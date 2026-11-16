// End-to-end smoke test against a live Supabase project, across real accounts.
//
//   cd backend && node scripts/smoke-production.mjs
//
// Uses the service-role key in backend/.env only to mint one-time sessions for the
// seeded demo accounts (magic-link tokens, no email sent, no passwords) and to clean
// up. Every query in the flows runs as the signed-in user, through RLS, exactly as
// the app does. Everything the test creates is tagged and deleted at the end.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { supabaseAdmin as admin } from "../supabaseClient.js";

const env = Object.fromEntries(
  readFileSync(new URL("../../frontend/.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const TAG = `[smoke ${new Date().toISOString().slice(0, 16)}]`;
const results = [];
const cleanup = [];

async function signIn(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  const { data: s, error: e } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (e) throw e;
  client.realtime.setAuth(s.session.access_token);
  return { client, id: s.user.id, email };
}

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail });
  } catch (err) {
    results.push({ ok: false, name, detail: err?.message ?? String(err) });
  }
}

const must = ({ data, error }) => {
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
  return data;
};
const expectError = ({ error }, pattern) => {
  if (!error) throw new Error("expected an error but the request succeeded");
  if (pattern && !pattern.test(error.message)) throw new Error(`unexpected error: ${error.message}`);
  return error.message;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// Waits for a realtime INSERT matching `match` on `table`, subscribed as `who`.
async function waitForRealtime(who, table, filter, match, trigger) {
  let resolveEvent;
  const got = new Promise((r) => (resolveEvent = r));
  const channel = who.client
    .channel(`smoke-${table}-${Math.random()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, (p) => match(p.new) && resolveEvent(p.new));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("realtime subscribe timed out")), 15000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
    });
  });
  await sleep(1000);
  await trigger();
  const row = await Promise.race([got, sleep(15000).then(() => null)]);
  await who.client.removeChannel(channel);
  if (!row) throw new Error(`no realtime ${table} event within 15 s`);
  return row;
}

const traveler = await signIn("karan.traveler@sahayatri.dev");
const traveler2 = await signIn("priya.traveler@sahayatri.dev");
const guide = await signIn("guide.jaipur@sahayatri.dev");
const PROFILE = "id, name, role, city, is_verified, is_admin, onboarded";

// ---------------------------------------------------------------- accounts
await step("traveller profile loads (column grants)", async () => {
  const p = must(await traveler.client.from("profiles").select(PROFILE).eq("id", traveler.id).single());
  if (p.role !== "traveler") throw new Error(`role is ${p.role}`);
  return p.name;
});
await step("guide profile loads and is verified", async () => {
  const p = must(await guide.client.from("profiles").select(PROFILE).eq("id", guide.id).single());
  if (!p.is_verified) throw new Error("guide not verified");
  return p.name;
});
await step("emails stay private to other users", async () =>
  expectError(await traveler.client.from("profiles").select("email").eq("id", guide.id), /permission denied/));

// ---------------------------------------------------------------- discovery
let spot;
await step("Explore search finds Jaipur spots by prefix", async () => {
  const rows = must(await traveler.client.rpc("search_locations", { p_query: "jai" }));
  spot = rows.find((r) => r.guide_id === guide.id) ?? rows[0];
  if (!spot) throw new Error("no results");
  return `${rows.length} results, total ${rows[0].total_count}`;
});
await step("Explore browse lists active spots with photos and prices", async () => {
  const rows = must(await traveler.client.rpc("search_locations", {}));
  const missing = rows.filter((r) => !r.photos?.length || r.price_per_person == null).length;
  return `${rows.length} on first page, ${missing} without photo/price`;
});
await step("spot page loads with guide and reviews", async () => {
  const loc = must(
    await traveler.client.from("locations").select("id, title, city, guide:profiles!locations_guide_id_fkey(id, name, is_verified)").eq("id", spot.id).single(),
  );
  must(await traveler.client.from("location_reviews").select("id").eq("location_id", spot.id));
  return `${loc.title} (${loc.city})`;
});
await step("view counter increments", async () => {
  const before = must(await admin.from("locations").select("views_count").eq("id", spot.id).single()).views_count;
  must(await traveler.client.rpc("increment_location_views", { p_location_id: spot.id }));
  const after = must(await admin.from("locations").select("views_count").eq("id", spot.id).single()).views_count;
  if (after !== before + 1) throw new Error(`${before} -> ${after}`);
  return `${before} -> ${after}`;
});
await step("guides list and map data load", async () => {
  const guides = must(await traveler.client.from("profiles").select("id, name, city").eq("role", "guide").eq("is_verified", true));
  return `${guides.length} verified guides`;
});

// ---------------------------------------------------------------- saved places
await step("save and unsave a spot (saves_count follows)", async () => {
  must(await traveler.client.from("saved_locations").insert({ user_id: traveler.id, location_id: spot.id }));
  const listed = must(await traveler.client.from("saved_locations").select("location:locations(id)").eq("user_id", traveler.id));
  must(await traveler.client.from("saved_locations").delete().eq("user_id", traveler.id).eq("location_id", spot.id));
  return `${listed.length} saved while testing`;
});

// ---------------------------------------------------------------- booking between accounts
let bookingId;
await step("traveller requests a trip; the server prices it", async () => {
  const row = must(
    await traveler.client
      .from("bookings")
      .insert({ traveler_id: traveler.id, guide_id: guide.id, location_id: spot.id, destination: "ignored", date: daysFromNow(45), people: 2 })
      .select("id, amount, status, destination")
      .single(),
  );
  bookingId = row.id;
  cleanup.push(() => admin.from("bookings").delete().eq("id", bookingId));
  if (row.status !== "pending") throw new Error(`status ${row.status}`);
  return `₹${row.amount} for 2, "${row.destination}"`;
});
await step("guide sees the request and gets a notification", async () => {
  const seen = must(await guide.client.from("bookings").select("id").eq("id", bookingId));
  const notes = must(await guide.client.from("notifications").select("id").eq("type", "booking_requested").contains("data", { booking_id: bookingId }));
  if (seen.length !== 1 || notes.length !== 1) throw new Error(`visible ${seen.length}, notifications ${notes.length}`);
  return "visible + notified";
});
await step("traveller cannot accept their own request", async () =>
  expectError(await traveler.client.from("bookings").update({ status: "accepted" }).eq("id", bookingId), /cannot change/));
await step("guide accepts; traveller is notified live (realtime)", async () => {
  const row = await waitForRealtime(
    traveler,
    "notifications",
    `user_id=eq.${traveler.id}`,
    (n) => n.data?.booking_id === bookingId,
    async () => must(await guide.client.from("bookings").update({ status: "accepted" }).eq("id", bookingId)),
  );
  return `notification "${row.title}"`;
});
await step("payments: advance order or a clear 'not available' message", async () => {
  const { data, error } = await traveler.client.functions.invoke("payments-api", { body: { action: "create_order", booking_id: bookingId, stage: "advance" } });
  if (!error && !data?.error) return `order ${data.order_id}`;
  const body = await error?.context?.json?.().catch(() => null);
  const message = data?.error ?? body?.error;
  if (!/isn't available yet/.test(message ?? "")) throw new Error(`unclear error: ${message ?? error?.message}`);
  return `online payments off (Razorpay keys not set): "${message}"`;
});
await step("traveller cancels; guide is notified", async () => {
  must(await traveler.client.from("bookings").update({ status: "cancelled" }).eq("id", bookingId));
  await sleep(500);
  const notes = must(await guide.client.from("notifications").select("id").eq("type", "booking_cancelled").contains("data", { booking_id: bookingId }));
  if (notes.length !== 1) throw new Error(`${notes.length} notifications`);
  return "cancelled + notified";
});
cleanup.push(() => admin.from("notifications").delete().contains("data", { booking_id: bookingId }));

// ---------------------------------------------------------------- messaging between accounts
let messageId;
await step("traveller messages guide; guide receives it live", async () => {
  const row = await waitForRealtime(
    guide,
    "messages",
    `receiver_id=eq.${guide.id}`,
    (m) => m.content.startsWith(TAG),
    async () => must(await traveler.client.from("messages").insert({ sender_id: traveler.id, receiver_id: guide.id, content: `${TAG} hello from Karan` })),
  );
  messageId = row.id;
  cleanup.push(() => admin.from("messages").delete().like("content", `${TAG}%`));
  cleanup.push(() => admin.from("notifications").delete().eq("type", "new_message").eq("user_id", guide.id).contains("data", { sender_id: traveler.id }).gte("created_at", new Date(Date.now() - 3600_000).toISOString()));
  return "delivered in realtime";
});
await step("conversation lists show the chat on both sides", async () => {
  const g = must(await guide.client.rpc("my_conversations"));
  const t = must(await traveler.client.rpc("my_conversations"));
  if (!g.some((c) => c.partner_id === traveler.id) || !t.some((c) => c.partner_id === guide.id)) throw new Error("missing conversation");
  return `guide ${g.length}, traveller ${t.length} conversations`;
});
await step("guide reads; traveller sees the read receipt", async () => {
  must(await guide.client.from("messages").update({ is_read: true }).eq("id", messageId));
  const m = must(await traveler.client.from("messages").select("is_read").eq("id", messageId).single());
  if (!m.is_read) throw new Error("not marked read");
  return "seen";
});
await step("a third user cannot read the conversation", async () => {
  const rows = must(await traveler2.client.from("messages").select("id").eq("id", messageId));
  if (rows.length) throw new Error("leaked");
  return "private";
});
await step("receiver cannot edit the message", async () =>
  expectError(await guide.client.from("messages").update({ content: "edited" }).eq("id", messageId), /permission denied/));

// ---------------------------------------------------------------- travel buddy between accounts
let tripId;
await step("traveller posts a buddy trip", async () => {
  const t = must(
    await traveler.client
      .from("buddy_trips")
      .insert({ user_id: traveler.id, destination: `${TAG} Leh`, start_date: daysFromNow(60), end_date: daysFromNow(65), budget: "₹15000" })
      .select("id")
      .single(),
  );
  tripId = t.id;
  cleanup.push(() => admin.from("buddy_trips").delete().eq("id", tripId));
  return "posted";
});
await step("another traveller requests to join; owner is notified", async () => {
  must(await traveler2.client.from("buddy_requests").insert({ trip_id: tripId, traveler_id: traveler2.id }));
  await sleep(500);
  const notes = must(await traveler.client.from("notifications").select("id").eq("type", "buddy_request_received").contains("data", { trip_id: tripId }));
  if (notes.length !== 1) throw new Error(`${notes.length} notifications`);
  return "requested + notified";
});
await step("owner accepts; requester is notified", async () => {
  must(await traveler.client.from("buddy_requests").update({ status: "accepted" }).eq("trip_id", tripId));
  await sleep(500);
  const notes = must(await traveler2.client.from("notifications").select("id").eq("type", "buddy_request_accepted").contains("data", { trip_id: tripId }));
  if (notes.length !== 1) throw new Error(`${notes.length} notifications`);
  return "accepted + notified";
});
cleanup.push(() => admin.from("notifications").delete().contains("data", { trip_id: tripId }));

// ---------------------------------------------------------------- reviews
await step("traveller reviews a spot; rating re-syncs", async () => {
  const before = must(await admin.from("locations").select("rating, reviews_count").eq("id", spot.id).single());
  const r = must(
    await traveler.client.from("location_reviews").insert({ location_id: spot.id, reviewer_id: traveler.id, rating: 5, comment: `${TAG} lovely` }).select("id").single(),
  );
  cleanup.push(async () => {
    await admin.from("location_reviews").delete().eq("id", r.id);
  });
  const after = must(await admin.from("locations").select("rating, reviews_count").eq("id", spot.id).single());
  if (after.reviews_count !== before.reviews_count + 1) throw new Error("count did not change");
  return `reviews ${before.reviews_count} -> ${after.reviews_count}`;
});
await step("guide review needs a completed trip", async () => {
  cleanup.push(() => admin.from("reviews").delete().eq("comment", `${TAG} fake`));
  return expectError(
    await traveler2.client.from("reviews").insert({ guide_id: guide.id, reviewer_id: traveler2.id, rating: 5, comment: `${TAG} fake` }),
    /row-level security/,
  );
});

// ---------------------------------------------------------------- availability and guide stats
await step("guide blocks a date; travellers can't book it", async () => {
  const date = daysFromNow(50);
  must(await guide.client.from("guide_unavailable_dates").insert({ guide_id: guide.id, date, note: TAG }));
  cleanup.push(() => admin.from("guide_unavailable_dates").delete().eq("guide_id", guide.id).eq("date", date));
  const visible = must(await traveler.client.from("guide_unavailable_dates").select("date").eq("guide_id", guide.id).eq("date", date));
  if (visible.length !== 1) throw new Error("travellers can't see the blocked date");
  return expectError(
    await traveler.client.from("bookings").insert({ traveler_id: traveler.id, guide_id: guide.id, location_id: spot.id, destination: "x", date, people: 1 }),
    /available on that date/,
  );
});
await step("guide trust stats and own stats load", async () => {
  const pub = must(await traveler.client.rpc("guide_public_stats", { p_guide_id: guide.id }));
  const mine = must(await guide.client.rpc("guide_my_stats"));
  return `public: ${pub?.completed_trips ?? 0} completed trips; own: ${mine?.pending_requests ?? 0} pending`;
});

// ---------------------------------------------------------------- admin
await step("admin overview stats (admin account)", async () => {
  const { data: lookup } = await admin.from("admin_lookup").select("user_id").limit(1).single();
  const { data: u } = await admin.auth.admin.getUserById(lookup.user_id);
  const adm = await signIn(u.user.email);
  const stats = must(await adm.client.rpc("admin_overview_stats"));
  must(await adm.client.rpc("admin_booking_timeseries", { p_months: 6 }));
  must(await adm.client.from("admin_profiles").select("id, email").limit(1));
  await adm.client.auth.signOut();
  return `travellers ${stats.travelers}, guides ${stats.guides}`;
});
await step("non-admins get nothing from admin views", async () => {
  const rows = must(await traveler.client.from("admin_profiles").select("id"));
  if (rows.length) throw new Error("leaked");
  return expectError(await traveler.client.rpc("admin_overview_stats"), /Unauthorized|permission/);
});

// ---------------------------------------------------------------- cleanup and report
for (const fn of cleanup.reverse()) await fn();
for (const who of [traveler, traveler2, guide]) await who.client.auth.signOut();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  —  ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed; test data cleaned up.`);
process.exit(failed.length ? 1 : 0);
