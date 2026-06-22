import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  {
    title: "1. What we collect",
    body: "Account info you provide (name, email, password or Google identity, profile photo), guide listing details (location, pricing, photos), booking and message content, and basic usage data needed to run the app.",
  },
  {
    title: "2. How we use it",
    body: "To run core features: showing your profile and listings to other users, matching travelers with guides, delivering messages and booking notifications, and basic anti-abuse checks (e.g. preventing duplicate accounts per email).",
  },
  {
    title: "3. Who we share it with",
    body: "Your data is hosted on Supabase (database, authentication, and file storage). If you sign in with Google, Google processes your authentication per their own privacy policy. We don't sell personal data to third parties.",
  },
  {
    title: "4. Location data",
    body: "Guides choose a map location when adding a listing. Travelers using the in-app SOS/safety screen may optionally enable live location sharing with trusted contacts — this is off by default and controlled entirely by the traveler.",
  },
  {
    title: "5. Your choices",
    body: "You can edit or remove most profile information yourself from the app. To delete your account entirely, contact us using the details below and we'll remove your account and associated data.",
  },
  {
    title: "6. Data retention",
    body: "We keep your data as long as your account is active. Cancelled or expired bookings, and expired travel-buddy posts, are removed automatically over time.",
  },
  {
    title: "7. Contact",
    body: "Questions about this policy or a data request: replace this with your actual support email before launch.",
  },
];

const Privacy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen gradient-sky pb-16">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Privacy Policy</h1>
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

export default Privacy;
