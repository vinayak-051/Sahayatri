import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Star, Bookmark, Route, ExternalLink, Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Location } from "@/types/database";
import { formatKm, googleMapsDirectionsUrl, groupByCity, OTHER_PLACES, planDayRoute } from "@/lib/dayPlanner";

const SavedPlaces = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [plannedCity, setPlannedCity] = useState<string | null>(null);

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
      toast.error("Couldn't load your saved places.");
    } else {
      setLocations(((data ?? []) as unknown as { location: Location }[]).map((r) => r.location).filter(Boolean));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const groups = useMemo(() => groupByCity(locations, (loc) => loc.city || loc.guide?.city), [locations]);
  const plannedGroup = groups.find((g) => g.city === plannedCity);
  const plan = useMemo(() => (plannedGroup ? planDayRoute(plannedGroup.items) : null), [plannedGroup]);
  const mapsUrl = plan ? googleMapsDirectionsUrl(plan.stops) : null;

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
          groups.map((group) => (
            <section key={group.city} className="space-y-3" aria-label={`Saved places in ${group.city}`}>
              <div className="flex items-center justify-between pt-2">
                <h2 className="text-sm font-bold text-foreground">
                  {group.city} <span className="text-muted-foreground font-medium">· {group.items.length}</span>
                </h2>
                {group.items.length > 1 && group.city !== OTHER_PLACES && (
                  <button
                    onClick={() => setPlannedCity(plannedCity === group.city ? null : group.city)}
                    aria-expanded={plannedCity === group.city}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary"
                  >
                    <Route size={13} /> {plannedCity === group.city ? "Hide plan" : "Plan my day"}
                  </button>
                )}
              </div>

              {plannedCity === group.city && plan ? (
                <div className="glass rounded-2xl p-4 border border-primary/10 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Suggested order, about <strong className="text-foreground">{formatKm(plan.totalKm)}</strong> between stops (straight-line).
                  </p>
                  <ol className="space-y-2">
                    {plan.stops.map((loc, i) => (
                      <li key={loc.id}>
                        <button onClick={() => navigate(`/location/${loc.id}`)} className="w-full flex items-center gap-3 text-left">
                          <span className="w-6 h-6 rounded-full gradient-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{loc.title}</span>
                          {i < plan.legsKm.length && <span className="text-[10px] text-muted-foreground shrink-0">→ {formatKm(plan.legsKm[i])}</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="grid grid-cols-2 gap-2">
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1">
                        <ExternalLink size={12} /> Open route
                      </a>
                    )}
                    <button onClick={() => navigate(`/guides?city=${encodeURIComponent(group.city)}`)} className="py-2 rounded-xl bg-secondary border border-border text-xs font-bold text-foreground flex items-center justify-center gap-1">
                      <Compass size={12} /> Find a guide
                    </button>
                  </div>
                </div>
              ) : (
                group.items.map((loc, i) => (
                  <motion.button
                    key={loc.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.06, 0.4) }}
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
                        <MapPin size={10} /> {loc.city || loc.guide?.city || "India"}
                      </p>
                      <span className="flex items-center gap-0.5 text-xs text-foreground mt-1">
                        <Star size={11} className="text-accent fill-accent" /> {loc.rating > 0 ? loc.rating.toFixed(1) : "New"}
                      </span>
                    </div>
                  </motion.button>
                ))
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
};

export default SavedPlaces;
