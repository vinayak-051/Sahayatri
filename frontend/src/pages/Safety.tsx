import { motion } from "framer-motion";
import { ArrowLeft, Phone, MapPin, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

const contacts = [
  { name: "Police", number: "100", icon: "🚔" },
  { name: "Ambulance", number: "108", icon: "🚑" },
  { name: "Women Helpline", number: "1091", icon: "📞" },
  { name: "Tourist Police", number: "1363", icon: "🛡️" },
];

const Safety = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Safety</h1>
      </div>

      <div className="px-6">
        {/* SOS Button */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center py-8"
        >
          <button className="w-32 h-32 rounded-full bg-destructive flex items-center justify-center shadow-elevated animate-pulse-glow relative">
            <div className="absolute inset-2 rounded-full border-2 border-destructive-foreground/30" />
            <span className="text-destructive-foreground text-2xl font-bold">SOS</span>
          </button>
          <p className="text-xs text-muted-foreground mt-4">Tap for emergency help</p>
        </motion.div>

        {/* Live Tracking */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5 shadow-card mb-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <MapPin size={20} className="text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Live Location Sharing</h3>
              <p className="text-xs text-muted-foreground">Share with trusted contacts</p>
            </div>
          </div>
          <div className="w-12 h-6 rounded-full gradient-primary relative cursor-pointer">
            <div className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-primary-foreground shadow-sm" />
          </div>
        </motion.div>

        {/* Emergency Contacts */}
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Shield size={16} className="text-primary" /> Emergency Contacts
        </h2>
        <div className="space-y-3">
          {contacts.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="glass rounded-2xl p-4 shadow-card flex items-center gap-4"
            >
              <span className="text-2xl">{c.icon}</span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{c.number}</p>
              </div>
              <button className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Phone size={16} className="text-primary-foreground" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Safety;
