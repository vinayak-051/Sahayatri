// Loads Razorpay Checkout on demand and opens it for an order created by the
// payments-api Edge Function. Card/UPI details never touch our code, and the
// success handler is optimistic only — the webhook is what actually marks the
// payment paid and flips the booking status.
export interface RazorpayOrder {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(order: RazorpayOrder, onSuccess: () => void) {
  await loadScript();
  new window.Razorpay({
    key: order.key_id,
    order_id: order.order_id,
    amount: order.amount,
    currency: order.currency,
    name: "Sahayatri",
    theme: { color: "#0ea5e9" },
    handler: onSuccess,
  }).open();
}
