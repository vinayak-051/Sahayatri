import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, MapPin, DollarSign, Users, Calendar, X, MessageCircle, Trash2, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { BuddyTrip } from "@/types/database";

interface JoinRequest {
  id: string;
  traveler_id: string;
  traveler_name: string;
}

const TravelBuddy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trips, setTrips] = useState<BuddyTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinRequests, setJoinRequests] = useState<Record<string, JoinRequest[]>>({});

  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchJoinRequests = useCallback(async (myTripIds: string[]) => {
    if (myTripIds.length === 0) {
      setJoinRequests({});
      return;
    }
    const { data, error } = await supabase
      .from("buddy_requests")
      .select("id, trip_id, traveler:profiles!buddy_requests_traveler_id_fkey(id, name)")
      .in("trip_id", myTripIds)
      .eq("status", "pending");
    if (error) {
      console.error("Failed to fetch join requests:", error.message);
      return;
    }
    const grouped: Record<string, JoinRequest[]> = {};
    for (const r of data ?? []) {
      const traveler = r.traveler as unknown as { id: string; name: string } | { id: string; name: string }[] | null;
      const t = Array.isArray(traveler) ? traveler[0] : traveler;
      if (!t) continue;
      grouped[r.trip_id] = grouped[r.trip_id] || [];
      grouped[r.trip_id].push({ id: r.id, traveler_id: t.id, traveler_name: t.name });
    }
    setJoinRequests(grouped);
  }, []);

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    // best-effort cleanup — RLS only lets this delete the current user's own
    // expired trips, but every visitor's query below filters expired ones out anyway
    await supabase.from("buddy_trips").delete().lt("end_date", today);
    const { data, error } = await supabase
      .from("buddy_trips")
      .select("*, user:profiles!buddy_trips_user_id_fkey(id, name)")
      .gte("end_date", today)
      .order("start_date", { ascending: true });
    if (error) {
      console.error("Failed to fetch trips:", error.message);
    } else {
      const tripsData = (data ?? []) as BuddyTrip[];
      setTrips(tripsData);
      if (user) await fetchJoinRequests(tripsData.filter((t) => t.user_id === user.id).map((t) => t.id));
    }
    setLoading(false);
  }, [user, fetchJoinRequests]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const handleRequestAction = async (requestId: string, tripId: string, action: "accepted" | "rejected") => {
    const { error } = await supabase.from("buddy_requests").update({ status: action }).eq("id", requestId);
    if (error) {
      toast.error("Failed to update request");
      return;
    }
    setJoinRequests((prev) => ({ ...prev, [tripId]: (prev[tripId] || []).filter((r) => r.id !== requestId) }));
    toast.success(action === "accepted" ? "Request accepted!" : "Request rejected");
  };

  const handleDeleteTrip = async (tripId: string) => {
    const { error } = await supabase.from("buddy_trips").delete().eq("id", tripId);
    if (error) {
      toast.error("Failed to delete trip");
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    toast.success("Trip removed");
  };

  const handleJoinTrip = async (tripId: string) => {
    if (!user) {
      toast.error("Please login to join a trip");
      return;
    }
    const { error } = await supabase.from("buddy_requests").insert({ trip_id: tripId, traveler_id: user.id });
    if (error) {
      if (error.code === "23505") toast.error("You've already requested to join this trip.");
      else toast.error(error.message || "Error sending join request");
      return;
    }
    toast.success("Join request sent!");
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to create a trip");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("buddy_trips").insert({
        user_id: user.id,
        destination,
        start_date: startDate,
        end_date: endDate,
        budget,
        description,
      });
      if (error) {
        toast.error(error.message || "Failed to create trip");
        return;
      }
      toast.success("Trip created successfully!");
      setShowCreateModal(false);
      fetchTrips();
      setDestination("");
      setStartDate("");
      setEndDate("");
      setBudget("");
      setDescription("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Travel Buddy</h1>
      </div>

      <div className="px-6 mb-6">
        <motion.button
          onClick={() => setShowCreateModal(true)}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full glass rounded-2xl p-5 flex items-center gap-4 shadow-card border border-dashed border-primary/30 active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
            <Plus size={22} className="text-primary-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">Create a Trip</h3>
            <p className="text-xs text-muted-foreground">Find companions for your journey</p>
          </div>
        </motion.button>
      </div>

      <div className="px-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center justify-center gap-2 bg-primary/10 py-2 rounded-xl">
          <Users size={16} className="text-primary" /> Sahayatri Registered Members
        </h2>
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trips.length > 0 ? (
            trips.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`glass rounded-2xl p-4 shadow-card border ${t.user_id === user?.id ? "border-primary/30" : "border-primary/5"}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-foreground">{t.user?.name}</h3>
                      <div className="flex items-center gap-2">
                        {t.user_id === user?.id ? (
                          <span className="text-[8px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">My Trip</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/messages?userId=${t.user_id}&userName=${encodeURIComponent(t.user?.name || "")}`); }}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary active:scale-95 transition-transform"
                          >
                            <MessageCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-secondary/30 p-2 rounded-xl">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Destination</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <MapPin size={10} className="text-primary" /> {t.destination}
                    </p>
                  </div>
                  <div className="bg-secondary/30 p-2 rounded-xl">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Budget</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <DollarSign size={10} className="text-primary" /> {t.budget || "Flexible"}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-foreground mb-3 leading-relaxed opacity-80">{t.description}</p>

                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Calendar size={12} />
                    <span>{new Date(t.start_date).toLocaleDateString()} - {new Date(t.end_date).toLocaleDateString()}</span>
                  </div>

                  {t.user_id !== user?.id ? (
                    <button
                      onClick={() => handleJoinTrip(t.id)}
                      className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg active:scale-95 transition-transform hover:bg-primary/20"
                    >
                      Request to Join
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-lg opacity-50">Organizer</span>
                      <button
                        onClick={() => handleDeleteTrip(t.id)}
                        className="p-1.5 rounded-lg bg-destructive/10 text-destructive active:scale-95 transition-transform"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {t.user_id === user?.id && (joinRequests[t.id]?.length ?? 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Join Requests</p>
                    {joinRequests[t.id].map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-foreground">{r.traveler_name}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRequestAction(r.id, t.id, "accepted")}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary active:scale-90 transition-transform"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => handleRequestAction(r.id, t.id, "rejected")}
                            className="p-1.5 rounded-lg bg-destructive/10 text-destructive active:scale-90 transition-transform"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))
          ) : (
            <div className="text-center py-10 glass rounded-3xl opacity-60">
              <p className="text-sm text-foreground">No active trips found from Sahayatri members.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-lg glass-dark rounded-3xl p-6 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-primary-foreground">Create a Buddy Trip</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>

              <form onSubmit={handleCreateTrip} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Where are you going?</label>
                  <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Goa, Manali, Paris"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Start Date</label>
                    <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-white/40 ml-1">End Date</label>
                    <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Budget (optional)</label>
                  <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. ₹20,000 or $500"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none" />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell others about your trip plans..." rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none resize-none" />
                </div>

                <button type="submit" disabled={creating} className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow mt-4 active:scale-95 transition-transform disabled:opacity-50">
                  {creating ? "Creating Trip..." : "Post Trip"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TravelBuddy;
