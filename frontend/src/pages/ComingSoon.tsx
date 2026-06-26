import { motion } from "framer-motion";
import { ArrowLeft, Clock, Sparkles } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const featureNames: Record<string, { name: string; description: string; emoji: string }> = {
  "/travel-buddy": {
    name: "Travel Buddy",
    description: "Find fellow travelers heading to the same destination. Plan together, travel better.",
    emoji: "🧑‍🤝‍🧑",
  },
  "/ai-guide": {
    name: "AI Guide",
    description: "Get personalised AI-powered trip recommendations tailored to your interests and budget.",
    emoji: "🤖",
  },
};

const ComingSoon = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const feature = featureNames[location.pathname] ?? {
    name: "This Feature",
    description: "Something exciting is on the way.",
    emoji: "✨",
  };

  return (
    <div className="min-h-screen gradient-sky flex flex-col">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">{feature.name}</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="glass rounded-3xl p-10 shadow-elevated max-w-sm w-full text-center"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-6xl mb-6"
          >
            {feature.emoji}
          </motion.div>

          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow mx-auto mb-5">
            <Clock size={28} className="text-primary-foreground" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">Coming Soon</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-2">
            {feature.description}
          </p>
          <p className="text-xs text-primary font-medium flex items-center justify-center gap-1 mb-6">
            <Sparkles size={12} /> Available in the next update
          </p>

          <button
            onClick={() => navigate(-1)}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default ComingSoon;
