import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Star, Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Location } from "@/types/database";

const SavedPlaces = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_locations")
      .select("location:locations(*, guide:profiles!locations_guide_id_fkey(id, name, city))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch saved places:", error.message);
    } else {
      setLocations(((data ?? []) as unknown as { location: Location }[]).map((r) => r.location).filter(Boolean));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  useEffect(() => {
    document.title = "Saved Places | Sahayatri";
    return () => { document.title = "Sahayatri - Your Journey, Our Guidance"; };
  }, []);

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Saved Places</h1>
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="text-center py-16 opacity-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading saved places...</p>
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-20 opacity-40">
            <Bookmark size={36} className="mx-auto mb-3" />
            <p className="text-sm font-medium">No saved places yet</p>
            <p className="text-[10px] mt-1">Tap the bookmark icon on a destination to save it here.</p>
          </div>
        ) : (
          locations.map((loc, i) => (
            <motion.button
              key={loc.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => navigate(`/location/${loc.id}`)}
              className="w-full glass rounded-2xl p-3 shadow-card flex items-center gap-4 text-left border border-primary/10 card-lift"
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary shrink-0">
                {loc.photos?.[0] ? (
                  <img src={loc.photos[0]} alt={loc.title} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><MapPin size={20} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground truncate">{loc.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin size={10} /> {loc.guide?.city || "India"}
                </p>
                <span className="flex items-center gap-0.5 text-xs text-foreground mt-1">
                  <Star size={11} className="text-accent fill-accent" /> {loc.rating > 0 ? loc.rating.toFixed(1) : "New"}
                </span>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
};

export default SavedPlaces;
