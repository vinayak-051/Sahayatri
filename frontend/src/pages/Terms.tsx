import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  {
    title: "1. What Sahayatri Journeys is",
    body: "Sahayatri Journeys is a platform that connects travelers with independent local guides across India. We provide the app and the booking/messaging tools — we are not a party to, and do not guarantee the outcome of, any trip, tour, or in-person interaction arranged through it.",
  },
  {
    title: "2. Accounts",
    body: "You must provide accurate information when registering and are responsible for keeping your password and account secure. One email address may only be associated with a single account and a single role (traveler or guide).",
  },
  {
    title: "3. Guide verification",
    body: "Guides are not automatically verified on signup. A guide's profile only shows a \"Verified\" badge after their identity has been manually reviewed. Always exercise normal caution when meeting anyone in person, verified or not.",
  },
  {
    title: "4. Bookings and payments",
    body: "Booking requests, acceptances, and cancellations are coordinated through the app. At this time, the app does not process payments — any payment arrangement between a traveler and a guide happens directly between them, outside the platform, and is solely their responsibility.",
  },
  {
    title: "5. Conduct",
    body: "Don't use the platform to harass other users, post false listings, misrepresent your identity, or attempt to circumvent safety or moderation features. We may suspend or remove accounts that violate this.",
  },
  {
    title: "6. Content you post",
    body: "You retain ownership of photos, descriptions, and messages you post, but grant us a license to display them within the app so the platform can function (e.g. showing a guide's listing photos to travelers).",
  },
  {
    title: "7. Limitation of liability",
    body: "The platform is provided \"as is.\" To the extent permitted by law, Sahayatri Journeys is not liable for disputes, losses, injuries, or damages arising from trips or interactions arranged through the app.",
  },
  {
    title: "8. Changes",
    body: "We may update these terms as the platform evolves. Continued use of the app after a change means you accept the updated terms.",
  },
];

const Terms = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen gradient-sky pb-16">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Terms of Service</h1>
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

export default Terms;
