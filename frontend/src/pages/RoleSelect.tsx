import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-travel.jpg";
import travelerImg from "@/assets/traveler-card.jpg";
import guideImg from "@/assets/guide-card.jpg";

const RoleSelect = () => {
  const [selected, setSelected] = useState<"traveler" | "guide" | null>(null);
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img src={heroImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />

      <div className="relative z-10 flex flex-col min-h-screen px-6 pt-16 pb-8">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl font-bold text-primary-foreground mb-2">
            How do you want to use <span className="text-accent">Sahayatri</span>?
          </h1>
          <p className="text-primary-foreground/70 text-sm font-light">Choose your journey</p>
        </motion.div>

        <div className="flex-1 flex flex-col gap-4 max-w-sm mx-auto w-full">
          {[
            {
              id: "traveler" as const,
              img: travelerImg,
              emoji: "🌏",
              title: "Explore as Traveler",
              desc: "Discover places, find guides, and travel with others",
            },
            {
              id: "guide" as const,
              img: guideImg,
              emoji: "🧭",
              title: "Earn as Guide",
              desc: "Share your knowledge and earn money",
            },
          ].map((role, i) => (
            <motion.button
              key={role.id}
              initial={{ x: i === 0 ? -40 : 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.2, duration: 0.5 }}
              onClick={() => setSelected(role.id)}
              className={`relative rounded-3xl overflow-hidden h-52 group transition-all duration-300 ${
                selected === role.id ? "ring-2 ring-accent scale-[1.02]" : ""
              }`}
            >
              <img
                src={role.img}
                alt={role.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              {selected === role.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full gradient-accent flex items-center justify-center"
                >
                  <span className="text-primary-foreground text-sm">✓</span>
                </motion.div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                <span className="text-2xl mb-1 block">{role.emoji}</span>
                <h3 className="text-primary-foreground font-semibold text-lg">{role.title}</h3>
                <p className="text-primary-foreground/70 text-xs mt-1">{role.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 max-w-sm mx-auto w-full"
        >
          <button
            disabled={!selected}
            onClick={() => navigate(selected === "guide" ? "/guide-auth" : "/auth")}
            className={`w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base transition-all duration-300 ${
              selected
                ? "gradient-accent shadow-accent-glow animate-pulse-glow"
                : "bg-muted-foreground/30 cursor-not-allowed"
            }`}
          >
            Continue
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default RoleSelect;
