// Razorpay calls this on payment events. The verified signature — never the
// client's success callback — is the source of truth that money moved.
//
// All state changes happen in one database transaction, process_payment_captured
// (backend/supabase/migrations/20261109000000_security_hardening.sql):
//   advance paid -> booking becomes 'confirmed'
//   final paid   -> final_payment_mode = 'online'; guide credited in guide_ledger
// It is idempotent: Razorpay retries webhooks, and duplicates are no-ops.
//
// Deploy with verify_jwt = false (see supabase/config.toml): Razorpay sends no
// Supabase JWT. Configure in the Razorpay dashboard: URL
// <project>/functions/v1/razorpay-webhook, event payment.captured,
// secret = RAZORPAY_WEBHOOK_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares in constant time so the signature can't be guessed byte by byte.
function timingSafeEqual(a: string, b: string) {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacSha256Hex(Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!, body);
  if (!signature || !timingSafeEqual(signature, expected)) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);
  if (event.event !== "payment.captured") return new Response("ignored");

  const entity = event.payload.payment.entity;
  const { data, error } = await supabase.rpc("process_payment_captured", {
    p_order_id: entity.order_id,
    p_payment_id: entity.id,
  });
  if (error) {
    // A 5xx makes Razorpay retry, which is safe because processing is idempotent.
    console.error("process_payment_captured failed", error);
    return new Response("processing failed", { status: 500 });
  }
  if (data !== "ok") console.warn(`payment ${entity.id} for order ${entity.order_id}: ${data}`);
  return new Response(String(data));
});
