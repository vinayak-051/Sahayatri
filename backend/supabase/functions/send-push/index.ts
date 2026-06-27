// Triggered by a Supabase Database Webhook on `insert into public.notifications`.
// Delivers a real OS-level Web Push so the user is notified even with the
// app/browser closed. See backend/migrations/0007_notifications.sql for the
// trigger functions that create the rows this function reacts to.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const { record } = await req.json();
  if (!record?.user_id) return new Response("ignored", { status: 200 });

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", record.user_id);

  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: record.title, body: record.body, data: record.data })
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", err);
        }
      }
    })
  );

  return new Response("ok", { status: 200 });
});
