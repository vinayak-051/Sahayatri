import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Phone, MapPin, Shield, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const contacts = [
  { name: "Police", number: "100", icon: "🚔" },
  { name: "Ambulance", number: "108", icon: "🚑" },
  { name: "Women Helpline", number: "1091", icon: "📞" },
  { name: "Tourist Police", number: "1363", icon: "🛡️" },
];

const Safety = () => {
  const navigate = useNavigate();
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationLink, setLocationLink] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSOS = () => {
    window.location.href = "tel:112";
  };

  const handleCall = (number: string) => {
    window.location.href = `tel:${number}`;
  };

  const toggleLocationSharing = () => {
    if (locationSharing) {
      setLocationSharing(false);
      setLocationLink(null);
      return;
    }

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const link = `https://maps.google.com/?q=${latitude},${longitude}`;
        setLocationLink(link);
        setLocationSharing(true);
        setGettingLocation(false);
        navigator.clipboard?.writeText(link).then(() => {
          toast.success("Location link copied to clipboard!");
        }).catch(() => {
          toast.info("Location link ready — tap Copy to share");
        });
      },
      () => {
        setGettingLocation(false);
        toast.error("Could not get your location. Please enable location access in your browser settings.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const copyLink = () => {
    if (!locationLink) return;
    navigator.clipboard?.writeText(locationLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleSOS}
            className="w-32 h-32 rounded-full bg-destructive flex items-center justify-center shadow-elevated animate-pulse-glow relative active:brightness-90 transition-all"
          >
            <div className="absolute inset-2 rounded-full border-2 border-destructive-foreground/30" />
            <span className="text-destructive-foreground text-2xl font-bold tracking-widest">SOS</span>
          </motion.button>
          <p className="text-xs text-muted-foreground mt-4">Tap to call emergency (112)</p>
        </motion.div>

        {/* Live Location Sharing */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5 shadow-card mb-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin size={20} className="text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Live Location Sharing</h3>
                <p className="text-xs text-muted-foreground">Share with trusted contacts</p>
              </div>
            </div>
            <button
              onClick={toggleLocationSharing}
              disabled={gettingLocation}
              className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${
                locationSharing ? "gradient-primary" : "bg-secondary"
              } disabled:opacity-60`}
            >
              <motion.div
                animate={{ x: locationSharing ? 24 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-0.5 w-5 h-5 rounded-full bg-primary-foreground shadow-sm"
              />
            </button>
          </div>

          <AnimatePresence>
            {gettingLocation && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-primary mt-3 flex items-center gap-1.5"
              >
                <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                Getting your location...
              </motion.p>
            )}
            {locationSharing && locationLink && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3"
              >
                <p className="text-xs text-muted-foreground mb-1.5">Your location link:</p>
                <div className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                  <p className="text-xs text-foreground flex-1 truncate">{locationLink}</p>
                  <button
                    onClick={copyLink}
                    className="shrink-0 w-7 h-7 rounded-lg gradient-primary flex items-center justify-center"
                  >
                    {copied ? <Check size={12} className="text-primary-foreground" /> : <Copy size={12} className="text-primary-foreground" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Share this link with someone you trust</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Emergency Contacts */}
        <h2 className="text-sm font-semibold text-foreground mb-3 mt-5 flex items-center gap-2">
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
              <button
                onClick={() => handleCall(c.number)}
                className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center active:opacity-80 transition-opacity"
              >
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
