import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let guide;
let otherGuide;
let traveler;
let spot;

beforeAll(async () => {
  db = await createDatabase();
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000, name: "Asha" });
  otherGuide = await db.createUser({ role: "guide", verified: true, rate: 1500 });
  traveler = await db.createUser({ role: "traveler" });
  spot = await db.createLocation(guide, { price: 600 });
});

const block = (who, guideId, date, note = null) =>
  db.as(who, () =>
    db.query("insert into guide_unavailable_dates (guide_id, date, note) values ($1, $2, $3)", [guideId, date, note]),
  );

const unblock = (who, guideId, date) =>
  db.as(who, () => db.query("delete from guide_unavailable_dates where guide_id = $1 and date = $2", [guideId, date]));

const requestBooking = (fields) =>
  db.as(traveler, () =>
    db.query(
      `insert into bookings (traveler_id, guide_id, destination, date, people, amount, location_id)
       values ($1, $2, 'Jaipur', $3, 1, 0, $4)`,
      [traveler, fields.guide_id ?? guide, fields.date, fields.location_id ?? null],
    ),
  );

describe("guide_unavailable_dates", () => {
  it("lets a guide add, read and remove their own dates", async () => {
    expect((await block(guide, guide, daysFromNow(20), "Family wedding")).affectedRows).toBe(1);
    const rows = await db.as(guide, () =>
      db.rows("select date::text, note from guide_unavailable_dates where guide_id = $1", [guide]),
    );
    expect(rows).toEqual([{ date: daysFromNow(20), note: "Family wedding" }]);
    expect((await unblock(guide, guide, daysFromNow(20))).affectedRows).toBe(1);
  });

  it("stops a guide touching another guide's dates", async () => {
    expect(await rejects(block(guide, otherGuide, daysFromNow(21)))).toMatch(/row-level security/);
    await block(otherGuide, otherGuide, daysFromNow(21));
    expect((await unblock(guide, otherGuide, daysFromNow(21))).affectedRows).toBe(0);
    const { n } = await db.one("select count(*)::int as n from guide_unavailable_dates where guide_id = $1", [otherGuide]);
    expect(n).toBe(1);
  });

  it("lets travellers read but not write, and hides dates from anon", async () => {
    await block(guide, guide, daysFromNow(22));
    const seen = await db.as(traveler, () => db.rows("select date::text from guide_unavailable_dates where guide_id = $1", [guide]));
    expect(seen.map((r) => r.date)).toContain(daysFromNow(22));
    expect(await rejects(block(traveler, traveler, daysFromNow(23)))).toMatch(/row-level security/);
    expect(await rejects(block(traveler, guide, daysFromNow(23)))).toMatch(/row-level security/);
    expect((await unblock(traveler, guide, daysFromNow(22))).affectedRows).toBe(0);
    expect(await rejects(db.as("anon", () => db.rows("select * from guide_unavailable_dates")))).toMatch(/permission denied/);
  });

  it("allows no updates and no client-set created_at", async () => {
    expect(
      await rejects(
        db.as(guide, () => db.query("update guide_unavailable_dates set note = 'x' where guide_id = $1", [guide])),
      ),
    ).toMatch(/permission denied/);
    expect(
      await rejects(
        db.as(guide, () =>
          db.query("insert into guide_unavailable_dates (guide_id, date, created_at) values ($1, $2, now())", [
            guide,
            daysFromNow(24),
          ]),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it("rejects past dates and long notes", async () => {
    expect(await rejects(block(guide, guide, daysFromNow(-1)))).toMatch(/cannot block a date in the past/);
    expect(await rejects(block(guide, guide, daysFromNow(25), "x".repeat(101)))).toMatch(/check constraint/);
  });
});

describe("bookings on blocked dates", () => {
  it("rejects guide and spot booking requests with a readable message", async () => {
    await block(guide, guide, daysFromNow(30));
    expect(await rejects(requestBooking({ date: daysFromNow(30) }))).toBe("Asha isn't available on that date");
    expect(await rejects(requestBooking({ date: daysFromNow(30), location_id: spot }))).toBe(
      "Asha isn't available on that date",
    );
    expect((await requestBooking({ date: daysFromNow(31) })).affectedRows).toBe(1);
  });

  it("uses errcode 22023", async () => {
    try {
      await requestBooking({ date: daysFromNow(30) });
      throw new Error("expected failure");
    } catch (err) {
      expect(err.code).toBe("22023");
    }
  });

  it("rejects accepting a request on a blocked date, and allows it once unblocked", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(32) });
    await block(guide, guide, daysFromNow(32));
    const accept = () => db.as(guide, () => db.query("update bookings set status = 'accepted' where id = $1", [id]));
    expect(await rejects(accept())).toMatch(/marked this date as unavailable/);
    // Declining a blocked-date request still works.
    const other = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(32) });
    await db.as(guide, () => db.query("update bookings set status = 'declined' where id = $1", [other]));
    await unblock(guide, guide, daysFromNow(32));
    expect((await accept()).affectedRows).toBe(1);
  });

  it("does not restrict the service role", async () => {
    await block(guide, guide, daysFromNow(33));
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(33) });
    await db.as("service", () => db.query("update bookings set status = 'accepted' where id = $1", [id]));
    const { status } = await db.one("select status from bookings where id = $1", [id]);
    expect(status).toBe("accepted");
  });

  it("re-running the migration keeps data and behaviour", async () => {
    await db.db.exec(
      readFileSync(new URL("../../supabase/migrations/20261116100000_guide_availability.sql", import.meta.url), "utf8"),
    );
    expect(await rejects(requestBooking({ date: daysFromNow(30) }))).toBe("Asha isn't available on that date");
    const { n } = await db.one("select count(*)::int as n from guide_unavailable_dates where guide_id = $1", [guide]);
    expect(n).toBeGreaterThan(0);
  });
});
