import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, rejects } from "./harness.js";

let db;
let traveler;
let guide;
let unverifiedGuide;
let bannedGuide;

// Inserts a spot as the superuser with full control over the searchable fields.
async function addSpot(guideId, { title, city = null, category = "Heritage", tags = [], description = "short", price = 500, status = "active", createdAt = null }) {
  const row = await db.one(
    `insert into public.locations (title, short_description, detailed_content, lat, lng, city, category, tags, guide_id, price_per_person, status, created_at)
     values ($1, $2, 'long', 26.9, 75.8, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now())) returning id`,
    [title, description, city, category, tags, guideId, price, status, createdAt],
  );
  return row.id;
}

const SEARCH_SQL = "select * from search_locations(p_query => $1, p_category => $2, p_min_price => $3, p_max_price => $4, p_after_rank => $5, p_after_created_at => $6, p_after_id => $7, p_limit => $8)";

function search(as, { query = null, category = null, min = null, max = null, after = null, limit = 50 } = {}) {
  return db.as(as, () =>
    db.rows(SEARCH_SQL, [query, category, min, max, after?.rank ?? null, after?.created_at ?? null, after?.id ?? null, limit]),
  );
}

const titles = (rows) => rows.map((r) => r.title).sort();

beforeAll(async () => {
  db = await createDatabase();
  traveler = await db.createUser({ role: "traveler" });
  guide = await db.createUser({ role: "guide", verified: true, name: "Asha Guide", city: "Jaipur" });
  unverifiedGuide = await db.createUser({ role: "guide", verified: false });
  bannedGuide = await db.createUser({ role: "guide", verified: true });
  await db.query("update profiles set is_banned = true where id = $1", [bannedGuide]);

  await addSpot(guide, { title: "Amber Fort", city: "Jaipur", category: "Heritage", tags: ["Fort", "Sunset Views"], price: 300, createdAt: "2026-01-01" });
  await addSpot(guide, { title: "Hawa Mahal", city: "Jaipur", category: "Cultural", tags: ["palace"], price: 1200, createdAt: "2026-01-02" });
  await addSpot(guide, { title: "Chinese Fishing Nets", city: "Kochi", category: "Beach", tags: ["fishing"], price: 2000, createdAt: "2026-01-03" });
  await addSpot(guide, { title: "Shanti Stupa", city: "Leh", category: "Spiritual", description: "Calm views over Jaipur-style domes", price: null, createdAt: "2026-01-04" });
  await addSpot(guide, { title: "Old Jaipur Walk", city: "Jaipur", status: "archived", createdAt: "2026-01-05" });
  await addSpot(guide, { title: "Jaipur Draft", city: "Jaipur", status: "draft", createdAt: "2026-01-06" });
  await addSpot(unverifiedGuide, { title: "Unverified Jaipur Tour", city: "Jaipur", createdAt: "2026-01-07" });
  await addSpot(bannedGuide, { title: "Banned Jaipur Tour", city: "Jaipur", createdAt: "2026-01-08" });
});

describe("search_locations", () => {
  it("matches word prefixes in titles and cities, case-insensitively", async () => {
    expect(titles(await search(traveler, { query: "jai" }))).toEqual(["Amber Fort", "Hawa Mahal", "Shanti Stupa"]);
    expect(titles(await search(traveler, { query: "KOCHI" }))).toEqual(["Chinese Fishing Nets"]);
    expect(titles(await search(traveler, { query: "amb fo" }))).toEqual(["Amber Fort"]);
    expect(titles(await search(traveler, { query: "sunset" }))).toEqual(["Amber Fort"]);
    expect(await search(traveler, { query: "amber kochi" })).toHaveLength(0);
  });

  it("ranks title and city matches above description matches", async () => {
    const rows = await search(traveler, { query: "jaipur" });
    expect(rows.at(-1).title).toBe("Shanti Stupa");
    expect(Number(rows[0].rank)).toBeGreaterThan(Number(rows.at(-1).rank));
  });

  it("lists newest first when there is no query, with the guide's public fields", async () => {
    const rows = await search(traveler);
    expect(rows.map((r) => r.title)).toEqual(["Shanti Stupa", "Chinese Fishing Nets", "Hawa Mahal", "Amber Fort"]);
    expect(rows[0].guide).toEqual({ id: guide, name: "Asha Guide", profile_photo_url: null, city: "Jaipur", rating: 0 });
    expect(Number(rows[0].total_count)).toBe(4);
    expect(Number(rows[0].rank)).toBe(0);
  });

  it("filters by category and by price (min inclusive, max exclusive)", async () => {
    expect(titles(await search(traveler, { category: "Cultural" }))).toEqual(["Hawa Mahal"]);
    expect(titles(await search(traveler, { query: "jaipur", category: "Heritage" }))).toEqual(["Amber Fort"]);
    expect(titles(await search(traveler, { max: 500 }))).toEqual(["Amber Fort"]);
    expect(titles(await search(traveler, { min: 500, max: 2000 }))).toEqual(["Hawa Mahal"]);
    expect(titles(await search(traveler, { min: 2000 }))).toEqual(["Chinese Fishing Nets"]);
  });

  it("excludes archived and draft spots and spots of unverified or banned guides", async () => {
    const all = titles(await search(traveler, { query: "jaipur" }));
    for (const hidden of ["Old Jaipur Walk", "Jaipur Draft", "Unverified Jaipur Tour", "Banned Jaipur Tour"]) {
      expect(all).not.toContain(hidden);
    }
    // Even the owner of a draft does not see it in the public search.
    expect(titles(await search(guide, { query: "draft" }))).toEqual([]);
  });

  it("treats hostile input as plain text and never errors", async () => {
    for (const query of ["'", "\\", "&|!():*", "jai' | 'x", "amber:* & !fort", "(((", "a:*B", "' or 1=1 --", "%_", "  "]) {
      const rows = await search(traveler, { query });
      expect(Array.isArray(rows)).toBe(true);
    }
    expect(await search(traveler, { query: "&|!():*" })).toHaveLength(0);
    expect(titles(await search(traveler, { query: "amber!!" }))).toEqual(["Amber Fort"]);
    expect(titles(await search(traveler, { query: "(hawa)" }))).toEqual(["Hawa Mahal"]);
  });

  it("caps the page size and rejects a partial cursor", async () => {
    expect(await search(traveler, { limit: 1 })).toHaveLength(1);
    expect(await search(traveler, { limit: 0 })).toHaveLength(1);
    const message = await db.as(traveler, () =>
      rejects(db.query(SEARCH_SQL, [null, null, null, null, null, null, guide, 12])),
    );
    expect(message).toMatch(/Invalid search cursor/);
  });

  it("is for signed-in users only", async () => {
    expect(await db.as("anon", () => rejects(db.query("select * from search_locations()")))).toMatch(
      /permission denied for function/,
    );
  });
});

describe("search_locations keyset pagination", () => {
  let pager;

  beforeAll(async () => {
    pager = await db.createUser({ role: "guide", verified: true, city: "Udaipur" });
    // Many spots share created_at and rank, so ties must be broken by id.
    for (let i = 0; i < 23; i += 1) {
      await addSpot(pager, { title: `Lake Palace ${i}`, city: "Udaipur", category: "Nature", createdAt: i % 3 === 0 ? "2026-02-01" : `2026-02-${String(2 + i).padStart(2, "0")}` });
    }
  });

  async function pageThrough(filters, limit) {
    const seen = [];
    let after = null;
    for (let guard = 0; guard < 50; guard += 1) {
      const rows = await search(traveler, { ...filters, after, limit });
      seen.push(...rows.map((r) => r.id));
      if (rows.length < limit) return seen;
      after = rows.at(-1);
    }
    throw new Error("pagination did not finish");
  }

  it("returns every match exactly once, both browsing and searching", async () => {
    for (const filters of [{ category: "Nature" }, { query: "lake udai" }]) {
      const first = await search(traveler, { ...filters, limit: 5 });
      const total = Number(first[0].total_count);
      expect(total).toBe(23);
      const ids = await pageThrough(filters, 5);
      expect(ids).toHaveLength(23);
      expect(new Set(ids).size).toBe(23);
    }
  });

  it("does not repeat or skip spots when a newer spot is added between pages", async () => {
    const first = await search(traveler, { category: "Nature", limit: 10 });
    await addSpot(pager, { title: "Lake Palace new", city: "Udaipur", category: "Nature" });
    const rest = [];
    let after = first.at(-1);
    for (;;) {
      const rows = await search(traveler, { category: "Nature", after, limit: 10 });
      rest.push(...rows);
      if (rows.length < 10) break;
      after = rows.at(-1);
    }
    const ids = [...first, ...rest].map((r) => r.id);
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
    expect(rest.map((r) => r.title)).not.toContain("Lake Palace new");
    expect(Number(rest[0].total_count)).toBe(24);
  });
});

describe("search_vector", () => {
  it("is kept up to date when a guide creates and edits a spot through the API", async () => {
    const id = await db.as(guide, async () => {
      const row = await db.one(
        `insert into locations (title, short_description, detailed_content, lat, lng, city, category, guide_id, price_per_person)
         values ('Nahargarh Fort', 'Hilltop fort', 'long', 26.9, 75.8, 'Jaipur', 'Heritage', $1, 400) returning id`,
        [guide],
      );
      return row.id;
    });
    expect(titles(await search(traveler, { query: "nahar" }))).toEqual(["Nahargarh Fort"]);

    await db.as(guide, () => db.query("update locations set title = 'Jaigarh Fort', tags = '{Cannon}' where id = $1", [id]));
    expect(await search(traveler, { query: "nahar" })).toHaveLength(0);
    expect(titles(await search(traveler, { query: "cannon" }))).toEqual(["Jaigarh Fort"]);
  });

  it("cannot be written by clients", async () => {
    const spot = await db.createLocation(guide);
    const message = await db.as(guide, () =>
      rejects(db.query("update locations set search_vector = to_tsvector('simple', 'x') where id = $1", [spot])),
    );
    expect(message).toMatch(/permission denied|can only be updated to DEFAULT/);
  });
});
