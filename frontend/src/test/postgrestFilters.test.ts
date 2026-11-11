import { describe, expect, it } from "vitest";
import { containsPattern, ilikeAnyFilter, quoteFilterValue } from "@/lib/postgrestFilters";

describe("quoteFilterValue", () => {
  it("wraps values in double quotes so PostgREST reserved characters are data", () => {
    expect(quoteFilterValue("Jaipur")).toBe('"Jaipur"');
    expect(quoteFilterValue("a,b.c:d(e)")).toBe('"a,b.c:d(e)"');
  });

  it("escapes double quotes and backslashes", () => {
    expect(quoteFilterValue('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteFilterValue("back\\slash")).toBe('"back\\\\slash"');
    expect(quoteFilterValue('\\"')).toBe('"\\\\\\""');
  });
});

describe("containsPattern", () => {
  it("matches the term anywhere", () => {
    expect(containsPattern("jai")).toBe("%jai%");
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
    expect(containsPattern("a\\b")).toBe("%a\\\\b%");
  });

  it("turns * (a wildcard for PostgREST) into a single-character match", () => {
    expect(containsPattern("a*b")).toBe("%a_b%");
  });
});

describe("ilikeAnyFilter", () => {
  it("builds one quoted ilike condition per column", () => {
    expect(ilikeAnyFilter(["name", "city"], "jai")).toBe('name.ilike."%jai%",city.ilike."%jai%"');
  });

  it("keeps hostile input inside the quoted value", () => {
    const filter = ilikeAnyFilter(["name"], 'x",role.eq.admin,name.ilike."y');
    expect(filter).toBe('name.ilike."%x\\",role.eq.admin,name.ilike.\\"y%"');
    expect(ilikeAnyFilter(["name", "city"], "),(id.eq.1").split('ilike."')).toHaveLength(3);
  });
});
