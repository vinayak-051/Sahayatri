import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Compass, Users, Star, MapPin, Map, Bell, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import type { Profile, BuddyTrip, Location } from "@/types/database";
import heroImg from "@/assets/hero-travel.jpg";
import logo from "@/assets/logo.png";

const features = [
  { icon: Compass, title: "Find a Guide", subtitle: "Local experts near you", color: "gradient-primary", path: "/guides" },
  { icon: Users, title: "Travel Buddy", subtitle: "Find travel companions", color: "gradient-accent", path: "/travel-buddy" },
  { icon: Map, title: "Map View", subtitle: "Explore on map", color: "gradient-primary", path: "/map" },
  { icon: MessageCircle, title: "Messages", subtitle: "Chat with guides", color: "gradient-accent", path: "/messages" },
];

interface SearchResults {
  query: string;
  guides: Profile[];
  buddyTrips: BuddyTrip[];
}

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const unreadCount = useUnreadNotifications();
  const [topLocations, setTopLocations] = useState<Location[]>([]);

  useEffect(() => {
    const fetchTopLocations = async () => {
      const { data } = await supabase
        .from("locations")
        .select("*, guide:profiles!locations_guide_id_fkey(city)")
        .eq("status", "active")
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4);
      setTopLocations((data ?? []) as Location[]);
    };
    fetchTopLocations();
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const [{ data: guides }, { data: buddyTrips }] = await Promise.all([
        supabase.from("profiles").select("*").eq("role", "guide").or(`name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,specialization.ilike.%${searchQuery}%`),
        supabase
          .from("buddy_trips")
          .select("*, user:profiles!buddy_trips_user_id_fkey(id, name)")
          .ilike("destination", `%${searchQuery}%`),
      ]);
      setSearchResults({ query: searchQuery, guides: (guides ?? []) as Profile[], buddyTrips: (buddyTrips ?? []) as BuddyTrip[] });
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="relative h-[45vh] overflow-hidden">
        <img src={heroImg} alt="Travel" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-background" />
        <button
          onClick={() => navigate("/notifications")}
          className="absolute top-6 right-6 z-20 p-2.5 glass rounded-full shadow-card active:scale-95 transition-transform"
        >
          <Bell size={18} className="text-primary-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full gradient-accent text-[10px] text-accent-foreground font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <div className="relative z-10 flex flex-col justify-end h-full px-6 pb-8">
          <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-primary-foreground/80 text-sm font-light">
            Hello, {user?.name?.split(" ")[0] || "Traveler"} 👋
          </motion.p>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-2xl font-bold text-primary-foreground mt-1">
            Where do you want to go?
          </motion.h1>
        </div>
      </div>

      <div className="px-6 -mt-6 relative z-20">
        <motion.form onSubmit={handleSearch} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-elevated">
          <Search size={20} className="text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search destinations, guides..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searching && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        </motion.form>
      </div>

      {searchResults && (
        <div className="px-6 mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Results for "{searchResults.query}"</h2>
            <button onClick={() => setSearchResults(null)} className="text-xs text-muted-foreground">Clear</button>
          </div>

          {searchResults.guides.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Guides</h3>
                <button onClick={() => navigate(`/guides?city=${searchResults.query}`)} className="text-[10px] text-primary font-bold">View All</button>
              </div>
              <div className="space-y-3">
                {searchResults.guides.map((g) => (
                  <button key={g.id} onClick={() => navigate(`/guide/${g.id}`)} className="w-full glass rounded-2xl p-4 flex items-center gap-4 text-left shadow-card">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">🧭</div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{g.name} {g.is_verified && "✅"}</p>
                      <p className="text-xs text-muted-foreground">{g.city} • {g.specialization}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/messages?userId=${g.id}&userName=${encodeURIComponent(g.name)}`); }}
                      className="p-2.5 rounded-xl bg-primary/10 text-primary active:scale-95 transition-transform"
                    >
                      <MessageCircle size={18} />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.buddyTrips.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Travel Buddies ({searchResults.buddyTrips.length})</h3>
                <button onClick={() => navigate("/travel-buddy")} className="text-[10px] text-primary font-bold">Explore All</button>
              </div>
              <div className="space-y-3">
                {searchResults.buddyTrips.map((t) => (
                  <div key={t.id} className="glass rounded-2xl p-4 shadow-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm">👤</div>
                        <p className="text-xs font-bold text-foreground">{t.user?.name}</p>
                      </div>
                      <button onClick={() => navigate(`/messages?userId=${t.user_id}&userName=${encodeURIComponent(t.user?.name || "")}`)} className="p-2 rounded-lg bg-primary/5 text-primary active:scale-95 transition-transform">
                        <MessageCircle size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    <p className="text-[10px] text-primary mt-2 font-medium">
                      📅 {new Date(t.start_date).toLocaleDateString()} - {new Date(t.end_date).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.guides.length === 0 && searchResults.buddyTrips.length === 0 && (
            <div className="text-center py-8 glass rounded-2xl">
              <p className="text-sm text-muted-foreground">No verified members found for "{searchResults.query}"</p>
            </div>
          )}
        </div>
      )}

      <div className="px-6 mt-8">
        <h2 className="text-base font-semibold text-foreground mb-4">Explore Features</h2>
        <div className="grid grid-cols-2 gap-4">
          {features.map((f, i) => (
            <motion.button
              key={f.title}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              onClick={() => navigate(f.path)}
              className="glass rounded-3xl p-6 flex flex-col items-center gap-4 shadow-elevated hover:shadow-glow transition-all"
            >
              <div className={`w-16 h-16 rounded-2xl ${f.color} flex items-center justify-center shadow-lg`}>
                <f.icon size={32} className="text-primary-foreground" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-bold text-foreground text-center">{f.title}</span>
                <span className="text-xs text-muted-foreground text-center">{f.subtitle}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {topLocations.length > 0 && (
        <div className="mt-8">
          <div className="px-6 flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Popular Destinations</h2>
            <button onClick={() => navigate("/explore")} className="text-xs text-primary font-bold">See all</button>
          </div>
          <div className="grid grid-cols-4 gap-3 px-6">
            {topLocations.map((loc, i) => (
              <motion.div
                key={loc.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                onClick={() => navigate(`/location/${loc.id}`)}
                className="flex flex-col items-center gap-2 cursor-pointer"
              >
                <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden shadow-card bg-secondary">
                  {loc.photos?.[0] ? (
                    <img src={loc.photos[0]} alt={loc.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <MapPin size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <div className="flex items-center gap-1">
                      <MapPin size={8} className="text-accent" />
                      <span className="text-primary-foreground text-[10px] font-bold truncate">{loc.guide?.city || loc.title}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Star size={8} className="text-accent fill-accent" />
                  <span className="text-muted-foreground text-[8px] font-bold">{loc.rating > 0 ? loc.rating.toFixed(1) : "New"}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 px-6 pb-20 flex items-center justify-center gap-2 opacity-50">
        <img src={logo} alt="" className="w-4 h-4 object-contain" />
        <span className="text-[10px] font-bold text-foreground tracking-widest uppercase">SAHAYATRI 2026 © ALL RIGHTS RESERVED</span>
      </div>

      <BottomNav />
    </div>
  );
};

export default Home;
