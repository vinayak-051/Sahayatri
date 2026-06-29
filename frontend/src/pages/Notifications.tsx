import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Calendar, Check, X, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { AppNotification, NotificationType } from "@/types/database";

const ICONS: Record<NotificationType, { icon: typeof Calendar; color: string }> = {
  booking_requested: { icon: Calendar, color: "gradient-accent" },
  booking_accepted: { icon: Check, color: "gradient-primary" },
  booking_declined: { icon: X, color: "bg-destructive" },
  booking_cancelled: { icon: X, color: "bg-destructive" },
  new_message: { icon: MessageCircle, color: "gradient-primary" },
};

function getNotificationPath(n: AppNotification, isGuide: boolean): string | null {
  switch (n.type) {
    case "booking_requested": return "/guide-bookings";
    case "booking_accepted":
    case "booking_declined":
    case "booking_cancelled": return "/trips";
    case "new_message": {
      const senderId = n.data?.sender_id as string | undefined;
      const senderName = n.data?.sender_name as string | undefined;
      if (senderId) {
        const base = isGuide ? "/guide-messages" : "/messages";
        return `${base}?userId=${senderId}${senderName ? `&userName=${encodeURIComponent(senderName)}` : ""}`;
      }
      return isGuide ? "/guide-messages" : "/messages";
    }
    default: return null;
  }
}

const Notifications = () => {
  const navigate = useNavigate();
  const { user, isGuide } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotifications((data ?? []) as AppNotification[]);
    setLoading(false);

    const unreadIds = (data ?? []).filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-feed-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        async (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((prev) => [n, ...prev]);
          await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(isGuide ? "/guide-dashboard" : "/home")} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground flex-1">Notifications</h1>
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((n, i) => {
            const { icon: Icon, color } = ICONS[n.type] ?? { icon: Bell, color: "gradient-primary" };
            const path = getNotificationPath(n, isGuide);
            return (
              <motion.div
                key={n.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => path && navigate(path)}
                className={`glass rounded-2xl p-4 shadow-card flex items-start gap-3 ${path ? "cursor-pointer active:scale-[0.98] transition-transform" : ""}`}
              >
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon size={16} className="text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </motion.div>
            );
          })
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
