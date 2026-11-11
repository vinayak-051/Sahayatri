// Helpers for building PostgREST filters from text a user typed, so commas,
// dots, colons, parentheses and quotes are data and never filter syntax.

/**
 * Quotes a value for use inside a PostgREST logic filter such as `.or()`:
 * wraps it in double quotes and backslash-escapes `\` and `"`.
 * Example: `a,b` becomes `"a,b"`.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/**
 * An ilike pattern matching `term` anywhere. LIKE wildcards in the term (`%`, `_`,
 * `\`) are escaped so they match literally. PostgREST turns `*` into `%` in like
 * patterns and has no escape for it, so `*` becomes `_` (any one character).
 */
export function containsPattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "_");
  return `%${escaped}%`;
}

/**
 * An `.or()` filter matching rows where any of `columns` contains `term`
 * (case-insensitive), e.g. `name.ilike."%jai%",city.ilike."%jai%"`.
 */
export function ilikeAnyFilter(columns: string[], term: string): string {
  const value = quoteFilterValue(containsPattern(term));
  return columns.map((column) => `${column}.ilike.${value}`).join(",");
}
