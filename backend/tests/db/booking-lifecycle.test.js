import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let traveler;
let guide;

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 1000 });
});

const setStatus = (who, id, status) => db.as(who, () => db.query("update bookings set status = $2 where id = $1", [id, status]));

describe("expired requests (F1)", () => {
  it("cannot be accepted once the trip date has passed", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(-2) });
    expect(await rejects(setStatus(guide, id, "accepted"))).toMatch(/expired/);
  });

  it("can still be declined to clear them", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(-3) });
    expect((await setStatus(guide, id, "declined")).affectedRows).toBe(1);
  });

  it("does not affect requests for today or later", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(0) });
    expect((await setStatus(guide, id, "accepted")).affectedRows).toBe(1);
  });
});

describe("booking notifications (F2)", () => {
  it("say 'accepted', not 'confirmed', when a guide accepts", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, date: daysFromNow(20) });
    await setStatus(guide, id, "accepted");
    const note = await db.one(
      "select title, body from notifications where user_id = $1 and data->>'booking_id' = $2",
      [traveler, id],
    );
    expect(note.title).toBe("Booking accepted");
    expect(note.body).toMatch(/Pay the advance to confirm it/);
  });

  it("still announce the advance payment to the guide", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "accepted", date: daysFromNow(21) });
    await setStatus("service", id, "confirmed");
    const note = await db.one("select title from notifications where user_id = $1 and data->>'booking_id' = $2", [guide, id]);
    expect(note.title).toBe("Advance received");
  });
});
