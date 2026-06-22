import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Star, Globe, Search, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types/database";

const Guides = () => {
  const navigate = useNavigate();
  const [guides, setGuides] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState("");

  const fetchGuides = async (name = "") => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").eq("role", "guide").order("name", { ascending: true });
    if (name) query = query.ilike("name", `%${name}%`);
    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch guides:", error.message);
      setGuides([]);
    } else {
      setGuides((data ?? []) as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("q") || params.get("city") || "";
    setSearchName(name);
    fetchGuides(name);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGuides(searchName);
  };

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
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
              className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4 text-left border border-primary/10"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-bold overflow-hidden">
                {g.profile_photo_url ? (
                  <img src={g.profile_photo_url} className="w-full h-full object-cover" />
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
      </div>
    </div>
  );
};

export default Guides;
