import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let traveler;
let otherTraveler;
let guide;
let unverifiedGuide;
let spot;

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  otherTraveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  unverifiedGuide = await db.createUser({ role: "guide", rate: 1000 });
  spot = await db.createLocation(guide, { price: 750, title: "Amber Fort" });
});

const insertBooking = (fields) =>
  db.one(
    `insert into bookings (traveler_id, guide_id, destination, date, people, amount, status, cancellation_fee, location_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning guide_id, destination, amount, status, cancellation_fee`,
    [
      fields.traveler_id ?? traveler,
      fields.guide_id ?? guide,
      fields.destination ?? "Jaipur",
      fields.date ?? daysFromNow(7),
      fields.people ?? 1,
      fields.amount ?? 0,
      fields.status ?? "pending",
      fields.cancellation_fee ?? 0,
      fields.location_id ?? null,
    ],
  );

describe("creating bookings (B3, C1, C2)", () => {
  it("prices a spot booking on the server and ignores client-sent money and status", async () => {
    const row = await db.as(traveler, () =>
      insertBooking({
        guide_id: unverifiedGuide, // wrong guide on purpose: the spot decides
        destination: "Fake",
        people: 2,
        amount: 1,
        status: "accepted",
        cancellation_fee: 99,
        location_id: spot,
      }),
    );
    expect(row).toMatchObject({ guide_id: guide, destination: "Amber Fort", status: "pending", cancellation_fee: "0" });
    expect(Number(row.amount)).toBe(1500);
  });

  it("prices a guide booking from the guide's day rate", async () => {
    const row = await db.as(traveler, () => insertBooking({ people: 3, amount: 5 }));
    expect(Number(row.amount)).toBe(6000);
  });

  it("rejects trips in the past", async () => {
    expect(await db.as(traveler, () => rejects(insertBooking({ date: daysFromNow(-1) })))).toMatch(/in the past/);
  });

  it("rejects bookings with an unverified guide", async () => {
    expect(await db.as(traveler, () => rejects(insertBooking({ guide_id: unverifiedGuide })))).toMatch(
      /not accepting bookings/,
    );
  });

  it("rejects bookings made by guides", async () => {
    const message = await db.as(guide, () => rejects(insertBooking({ traveler_id: guide })));
    expect(message).toMatch(/Only travellers/);
  });

  it("rejects archived spots", async () => {
    const archived = await db.createLocation(guide, { status: "archived" });
    expect(await db.as(traveler, () => rejects(insertBooking({ location_id: archived })))).toMatch(/not available/);
  });

  it("rejects group sizes outside 1–20", async () => {
    expect(await db.as(traveler, () => rejects(insertBooking({ people: 0 })))).toMatch(/bookings_people_range/);
  });

  it("rejects requests on someone else's behalf", async () => {
    expect(await db.as(traveler, () => rejects(insertBooking({ traveler_id: otherTraveler })))).toMatch(
      /only request bookings for yourself/,
    );
  });
});

describe("booking status transitions (B3)", () => {
  const book = (status, date) => db.createBooking({ travelerId: traveler, guideId: guide, status, date });
  const setStatus = (who, id, status) => db.as(who, () => db.query("update bookings set status = $2 where id = $1", [id, status]));

  it("lets the guide accept or decline a pending request", async () => {
    expect((await setStatus(guide, await book("pending", daysFromNow(20)), "accepted")).affectedRows).toBe(1);
    expect((await setStatus(guide, await book("pending", daysFromNow(21)), "declined")).affectedRows).toBe(1);
  });

  it("does not let the traveller accept their own request", async () => {
    const id = await book("pending", daysFromNow(22));
    expect(await rejects(setStatus(traveler, id, "accepted"))).toMatch(/cannot change from pending to accepted/);
  });

  it("lets the traveller cancel a pending or accepted booking", async () => {
    expect((await setStatus(traveler, await book("pending", daysFromNow(23)), "cancelled")).affectedRows).toBe(1);
    expect((await setStatus(traveler, await book("accepted", daysFromNow(24)), "cancelled")).affectedRows).toBe(1);
  });

  it("only lets the payment system confirm a booking", async () => {
    const id = await book("accepted", daysFromNow(25));
    expect(await rejects(setStatus(traveler, id, "confirmed"))).toMatch(/confirmed only after the advance payment/);
    expect(await rejects(setStatus(guide, id, "confirmed"))).toMatch(/confirmed only after the advance payment/);
    expect((await setStatus("service", id, "confirmed")).affectedRows).toBe(1);
  });

  it("routes cancellation of a paid booking through the refund flow", async () => {
    const id = await book("confirmed", daysFromNow(26));
    expect(await rejects(setStatus(traveler, id, "cancelled"))).toMatch(/cancellation flow/);
  });

  it("allows marking a trip completed only on or after its date", async () => {
    expect(await rejects(setStatus(traveler, await book("accepted", daysFromNow(5)), "completed"))).toMatch(
      /only on or after its date/,
    );
    expect((await setStatus(traveler, await book("confirmed", daysFromNow(-1)), "completed")).affectedRows).toBe(1);
  });

  it("locks the price, parties and date once the request is sent", async () => {
    const id = await book("pending", daysFromNow(27));
    for (const assignment of ["amount = 1", `guide_id = '${unverifiedGuide}'`, `date = '${daysFromNow(40)}'`, "people = 5"]) {
      const message = await db.as(traveler, () => rejects(db.query(`update bookings set ${assignment} where id = $1`, [id])));
      expect(message).toMatch(/permission denied/);
    }
  });

  it("lets only the traveller leave feedback", async () => {
    const id = await book("pending", daysFromNow(28));
    expect(
      await db.as(guide, () => rejects(db.query("update bookings set feedback = 'Great guest' where id = $1", [id]))),
    ).toMatch(/Only the traveller/);
    const result = await db.as(traveler, () => db.query("update bookings set feedback = 'Lovely trip' where id = $1", [id]));
    expect(result.affectedRows).toBe(1);
  });

  it("does not let outsiders change someone else's booking", async () => {
    const id = await book("pending", daysFromNow(29));
    expect((await setStatus(otherTraveler, id, "cancelled")).affectedRows).toBe(0);
  });

  it("prevents double-booking a guide on the same date", async () => {
    const date = daysFromNow(30);
    const first = await db.createBooking({ travelerId: traveler, guideId: guide, date });
    const second = await db.createBooking({ travelerId: otherTraveler, guideId: guide, date });
    expect((await setStatus(guide, first, "accepted")).affectedRows).toBe(1);
    expect(await rejects(setStatus(guide, second, "accepted"))).toMatch(/bookings_guide_date_accepted|duplicate key/);
  });
});
