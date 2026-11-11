import { describe, it, expect, vi, beforeEach } from "vitest";
import source from "../../public/sw.js?raw";

const ORIGIN = "https://app.test";

type Handler = (event: unknown) => void;
type FakeRequest = { url: string; method: string; mode: string };

// Responses as fetch() returns them: same-origin ones have type "basic", which a
// constructed Response can't fake.
function fakeResponse(body: string, { status = 200, type = "basic", contentType = "text/html" } = {}) {
  const response = {
    status,
    type,
    ok: status >= 200 && status < 300,
    redirected: false,
    body,
    headers: new Headers({ "Content-Type": contentType }),
    clone: () => response,
  };
  return response;
}

function createCaches() {
  const stores = new Map<string, Map<string, unknown>>();
  const keyOf = (key: string | FakeRequest) => new URL(typeof key === "string" ? key : key.url, ORIGIN).href;
  return {
    stores,
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (key: string | FakeRequest) => store.get(keyOf(key)),
        put: async (key: string | FakeRequest, value: unknown) => {
          store.delete(keyOf(key));
          store.set(keyOf(key), value);
        },
        keys: async () => [...store.keys()],
        delete: async (key: string) => store.delete(keyOf(key)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
}

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const caches = createCaches();
  const fetch = vi.fn();
  const windows: Array<Record<string, unknown>> = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(),
    },
    registration: { showNotification: vi.fn() },
  };
  new Function("self", "caches", "fetch", source)(self, caches, fetch);
  return { handlers, caches, fetch, self, windows };
}

// Dispatches an event and collects what the worker passed to respondWith / waitUntil.
async function dispatch(handler: Handler, fields: Record<string, unknown>) {
  let responded: Promise<unknown> | undefined;
  const pending: Promise<unknown>[] = [];
  handler({
    ...fields,
    respondWith: (value: Promise<unknown>) => (responded = value),
    waitUntil: (value: Promise<unknown>) => pending.push(value),
  });
  const response = responded ? await responded : undefined;
  await Promise.all(pending);
  return { responded: responded !== undefined, response };
}

const get = (path: string, mode = "cors", origin = ORIGIN): FakeRequest => ({ url: new URL(path, origin).href, method: "GET", mode });

describe("service worker", () => {
  let worker: ReturnType<typeof loadWorker>;

  beforeEach(() => {
    worker = loadWorker();
  });

  it("leaves cross-origin and non-GET requests to the browser", async () => {
    const tile = await dispatch(worker.handlers.fetch, { request: get("/tiles/1/2/3.png", "no-cors", "https://tile.openstreetmap.org") });
    const post = await dispatch(worker.handlers.fetch, { request: { ...get("/assets/app.js"), method: "POST" } });
    const other = await dispatch(worker.handlers.fetch, { request: get("/robots.txt") });

    expect([tile.responded, post.responded, other.responded]).toEqual([false, false, false]);
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("serves hashed build assets cache-first and caches only good responses", async () => {
    worker.fetch.mockResolvedValueOnce(fakeResponse("js", { contentType: "text/javascript" }));
    const first = await dispatch(worker.handlers.fetch, { request: get("/assets/index-abc.js") });
    const second = await dispatch(worker.handlers.fetch, { request: get("/assets/index-abc.js") });

    expect(second.response).toBe(first.response);
    expect(worker.fetch).toHaveBeenCalledTimes(1);

    worker.fetch.mockResolvedValue(fakeResponse("missing", { status: 404 }));
    await dispatch(worker.handlers.fetch, { request: get("/assets/gone-123.js") });
    await dispatch(worker.handlers.fetch, { request: get("/assets/gone-123.js") });
    expect(worker.fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the asset cache bounded", async () => {
    worker.fetch.mockImplementation(async () => fakeResponse("js", { contentType: "text/javascript" }));
    for (let i = 0; i < 160; i++) {
      await dispatch(worker.handlers.fetch, { request: get(`/assets/chunk-${i}.js`) });
    }
    const assets = [...worker.caches.stores.entries()].find(([name]) => name.includes("assets"))![1];
    expect(assets.size).toBe(150);
    expect(assets.has(`${ORIGIN}/assets/chunk-0.js`)).toBe(false);
    expect(assets.has(`${ORIGIN}/assets/chunk-159.js`)).toBe(true);
  });

  it("serves navigations network-first and keeps the latest page as the offline shell", async () => {
    const page = fakeResponse("<html>fresh</html>");
    worker.fetch.mockResolvedValueOnce(page);
    const online = await dispatch(worker.handlers.fetch, { request: get("/explore", "navigate") });
    expect(online.response).toBe(page);

    worker.fetch.mockRejectedValueOnce(new TypeError("offline"));
    const offline = await dispatch(worker.handlers.fetch, { request: get("/trips", "navigate") });
    expect(offline.response).toBe(page);
  });

  it("answers an offline navigation with a plain 503 when no shell is cached", async () => {
    worker.fetch.mockRejectedValue(new TypeError("offline"));
    const { response } = await dispatch(worker.handlers.fetch, { request: get("/home", "navigate") });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).text()).toMatch(/offline/i);
  });

  it("precaches the app shell on install and deletes old caches on activate", async () => {
    worker.fetch.mockImplementation(async () => fakeResponse("shell"));
    await worker.caches.open("sahayatri-v1");

    await dispatch(worker.handlers.install, {});
    expect(worker.fetch.mock.calls.map(([url]) => url)).toEqual(["/", "/manifest.json", "/og-image.png"]);
    expect(worker.self.skipWaiting).toHaveBeenCalled();

    await dispatch(worker.handlers.activate, {});
    const names = [...worker.caches.stores.keys()];
    expect(names).not.toContain("sahayatri-v1");
    expect(names.some((name) => name.includes("shell"))).toBe(true);
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it("shows a notification from the push payload", async () => {
    await dispatch(worker.handlers.push, {
      data: { json: () => ({ title: "Booking accepted", body: "See you soon", data: { url: "/trips" } }), text: () => "" },
    });
    expect(worker.self.registration.showNotification).toHaveBeenCalledWith("Booking accepted", {
      body: "See you soon",
      icon: "/og-image.png",
      data: { url: "/trips" },
    });

    await dispatch(worker.handlers.push, {
      data: { json: () => { throw new SyntaxError("not json"); }, text: () => "plain text" },
    });
    expect(worker.self.registration.showNotification).toHaveBeenLastCalledWith("Sahayatri Journeys", {
      body: "plain text",
      icon: "/og-image.png",
      data: {},
    });
  });

  it("opens data.url on click, falling back to /notifications for missing or foreign URLs", async () => {
    const click = (data: unknown) =>
      dispatch(worker.handlers.notificationclick, { notification: { data, close: vi.fn() } });

    await click({ url: "/trips" });
    await click({});
    await click({ url: "https://evil.example/phish" });

    expect(worker.self.clients.openWindow.mock.calls.map(([url]) => url)).toEqual([
      `${ORIGIN}/trips`,
      `${ORIGIN}/notifications`,
      `${ORIGIN}/notifications`,
    ]);
  });

  it("reuses an open window: focuses it and navigates to the target", async () => {
    const client = { url: `${ORIGIN}/home`, focused: false, focus: vi.fn(), navigate: vi.fn() };
    worker.windows.push(client);

    await dispatch(worker.handlers.notificationclick, { notification: { data: { url: "/trips" }, close: vi.fn() } });

    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/trips`);
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });
});
