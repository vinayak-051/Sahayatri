import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  {
    title: "1. Scope",
    body: "This policy covers trip bookings made through Sahayatri Journeys. At this time the app does not process payments — payment arrangements happen directly between traveler and guide. Once in-app payments launch, refunds will be processed to the original payment method under the rules below.",
  },
  {
    title: "2. Cancellation by the traveler",
    body: "You can cancel a pending or accepted trip request from the My Trips screen at any time before the trip date. If a payment was made: cancellations more than 48 hours before the trip date are eligible for a full refund; cancellations within 48 hours are eligible for a 50% refund; no-shows are not refundable.",
  },
  {
    title: "3. Cancellation by the guide",
    body: "If a guide declines or cancels an accepted trip, any payment made for that trip is refunded in full. Repeated cancellations by a guide may lead to removal from the platform.",
  },
  {
    title: "4. Disputes",
    body: "If a trip did not take place as described (guide absent, materially different itinerary), report it within 7 days of the trip date via the Safety page or support email. We will review messages and booking records and may issue a partial or full refund.",
  },
  {
    title: "5. Processing time",
    body: "Approved refunds are initiated within 5–7 business days. Depending on your bank or payment provider, it may take additional time for the amount to reflect in your account.",
  },
  {
    title: "6. Contact",
    body: "For refund or cancellation questions, contact us through the in-app Safety page. We aim to respond within 2 business days.",
  },
];

const RefundPolicy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen gradient-sky pb-16">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Cancellation & Refund Policy</h1>
      </div>
      <div className="px-6 space-y-5">
        <p className="text-xs text-muted-foreground italic">
          This is a general-purpose placeholder, not reviewed by a lawyer. Have this reviewed before any public launch.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="text-sm font-bold text-foreground mb-1">{s.title}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RefundPolicy;
