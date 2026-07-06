// Editor-only shims: VS Code's built-in TypeScript server doesn't know the
// Deno runtime these functions actually run on, so without this it flags
// `Deno.*` and `npm:` imports as errors. The Supabase edge runtime provides
// the real implementations; installing the Deno VS Code extension replaces
// these shims with full type checking.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module "npm:@supabase/supabase-js@2.45.4" {
  // deno-lint-ignore no-explicit-any
  export function createClient(url: string, key: string): any;
}

declare module "npm:web-push@3.6.7";
