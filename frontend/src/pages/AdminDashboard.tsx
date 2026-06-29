import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, CheckCircle, XCircle, User, MapPin, Star, Search, RefreshCw,
  Users, TrendingUp, Calendar, Package, ChevronDown, ChevronUp, LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Profile } from "@/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminTab = "overview" | "guides" | "bookings" | "buddy" | "analytics";
type GuideFilter = "unverified" | "verified" | "all";

interface BookingRow {
  id: string;
  destination: string;
  date: string;
  people: number;
  amount: number;
  status: string;
  created_at: string;
  traveler: { id: string; name: string; profile_photo_url: string | null } | null;
  guide: { id: string; name: string; profile_photo_url: string | null; city: string | null } | null;
}

interface BuddyRequestRow {
  id: string;
  status: string;
  created_at: string;
  traveler: { id: string; name: string; profile_photo_url: string | null } | null;
}

interface BuddyTripRow {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: string | null;
  description: string | null;
  created_at: string;
  user: { id: string; name: string; profile_photo_url: string | null } | null;
  buddy_requests: BuddyRequestRow[];
}

interface TravelerRow {
  id: string;
  name: string;
  email: string;
  city: string | null;
  profile_photo_url: string | null;
  created_at: string;
}

interface OverviewStats {
  travelers: number;
  guides: number;
  verifiedGuides: number;
  totalBookings: number;
  pendingBookings: number;
  acceptedBookings: number;
  completedBookings: number;
  totalRevenue: number;
  buddyTrips: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/10 text-amber-600",
  accepted:  "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  declined:  "bg-red-500/10 text-red-500",
  cancelled: "bg-gray-500/10 text-gray-500",
  rejected:  "bg-red-500/10 text-red-500",
};

function fmtCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

type AnalyticsRow = { created_at: string; amount: number; status: string };

function buildDailyData(rows: AnalyticsRow[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split("T")[0];
    const hits = rows.filter((r) => r.created_at.startsWith(key));
    return {
      label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
      Requested: hits.length,
      Accepted: hits.filter((r) => r.status === "accepted" || r.status === "completed").length,
      revenue: hits.reduce((s, r) => s + (r.amount ?? 0), 0),
    };
  });
}

function buildMonthlyData(rows: AnalyticsRow[]) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hits = rows.filter((r) => r.created_at.startsWith(key));
    return {
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      Requested: hits.length,
      Accepted: hits.filter((r) => r.status === "accepted" || r.status === "completed").length,
      revenue: hits.reduce((s, r) => s + (r.amount ?? 0), 0),
    };
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, onClick }: { label: string; value: number; color: string; icon: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`glass rounded-2xl p-3 shadow-card text-left w-full transition-transform active:scale-95 ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`flex items-center gap-1.5 mb-0.5 ${color}`}>
        {icon}
        <p className="text-xl font-bold">{value.toLocaleString("en-IN")}</p>
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {onClick && <p className="text-[9px] text-primary mt-0.5">Tap to view →</p>}
    </button>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4 shadow-card">
      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function MiniAvatar({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0">
      {url
        ? <img src={url} alt={name} className="w-full h-full object-cover" />
        : <User size={13} className="text-muted-foreground" />}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, isLoading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);

  // Guides
  const [guides, setGuides] = useState<Profile[]>([]);
  const [guideFilter, setGuideFilter] = useState<GuideFilter>("unverified");
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Bookings
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookingFilter, setBookingFilter] = useState("all");

  // Buddy trips
  const [buddyTrips, setBuddyTrips] = useState<BuddyTripRow[]>([]);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  // Travelers detail
  const [travelers, setTravelers] = useState<TravelerRow[]>([]);
  const [travelersLoading, setTravelersLoading] = useState(false);
  const [overviewDetail, setOverviewDetail] = useState<string | null>(null);

  // Overview & Analytics
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [analyticsData, setAnalyticsData] = useState<{
    daily: ReturnType<typeof buildDailyData>;
    monthly: ReturnType<typeof buildMonthlyData>;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !user?.is_admin) navigate("/home");
  }, [user, isLoading, navigate]);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchTravelers = useCallback(async () => {
    setTravelersLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, city, profile_photo_url, created_at")
      .eq("role", "traveler")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Failed to load travelers");
    else setTravelers((data ?? []) as TravelerRow[]);
    setTravelersLoading(false);
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const [travelersRes, guidesRes, bookingsRes, buddyRes] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "traveler"),
      supabase.from("profiles").select("id, is_verified").eq("role", "guide"),
      supabase.from("bookings").select("id, status, amount"),
      supabase.from("buddy_trips").select("*", { count: "exact", head: true }),
    ]);

    const allGuides = guidesRes.data ?? [];
    const allBookings = (bookingsRes.data ?? []) as { id: string; status: string; amount: number }[];

    setStats({
      travelers: travelersRes.count ?? 0,
      guides: allGuides.length,
      verifiedGuides: allGuides.filter((g) => g.is_verified).length,
      totalBookings: allBookings.length,
      pendingBookings: allBookings.filter((b) => b.status === "pending").length,
      acceptedBookings: allBookings.filter((b) => b.status === "accepted").length,
      completedBookings: allBookings.filter((b) => b.status === "completed").length,
      totalRevenue: allBookings
        .filter((b) => b.status === "completed")
        .reduce((s, b) => s + (b.amount ?? 0), 0),
      buddyTrips: buddyRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  const fetchGuides = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select("id, name, email, city, rating, is_verified, profile_photo_url, created_at, rate_per_day, specialization")
      .eq("role", "guide")
      .order("created_at", { ascending: false });

    if (guideFilter === "unverified") query = query.eq("is_verified", false);
    if (guideFilter === "verified") query = query.eq("is_verified", true);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) toast.error("Failed to load guides");
    else setGuides((data ?? []) as Profile[]);
    setLoading(false);
  }, [guideFilter, search]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("bookings")
      .select(`
        id, destination, date, people, amount, status, created_at,
        traveler:profiles!traveler_id(id, name, profile_photo_url),
        guide:profiles!guide_id(id, name, profile_photo_url, city)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (bookingFilter !== "all") query = query.eq("status", bookingFilter);

    const { data, error } = await query;
    if (error) toast.error("Failed to load bookings");
    else setBookings((data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  }, [bookingFilter]);

  const fetchBuddyTrips = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("buddy_trips")
      .select(`
        id, destination, start_date, end_date, budget, description, created_at,
        user:profiles!user_id(id, name, profile_photo_url),
        buddy_requests(
          id, status, created_at,
          traveler:profiles!traveler_id(id, name, profile_photo_url)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) toast.error("Failed to load buddy trips");
    else setBuddyTrips((data ?? []) as unknown as BuddyTripRow[]);
    setLoading(false);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const { data, error } = await supabase
      .from("bookings")
      .select("created_at, amount, status")
      .gte("created_at", since.toISOString());

    if (error) toast.error("Failed to load analytics");
    else {
      const rows = (data ?? []) as AnalyticsRow[];
      setAnalyticsData({ daily: buildDailyData(rows), monthly: buildMonthlyData(rows) });
    }
    setLoading(false);
  }, []);

  // Reset overview detail when leaving overview
  useEffect(() => {
    if (activeTab !== "overview") setOverviewDetail(null);
  }, [activeTab]);

  // Load on tab change
  useEffect(() => {
    if (!user?.is_admin) return;
    if (activeTab === "overview") fetchStats();
    else if (activeTab === "guides") fetchGuides();
    else if (activeTab === "bookings") fetchBookings();
    else if (activeTab === "buddy") fetchBuddyTrips();
    else if (activeTab === "analytics") fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.is_admin]);

  // Re-fetch when guide filter/search changes
  useEffect(() => {
    if (activeTab === "guides" && user?.is_admin) fetchGuides();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideFilter, search]);

  // Re-fetch when booking filter changes
  useEffect(() => {
    if (activeTab === "bookings" && user?.is_admin) fetchBookings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingFilter]);

  // Realtime guide changes
  useEffect(() => {
    const ch = supabase
      .channel("admin-guides-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: "role=eq.guide" }, () => {
        if (activeTab === "guides") fetchGuides();
        else if (activeTab === "overview") fetchStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeTab, fetchGuides, fetchStats]);

  const toggleVerify = async (guide: Profile) => {
    setTogglingId(guide.id);
    const { error } = await supabase.rpc("admin_verify_guide", {
      p_guide_id: guide.id,
      p_verified: !guide.is_verified,
    });
    if (error) toast.error(error.message || "Failed to update verification");
    else {
      toast.success(guide.is_verified ? `${guide.name} unverified` : `${guide.name} verified!`);
      fetchGuides();
    }
    setTogglingId(null);
  };

  const refresh = () => {
    if (activeTab === "overview") fetchStats();
    else if (activeTab === "guides") fetchGuides();
    else if (activeTab === "bookings") fetchBookings();
    else if (activeTab === "buddy") fetchBuddyTrips();
    else fetchAnalytics();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-sky flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.is_admin) return null;

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "overview",  label: "Overview" },
    { key: "guides",    label: "Guides" },
    { key: "bookings",  label: "Bookings" },
    { key: "buddy",     label: "Buddy Trips" },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div className="min-h-screen gradient-sky pb-10">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/home")} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Admin Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={refresh} className="p-1">
            <RefreshCw size={18} className={`text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={async () => { await logout(); navigate("/auth"); }}
            className="p-1"
          >
            <LogOut size={18} className="text-destructive" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "glass text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="px-6 space-y-5">
          {/* ── Travelers Detail ── */}
          {overviewDetail === "travelers" && (
            <>
              <button
                onClick={() => setOverviewDetail(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <ArrowLeft size={15} /> Back to Overview
              </button>
              <p className="text-base font-bold text-foreground -mt-2">All Travelers</p>
              {travelersLoading ? <Spinner /> : travelers.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground text-sm">No travelers yet</p>
              ) : travelers.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="glass rounded-2xl p-4 shadow-card flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {t.profile_photo_url
                      ? <img src={t.profile_photo_url} alt={t.name} className="w-full h-full object-cover" />
                      : <User size={20} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                    {t.city && (
                      <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <MapPin size={10} /> {t.city}
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">{fmtDate(t.created_at)}</p>
                </motion.div>
              ))}
            </>
          )}

          {/* ── Stats Grid ── */}
          {overviewDetail === null && (
            loading || !stats ? <Spinner /> : (
              <>
                <Section label="Users">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label="Travelers" value={stats.travelers} color="text-blue-500" icon={<Users size={15} />}
                      onClick={() => { setOverviewDetail("travelers"); fetchTravelers(); }}
                    />
                    <StatCard
                      label="Total Guides" value={stats.guides} color="text-foreground" icon={<User size={15} />}
                      onClick={() => { setActiveTab("guides"); setGuideFilter("all"); }}
                    />
                    <StatCard
                      label="Verified Guides" value={stats.verifiedGuides} color="text-green-500" icon={<CheckCircle size={15} />}
                      onClick={() => { setActiveTab("guides"); setGuideFilter("verified"); }}
                    />
                    <StatCard
                      label="Pending Guides" value={stats.guides - stats.verifiedGuides} color="text-amber-500" icon={<XCircle size={15} />}
                      onClick={() => { setActiveTab("guides"); setGuideFilter("unverified"); }}
                    />
                  </div>
                </Section>

                <Section label="Bookings">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      label="Total Bookings" value={stats.totalBookings} color="text-foreground" icon={<Calendar size={15} />}
                      onClick={() => { setActiveTab("bookings"); setBookingFilter("all"); }}
                    />
                    <StatCard
                      label="Pending" value={stats.pendingBookings} color="text-amber-500" icon={<Package size={15} />}
                      onClick={() => { setActiveTab("bookings"); setBookingFilter("pending"); }}
                    />
                    <StatCard
                      label="Active Tours" value={stats.acceptedBookings} color="text-blue-500" icon={<TrendingUp size={15} />}
                      onClick={() => { setActiveTab("bookings"); setBookingFilter("accepted"); }}
                    />
                    <StatCard
                      label="Completed" value={stats.completedBookings} color="text-green-500" icon={<CheckCircle size={15} />}
                      onClick={() => { setActiveTab("bookings"); setBookingFilter("completed"); }}
                    />
                  </div>
                </Section>

                <Section label="Revenue & Trips">
                  <div className="glass rounded-2xl p-4 shadow-card mb-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Total Revenue (completed)</p>
                    <p className="text-2xl font-bold text-green-500">{fmtCurrency(stats.totalRevenue)}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <StatCard
                      label="Buddy Trips Posted" value={stats.buddyTrips} color="text-primary" icon={<Users size={15} />}
                      onClick={() => setActiveTab("buddy")}
                    />
                  </div>
                </Section>
              </>
            )
          )}
        </div>
      )}

      {/* ── GUIDES ───────────────────────────────────────────────────────────── */}
      {activeTab === "guides" && (
        <div className="px-6 space-y-3">
          <div className="flex gap-2">
            {(["unverified", "verified", "all"] as GuideFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setGuideFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  guideFilter === f ? "gradient-primary text-primary-foreground shadow-glow" : "glass text-muted-foreground"
                }`}
              >
                {f === "unverified" ? "Pending" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

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

          {loading ? <Spinner /> : guides.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">No guides found</p>
          ) : guides.map((guide, i) => (
            <motion.div
              key={guide.id}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-2xl p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {guide.profile_photo_url
                    ? <img src={guide.profile_photo_url} alt={guide.name} className="w-full h-full object-cover" />
                    : <User size={22} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{guide.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${guide.is_verified ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                      {guide.is_verified ? "Verified" : "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{guide.email}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
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
                  {guide.specialization && <p className="text-xs text-primary mt-1">{guide.specialization}</p>}
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
          ))}
        </div>
      )}

      {/* ── BOOKINGS ─────────────────────────────────────────────────────────── */}
      {activeTab === "bookings" && (
        <div className="px-6 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["all", "pending", "accepted", "completed", "declined", "cancelled"].map((f) => (
              <button
                key={f}
                onClick={() => setBookingFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  bookingFilter === f ? "gradient-primary text-primary-foreground shadow-glow" : "glass text-muted-foreground"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? <Spinner /> : bookings.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">No bookings found</p>
          ) : bookings.map((booking, i) => (
            <motion.div
              key={booking.id}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="glass rounded-2xl p-4 shadow-card space-y-2.5"
            >
              {/* Traveler → Guide */}
              <div className="flex items-center gap-2">
                <MiniAvatar url={booking.traveler?.profile_photo_url ?? null} name={booking.traveler?.name ?? ""} />
                <span className="text-xs font-medium text-foreground truncate max-w-[80px]">{booking.traveler?.name ?? "Unknown"}</span>
                <span className="text-xs text-muted-foreground">→</span>
                <MiniAvatar url={booking.guide?.profile_photo_url ?? null} name={booking.guide?.name ?? ""} />
                <span className="text-xs font-medium text-foreground truncate max-w-[80px]">{booking.guide?.name ?? "Unknown"}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[booking.status] ?? "bg-secondary text-muted-foreground"}`}>
                  {booking.status}
                </span>
              </div>

              {/* Details */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5"><MapPin size={10} />{booking.destination}</span>
                <span className="flex items-center gap-0.5"><Calendar size={10} />{fmtDate(booking.date)}</span>
                {booking.people > 1 && <span>{booking.people} pax</span>}
                <span className="ml-auto font-semibold text-foreground">{fmtCurrency(booking.amount)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── BUDDY TRIPS ──────────────────────────────────────────────────────── */}
      {activeTab === "buddy" && (
        <div className="px-6 space-y-3">
          {loading ? <Spinner /> : buddyTrips.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">No buddy trips found</p>
          ) : buddyTrips.map((trip, i) => {
            const accepted = trip.buddy_requests.filter((r) => r.status === "accepted").length;
            const rejected = trip.buddy_requests.filter((r) => r.status === "rejected").length;
            const pending  = trip.buddy_requests.filter((r) => r.status === "pending").length;
            const isOpen   = expandedTrip === trip.id;

            return (
              <motion.div
                key={trip.id}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="glass rounded-2xl shadow-card overflow-hidden"
              >
                <button
                  className="w-full p-4 text-left"
                  onClick={() => setExpandedTrip(isOpen ? null : trip.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {trip.user?.profile_photo_url
                        ? <img src={trip.user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                        : <User size={18} className="text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground">{trip.user?.name ?? "Unknown"} posted</p>
                      <h3 className="text-sm font-semibold text-foreground">{trip.destination}</h3>
                      <p className="text-xs text-muted-foreground">{fmtDate(trip.start_date)} – {fmtDate(trip.end_date)}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {accepted > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">{accepted} accepted</span>}
                        {pending  > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">{pending} pending</span>}
                        {rejected > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{rejected} rejected</span>}
                        {trip.buddy_requests.length === 0 && <span className="text-[10px] text-muted-foreground">No requests yet</span>}
                      </div>
                    </div>
                    {trip.buddy_requests.length > 0 && (
                      isOpen ? <ChevronUp size={16} className="text-muted-foreground shrink-0 mt-1" />
                             : <ChevronDown size={16} className="text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>
                </button>

                {isOpen && trip.buddy_requests.length > 0 && (
                  <div className="border-t border-border/40 px-4 pb-3 pt-2 space-y-2">
                    {trip.buddy_requests.map((req) => (
                      <div key={req.id} className="flex items-center gap-2">
                        <MiniAvatar url={req.traveler?.profile_photo_url ?? null} name={req.traveler?.name ?? ""} />
                        <span className="text-xs text-foreground flex-1">{req.traveler?.name ?? "Unknown"} requested to join</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[req.status] ?? "bg-secondary text-muted-foreground"}`}>
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── ANALYTICS ────────────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="px-6 space-y-4">
          {loading || !analyticsData ? <Spinner /> : (
            <>
              <ChartCard title="Requested vs Accepted — Last 7 Days">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={analyticsData.daily} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Requested" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Accepted"  stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Requested vs Accepted — Last 6 Months">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={analyticsData.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Requested" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Accepted"  stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Revenue — Last 6 Months (₹)">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analyticsData.monthly} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [fmtCurrency(v), "Revenue"]}
                      cursor={{ fill: "rgba(128,128,128,0.08)" }}
                    />
                    <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )}
        </div>
      )}
    </div>
  );
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  );
}

export default AdminDashboard;
