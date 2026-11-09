// Spins up an in-memory PostgreSQL (PGlite), applies the Supabase shim and every
// migration in order, and offers helpers to run queries as a real client role.
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const shim = readFileSync(new URL("./supabase-shim.sql", import.meta.url), "utf8");

export async function createDatabase() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(shim);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
  return new TestDb(db);
}

class TestDb {
  constructor(db) {
    this.db = db;
  }

  // Runs fn with the session switched to a client role, the way PostgREST does
  // (SET ROLE + request.jwt.claims). Always restores the superuser afterwards.
  async as(identity, fn) {
    const role = identity === "anon" ? "anon" : identity === "service" ? "service_role" : "authenticated";
    const claims = identity === "anon" || identity === "service" ? { role } : { sub: identity, role };
    await this.db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await this.db.exec(`set role ${role}`);
    try {
      return await fn(this);
    } finally {
      await this.db.exec("reset role");
      await this.db.query("select set_config('request.jwt.claims', '', false)");
    }
  }

  query(sql, params) {
    return this.db.query(sql, params);
  }

  async rows(sql, params) {
    return (await this.db.query(sql, params)).rows;
  }

  async one(sql, params) {
    return (await this.db.query(sql, params)).rows[0];
  }

  // Creates an auth user; the handle_new_user trigger creates the profile.
  async createUser({ role = "traveler", name, verified = false, rate, city = "Jaipur" } = {}) {
    const id = randomUUID();
    const email = `${role}-${id.slice(0, 8)}@test.dev`;
    await this.db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      id,
      email,
      JSON.stringify({ name: name ?? `${role} ${id.slice(0, 4)}`, role, city }),
    ]);
    if (verified || rate != null) {
      await this.db.query("update public.profiles set is_verified = $2, rate_per_day = $3 where id = $1", [
        id,
        verified,
        rate ?? null,
      ]);
    }
    return id;
  }

  async makeAdmin(id) {
    await this.db.query("insert into public.admin_lookup (user_id) values ($1)", [id]);
    await this.db.query("update public.profiles set is_admin = true where id = $1", [id]);
  }

  async createLocation(guideId, { price = 500, status = "active", title } = {}) {
    const row = await this.one(
      `insert into public.locations (title, short_description, detailed_content, lat, lng, category, guide_id, price_per_person, status)
       values ($1, 'short', 'long', 26.9, 75.8, 'Heritage', $2, $3, $4) returning id`,
      [title ?? `Spot ${randomUUID().slice(0, 6)}`, guideId, price, status],
    );
    return row.id;
  }

  // Inserts a booking directly as the superuser, bypassing client rules. Dated two
  // days back so fixtures don't count towards the traveller's daily request limit.
  async createBooking({ travelerId, guideId, status = "pending", date, amount = 1000, locationId = null }) {
    const row = await this.one(
      `insert into public.bookings (traveler_id, guide_id, destination, date, people, amount, status, location_id, created_at)
       values ($1, $2, 'Somewhere', $3, 1, $4, $5, $6, now() - interval '2 days') returning id`,
      [travelerId, guideId, date ?? daysFromNow(10), amount, status, locationId],
    );
    return row.id;
  }
}

export function daysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Resolves to the Postgres error message, or fails the test if fn succeeds.
export async function rejects(promise) {
  try {
    await promise;
  } catch (err) {
    return err.message;
  }
  throw new Error("Expected the query to fail, but it succeeded");
}
