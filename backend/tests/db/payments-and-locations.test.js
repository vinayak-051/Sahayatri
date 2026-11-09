import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let traveler;
let guide;
let otherGuide;
let admin;

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  otherGuide = await db.createUser({ role: "guide", verified: true, rate: 1000 });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
});

describe("admin payouts (D2)", () => {
  beforeAll(async () => {
    await db.query(
      "insert into guide_ledger (guide_id, type, amount) values ($1, 'earning', 1000), ($1, 'commission', -150)",
      [guide],
    );
  });

  it("lets admins read every guide's ledger and guides only their own", async () => {
    expect((await db.as(admin, () => db.rows("select id from guide_ledger where guide_id = $1", [guide]))).length).toBe(2);
    expect(await db.as(otherGuide, () => db.rows("select id from guide_ledger where guide_id = $1", [guide]))).toHaveLength(0);
  });

  it("records an audited payout that reduces the balance", async () => {
    await db.as(admin, () => db.query("select admin_record_payout($1, 500)", [guide]));
    const { balance } = await db.one("select sum(amount)::numeric as balance from guide_ledger where guide_id = $1", [guide]);
    expect(Number(balance)).toBe(350);
    const audit = await db.rows("select details from admin_actions where action = 'record_payout' and target_id = $1", [guide]);
    expect(audit).toHaveLength(1);
  });

  it("refuses to pay out more than the balance", async () => {
    expect(await db.as(admin, () => rejects(db.query("select admin_record_payout($1, 10000)", [guide])))).toMatch(/exceeds/);
  });

  it("is admin-only, and clients cannot write the ledger directly", async () => {
    expect(await db.as(guide, () => rejects(db.query("select admin_record_payout($1, 10)", [guide])))).toMatch(/Unauthorized/);
    const message = await db.as(admin, () =>
      rejects(db.query("insert into guide_ledger (guide_id, type, amount) values ($1, 'earning', 999)", [guide])),
    );
    expect(message).toMatch(/row-level security/);
  });
});

describe("payment capture (B11, D1)", () => {
  const addPayment = async (bookingId, stage, orderId, amount) =>
    db.query("insert into payments (booking_id, stage, razorpay_order_id, amount) values ($1, $2, $3, $4)", [
      bookingId,
      stage,
      orderId,
      amount,
    ]);
  const capture = (orderId, paymentId) =>
    db.as("service", () => db.one("select process_payment_captured($1, $2) as result", [orderId, paymentId]));

  it("confirms a booking when the advance is captured, exactly once", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "accepted", amount: 1000, date: daysFromNow(9) });
    await addPayment(id, "advance", "order_adv_1", 500);
    expect((await capture("order_adv_1", "pay_1")).result).toBe("ok");
    expect((await capture("order_adv_1", "pay_1")).result).toBe("already processed");
    const booking = await db.one("select status from bookings where id = $1", [id]);
    const payment = await db.one("select status, razorpay_payment_id from payments where razorpay_order_id = 'order_adv_1'");
    expect(booking.status).toBe("confirmed");
    expect(payment).toEqual({ status: "paid", razorpay_payment_id: "pay_1" });
  });

  it("credits the guide once for the final payment, minus commission", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: otherGuide, status: "confirmed", amount: 2000, date: daysFromNow(-2) });
    await addPayment(id, "final", "order_fin_1", 1000);
    await capture("order_fin_1", "pay_2");
    await capture("order_fin_1", "pay_2");
    const ledger = await db.rows("select type, amount from guide_ledger where booking_id = $1 order by type", [id]);
    expect(ledger.map((r) => [r.type, Number(r.amount)])).toEqual([
      ["commission", -300],
      ["earning", 2000],
    ]);
    expect((await db.one("select final_payment_mode from bookings where id = $1", [id])).final_payment_mode).toBe("online");
  });

  it("reports unknown orders", async () => {
    expect((await capture("order_missing", "pay_x")).result).toBe("no matching order");
  });

  it("cannot be called by clients", async () => {
    const message = await db.as(traveler, () => rejects(db.query("select process_payment_captured('order_adv_1', 'pay_9')")));
    expect(message).toMatch(/permission denied for function/);
  });
});

describe("locations (C3, D3)", () => {
  it("counts every view atomically, for visitors and travellers alike", async () => {
    const spot = await db.createLocation(guide);
    await db.as("anon", () => db.query("select increment_location_views($1)", [spot]));
    await db.as(traveler, () => db.query("select increment_location_views($1)", [spot]));
    expect((await db.one("select views_count from locations where id = $1", [spot])).views_count).toBe(2);
  });

  it("lets guides edit content but not ratings or counters", async () => {
    const spot = await db.createLocation(guide);
    await db.as(guide, async () => {
      expect((await db.query("update locations set title = 'Hawa Mahal', city = 'Jaipur' where id = $1", [spot])).affectedRows).toBe(1);
      for (const assignment of ["rating = 5", "reviews_count = 99", "saves_count = 99", "views_count = 99", `guide_id = '${otherGuide}'`]) {
        expect(await rejects(db.query(`update locations set ${assignment} where id = $1`, [spot]))).toMatch(/permission denied/);
      }
    });
  });

  it("stores a city and refreshes updated_at on edits", async () => {
    const spot = await db.createLocation(guide);
    const before = await db.one("select updated_at from locations where id = $1", [spot]);
    await db.as(guide, () => db.query("update locations set city = 'Udaipur' where id = $1", [spot]));
    const after = await db.one("select city, updated_at from locations where id = $1", [spot]);
    expect(after.city).toBe("Udaipur");
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.updated_at).getTime());
  });

  it("rejects impossible coordinates", async () => {
    const message = await db.as(guide, () =>
      rejects(
        db.query(
          `insert into locations (title, short_description, detailed_content, lat, lng, category, guide_id)
           values ('Nowhere', 's', 'd', 'NaN', 75.8, 'Nature', $1)`,
          [guide],
        ),
      ),
    );
    expect(message).toMatch(/locations_coordinates_valid/);
  });
});

describe("storage limits (B10)", () => {
  it("caps upload size and types on every bucket", async () => {
    const buckets = await db.rows("select id, file_size_limit, allowed_mime_types from storage.buckets order by id");
    expect(buckets).toHaveLength(3);
    for (const bucket of buckets) {
      expect(Number(bucket.file_size_limit)).toBe(5 * 1024 * 1024);
      expect(bucket.allowed_mime_types).toContain("image/jpeg");
    }
    expect(buckets.find((b) => b.id === "verification-docs").allowed_mime_types).toContain("application/pdf");
    expect(buckets.find((b) => b.id === "avatars").allowed_mime_types).not.toContain("application/pdf");
  });
});
