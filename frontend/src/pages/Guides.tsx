import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Star, Globe, Search, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types/database";

const PAGE_SIZE = 15;

const Guides = () => {
  const navigate = useNavigate();
  const [guides, setGuides] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchGuides = async (name = "", reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) setLoading(true); else setLoadingMore(true);

    let query = supabase
      .from("profiles")
      .select("id, name, profile_photo_url, is_verified, city, rating, languages, rate_per_day")
      .eq("role", "guide")
      .eq("is_verified", true)
      .order("name", { ascending: true })
      .range(currentOffset, currentOffset + PAGE_SIZE - 1);
    if (name) query = query.ilike("name", `%${name}%`);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch guides:", error.message);
    } else {
      const fetched = (data ?? []) as Profile[];
      setGuides(reset ? fetched : (prev) => [...prev, ...fetched]);
      setHasMore(fetched.length === PAGE_SIZE);
      setOffset(currentOffset + PAGE_SIZE);
    }
    if (reset) setLoading(false); else setLoadingMore(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("q") || params.get("city") || "";
    setSearchName(name);
    setOffset(0);
    fetchGuides(name, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = "Find a Guide | Sahayatri";
    return () => { document.title = "Sahayatri - Your Journey, Our Guidance"; };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchName.trim().length > 0 && searchName.trim().length < 2) return;
    setOffset(0);
    setHasMore(true);
    fetchGuides(searchName, true);
  };

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/home")} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Find a Guide</h1>
      </div>

      <div className="px-6 mb-6">
        <form onSubmit={handleSearch} className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-card">
          <Search size={18} className="text-muted-foreground" />
          <input
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search guides by name..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        </form>
      </div>

      <div className="px-6 space-y-3">
        {guides.length > 0 ? (
          guides.map((g, i) => (
            <motion.button
              key={g.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => navigate(`/guide/${g.id}`)}
              className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4 text-left border border-primary/10 card-lift"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold overflow-hidden">
                {g.profile_photo_url ? (
                  <img src={g.profile_photo_url} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  "🧭"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-foreground truncate">{g.name}</h3>
                  {g.is_verified && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">VERIFIED ✅</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin size={10} /> {g.city || "India"}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="flex items-center gap-0.5 text-xs text-foreground">
                    <Star size={12} className="text-accent fill-accent" /> {g.rating || "New"}
                  </span>
                  {g.languages?.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Globe size={10} /> {g.languages.length} lang
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-primary">
                  {g.rate_per_day != null ? `₹${g.rate_per_day.toLocaleString()}` : "—"}
                </span>
                <p className="text-[8px] text-muted-foreground font-bold">{g.rate_per_day != null ? "per day" : "contact for price"}</p>
              </div>
            </motion.button>
          ))
        ) : !loading ? (
          <div className="text-center py-10 glass rounded-3xl opacity-60">
            <p className="text-sm">No verified guides found yet.</p>
          </div>
        ) : null}

        {hasMore && !loading && guides.length > 0 && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => fetchGuides(searchName, false)}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow disabled:opacity-60 flex items-center gap-2"
            >
              {loadingMore ? (
                <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Loading...</>
              ) : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Guides;
