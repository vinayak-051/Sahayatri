import { describe, it, expect, vi, afterEach } from "vitest";
import { registerServiceWorker, SERVICE_WORKER_URL } from "@/lib/serviceWorker";

describe("registerServiceWorker", () => {
  afterEach(() => {
    // @ts-expect-error -- removing the stub installed in each test
    delete navigator.serviceWorker;
    vi.restoreAllMocks();
  });

  function stubServiceWorker(register = vi.fn().mockResolvedValue({})) {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
    return register;
  }

  it("waits for the window load event before registering", () => {
    const register = stubServiceWorker();
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL);
  });

  it("registers straight away when the page has already loaded", () => {
    const register = stubServiceWorker();
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");

    registerServiceWorker();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("logs instead of throwing when registration fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubServiceWorker(vi.fn().mockRejectedValue(new Error("nope")));
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");

    registerServiceWorker();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });

  it("does nothing without service worker support", () => {
    expect(() => registerServiceWorker()).not.toThrow();
  });
});
