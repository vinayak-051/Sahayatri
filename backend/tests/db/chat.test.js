import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, rejects } from "./harness.js";

let db;
let alice;
let bob;
let carol;
let guide;
let loner;

// Inserts a message as the superuser at a fixed, whole-second time (minutes after
// a base time), so ordering is deterministic and timestamps round-trip exactly.
async function seed(sender, receiver, content, minute, { read = false, id = randomUUID() } = {}) {
  return db.one(
    `insert into messages (id, sender_id, receiver_id, content, is_read, created_at)
     values ($1, $2, $3, $4, $5, timestamptz '2026-11-01 10:00:00+00' + make_interval(mins => $6))
     returning id, created_at`,
    [id, sender, receiver, content, read, minute],
  );
}

const conversationsOf = (user) => db.as(user, () => db.rows("select * from my_conversations()"));

const pageOf = (user, partner, { before = null, limit = 50 } = {}) =>
  db.as(user, () =>
    db.rows("select * from conversation_messages($1, $2, $3, $4)", [
      partner,
      before?.created_at ?? null,
      before?.id ?? null,
      limit,
    ]),
  );

beforeAll(async () => {
  db = await createDatabase();
  alice = await db.createUser({ role: "traveler", name: "Alice" });
  bob = await db.createUser({ role: "traveler", name: "Bob" });
  carol = await db.createUser({ role: "traveler", name: "Carol" });
  guide = await db.createUser({ role: "guide", name: "Gita", verified: true, rate: 1500 });
  loner = await db.createUser({ role: "traveler", name: "Lonely" });

  await seed(bob, alice, "Hi Alice", 0, { read: true });
  await seed(alice, bob, "Hello Bob", 1);
  await seed(bob, alice, "How are you?", 2);
  await seed(bob, alice, "There?", 3);
  await seed(carol, bob, "Bob, it's Carol", 4);
  await seed(alice, guide, "Is the fort tour on?", 5);
});

describe("my_conversations()", () => {
  it("returns one row per partner, newest conversation first, with the latest message either way", async () => {
    const rows = await conversationsOf(alice);
    expect(rows.map((r) => r.partner_id)).toEqual([guide, bob]);

    const [withGuide, withBob] = rows;
    expect(withGuide).toMatchObject({
      partner_name: "Gita",
      partner_role: "guide",
      partner_is_verified: true,
      last_message_content: "Is the fort tour on?",
      last_message_sender_id: alice,
      unread_count: 0,
    });
    expect(withBob).toMatchObject({
      partner_name: "Bob",
      partner_role: "traveler",
      partner_is_verified: false,
      last_message_content: "There?",
      last_message_sender_id: bob,
      unread_count: 2,
    });
    expect(withBob.last_message_created_at).toEqual(new Date("2026-11-01T10:03:00Z"));
  });

  it("counts only unread messages the caller received", async () => {
    const forBob = await conversationsOf(bob);
    expect(forBob.map((r) => [r.partner_id, r.unread_count])).toEqual([
      [carol, 1],
      [alice, 1],
    ]);
    const forGuide = await conversationsOf(guide);
    expect(forGuide).toHaveLength(1);
    expect(forGuide[0]).toMatchObject({ partner_id: alice, partner_name: "Alice", unread_count: 1 });
  });

  it("never shows other people's conversations", async () => {
    const forCarol = await conversationsOf(carol);
    expect(forCarol).toHaveLength(1);
    expect(forCarol[0]).toMatchObject({ partner_id: bob, last_message_content: "Bob, it's Carol", unread_count: 0 });
    expect(await conversationsOf(loner)).toEqual([]);
  });

  it("drops the unread count once the caller reads the conversation", async () => {
    await db.as(alice, () =>
      db.query("update messages set is_read = true where sender_id = $1 and receiver_id = $2 and is_read is not true", [
        bob,
        alice,
      ]),
    );
    const withBob = (await conversationsOf(alice)).find((r) => r.partner_id === bob);
    expect(withBob).toMatchObject({ unread_count: 0, last_message_content: "There?" });
    // Reading doesn't touch the other side's unread count.
    expect((await conversationsOf(bob)).find((r) => r.partner_id === alice).unread_count).toBe(1);
  });

  it("is not available to anonymous visitors", async () => {
    expect(await db.as("anon", () => rejects(db.query("select * from my_conversations()")))).toMatch(/permission denied/);
  });
});

describe("conversation_messages()", () => {
  let dave;
  let erin;
  let expected;

  beforeAll(async () => {
    dave = await db.createUser({ role: "traveler", name: "Dave" });
    erin = await db.createUser({ role: "guide", name: "Erin", verified: true });
    for (let minute = 0; minute < 6; minute++) {
      await seed(minute % 2 ? dave : erin, minute % 2 ? erin : dave, `message ${minute}`, minute);
    }
    // Three messages in the same instant: the id breaks the tie.
    const tiedIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of tiedIds) await seed(dave, erin, `tied ${id}`, 10, { id });

    expected = (
      await db.rows("select id from messages where (sender_id = $1 and receiver_id = $2) or (sender_id = $2 and receiver_id = $1)", [
        dave,
        erin,
      ])
    ).length;
  });

  it("pages through a conversation newest first with a (created_at, id) cursor", async () => {
    const seen = [];
    let before = null;
    for (;;) {
      const page = await pageOf(dave, erin, { before, limit: 4 });
      if (page.length === 0) break;
      expect(page.length).toBeLessThanOrEqual(4);
      seen.push(...page);
      before = page[page.length - 1];
    }

    expect(seen).toHaveLength(expected);
    expect(new Set(seen.map((m) => m.id)).size).toBe(expected);
    const sorted = [...seen].sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    expect(seen.map((m) => m.id)).toEqual(sorted.map((m) => m.id));
    expect(seen.at(-1).content).toBe("message 0");
  });

  it("returns the same conversation to both participants", async () => {
    const forDave = await pageOf(dave, erin);
    const forErin = await pageOf(erin, dave);
    expect(forErin.map((m) => m.id)).toEqual(forDave.map((m) => m.id));
  });

  it("keeps the page size between 1 and 100", async () => {
    expect(await pageOf(dave, erin, { limit: 0 })).toHaveLength(1);
    expect(await pageOf(dave, erin, { limit: 1000 })).toHaveLength(expected);
  });

  it("only ever returns the caller's own conversation", async () => {
    // Carol asks for "her conversation with Alice" and gets nothing of Alice and Bob's.
    expect(await pageOf(carol, alice)).toEqual([]);
    const forCarol = await pageOf(carol, bob);
    expect(forCarol.map((m) => m.content)).toEqual(["Bob, it's Carol"]);
    expect(await db.as("anon", () => rejects(db.query("select * from conversation_messages($1)", [alice])))).toMatch(
      /permission denied/,
    );
  });
});

describe("sending with a client-generated id", () => {
  it("keeps the client's id, while created_at and is_read stay server-owned", async () => {
    const id = randomUUID();
    const row = await db.as(alice, () =>
      db.one("insert into messages (id, sender_id, receiver_id, content) values ($1, $2, $3, 'Hi') returning *", [id, alice, bob]),
    );
    expect(row).toMatchObject({ id, is_read: false });
    expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(60_000);
    const message = await db.as(alice, () =>
      rejects(
        db.query("insert into messages (sender_id, receiver_id, content, created_at) values ($1, $2, 'Backdated', '2020-01-01')", [
          alice,
          bob,
        ]),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("rejects a reused message id, so a retried send cannot duplicate a message", async () => {
    const id = randomUUID();
    const send = () =>
      db.as(alice, () =>
        db.query("insert into messages (id, sender_id, receiver_id, content) values ($1, $2, $3, 'Once only')", [id, alice, bob]),
      );
    await send();
    expect(await rejects(send())).toMatch(/messages_pkey/);
    expect(await db.rows("select id from messages where id = $1", [id])).toHaveLength(1);
  });
});
