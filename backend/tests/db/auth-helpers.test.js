import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./harness.js";

const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

describe("admin checks in RLS policies", () => {
  it("go through SECURITY DEFINER helpers", async () => {
    const db = await createDatabase();
    const rows = await db.rows(
      `select proname, prosecdef from pg_proc
        where pronamespace = 'public'::regnamespace and proname in ('is_admin', 'is_banned') order by proname`,
    );
    expect(rows).toEqual([
      { proname: "is_admin", prosecdef: true },
      { proname: "is_banned", prosecdef: true },
    ]);
  });

  it("never read admin_lookup directly (clients have no access to it)", async () => {
    const db = await createDatabase();
    const inline = await db.rows(
      "select tablename, policyname from pg_policies where (coalesce(qual, '') || coalesce(with_check, '')) ilike '%admin_lookup%'",
    );
    expect(inline).toEqual([]);
  });

  it("recover production, where profiles_select_admin queried admin_lookup inline", async () => {
    const db = await createDatabase();
    // Recreate production's older policy definition.
    await db.query("drop policy profiles_select_admin on public.profiles");
    await db.query(
      "create policy profiles_select_admin on public.profiles for select using (exists (select 1 from admin_lookup where admin_lookup.user_id = (select auth.uid())))",
    );
    const guide = await db.createUser({ role: "guide", verified: true });
    const traveler = await db.createUser({ role: "traveler" });

    const broken = await db.as(traveler, () => db.query("select id from profiles where id = $1", [guide]).then(() => "no error", (e) => e.message));
    expect(broken).toMatch(/permission denied for table admin_lookup/);

    await db.db.exec(migration("20261113000100_profiles_admin_policy.sql"));
    const fixed = await db.as(traveler, () => db.rows("select id from profiles where id = $1", [guide]));
    expect(fixed).toHaveLength(1);
  });
});
