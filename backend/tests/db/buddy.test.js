import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let owner;
let asha;
let ravi;
let outsider;

beforeAll(async () => {
  db = await createDatabase();
  owner = await db.createUser({ role: "traveler", name: "Meera" });
  asha = await db.createUser({ role: "traveler", name: "Asha" });
  ravi = await db.createUser({ role: "traveler", name: "Ravi" });
  outsider = await db.createUser({ role: "traveler", name: "Kabir" });
});

// Clients send only the columns they are allowed to insert.
const createTrip = async (userId, destination) =>
  (
    await db.as(userId, () =>
      db.one("insert into buddy_trips (user_id, destination, start_date, end_date) values ($1, $2, $3, $4) returning id", [
        userId,
        destination,
        daysFromNow(10),
        daysFromNow(14),
      ]),
    )
  ).id;

const requestToJoin = async (travelerId, tripId) =>
  (
    await db.as(travelerId, () =>
      db.one("insert into buddy_requests (trip_id, traveler_id) values ($1, $2) returning id", [tripId, travelerId]),
    )
  ).id;

const setStatusAs = (userId, requestId, status) =>
  db.as(userId, () => db.query("update buddy_requests set status = $2 where id = $1", [requestId, status]));

// Read as the superuser so the assertions do not depend on the rules under test.
const notificationsOf = (userId, type) =>
  db.rows("select user_id, type, title, body, data, is_read from notifications where user_id = $1 and type = $2 order by created_at", [
    userId,
    type,
  ]);

describe("buddy request notifications", () => {
  it("notifies the trip owner exactly once per join request", async () => {
    const tripId = await createTrip(owner, "Leh");
    const ashaRequest = await requestToJoin(asha, tripId);

    let received = await notificationsOf(owner, "buddy_request_received");
    expect(received).toHaveLength(1);
    expect(received[0].title).toBe("New travel buddy request");
    expect(received[0].body).toBe("Asha wants to join your trip to Leh");
    expect(received[0].data).toEqual({ trip_id: tripId, request_id: ashaRequest, requester_id: asha });
    expect(received[0].is_read).toBe(false);

    const raviRequest = await requestToJoin(ravi, tripId);
    received = await notificationsOf(owner, "buddy_request_received");
    expect(received).toHaveLength(2);
    expect(received.map((n) => n.data.request_id).sort()).toEqual([ashaRequest, raviRequest].sort());

    // The requesters themselves hear nothing yet.
    expect(await notificationsOf(asha, "buddy_request_received")).toHaveLength(0);
    expect(await notificationsOf(asha, "buddy_request_accepted")).toHaveLength(0);
  });

  it("does not notify anyone when a duplicate request is refused", async () => {
    const tripId = await createTrip(owner, "Hampi");
    await requestToJoin(asha, tripId);
    const before = (await notificationsOf(owner, "buddy_request_received")).length;

    const message = await db.as(asha, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, asha])),
    );
    expect(message).toMatch(/buddy_requests_trip_id_traveler_id_key/);
    expect(await notificationsOf(owner, "buddy_request_received")).toHaveLength(before);
  });

  it("notifies the requester when the owner accepts, and only once", async () => {
    const tripId = await createTrip(owner, "Goa");
    const requestId = await requestToJoin(asha, tripId);
    const before = (await notificationsOf(asha, "buddy_request_accepted")).length;

    expect((await setStatusAs(owner, requestId, "accepted")).affectedRows).toBe(1);

    const accepted = await notificationsOf(asha, "buddy_request_accepted");
    expect(accepted).toHaveLength(before + 1);
    const latest = accepted[accepted.length - 1];
    expect(latest.title).toBe("Travel buddy request accepted");
    expect(latest.body).toBe("Meera accepted your request to join the trip to Goa");
    expect(latest.data).toEqual({ trip_id: tripId });

    // Saving the same status again is not a new acceptance.
    await setStatusAs(owner, requestId, "accepted");
    expect(await notificationsOf(asha, "buddy_request_accepted")).toHaveLength(before + 1);
  });

  it("does not notify the requester when the owner rejects", async () => {
    const tripId = await createTrip(owner, "Varanasi");
    const requestId = await requestToJoin(ravi, tripId);

    expect((await setStatusAs(owner, requestId, "rejected")).affectedRows).toBe(1);

    expect(await db.rows("select id from notifications where user_id = $1", [ravi])).toHaveLength(0);
  });

  it("does not let a requester accept their own request", async () => {
    const tripId = await createTrip(owner, "Munnar");
    const requestId = await requestToJoin(ravi, tripId);

    expect((await setStatusAs(ravi, requestId, "accepted")).affectedRows).toBe(0);
    expect((await db.one("select status from buddy_requests where id = $1", [requestId])).status).toBe("pending");
    expect(await notificationsOf(ravi, "buddy_request_accepted")).toHaveLength(0);
  });
});

describe("buddy notification privacy", () => {
  it("keeps notifications private to their recipient", async () => {
    const tripId = await createTrip(owner, "Spiti");
    await requestToJoin(asha, tripId);

    const own = await db.as(owner, () => db.rows("select type from notifications"));
    expect(own.length).toBeGreaterThan(0);
    expect(new Set(own.map((n) => n.type))).toEqual(new Set(["buddy_request_received"]));

    await db.as(outsider, async () => {
      expect(await db.rows("select id from notifications where user_id = $1", [owner])).toHaveLength(0);
      expect(await db.rows("select id from notifications")).toHaveLength(0);
      expect((await db.query("update notifications set is_read = true where user_id = $1", [owner])).affectedRows).toBe(0);
    });
    expect(await db.as("anon", () => db.rows("select id from notifications"))).toHaveLength(0);
  });

  it("does not let clients write notifications themselves", async () => {
    const message = await db.as(outsider, () =>
      rejects(
        db.query(
          "insert into notifications (user_id, type, title, body) values ($1, 'buddy_request_accepted', 'Fake', 'Fake')",
          [owner],
        ),
      ),
    );
    expect(message).toMatch(/row-level security|permission denied/);
  });
});

describe("buddy request rules still hold", () => {
  it("rejects joining your own trip and tells nobody", async () => {
    const tripId = await createTrip(outsider, "Coorg");

    const message = await db.as(outsider, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, outsider])),
    );
    expect(message).toMatch(/row-level security/);
    expect(await db.rows("select id from buddy_requests where trip_id = $1", [tripId])).toHaveLength(0);
    expect(await db.rows("select id from notifications where user_id = $1", [outsider])).toHaveLength(0);
  });

  it("rejects requests sent in someone else's name", async () => {
    const tripId = await createTrip(owner, "Ooty");
    const before = (await notificationsOf(owner, "buddy_request_received")).length;

    const message = await db.as(outsider, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, asha])),
    );
    expect(message).toMatch(/row-level security/);
    expect(await notificationsOf(owner, "buddy_request_received")).toHaveLength(before);
  });

  it("blocks banned travellers from requesting", async () => {
    const tripId = await createTrip(owner, "Rishikesh");
    const before = (await notificationsOf(owner, "buddy_request_received")).length;

    await db.query("update profiles set is_banned = true where id = $1", [outsider]);
    const message = await db.as(outsider, () =>
      rejects(db.query("insert into buddy_requests (trip_id, traveler_id) values ($1, $2)", [tripId, outsider])),
    );
    await db.query("update profiles set is_banned = false where id = $1", [outsider]);

    expect(message).toMatch(/row-level security/);
    expect(await notificationsOf(owner, "buddy_request_received")).toHaveLength(before);
  });
});
