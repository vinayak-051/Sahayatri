import { supabase } from "@/lib/supabaseClient";
import { friendlyDbError } from "@/lib/dbErrors";
import { SERVICE_WORKER_URL } from "@/lib/serviceWorker";

// Push is opt-in: nothing here runs until the user turns it on from the
// Notifications page. The in-app notification feed works without it.

export type PushStatus = "unsupported" | "unconfigured" | "denied" | "enabled" | "disabled";
export interface PushResult {
  error: string | null;
}

const BLOCKED_MESSAGE = "Notifications are blocked for this site. Allow them in your browser settings, then try again.";
const SW_READY_TIMEOUT_MS = 10_000;

function vapidPublicKey(): string | undefined {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey());
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

// The browser only creates push subscriptions for an active service worker.
// Production registers it on load; registering again just returns that
// registration, and also covers dev builds, which skip it.
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DOMException("Service worker not ready", "TimeoutError")), SW_READY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function describePushError(err: unknown, fallback: string): string {
  const name = err instanceof Error || err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
      return BLOCKED_MESSAGE;
    case "AbortError":
      return "Your browser's push service isn't available. Check that push messaging is enabled in your browser settings, then try again.";
    case "TimeoutError":
      return "Notifications aren't ready yet. Reload the page and try again.";
    default:
      return fallback;
  }
}

// Status of push on this device for the signed-in user. Never throws.
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (!isPushConfigured()) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "disabled";
  try {
    const subscription = await currentSubscription();
    if (!subscription) return "disabled";
    // Row-level security only shows this user's rows, so no row means the
    // subscription was left by another account that used this browser.
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (error) {
      console.warn("Couldn't check the push subscription:", error.message);
      return "enabled";
    }
    return data ? "enabled" : "disabled";
  } catch (err) {
    console.warn("Couldn't read push status:", err);
    return "disabled";
  }
}

// Call from a click handler: the permission prompt needs the user's gesture.
export async function enablePush(userId: string): Promise<PushResult> {
  if (!isPushSupported()) return { error: "This browser doesn't support push notifications." };
  const vapidKey = vapidPublicKey();
  if (!vapidKey) return { error: "Push notifications aren't set up for this app yet." };

  try {
    // First, while the click still counts as a user gesture.
    const permission = await Notification.requestPermission();
    if (permission === "denied") return { error: BLOCKED_MESSAGE };
    if (permission !== "granted") return { error: "Notifications weren't allowed. Try again and choose Allow." };

    const registration = await activeRegistration();
    // Start fresh: a subscription left by another account on this browser
    // can't be reassigned, and a stale one may use an old key.
    const previous = await registration.pushManager.getSubscription();
    if (previous) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", previous.endpoint);
      await previous.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys?.auth) {
      await subscription.unsubscribe();
      return { error: "Your browser returned an incomplete push subscription. Please try again." };
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: userId, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
        { onConflict: "endpoint" },
      );
    if (error) {
      await subscription.unsubscribe().catch(() => false);
      return { error: friendlyDbError(error, "Couldn't save your notification settings. Please try again.") };
    }
    return { error: null };
  } catch (err) {
    console.error("Enabling push notifications failed:", err);
    return { error: describePushError(err, "Couldn't turn on push notifications. Please try again.") };
  }
}

export async function disablePush(): Promise<PushResult> {
  if (!isPushSupported()) return { error: null };
  try {
    const subscription = await currentSubscription();
    if (!subscription) return { error: null };
    // Either step alone stops notifications: without the row the server stops
    // sending, and a dead endpoint's row is deleted the next time a send fails.
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed && error) {
      return { error: friendlyDbError(error, "Couldn't turn off push notifications. Please try again.") };
    }
    if (error) console.warn("Push subscription row not deleted:", error.message);
    return { error: null };
  } catch (err) {
    console.error("Disabling push notifications failed:", err);
    return { error: describePushError(err, "Couldn't turn off push notifications. Please try again.") };
  }
}
