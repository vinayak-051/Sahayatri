// Razorpay calls this on payment events. The verified signature — never the
// client's success callback — is the source of truth that money moved.
//
// advance paid  -> booking becomes 'confirmed'
// final paid    -> final_payment_mode = 'online'; guide is credited the full
//                  amount minus the platform commission in guide_ledger
//
// Deploy with --no-verify-jwt (Razorpay sends no Supabase JWT). Configure in the
// Razorpay dashboard: URL <project>/functions/v1/razorpay-webhook, event
// payment.captured, secret = RAZORPAY_WEBHOOK_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const COMMISSION_RATE = 0.15;

async function isValidSignature(body: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

Deno.serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !(await isValidSignature(body, signature))) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);
  if (event.event !== "payment.captured") return new Response("ignored");

  const entity = event.payload.payment.entity;
  const { data: payment } = await supabase
    .from("payments").select("*").eq("razorpay_order_id", entity.order_id).single();
  if (!payment) return new Response("no matching order");
  // Razorpay retries webhooks; a paid row means this event was already handled
  if (payment.status === "paid") return new Response("already processed");

  await supabase.from("payments")
    .update({ status: "paid", razorpay_payment_id: entity.id })
    .eq("id", payment.id);

  const { data: booking } = await supabase
    .from("bookings").select("*").eq("id", payment.booking_id).single();
  if (!booking) return new Response("booking missing");

  if (payment.stage === "advance") {
    await supabase.from("bookings")
      .update({ status: "confirmed" })
      .eq("id", booking.id)
      .eq("status", "accepted");
  } else {
    const total = Number(booking.amount);
    await supabase.from("bookings")
      .update({ final_payment_mode: "online" })
      .eq("id", booking.id);
    await supabase.from("guide_ledger").insert([
      { guide_id: booking.guide_id, booking_id: booking.id, type: "earning", amount: total },
      { guide_id: booking.guide_id, booking_id: booking.id, type: "commission", amount: -Math.round(total * COMMISSION_RATE * 100) / 100 },
    ]);
  }
  return new Response("ok");
});
