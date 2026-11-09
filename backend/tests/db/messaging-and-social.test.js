import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let alice;
let bob;
let carol;
let guide;
let admin;

beforeAll(async () => {
  db = await createDatabase();
  alice = await db.createUser({ role: "traveler" });
  bob = await db.createUser({ role: "traveler" });
  carol = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 1500 });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
});

const sendAs = (sender, receiver, content) =>
  db.as(sender, () => db.query("insert into messages (sender_id, receiver_id, content) values ($1, $2, $3)", [sender, receiver, content]));

describe("messages (B5, C2)", () => {
  it("delivers a message and notifies the receiver", async () => {
    await sendAs(alice, bob, "Hi Bob!");
    const unread = await db.as(bob, () => db.rows("select type from notifications where user_id = $1", [bob]));
    expect(unread.map((n) => n.type)).toContain("new_message");
  });

  it("lets the receiver mark a message read but not rewrite it", async () => {
    const { id } = await db.one("select id from messages where sender_id = $1 and receiver_id = $2 limit 1", [alice, bob]);
    await db.as(bob, async () => {
      expect((await db.query("update messages set is_read = true where id = $1", [id])).affectedRows).toBe(1);
      expect(await rejects(db.query("update messages set content = 'edited' where id = $1", [id]))).toMatch(/permission denied/);
      expect(await rejects(db.query("update messages set sender_id = $2 where id = $1", [id, carol]))).toMatch(
        /permission denied/,
      );
    });
  });

  it("does not let anyone send as someone else", async () => {
    const message = await db.as(alice, () =>
      rejects(db.query("insert into messages (sender_id, receiver_id, content) values ($1, $2, 'spoof')", [bob, carol])),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("rejects empty, oversized and self-addressed messages", async () => {
    expect(await rejects(sendAs(alice, alice, "talking to myself"))).toMatch(/messages_no_self/);
    expect(await rejects(sendAs(alice, bob, "   "))).toMatch(/messages_content_length/);
    expect(await rejects(sendAs(alice, bob, "x".repeat(2001)))).toMatch(/messages_content_length/);
  });

  it("blocks banned users from sending", async () => {
    await db.query("update profiles set is_banned = true where id = $1", [carol]);
    expect(await rejects(sendAs(carol, bob, "spam"))).toMatch(/row-level security/);
    await db.query("update profiles set is_banned = false where id = $1", [carol]);
  });

  it("keeps conversations private", async () => {
    const rows = await db.as(carol, () => db.rows("select id from messages where sender_id = $1", [alice]));
    expect(rows).toHaveLength(0);
  });
});

describe("notifications", () => {
  it("lets users mark their notifications read and nothing else", async () => {
    await db.as(bob, async () => {
      expect((await db.query("update notifications set is_read = true where user_id = $1", [bob])).affectedRows).toBeGreaterThan(0);
      expect(await rejects(db.query("update notifications set title = 'x' where user_id = $1", [bob]))).toMatch(
        /permission denied/,
      );
    });
  });

  it("accepts the advance-paid notification when a payment confirms a booking (D1)", async () => {
    const id = await db.createBooking({ travelerId: alice, guideId: guide, status: "accepted", date: daysFromNow(12) });
    await db.as("service", () => db.query("update bookings set status = 'confirmed' where id = $1", [id]));
    const rows = await db.rows("select type from notifications where user_id = $1 and type = 'booking_advance_paid'", [guide]);
    expect(rows).toHaveLength(1);
  });
});

describe("buddy trips (B6, C2)", () => {
  let tripId;

  beforeAll(async () => {
    tripId = (
      await db.one(
        "insert into buddy_trips (user_id, destination, start_date, end_date) values ($1, 'Leh', $2, $3) returning id",
        [alice, daysFromNow(10), daysFromNow(15)],
      )
    ).id;
  });

  it("are hidden from anonymous visitors and visible to signed-in users", async () => {
    expect(await db.as("anon", () => db.rows("select id from buddy_trips"))).toHaveLength(0);
    expect((await db.as(bob, () => db.rows("select id from buddy_trips"))).length).toBeGreaterThan(0);
  });

  it("must end on or after the start date", async () => {
    const message = await db.as(bob, () =>
      rejects(
        db.query("insert into buddy_trips (user_id, destination, start_date, end_date) values ($1, 'Goa', $2, $3)", [
          bob,
          daysFromNow(10),
          daysFromNow(5),
        ]),
      ),
    );
    expect(message).toMatch(/buddy_trips_dates_valid/);
  });

  it("cannot be joined by their own creator", async () => {
    const message = await db.as(alice, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, alice])),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("let the owner accept a request but change nothing else", async () => {
    await db.as(bob, () => db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, bob]));
    await db.as(alice, async () => {
      const result = await db.query("update buddy_requests set status = 'accepted' where trip_id = $1", [tripId]);
      expect(result.affectedRows).toBe(1);
      expect(
        await rejects(db.query("update buddy_requests set traveler_id = $2 where trip_id = $1", [tripId, carol])),
      ).toMatch(/permission denied/);
    });
  });
});

describe("reports (B7)", () => {
  it("can be read by the spot's guide but resolved only by admins", async () => {
    const spot = await db.createLocation(guide);
    await db.as(bob, () =>
      db.query("insert into reports (location_id, reported_by, reason) values ($1, $2, 'Misleading photos')", [spot, bob]),
    );
    await db.as(guide, async () => {
      expect(await db.rows("select id from reports where location_id = $1", [spot])).toHaveLength(1);
      expect((await db.query("update reports set status = 'dismissed' where location_id = $1", [spot])).affectedRows).toBe(0);
    });
    const result = await db.as(admin, () => db.query("update reports set status = 'reviewed' where location_id = $1", [spot]));
    expect(result.affectedRows).toBe(1);
  });
});
