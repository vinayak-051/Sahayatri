import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, daysFromNow, rejects } from "./harness.js";

let db;
let travelerA;
let travelerB;
let guide;
let otherGuide;
let cashGuide;
let admin;
let spot;

beforeAll(async () => {
  db = await createDatabase();
  travelerA = await db.createUser({ role: "traveler" });
  travelerB = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, rate: 2000 });
  otherGuide = await db.createUser({ role: "guide" });
  cashGuide = await db.createUser({ role: "guide" });
  admin = await db.createUser({ role: "traveler" });
  await db.makeAdmin(admin);
  spot = await db.createLocation(guide, { title: "Hawa Mahal" });
});

describe("admin_overview_stats", () => {
  beforeAll(async () => {
    const booking = (status, amount, date) =>
      db.createBooking({ travelerId: travelerA, guideId: guide, status, amount, date: daysFromNow(date) });
    await booking("pending", 500, 20);
    await booking("accepted", 700, 21);
    await booking("confirmed", 900, 22);
    await booking("completed", 1000, -5);
    await booking("completed", 3000, -6);
    await booking("declined", 400, 23);
    const cancelled = await booking("cancelled", 2000, 3);
    await db.query("update bookings set cancellation_fee = 200 where id = $1", [cancelled]);
    // A stray cancellation fee on a booking that is not cancelled must not count.
    const stray = await db.createBooking({ travelerId: travelerB, guideId: guide, status: "pending", amount: 100, date: daysFromNow(24) });
    await db.query("update bookings set cancellation_fee = 50 where id = $1", [stray]);

    await db.query(
      `insert into guide_ledger (guide_id, type, amount) values
         ($1, 'earning', 3000), ($1, 'commission', -450), ($1, 'payout', -1000),
         ($2, 'earning', 1000), ($2, 'commission', -150),
         ($3, 'commission', -100)`,
      [guide, otherGuide, cashGuide],
    );

    await db.query(
      "insert into buddy_trips (user_id, destination, start_date, end_date) values ($1, 'Goa', $2, $3)",
      [travelerA, daysFromNow(30), daysFromNow(33)],
    );
    await db.query(
      `insert into reports (location_id, reported_by, reason, status) values
         ($1, $2, 'Spam', 'open'), ($1, $3, 'Wrong info', 'reviewed')`,
      [spot, travelerA, travelerB],
    );
    await db.query(
      `insert into verification_requests (guide_id, document_type, document_path, status) values
         ($1, 'aadhaar', 'a/doc.pdf', 'pending'), ($2, 'passport', 'b/doc.pdf', 'approved')`,
      [otherGuide, cashGuide],
    );
  });

  it("returns every dashboard total in one call", async () => {
    const { stats } = await db.as(admin, () => db.one("select admin_overview_stats() as stats"));
    expect(stats).toEqual({
      travelers: 2,
      guides: 3,
      verified_guides: 1,
      bookings: { total: 8, pending: 2, accepted: 1, confirmed: 1, completed: 2, declined: 1, cancelled: 1 },
      buddy_trips: 1,
      open_reports: 1,
      pending_verifications: 1,
      gross_booking_value: 4000,
      commission_revenue: 700,
      cancellation_fees: 200,
      platform_revenue: 900,
      outstanding_guide_balances: 2400,
    });
  });

  it("is admin-only", async () => {
    for (const user of [travelerA, guide]) {
      expect(await db.as(user, () => rejects(db.query("select admin_overview_stats()")))).toMatch(/Unauthorized/);
    }
    expect(await db.as("anon", () => rejects(db.query("select admin_overview_stats()")))).toMatch(
      /permission denied for function/,
    );
  });
});

describe("admin_delete_review", () => {
  let guideReviewKeep;
  let guideReviewRemove;
  let spotReviewKeep;
  let spotReviewRemove;

  const addGuideReview = async (reviewerId, rating, comment) =>
    (
      await db.one("insert into reviews (guide_id, reviewer_id, rating, comment) values ($1, $2, $3, $4) returning id", [
        guide,
        reviewerId,
        rating,
        comment,
      ])
    ).id;
  const addSpotReview = async (reviewerId, rating, comment) =>
    (
      await db.one(
        "insert into location_reviews (location_id, reviewer_id, rating, comment) values ($1, $2, $3, $4) returning id",
        [spot, reviewerId, rating, comment],
      )
    ).id;
  const guideRating = async () => Number((await db.one("select rating from profiles where id = $1", [guide])).rating);
  const spotRating = async () => {
    const row = await db.one("select rating, reviews_count from locations where id = $1", [spot]);
    return [Number(row.rating), row.reviews_count];
  };

  beforeAll(async () => {
    guideReviewKeep = await addGuideReview(travelerA, 5, "Wonderful guide");
    guideReviewRemove = await addGuideReview(travelerB, 1, "Rude and abusive");
    spotReviewKeep = await addSpotReview(travelerA, 4, "Lovely at sunset");
    spotReviewRemove = await addSpotReview(travelerB, 2, "Buy my tours instead");
  });

  it("lets admins read reviews with author and target names, even on archived spots", async () => {
    await db.query("update locations set status = 'archived' where id = $1", [spot]);
    try {
      const rows = await db.as(admin, () =>
        db.rows(
          `select r.id, a.name as author, l.title as target
             from location_reviews r
             join profiles a on a.id = r.reviewer_id
             join locations l on l.id = r.location_id
            where r.location_id = $1`,
          [spot],
        ),
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.author && r.target === "Hawa Mahal")).toBe(true);
    } finally {
      await db.query("update locations set status = 'active' where id = $1", [spot]);
    }
  });

  it("is rejected for non-admins and leaves the review in place", async () => {
    for (const user of [travelerB, guide]) {
      const message = await db.as(user, () =>
        rejects(db.query("select admin_delete_review('guide', $1, 'Not allowed')", [guideReviewRemove])),
      );
      expect(message).toMatch(/Unauthorized/);
    }
    expect(
      await db.as("anon", () => rejects(db.query("select admin_delete_review('spot', $1, 'x')", [spotReviewRemove]))),
    ).toMatch(/permission denied for function/);
    const { n } = await db.one("select count(*)::int as n from reviews where id = $1", [guideReviewRemove]);
    expect(n).toBe(1);
  });

  it("validates the kind and requires a reason", async () => {
    await db.as(admin, async () => {
      expect(await rejects(db.query("select admin_delete_review('photo', $1, 'Spam')", [guideReviewRemove]))).toMatch(
        /guide or spot/,
      );
      expect(await rejects(db.query("select admin_delete_review('guide', $1, '   ')", [guideReviewRemove]))).toMatch(
        /reason/,
      );
      // A guide review id is not a spot review.
      expect(await rejects(db.query("select admin_delete_review('spot', $1, 'Spam')", [guideReviewRemove]))).toMatch(
        /not found/,
      );
    });
  });

  it("deletes a guide review, audits it and re-syncs the guide's rating", async () => {
    expect(await guideRating()).toBe(3);
    await db.as(admin, () =>
      db.query("select admin_delete_review('guide', $1, '  Abusive language  ')", [guideReviewRemove]),
    );

    expect(await db.rows("select id from reviews where guide_id = $1", [guide])).toEqual([{ id: guideReviewKeep }]);
    expect(await guideRating()).toBe(5);

    const audit = await db.one(
      "select admin_id, details from admin_actions where action = 'delete_review' and target_id = $1",
      [guideReviewRemove],
    );
    expect(audit.admin_id).toBe(admin);
    expect(audit.details).toMatchObject({
      kind: "guide",
      target_id: guide,
      reviewer_id: travelerB,
      rating: 1,
      comment: "Rude and abusive",
      reason: "Abusive language",
    });
    expect(audit.details.reviewer_name).toBeTruthy();
    expect(audit.details.target_name).toBeTruthy();
  });

  it("deletes a spot review, audits it and re-syncs the spot's rating and count", async () => {
    expect(await spotRating()).toEqual([3, 2]);
    await db.as(admin, () => db.query("select admin_delete_review('spot', $1, 'Self-promotion')", [spotReviewRemove]));

    expect(await db.rows("select id from location_reviews where location_id = $1", [spot])).toEqual([
      { id: spotReviewKeep },
    ]);
    expect(await spotRating()).toEqual([4, 1]);

    const audit = await db.one("select details from admin_actions where action = 'delete_review' and target_id = $1", [
      spotReviewRemove,
    ]);
    expect(audit.details).toMatchObject({
      kind: "spot",
      target_id: spot,
      target_name: "Hawa Mahal",
      reviewer_id: travelerB,
      rating: 2,
      comment: "Buy my tours instead",
      reason: "Self-promotion",
    });
  });

  it("reports a review that is already gone", async () => {
    expect(
      await db.as(admin, () => rejects(db.query("select admin_delete_review('spot', $1, 'Again')", [spotReviewRemove]))),
    ).toMatch(/not found/);
  });

  it("allows no unaudited deletes, even by admins", async () => {
    await db.as(admin, async () => {
      expect((await db.query("delete from location_reviews where id = $1", [spotReviewKeep])).affectedRows).toBe(0);
      expect((await db.query("delete from reviews where id = $1", [guideReviewKeep])).affectedRows).toBe(0);
    });
    const { n } = await db.one("select count(*)::int as n from admin_actions where action = 'delete_review'");
    expect(n).toBe(2);
  });
});
