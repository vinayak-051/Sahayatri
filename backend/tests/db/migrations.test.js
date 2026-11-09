import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./harness.js";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

describe("migrations", () => {
  it("apply cleanly to a fresh database", async () => {
    const db = await createDatabase();
    const { n } = await db.one("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(n).toBeGreaterThanOrEqual(17);
  });

  it("can re-apply every migration after the baseline (safe to re-run)", async () => {
    const db = await createDatabase();
    const later = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort().slice(1);
    for (const file of later) {
      await expect(db.db.exec(readFileSync(new URL(file, migrationsDir), "utf8"))).resolves.toBeDefined();
    }
  });
});
