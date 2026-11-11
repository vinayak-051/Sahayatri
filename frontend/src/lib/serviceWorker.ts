export const SERVICE_WORKER_URL = "/sw.js";

// Registers the app's service worker (offline shell, cached build assets, Web Push)
// once the page has loaded, so it never competes with the first render.
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
