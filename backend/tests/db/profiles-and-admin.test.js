import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, rejects } from "./harness.js";

let db;
let traveler;
let guide;
let admin;

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
});

describe("admin_lookup (B1)", () => {
  it("cannot be read or written by clients", async () => {
    await db.as(traveler, async () => {
      expect(await rejects(db.query("select * from admin_lookup"))).toMatch(/permission denied/);
      expect(await rejects(db.query("insert into admin_lookup (user_id) values ($1)", [traveler]))).toMatch(
        /permission denied/,
      );
    });
    await db.as("anon", async () => {
      expect(await rejects(db.query("delete from admin_lookup"))).toMatch(/permission denied/);
    });
  });

  it("still identifies admins through is_admin()", async () => {
    expect((await db.as(admin, () => db.one("select is_admin() as v"))).v).toBe(true);
    expect((await db.as(traveler, () => db.one("select is_admin() as v"))).v).toBe(false);
  });
});

describe("profile updates (B2)", () => {
  it("lets users edit their own profile fields", async () => {
    const result = await db.as(guide, () =>
      db.query("update profiles set name = 'Asha', bio = 'Local guide', rate_per_day = 2500 where id = $1", [guide]),
    );
    expect(result.affectedRows).toBe(1);
  });

  it.each(["is_verified = true", "is_banned = false", "is_admin = true", "rating = 5", "email = 'x@y.dev'"])(
    "rejects a user setting %s on their own profile",
    async (assignment) => {
      const message = await db.as(guide, () => rejects(db.query(`update profiles set ${assignment} where id = $1`, [guide])));
      expect(message).toMatch(/permission denied/);
    },
  );

  it("does not let users edit someone else's profile", async () => {
    const result = await db.as(traveler, () => db.query("update profiles set name = 'Hacked' where id = $1", [guide]));
    expect(result.affectedRows).toBe(0);
  });

  it("allows choosing a role only during onboarding", async () => {
    // Signed up with a role: already onboarded, so the role is fixed.
    expect(
      await db.as(traveler, () => rejects(db.query("update profiles set role = 'guide' where id = $1", [traveler]))),
    ).toMatch(/Role cannot be changed after onboarding/);

    // Google sign-in creates a profile without a role; CompleteProfile picks it once.
    const oauthUser = randomUUID();
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      oauthUser,
      `oauth-${oauthUser.slice(0, 8)}@test.dev`,
      JSON.stringify({ name: "OAuth User" }),
    ]);
    await db.as(oauthUser, async () => {
      const result = await db.query("update profiles set role = 'guide', onboarded = true where id = $1", [oauthUser]);
      expect(result.affectedRows).toBe(1);
      expect(await rejects(db.query("update profiles set role = 'traveler' where id = $1", [oauthUser]))).toMatch(
        /Role cannot be changed/,
      );
      expect(await rejects(db.query("update profiles set onboarded = false where id = $1", [oauthUser]))).toMatch(
        /Onboarding cannot be undone/,
      );
    });
  });

  it("rejects a negative day rate", async () => {
    expect(
      await db.as(guide, () => rejects(db.query("update profiles set rate_per_day = -1 where id = $1", [guide]))),
    ).toMatch(/profiles_rate_non_negative/);
  });
});

describe("profile privacy (B4)", () => {
  it("lets signed-in users see public guide fields but not emails", async () => {
    await db.as(traveler, async () => {
      expect((await db.rows("select name, city from profiles where id = $1", [guide])).length).toBe(1);
      expect(await rejects(db.query("select email from profiles where id = $1", [guide]))).toMatch(/permission denied/);
      expect(await rejects(db.query("select * from profiles where id = $1", [guide]))).toMatch(/permission denied/);
    });
  });

  it("hides every profile from anonymous visitors", async () => {
    const rows = await db.as("anon", () => db.rows("select id from profiles"));
    expect(rows).toHaveLength(0);
  });

  it("shows emails to admins only, through admin_profiles", async () => {
    const adminRows = await db.as(admin, () => db.rows("select email from admin_profiles where email is not null"));
    expect(adminRows.length).toBeGreaterThanOrEqual(3);
    const travelerRows = await db.as(traveler, () => db.rows("select email from admin_profiles"));
    expect(travelerRows).toHaveLength(0);
    expect(await db.as("anon", () => rejects(db.query("select email from admin_profiles")))).toMatch(/permission denied/);
  });
});
