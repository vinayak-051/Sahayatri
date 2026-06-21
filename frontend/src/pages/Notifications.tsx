import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Calendar, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

interface Notification {
  id: string;
  icon: typeof Calendar;
  color: string;
  title: string;
  desc: string;
  time: string;
}

const Notifications = () => {
  const navigate = useNavigate();
  const { user, isGuide } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (isGuide) {
      const { data } = await supabase
        .from("bookings")
        .select("*, traveler:profiles!bookings_traveler_id_fkey(name)")
        .eq("guide_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setNotifications(
        (data ?? []).map((b) => ({
          id: b.id,
          icon: Calendar,
          color: "gradient-accent",
          title: "New booking request",
          desc: `${b.traveler?.name || "A traveler"} requested a trip to ${b.destination}`,
          time: new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        }))
      );
    } else {
      const { data } = await supabase
        .from("bookings")
        .select("*, guide:profiles!bookings_guide_id_fkey(name)")
        .eq("traveler_id", user.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });
      setNotifications(
        (data ?? []).map((b) => ({
          id: b.id,
          icon: Check,
          color: "gradient-primary",
          title: "Booking confirmed",
          desc: `${b.guide?.name || "Your guide"} accepted your trip to ${b.destination}`,
          time: new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        }))
      );
    }
    setLoading(false);
  }, [user, isGuide]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground flex-1">Notifications</h1>
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-4 shadow-card flex items-start gap-3"
            >
              <div className={`w-10 h-10 rounded-xl ${n.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <n.icon size={16} className="text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.desc}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-20 opacity-50">
            <Bell size={40} className="mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm">No notifications yet from Sahayatri members.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
