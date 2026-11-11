// A stand-in for a supabase-js query builder: every builder method (select, eq,
// order, limit, single, insert, ...) is recorded and returns the builder, and
// awaiting the builder resolves to `result`.
export interface QueryCall {
  method: string;
  args: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockQuery(result: unknown, calls: QueryCall[] = []): any {
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return builder;
        };
      },
    },
  );
  return builder;
}
