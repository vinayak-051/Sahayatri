// All money actions for bookings, invoked from the app with the traveler's JWT
// via supabase.functions.invoke("payments-api"). Razorpay keys live in function
// secrets; the client only ever receives order ids and the public key id.
//
// Actions:
//   create_order { booking_id, stage: "advance" | "final" }
//     advance = 50% of the booking amount, payable once the guide accepts;
//     final   = remaining 50% online, payable after the advance is paid.
//   cancel { booking_id }
//     Refunds the advance. Within 5 days of the trip date, 10% of the total is
//     forfeited as a cancellation fee (kept entirely by the platform).
//   confirm_cash { booking_id }
//     Traveler confirms the final 50% was handed to the guide in cash. The
//     platform's full commission is then deducted from the advance it holds.
//
// The webhook (razorpay-webhook) — not the client callback — is what marks
// payments as paid.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

const COMMISSION_RATE = 0.15;
const CANCELLATION_FEE_RATE = 0.10;
const CANCELLATION_WINDOW_DAYS = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function razorpay(path: string, body: unknown) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Razorpay ${path} failed: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { action, booking_id, stage } = await req.json();
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", booking_id).single();
  if (!booking || booking.traveler_id !== user.id) return json({ error: "Booking not found" }, 404);

  // integer paise everywhere so the two halves always sum to the exact total
  const totalPaise = Math.round(Number(booking.amount) * 100);
  const advancePaise = Math.round(totalPaise / 2);
  const finalPaise = totalPaise - advancePaise;

  const { data: paidRows } = await supabase
    .from("payments").select("stage").eq("booking_id", booking.id).eq("status", "paid");
  const advancePaid = (paidRows ?? []).some((p) => p.stage === "advance");
  const finalPaid = (paidRows ?? []).some((p) => p.stage === "final");

  try {
    if (action === "create_order") {
      if (stage === "advance") {
        if (booking.status !== "accepted" || advancePaid) {
          return json({ error: "Advance is not payable for this booking" }, 400);
        }
      } else if (stage === "final") {
        if (!advancePaid || finalPaid || booking.final_payment_mode || !["confirmed", "completed"].includes(booking.status)) {
          return json({ error: "Final payment is not payable for this booking" }, 400);
        }
      } else {
        return json({ error: "Invalid stage" }, 400);
      }

      const paise = stage === "advance" ? advancePaise : finalPaise;
      const order = await razorpay("/orders", {
        amount: paise,
        currency: "INR",
        receipt: booking.id,
        notes: { booking_id: booking.id, stage },
      });
      await supabase.from("payments").insert({
        booking_id: booking.id,
        stage,
        razorpay_order_id: order.id,
        amount: paise / 100,
      });
      return json({ order_id: order.id, amount: paise, currency: "INR", key_id: RAZORPAY_KEY_ID });
    }

    if (action === "cancel") {
      if (["pending", "accepted"].includes(booking.status)) {
        // nothing paid yet: plain cancellation, no refund needed
        await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
        return json({ cancelled: true, refund: 0, fee: 0 });
      }
      if (booking.status !== "confirmed") return json({ error: "This booking can no longer be cancelled" }, 400);

      const { data: advance } = await supabase
        .from("payments").select("*")
        .eq("booking_id", booking.id).eq("stage", "advance").eq("status", "paid")
        .single();
      if (!advance?.razorpay_payment_id) return json({ error: "Advance payment record not found" }, 400);

      const daysUntilTrip = Math.ceil((new Date(booking.date).getTime() - Date.now()) / 86_400_000);
      const feePaise = daysUntilTrip <= CANCELLATION_WINDOW_DAYS ? Math.round(totalPaise * CANCELLATION_FEE_RATE) : 0;
      const refundPaise = advancePaise - feePaise;

      if (refundPaise > 0) {
        // partial refund back to the traveler's original UPI/card
        await razorpay(`/payments/${advance.razorpay_payment_id}/refund`, { amount: refundPaise });
      }
      await supabase.from("payments")
        .update({ status: "refunded", refund_amount: refundPaise / 100 })
        .eq("id", advance.id);
      // fee is platform revenue: no guide_ledger rows on cancellation
      await supabase.from("bookings")
        .update({ status: "cancelled", cancellation_fee: feePaise / 100 })
        .eq("id", booking.id);
      return json({ cancelled: true, refund: refundPaise / 100, fee: feePaise / 100 });
    }

    if (action === "confirm_cash") {
      const today = new Date().toISOString().slice(0, 10);
      if (!advancePaid || finalPaid || booking.final_payment_mode || !["confirmed", "completed"].includes(booking.status)) {
        return json({ error: "Cash payment cannot be recorded for this booking" }, 400);
      }
      if (booking.date > today) return json({ error: "Cash payment can be confirmed only after the trip date" }, 400);

      await supabase.from("bookings").update({ final_payment_mode: "cash" }).eq("id", booking.id);
      // guide already holds the final 50% in cash, so the platform credits only
      // the advance it holds, minus the full commission on the total
      await supabase.from("guide_ledger").insert([
        { guide_id: booking.guide_id, booking_id: booking.id, type: "earning", amount: advancePaise / 100 },
        { guide_id: booking.guide_id, booking_id: booking.id, type: "commission", amount: -Math.round(totalPaise * COMMISSION_RATE) / 100 },
      ]);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("payments-api error", err);
    return json({ error: "Payment operation failed, please try again" }, 500);
  }
});
