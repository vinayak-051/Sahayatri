import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Lightbulb, ChevronDown, MapPin, ShieldCheck, Utensils, Bus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TIP_CATEGORIES = [
  {
    icon: MapPin,
    title: "Finding places nearby",
    tips: [
      "Use Explore to filter listings by category (Nature, Heritage, Temple, etc.) for your city.",
      "Check Map View to see guide-authored spots and verified guides plotted together.",
      "Open a listing's 'Best Visiting Time' field before planning your day around it.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Staying safe",
    tips: [
      "Each listing shows a safety level (high / moderate / low) — check it before going solo.",
      "Share your live location with someone you trust, especially for evening outings.",
      "Keep a digital copy of your ID and emergency contacts handy. See the Safety tab for more.",
    ],
  },
  {
    icon: Utensils,
    title: "Food & culture",
    tips: [
      "Ask your guide for their personal favorite spot — locals usually know better than search results.",
      "Carry cash for smaller vendors; UPI is widely accepted in most cities but not all stalls.",
      "Dress modestly when visiting temples and other religious sites.",
    ],
  },
  {
    icon: Bus,
    title: "Getting around",
    tips: [
      "Ride-hailing apps cover most Indian cities; for autos, confirm the fare or insist on the meter.",
      "Book guide-led transport-included experiences when available — check a listing's pricing field.",
      "Plan buffer time between spots; traffic in Indian cities can be unpredictable.",
    ],
  },
];

const AIGuide = () => {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col min-h-screen gradient-sky">
      <div className="glass px-4 py-3 flex items-center gap-3 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center">
          <Lightbulb size={16} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">AI Guide</h1>
          <p className="text-[10px] text-muted-foreground">Practical checklists, not AI-generated</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 pb-12">
        {TIP_CATEGORIES.map((cat, i) => (
          <motion.div key={cat.title} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.05 }} className="glass rounded-2xl overflow-hidden shadow-card">
            <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center gap-3 p-4 text-left">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
                <cat.icon size={18} className="text-primary-foreground" />
              </div>
              <span className="flex-1 text-sm font-bold text-foreground">{cat.title}</span>
              <ChevronDown size={18} className={`text-muted-foreground transition-transform ${openIndex === i ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {openIndex === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <ul className="px-4 pb-4 space-y-2">
                    {cat.tips.map((tip) => (
                      <li key={tip} className="text-xs text-muted-foreground leading-relaxed pl-4 border-l-2 border-primary/20">{tip}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        <p className="text-[10px] text-muted-foreground text-center pt-4">
          These are general, hand-curated travel tips — not a live AI assistant.
        </p>
      </div>
    </div>
  );
};

export default AIGuide;
