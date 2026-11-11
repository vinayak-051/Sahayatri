// Regression tests for issues found by the independent review of the hardening migration.
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let traveler;
let otherTraveler;
let guide;
let admin;

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  otherTraveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
});

describe("admin_profiles is read-only", () => {
  it("grants clients SELECT only", async () => {
    for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      const row = await db.one("select has_table_privilege('authenticated', 'public.admin_profiles', $1) as allowed", [privilege]);
      expect(row.allowed).toBe(false);
    }
    expect((await db.one("select has_table_privilege('anon', 'public.admin_profiles', 'SELECT') as allowed")).allowed).toBe(false);
  });

  it("cannot be used to upsert privileged profile fields", async () => {
    const message = await db.as(traveler, () =>
      rejects(
        db.query(
          `insert into admin_profiles (id, email, name, role, is_verified)
           values ($1, 'x@test.dev', 'x', 'traveler', true)
           on conflict (id) do update set is_verified = true`,
          [traveler],
        ),
      ),
    );
    expect(message).toMatch(/permission denied/);
    expect((await db.one("select is_verified from profiles where id = $1", [traveler])).is_verified).toBe(false);
  });
});

describe("payments that cannot be applied are flagged for refund", () => {
  const addPayment = (bookingId, stage, orderId, amount) =>
    db.query("insert into payments (booking_id, stage, razorpay_order_id, amount) values ($1, $2, $3, $4)", [
      bookingId,
      stage,
      orderId,
      amount,
    ]);
  const capture = async (orderId, paymentId) =>
    (await db.as("service", () => db.one("select process_payment_captured($1, $2) as result", [orderId, paymentId]))).result;
  const ledgerRows = (bookingId) => db.rows("select type from guide_ledger where booking_id = $1", [bookingId]);

  it("credits the guide once when two final orders are both paid", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "confirmed", amount: 2000, date: daysFromNow(-3) });
    await addPayment(id, "final", "order_fin_a", 1000);
    await addPayment(id, "final", "order_fin_b", 1000);
    expect(await capture("order_fin_a", "pay_a")).toBe("ok");
    expect(await capture("order_fin_b", "pay_b")).toBe("needs_refund");
    expect(await capture("order_fin_b", "pay_b")).toBe("needs_refund"); // retry until refunded
    expect(await ledgerRows(id)).toHaveLength(2);
    expect((await db.one("select status from payments where razorpay_order_id = 'order_fin_b'")).status).toBe("needs_refund");
  });

  it("does not credit an online final payment after cash was recorded", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "confirmed", amount: 2000, date: daysFromNow(-4) });
    await addPayment(id, "final", "order_fin_c", 1000);
    await db.as("service", () => db.query("update bookings set final_payment_mode = 'cash' where id = $1", [id]));
    expect(await capture("order_fin_c", "pay_c")).toBe("needs_refund");
    expect(await ledgerRows(id)).toHaveLength(0);
    expect((await db.one("select final_payment_mode from bookings where id = $1", [id])).final_payment_mode).toBe("cash");
  });

  it("flags an advance captured after the booking was cancelled", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "accepted", amount: 1000, date: daysFromNow(14) });
    await addPayment(id, "advance", "order_adv_x", 500);
    await db.as(traveler, () => db.query("update bookings set status = 'cancelled' where id = $1", [id]));
    expect(await capture("order_adv_x", "pay_x")).toBe("needs_refund");
    expect((await db.one("select status from bookings where id = $1", [id])).status).toBe("cancelled");
  });

  it("flags a second advance on an already confirmed booking", async () => {
    const id = await db.createBooking({ travelerId: traveler, guideId: guide, status: "accepted", amount: 1000, date: daysFromNow(15) });
    await addPayment(id, "advance", "order_adv_y1", 500);
    await addPayment(id, "advance", "order_adv_y2", 500);
    expect(await capture("order_adv_y1", "pay_y1")).toBe("ok");
    expect(await capture("order_adv_y2", "pay_y2")).toBe("needs_refund");
    const paid = await db.rows("select id from payments where booking_id = $1 and status = 'paid'", [id]);
    expect(paid).toHaveLength(1);
  });
});

describe("clients cannot set server-owned columns on insert", () => {
  it("rejects back-dated messages and reports (rate limits count by created_at)", async () => {
    await db.as(traveler, async () => {
      expect(
        await rejects(
          db.query(
            "insert into messages (sender_id, receiver_id, content, created_at) values ($1, $2, 'hi', now() - interval '1 day')",
            [traveler, guide],
          ),
        ),
      ).toMatch(/permission denied/);
      expect(
        await rejects(
          db.query("insert into messages (sender_id, receiver_id, content, is_read) values ($1, $2, 'hi', true)", [traveler, guide]),
        ),
      ).toMatch(/permission denied/);
    });
  });

  it("lets a client choose a message id (optimistic sends)", async () => {
    const result = await db.as(traveler, () =>
      db.query("insert into messages (id, sender_id, receiver_id, content) values (gen_random_uuid(), $1, $2, 'hello')", [
        traveler,
        guide,
      ]),
    );
    expect(result.affectedRows).toBe(1);
  });

  it("rejects self-approved buddy requests", async () => {
    const trip = (
      await db.one(
        "insert into buddy_trips (user_id, destination, start_date, end_date) values ($1, 'Goa', $2, $3) returning id",
        [otherTraveler, daysFromNow(10), daysFromNow(12)],
      )
    ).id;
    const message = await db.as(traveler, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id, status) values ($1, $2, 'accepted')", [trip, traveler])),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("rejects self-approved verification requests", async () => {
    const message = await db.as(guide, () =>
      rejects(
        db.query(
          "insert into verification_requests (guide_id, document_type, document_path, status) values ($1, 'passport', 'x/y.png', 'approved')",
          [guide],
        ),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });
});

describe("server-side functions still pass the client guards", () => {
  it("lets admin functions change verification and bans", async () => {
    const newGuide = await db.createUser({ role: "guide" });
    await db.as(admin, async () => {
      await db.query("select admin_verify_guide($1, true)", [newGuide]);
      await db.query("select admin_set_banned($1, true)", [newGuide]);
    });
    expect(await db.one("select is_verified, is_banned from profiles where id = $1", [newGuide])).toEqual({
      is_verified: true,
      is_banned: true,
    });
  });

  it("re-syncs the guide's rating when a traveller with a completed trip reviews them", async () => {
    await db.createBooking({ travelerId: traveler, guideId: guide, status: "completed", date: daysFromNow(-20) });
    await db.as(traveler, () =>
      db.query("insert into reviews (guide_id, reviewer_id, rating, comment) values ($1, $2, 4, 'Great')", [guide, traveler]),
    );
    expect(Number((await db.one("select rating from profiles where id = $1", [guide])).rating)).toBe(4);
  });

  it("rejects reviews without a completed trip", async () => {
    const message = await db.as(otherTraveler, () =>
      rejects(db.query("insert into reviews (guide_id, reviewer_id, rating, comment) values ($1, $2, 5, 'Fake')", [guide, otherTraveler])),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("accepts a payout equal to the balance despite floating-point noise", async () => {
    const paidGuide = await db.createUser({ role: "guide", verified: true });
    await db.query("insert into guide_ledger (guide_id, type, amount) values ($1, 'earning', 350.10)", [paidGuide]);
    await db.as(admin, () => db.query("select admin_record_payout($1, 350.1000000001)", [paidGuide]));
    const { balance } = await db.one("select coalesce(sum(amount), 0)::numeric as balance from guide_ledger where guide_id = $1", [paidGuide]);
    expect(Number(balance)).toBe(0);
  });
});
