import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

const review = (db, who, guide) =>
  db.as(who, () =>
    db.query("insert into reviews (guide_id, reviewer_id, rating, comment) values ($1, $2, 5, 'Great')", [guide, who]),
  );

describe("guide review policies", () => {
  it("allow only travellers with a completed trip, and never banned users", async () => {
    const db = await createDatabase();
    const guide = await db.createUser({ role: "guide", verified: true });
    const stranger = await db.createUser({ role: "traveler" });
    const guest = await db.createUser({ role: "traveler" });
    await db.createBooking({ travelerId: guest, guideId: guide, status: "completed", date: daysFromNow(-5) });

    expect(await rejects(review(db, stranger, guide))).toMatch(/row-level security/);
    expect((await review(db, guest, guide)).affectedRows).toBe(1);

    const banned = await db.createUser({ role: "traveler" });
    await db.createBooking({ travelerId: banned, guideId: guide, status: "completed", date: daysFromNow(-6) });
    await db.query("update profiles set is_banned = true where id = $1", [banned]);
    expect(await rejects(review(db, banned, guide))).toMatch(/row-level security/);
  });

  it("repair production's extra policy that let any traveller review any guide", async () => {
    const db = await createDatabase();
    await db.query(
      `create policy reviews_insert_as_traveler on public.reviews for insert with check (
         reviewer_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'traveler'))`,
    );
    const guide = await db.createUser({ role: "guide", verified: true });
    const stranger = await db.createUser({ role: "traveler" });
    expect((await review(db, stranger, guide)).affectedRows).toBe(1); // the drift: anyone could review
    await db.query("delete from reviews");

    await db.db.exec(
      readFileSync(new URL("../../supabase/migrations/20261116000000_review_policies.sql", import.meta.url), "utf8"),
    );
    expect(await rejects(review(db, stranger, guide))).toMatch(/row-level security/);
    const inserts = await db.rows(
      "select policyname from pg_policies where tablename = 'reviews' and cmd = 'INSERT' and permissive = 'PERMISSIVE'",
    );
    expect(inserts.map((p) => p.policyname)).toEqual(["reviews_insert_completed_booking"]);
  });
});
