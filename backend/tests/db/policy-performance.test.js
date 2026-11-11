import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, rejects } from "./harness.js";

let db;

beforeAll(async () => {
  db = await createDatabase();
});

describe("policy performance migration", () => {
  it("leaves no per-row auth.uid(), is_admin() or is_banned() calls in policies", async () => {
    const unwrapped = await db.rows(
      `select schemaname, tablename, policyname
         from pg_policies
        where schemaname in ('public', 'storage')
          and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT )(?<!\\.)(auth\\.uid|(public\\.)?is_admin|(public\\.)?is_banned)\\(\\)'`,
    );
    expect(unwrapped).toEqual([]);
  });

  it("keeps the policies' behaviour", async () => {
    const guide = await db.createUser({ role: "guide", verified: true });
    const traveler = await db.createUser({ role: "traveler" });
    const other = await db.createUser({ role: "traveler" });
    const admin = await db.createUser({ role: "traveler" });
    await db.makeAdmin(admin);
    await db.createLocation(guide, { status: "archived", title: "Hidden spot" });

    // owner-only reads
    await db.query("insert into notifications (user_id, type, title, body) values ($1, 'new_message', 't', 'b')", [traveler]);
    expect(await db.as(traveler, () => db.rows("select id from notifications"))).toHaveLength(1);
    expect(await db.as(other, () => db.rows("select id from notifications"))).toHaveLength(0);

    // admin-only reads
    expect((await db.as(admin, () => db.rows("select id from locations where status = 'archived'"))).length).toBe(1);
    expect(await db.as(traveler, () => db.rows("select id from locations where status = 'archived'"))).toHaveLength(0);

    // restrictive ban policy
    await db.query("update profiles set is_banned = true where id = $1", [other]);
    expect(
      await db.as(other, () =>
        rejects(db.query("insert into messages (sender_id, receiver_id, content) values ($1, $2, 'hi')", [other, traveler])),
      ),
    ).toMatch(/row-level security/);
  });
});
