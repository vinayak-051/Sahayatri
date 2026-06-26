import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, XCircle, User, MapPin, Star, Search, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Profile } from "@/types/database";

type Filter = "unverified" | "verified" | "all";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [guides, setGuides] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("unverified");
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user?.is_admin) {
      navigate("/home");
    }
  }, [user, isLoading, navigate]);

  const fetchGuides = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select("id, name, email, city, rating, is_verified, profile_photo_url, created_at, rate_per_day, specialization")
      .eq("role", "guide")
      .order("created_at", { ascending: false });

    if (filter === "unverified") query = query.eq("is_verified", false);
    if (filter === "verified") query = query.eq("is_verified", true);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load guides");
    } else {
      setGuides((data ?? []) as Profile[]);
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    fetchGuides();
  }, [fetchGuides]);

  const toggleVerify = async (guide: Profile) => {
    setTogglingId(guide.id);
    const { error } = await supabase.rpc("admin_verify_guide", {
      p_guide_id: guide.id,
      p_verified: !guide.is_verified,
    });
    if (error) {
      toast.error(error.message || "Failed to update verification");
    } else {
      toast.success(guide.is_verified ? `${guide.name} unverified` : `${guide.name} verified!`);
      fetchGuides();
    }
    setTogglingId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-sky flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.is_admin) return null;

  const tabs: { key: Filter; label: string }[] = [
    { key: "unverified", label: "Pending" },
    { key: "verified", label: "Verified" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen gradient-sky pb-10">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Admin Dashboard</h1>
        <button onClick={fetchGuides} className="ml-auto p-1">
          <RefreshCw size={18} className={`text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="px-6 mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Total Guides", value: guides.length, color: "text-foreground" },
          { label: "Verified", value: guides.filter((g) => g.is_verified).length, color: "text-green-500" },
          { label: "Pending", value: guides.filter((g) => !g.is_verified).length, color: "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-2xl p-3 text-center shadow-card">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-6 mb-4 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === tab.key
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "glass text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-6 mb-4">
        <div className="glass rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-card">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchGuides()}
            placeholder="Search guide by name..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Guide list */}
      <div className="px-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guides.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No guides found</div>
        ) : (
          guides.map((guide, i) => (
            <motion.div
              key={guide.id}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-2xl p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {guide.profile_photo_url ? (
                    <img src={guide.profile_photo_url} alt={guide.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={22} className="text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{guide.name}</h3>
                    {guide.is_verified ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">Verified</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">Pending</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{guide.email}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {guide.city && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <MapPin size={10} /> {guide.city}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Star size={10} className="fill-amber-400 text-amber-400" /> {guide.rating?.toFixed(1) ?? "0.0"}
                    </span>
                    {guide.rate_per_day && (
                      <span className="text-xs text-muted-foreground">₹{guide.rate_per_day}/day</span>
                    )}
                  </div>
                  {guide.specialization && (
                    <p className="text-xs text-primary mt-1">{guide.specialization}</p>
                  )}
                </div>

                <button
                  onClick={() => toggleVerify(guide)}
                  disabled={togglingId === guide.id}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
                    guide.is_verified
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "gradient-primary text-primary-foreground shadow-glow"
                  }`}
                >
                  {togglingId === guide.id ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : guide.is_verified ? (
                    <><XCircle size={13} /> Unverify</>
                  ) : (
                    <><CheckCircle size={13} /> Verify</>
                  )}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
