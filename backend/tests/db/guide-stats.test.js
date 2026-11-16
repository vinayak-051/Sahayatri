import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let travelerA;
let travelerB;
let travelerC;
let guide;
let quietGuide;
let unverifiedGuide;
let admin;

beforeAll(async () => {
  db = await createDatabase();
  travelerA = await db.createUser({ role: "traveler" });
  travelerB = await db.createUser({ role: "traveler" });
  travelerC = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  quietGuide = await db.createUser({ role: "guide", verified: true, rate: 1500 });
  unverifiedGuide = await db.createUser({ role: "guide", rate: 1000 });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
});

const responseOf = async (id) => (await db.one("select responded_at from bookings where id = $1", [id])).responded_at;
const setStatusAs = (who, id, status) =>
  db.as(who, () => db.query("update bookings set status = $2 where id = $1", [id, status]));

describe("bookings.responded_at", () => {
  it("is set when the guide accepts or declines a pending request", async () => {
    const toAccept = await db.createBooking({ travelerId: travelerA, guideId: quietGuide, date: daysFromNow(40) });
    const toDecline = await db.createBooking({ travelerId: travelerB, guideId: quietGuide, date: daysFromNow(41) });
    expect(await responseOf(toAccept)).toBeNull();

    await setStatusAs(quietGuide, toAccept, "accepted");
    await setStatusAs(quietGuide, toDecline, "declined");
    expect(await responseOf(toAccept)).toBeInstanceOf(Date);
    expect(await responseOf(toDecline)).toBeInstanceOf(Date);
  });

  it("is not set when the traveller cancels, and later changes keep the first answer time", async () => {
    const cancelled = await db.createBooking({ travelerId: travelerA, guideId: quietGuide, date: daysFromNow(42) });
    await setStatusAs(travelerA, cancelled, "cancelled");
    expect(await responseOf(cancelled)).toBeNull();

    const accepted = await db.createBooking({ travelerId: travelerC, guideId: quietGuide, date: daysFromNow(43) });
    await setStatusAs(quietGuide, accepted, "accepted");
    const first = await responseOf(accepted);
    await setStatusAs(travelerC, accepted, "cancelled");
    expect(await responseOf(accepted)).toEqual(first);
  });

  it("cannot be written by clients", async () => {
    const id = await db.createBooking({ travelerId: travelerA, guideId: quietGuide, date: daysFromNow(44) });
    for (const who of [travelerA, quietGuide]) {
      expect(await db.as(who, () => rejects(db.query("update bookings set responded_at = now() where id = $1", [id])))).toMatch(
        /permission denied/,
      );
    }

    const row = await db.as(travelerB, () =>
      db.one(
        `insert into bookings (traveler_id, guide_id, destination, date, people, amount, responded_at)
         values ($1, $2, 'Jaipur', $3, 1, 0, now()) returning id`,
        [travelerB, quietGuide, daysFromNow(45)],
      ),
    );
    expect(await responseOf(row.id)).toBeNull();
  });
});

describe("guide_public_stats", () => {
  beforeAll(async () => {
    const book = (travelerId, status, date, createdHoursAgo, respondedHoursAgo = null) =>
      db.query(
        `insert into bookings (traveler_id, guide_id, destination, date, people, amount, status, created_at, responded_at)
         values ($1, $2, 'Jaipur', $3, 1, 1000, $4, now() - make_interval(hours => $5::int),
                 case when $6::int is null then null else now() - make_interval(hours => $6::int) end)`,
        [travelerId, guide, daysFromNow(date), status, createdHoursAgo, respondedHoursAgo],
      );
    // Two completed trips with travellerA, one with travellerB: 3 trips, 2 travellers.
    await book(travelerA, "completed", -10, 400, 398); // answered in 2h
    await book(travelerA, "completed", -20, 600, 590); // 10h
    await book(travelerB, "completed", -30, 800, 796); // 4h
    await book(travelerB, "declined", 15, 100);        // answered, no timestamp (older row)
    await book(travelerC, "pending", 16, 72);          // unanswered after 48h
    await book(travelerC, "pending", 17, 5);           // still within 48h: not counted
    await book(travelerC, "cancelled", 18, 90);        // withdrawn before an answer: not counted

    await db.query(
      `insert into reviews (guide_id, reviewer_id, rating, comment) values
         ($1, $2, 5, 'Great'), ($1, $3, 4, 'Good')`,
      [guide, travelerA, travelerB],
    );
  });

  it("returns only the public aggregates", async () => {
    const { stats } = await db.as(travelerC, () => db.one("select guide_public_stats($1) as stats", [guide]));
    const { created_at } = await db.one("select created_at from profiles where id = $1", [guide]);
    expect(Object.keys(stats).sort()).toEqual(
      ["avg_rating", "completed_trips", "median_response_hours", "member_since", "response_rate", "reviews_count", "travellers_served"].sort(),
    );
    expect(stats).toMatchObject({
      completed_trips: 3,
      travellers_served: 2,
      response_rate: 0.8, // 4 answered of 5
      median_response_hours: 4,
      reviews_count: 2,
      avg_rating: 4.5,
    });
    expect(new Date(stats.member_since).getTime()).toBe(created_at.getTime());
    const text = JSON.stringify(stats);
    expect(text).not.toMatch(/@test\.dev/);
    expect(text).not.toContain(travelerA);
  });

  it("gives nulls when a guide has no requests yet", async () => {
    const fresh = await db.createUser({ role: "guide", verified: true });
    const { stats } = await db.as(travelerA, () => db.one("select guide_public_stats($1) as stats", [fresh]));
    expect(stats).toMatchObject({
      completed_trips: 0,
      travellers_served: 0,
      response_rate: null,
      median_response_hours: null,
      reviews_count: 0,
      avg_rating: null,
    });
  });

  it("returns null for unverified guides and non-guides", async () => {
    const rows = await db.as(travelerA, () =>
      db.one("select guide_public_stats($1) as unverified, guide_public_stats($2) as traveler", [unverifiedGuide, travelerB]),
    );
    expect(rows).toEqual({ unverified: null, traveler: null });
  });

  it("is not callable without signing in", async () => {
    expect(await db.as("anon", () => rejects(db.query("select guide_public_stats($1)", [guide])))).toMatch(/permission denied/);
  });
});

describe("guide_my_stats", () => {
  let ledgerGuide;

  beforeAll(async () => {
    ledgerGuide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
    const book = (travelerId, status, date) =>
      db.createBooking({ travelerId, guideId: ledgerGuide, status, date: daysFromNow(date), amount: 2000 });
    await book(travelerA, "completed", -5);
    await book(travelerA, "completed", -6);
    await book(travelerB, "completed", -7);
    await book(travelerB, "accepted", 8);   // unpaid: not earnings
    await book(travelerC, "pending", 9);
    await book(travelerC, "pending", 10);
    await book(travelerA, "pending", -2);   // date passed: not a pending request
    await book(travelerB, "declined", 11);
    await db.query(
      `insert into guide_ledger (guide_id, type, amount) values
         ($1, 'earning', 4000), ($1, 'commission', -600), ($1, 'earning', 2000), ($1, 'commission', -300),
         ($1, 'payout', -3000), ($2, 'earning', 9999)`,
      [ledgerGuide, guide],
    );
  });

  it("returns the signed-in guide's trips, requests and ledger money", async () => {
    const { stats } = await db.as(ledgerGuide, () => db.one("select guide_my_stats() as stats"));
    expect(stats).toEqual({
      completed_trips: 3,
      travellers_served: 2,
      pending_requests: 2,
      upcoming_trips: 1,
      bookings_by_status: { pending: 3, accepted: 1, confirmed: 0, completed: 3, declined: 1, cancelled: 0 },
      ledger_balance: 2100,
      lifetime_earnings: 5100,
      reviews_count: 0,
      avg_rating: null,
    });
  });

  it("rejects travellers and anonymous callers", async () => {
    expect(await db.as(travelerA, () => rejects(db.query("select guide_my_stats()")))).toMatch(/Only guides/);
    expect(await db.as("anon", () => rejects(db.query("select guide_my_stats()")))).toMatch(/permission denied/);
  });
});

describe("admin_booking_timeseries", () => {
  let tsDb;
  let tsAdmin;

  beforeAll(async () => {
    tsDb = await createDatabase();
    const t = await tsDb.createUser({ role: "traveler" });
    const g = await tsDb.createUser({ role: "guide", verified: true });
    tsAdmin = await tsDb.createUser({ role: "traveler" });
    await tsDb.makeAdmin(tsAdmin);
    const book = (status, amount, createdAt) =>
      tsDb.query(
        `insert into bookings (traveler_id, guide_id, destination, date, people, amount, status, created_at)
         values ($1, $2, 'Jaipur', $3, 1, $4, $5, $6::timestamptz)`,
        [t, g, daysFromNow(30), amount, status, createdAt],
      );
    const todayIst = (await tsDb.one("select (now() at time zone 'Asia/Kolkata')::date::text as d")).d;
    // Noon India time today, and noon India time 3 days ago.
    await book("pending", 1000, `${todayIst} 12:00+05:30`);
    await book("accepted", 2000, `${todayIst} 12:00+05:30`);
    const threeDaysAgo = (await tsDb.one("select ($1::date - 3)::text as d", [todayIst])).d;
    await book("completed", 3000, `${threeDaysAgo} 12:00+05:30`);
    // Long before any window.
    await book("declined", 500, "2020-01-15 12:00+05:30");
  });

  it("aggregates per day and per month, with empty buckets filled in", async () => {
    const { ts } = await tsDb.as(tsAdmin, () => tsDb.one("select admin_booking_timeseries(6) as ts"));
    expect(ts.timezone).toBe("Asia/Kolkata");
    expect(ts.monthly).toHaveLength(6);
    expect(ts.daily[0].day).toBe(ts.from);
    expect(ts.daily.at(-1).day).toBe(ts.to);

    const today = ts.daily.at(-1);
    expect(today).toMatchObject({ total: 2, pending: 1, accepted: 1, completed: 0, value: 3000 });
    const threeAgo = ts.daily.at(-4);
    expect(threeAgo).toMatchObject({ total: 1, completed: 1, value: 3000 });

    const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key]), 0);
    expect(sum(ts.daily, "total")).toBe(3); // the 2020 booking is outside the window
    expect(sum(ts.monthly, "total")).toBe(3);
    expect(sum(ts.monthly, "value")).toBe(6000);
    expect(ts.monthly.at(-1).month).toBe(ts.to.slice(0, 7));
  });

  it("clamps the window to 1..24 months", async () => {
    const { a, b } = await tsDb.as(tsAdmin, () =>
      tsDb.one("select admin_booking_timeseries(0) as a, admin_booking_timeseries(100) as b"),
    );
    expect(a.monthly).toHaveLength(1);
    expect(b.monthly).toHaveLength(24);
  });

  it("is admin-only", async () => {
    const someone = await tsDb.createUser({ role: "guide", verified: true });
    expect(await tsDb.as(someone, () => rejects(tsDb.query("select admin_booking_timeseries()")))).toMatch(/Unauthorized/);
    expect(await tsDb.as("anon", () => rejects(tsDb.query("select admin_booking_timeseries()")))).toMatch(/permission denied/);
  });
});
