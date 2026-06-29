import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, TrendingUp, Users, MapPin, Calendar, IndianRupee, ChevronRight, Bell, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import GuideBottomNav from "@/components/GuideBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import type { Booking } from "@/types/database";

const GuideDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const unreadCount = useUnreadNotifications();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const [{ data: bookingsData }, { data: ratingData }] = await Promise.all([
      supabase
        .from("bookings")
        .select("*, traveler:profiles!bookings_traveler_id_fkey(id, name, profile_photo_url)")
        .eq("guide_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("guide_rating_stats").select("avg_rating").eq("guide_id", user.id).maybeSingle(),
    ]);
    setBookings((bookingsData ?? []) as Booking[]);
    setAvgRating(ratingData?.avg_rating ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bookings-guide-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `guide_id=eq.${user.id}` }, () => {
        fetchData(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchData]);

  const handleBookingAction = async (id: string, action: "accept" | "decline") => {
    const status = action === "accept" ? "accepted" : "declined";
    if (action === "accept") {
      const target = bookings.find((b) => b.id === id);
      const conflict = bookings.find((b) => b.id !== id && b.status === "accepted" && b.date === target?.date);
      if (conflict) {
        toast.error(`You already have an accepted trip on ${new Date(target!.date).toLocaleDateString()}.`);
        return;
      }
    }
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) {
      toast.error("Error updating booking");
      return;
    }
    toast.success(action === "accept" ? "Booking accepted!" : "Booking declined");
    fetchData();
  };

  const pendingBookings = bookings.filter((b) => b.status === "pending");
  const acceptedBookings = bookings.filter((b) => b.status === "accepted");
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const totalEarnings = completedBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const statCards = [
    { icon: Users, label: "Tourists Served", value: String(completedBookings.length), color: "gradient-primary" },
    { icon: Star, label: "Rating", value: avgRating ? avgRating.toFixed(1) : "New", color: "gradient-accent" },
    { icon: IndianRupee, label: "Total Earnings", value: `₹${totalEarnings.toLocaleString()}`, color: "gradient-primary" },
    { icon: Calendar, label: "Total Trips", value: String(bookings.length), color: "gradient-accent" },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center gradient-sky"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen gradient-sky pb-24 text-foreground">
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back 👋</p>
          <h1 className="text-xl font-bold">{user?.name || "Guide"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/notifications")} className="relative w-10 h-10 rounded-xl glass flex items-center justify-center shadow-card">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full gradient-accent text-[10px] text-accent-foreground font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl overflow-hidden">
            {user?.profile_photo_url ? <img src={user.profile_photo_url} className="w-full h-full object-cover" /> : "👨‍🏫"}
          </div>
        </div>
      </div>

      <div className="px-6 mb-4">
        <button onClick={() => navigate("/guide-locations")} className="w-full py-4 gradient-accent text-accent-foreground font-bold rounded-2xl shadow-card flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <MapPin size={20} /> Manage My Locations
        </button>
      </div>

      <div className="px-6 grid grid-cols-2 gap-3 mb-6">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="glass rounded-2xl p-4 shadow-card">
            <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center mb-2`}>
              <s.icon size={16} className="text-primary-foreground" />
            </div>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {pendingBookings.length > 0 && (
        <div className="px-6 mb-6">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            New Requests <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{pendingBookings.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingBookings.map((b) => (
              <motion.div key={b.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="glass rounded-2xl p-4 shadow-card flex items-center gap-3 border-l-4 border-accent">
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xl">👤</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate">{b.traveler?.name}</h3>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin size={10} /> {b.destination}
                  </p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar size={10} /> {new Date(b.date).toLocaleDateString()} · {b.people} people
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleBookingAction(b.id, "accept")} className="p-2 rounded-lg bg-primary/10 text-primary active:scale-90 transition-transform">
                    <Check size={18} />
                  </button>
                  <button onClick={() => handleBookingAction(b.id, "decline")} className="p-2 rounded-lg bg-destructive/10 text-destructive active:scale-90 transition-transform">
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Accepted Trips</h2>
          <button onClick={() => navigate("/guide-bookings")} className="text-xs text-primary font-medium flex items-center gap-1">
            View all <ChevronRight size={14} />
          </button>
        </div>
        <div className="space-y-3">
          {acceptedBookings.length > 0 ? (
            acceptedBookings.map((b) => (
              <motion.div key={b.id} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="glass rounded-2xl p-4 shadow-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <TrendingUp size={16} className="text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold">{b.traveler?.name} — {b.destination}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(b.date).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-bold text-primary">₹{b.amount}</span>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8 glass rounded-2xl opacity-50">
              <p className="text-xs">No accepted trips yet.</p>
            </div>
          )}
        </div>
      </div>

      <GuideBottomNav />
    </div>
  );
};

export default GuideDashboard;
