import { supabase } from "@/lib/supabaseClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

// Best-effort: silently no-ops if the browser lacks support, the user denies
// permission, or VAPID isn't configured yet — push is an enhancement, not a
// requirement for the in-app notification feed to work.
export async function subscribeToPush(userId: string) {
  if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.register("/sw.js");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys?.auth) return;

    await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      { onConflict: "endpoint" }
    );
  } catch (err) {
    console.error("Push subscription failed:", err);
  }
}
