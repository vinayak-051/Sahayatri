import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockQuery, type QueryCall } from "./supabaseMock";

const mockFrom = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

import { disablePush, enablePush, getPushStatus, isPushSupported } from "@/lib/push";

// A valid-looking base64url VAPID key (65 bytes once decoded).
const VAPID_KEY = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function fakeSubscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let current: ReturnType<typeof fakeSubscription> | null;
const subscribe = vi.fn();
const register = vi.fn();
const order: string[] = [];
let permission: NotificationPermission;
const requestPermission = vi.fn();

function installBrowser() {
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe,
    },
  };
  register.mockImplementation(async () => {
    order.push("register");
    return registration;
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register,
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
}

describe("push helpers", () => {
  let calls: QueryCall[];

  beforeEach(() => {
    calls = [];
    order.length = 0;
    current = null;
    permission = "default";
    requestPermission.mockReset().mockImplementation(async () => {
      order.push("requestPermission");
      return permission;
    });
    subscribe.mockReset().mockImplementation(async () => {
      current = fakeSubscription("https://push.example/new");
      return current;
    });
    mockFrom.mockReset().mockImplementation(() => mockQuery({ data: null, error: null }, calls));
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    installBrowser();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // @ts-expect-error -- removing the stub installed above
    delete navigator.serviceWorker;
  });

  it("reports unsupported without a service worker or PushManager", async () => {
    // @ts-expect-error -- simulate a browser without service workers
    delete navigator.serviceWorker;
    expect(isPushSupported()).toBe(false);
    expect(await getPushStatus()).toBe("unsupported");
  });

  it("reports unconfigured without a VAPID key", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
    expect(await getPushStatus()).toBe("unconfigured");
    expect(await enablePush("user-1")).toEqual({ error: expect.stringMatching(/aren't set up/) });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports denied, disabled and enabled from permission, subscription and the saved row", async () => {
    permission = "denied";
    expect(await getPushStatus()).toBe("denied");

    permission = "granted";
    expect(await getPushStatus()).toBe("disabled");

    current = fakeSubscription("https://push.example/mine");
    mockFrom.mockImplementation(() => mockQuery({ data: { id: "row-1" }, error: null }, calls));
    expect(await getPushStatus()).toBe("enabled");
    expect(calls).toContainEqual({ method: "eq", args: ["endpoint", "https://push.example/mine"] });

    // A subscription whose row isn't visible belongs to another account on this browser.
    mockFrom.mockImplementation(() => mockQuery({ data: null, error: null }, calls));
    expect(await getPushStatus()).toBe("disabled");
  });

  it("never prompts on its own: only enablePush asks for permission", async () => {
    await getPushStatus();
    await disablePush();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks for permission first, then subscribes and saves the subscription", async () => {
    permission = "granted";

    expect(await enablePush("user-1")).toEqual({ error: null });

    expect(order[0]).toBe("requestPermission");
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(calls).toContainEqual({
      method: "upsert",
      args: [
        { user_id: "user-1", endpoint: "https://push.example/new", p256dh: "p256dh-key", auth_key: "auth-key" },
        { onConflict: "endpoint" },
      ],
    });
  });

  it("replaces a subscription left on this browser before subscribing", async () => {
    permission = "granted";
    const previous = fakeSubscription("https://push.example/old");
    current = previous;

    expect(await enablePush("user-1")).toEqual({ error: null });

    expect(previous.unsubscribe).toHaveBeenCalled();
    expect(calls).toContainEqual({ method: "delete", args: [] });
    expect(calls).toContainEqual({ method: "eq", args: ["endpoint", "https://push.example/old"] });
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("returns a message and doesn't subscribe when permission is refused", async () => {
    permission = "denied";
    expect(await enablePush("user-1")).toEqual({ error: expect.stringMatching(/blocked/) });
    expect(subscribe).not.toHaveBeenCalled();

    permission = "default";
    expect(await enablePush("user-1")).toEqual({ error: expect.stringMatching(/weren't allowed/) });
  });

  it("unsubscribes again and returns a friendly message when saving fails", async () => {
    permission = "granted";
    mockFrom.mockImplementation(() => mockQuery({ data: null, error: { code: "42501", message: "permission denied for table" } }, calls));

    const result = await enablePush("user-1");

    expect(result).toEqual({ error: "You don't have permission to do that." });
    expect(current?.unsubscribe).toHaveBeenCalled();
  });

  it("turns browser push-service failures into a useful message", async () => {
    permission = "granted";
    subscribe.mockRejectedValue(new DOMException("push service error", "AbortError"));

    expect(await enablePush("user-1")).toEqual({ error: expect.stringMatching(/push service/) });
  });

  it("disablePush unsubscribes and deletes the row by endpoint", async () => {
    const subscription = fakeSubscription("https://push.example/mine");
    current = subscription;

    expect(await disablePush()).toEqual({ error: null });

    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(calls).toContainEqual({ method: "delete", args: [] });
    expect(calls).toContainEqual({ method: "eq", args: ["endpoint", "https://push.example/mine"] });
  });

  it("disablePush is a no-op without a subscription", async () => {
    expect(await disablePush()).toEqual({ error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
