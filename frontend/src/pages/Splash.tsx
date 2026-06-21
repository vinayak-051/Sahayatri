import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import heroImg from "@/assets/hero-travel.jpg";
import logo from "@/assets/logo.png";

const Splash = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/role-select"), 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img
        src={heroImg}
        alt="Travel destination"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 gradient-hero" />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-6">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-4"
        >
          <div className="w-24 h-24 rounded-3xl bg-white/90 p-4 flex items-center justify-center shadow-glow mx-auto mb-6">
            <img src={logo} alt="Sahayatri Logo" className="w-full h-full object-contain" />
          </div>
        </motion.div>
        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-4xl font-bold text-primary-foreground tracking-tight"
        >
          SAHAYATRI
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-primary-foreground/80 text-sm font-light mt-2"
        >
          Your journey, our guidance
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-12"
        >
          <div className="w-8 h-8 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
        </motion.div>
      </div>
    </div>
  );
};

export default Splash;
