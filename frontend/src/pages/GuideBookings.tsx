import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { MapPin, Calendar, Users, Check, Clock, X, MessageCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import GuideBottomNav from "@/components/GuideBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Booking } from "@/types/database";

const tabs = ["All", "Pending", "Accepted", "Completed"];

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  accepted: { label: "Accepted", color: "text-green-600", bg: "bg-green-50", icon: Check },
  completed: { label: "Completed", color: "text-muted-foreground", bg: "bg-muted", icon: Check },
  declined: { label: "Declined", color: "text-red-500", bg: "bg-red-50", icon: X },
  cancelled: { label: "Cancelled", color: "text-red-500", bg: "bg-red-50", icon: X },
};

const GuideBookings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("All");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("*, traveler:profiles!bookings_traveler_id_fkey(id, name, profile_photo_url)")
      .eq("guide_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch bookings:", error.message);
    } else {
      setBookings((data ?? []) as Booking[]);
    }
    setLoading(false);
  }, [user]);

  const updateBookingStatus = async (bookingId: string, action: "accept" | "decline") => {
    if (action === "accept") {
      const target = bookings.find((b) => b.id === bookingId);
      const conflict = bookings.find((b) => b.id !== bookingId && b.status === "accepted" && b.date === target?.date);
      if (conflict) {
        toast.error(`You already have an accepted trip on ${new Date(target!.date).toLocaleDateString()}.`);
        return;
      }
    }
    setActionLoading(bookingId);
    try {
      const status = action === "accept" ? "accepted" : "declined";
      const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId);
      if (error) {
        if (error.message.toLowerCase().includes("not verified")) {
          toast.error("Your account must be verified by admin before you can accept bookings.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)));
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bookings-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `guide_id=eq.${user.id}` }, () => {
        fetchBookings(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchBookings]);

  const filtered = bookings.filter((b) => activeTab === "All" || b.status.toLowerCase() === activeTab.toLowerCase());

  return (
    <div className="min-h-screen gradient-sky pb-24">
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Bookings</h1>
          <p className="text-sm text-muted-foreground mt-1">Requests from verified travelers</p>
        </div>
        <button onClick={() => fetchBookings()} className="w-10 h-10 rounded-2xl glass flex items-center justify-center border border-primary/10 active:scale-95 transition-transform">
          <RefreshCw size={16} className={`text-primary ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-6 mb-5">
        <div className="glass rounded-2xl px-5 py-3 flex items-center justify-around border border-primary/5">
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{bookings.length}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
          </div>
          <div className="w-px h-7 bg-border" />
          <div className="text-center">
            <p className="text-base font-bold text-amber-600">{bookings.filter((b) => b.status === "pending").length}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pending</p>
          </div>
          <div className="w-px h-7 bg-border" />
          <div className="text-center">
            <p className="text-base font-bold text-green-600">{bookings.filter((b) => b.status === "accepted").length}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Accepted</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-6 mb-5 hide-scrollbar">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === t ? "gradient-primary text-white shadow-glow" : "glass text-muted-foreground border border-primary/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="text-center py-16 opacity-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading bookings...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 opacity-40">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm font-medium">No bookings found</p>
            <p className="text-[10px] mt-1">Traveler requests will appear here once they book you.</p>
          </div>
        ) : (
          filtered.map((b, i) => {
            const sc = statusConfig[b.status] || statusConfig.pending;
            const isActing = actionLoading === b.id;
            return (
              <motion.div key={b.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }} className="glass rounded-2xl p-4 shadow-card border border-primary/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-2xl gradient-primary flex items-center justify-center text-white font-bold text-base">
                    {b.traveler?.name?.[0] ?? "T"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{b.traveler?.name}</h3>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>
                      <sc.icon size={10} /> {sc.label}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-primary">₹{b.amount?.toLocaleString()}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {b.destination}</span>
                  <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(b.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="flex items-center gap-1"><Users size={10} /> {b.people} {b.people === 1 ? "person" : "people"}</span>
                </div>

                <div className="flex gap-2">
                  {b.status === "pending" && (
                    <>
                      <button
                        disabled={isActing}
                        onClick={() => updateBookingStatus(b.id, "accept")}
                        className="flex-1 py-2 rounded-xl gradient-primary text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {isActing ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
                        Accept
                      </button>
                      <button
                        disabled={isActing}
                        onClick={() => updateBookingStatus(b.id, "decline")}
                        className="flex-1 py-2 rounded-xl bg-secondary border border-border text-xs font-medium text-foreground flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <X size={13} /> Decline
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => navigate(`/guide-messages?userId=${b.traveler_id}&userName=${encodeURIComponent(b.traveler?.name || "")}`)}
                    className="py-2 px-3 rounded-xl glass border border-primary/10 text-primary text-xs font-medium flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    <MessageCircle size={13} /> Chat
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <GuideBottomNav />
    </div>
  );
};

export default GuideBookings;
