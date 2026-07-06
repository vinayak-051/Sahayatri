import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Shield, LogOut, Globe, MapPin, TrendingUp, Camera, X, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import GuideBottomNav from "@/components/GuideBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { validateImageFile } from "@/lib/validateImage";
import type { Location, VerificationRequest, VerificationDocumentType } from "@/types/database";

const DOC_TYPES: { value: VerificationDocumentType; label: string }[] = [
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "driving_license", label: "Driving License" },
  { value: "passport", label: "Passport" },
  { value: "voter_id", label: "Voter ID" },
  { value: "other", label: "Other Govt. ID" },
];

const GuideProfile = () => {
  const navigate = useNavigate();
  const { user, logout, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({ totalTrips: 0, touristsServed: 0, totalEarnings: 0, avgRating: null as number | null });
  const [statusCounts, setStatusCounts] = useState({ rejected: 0, accepted: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [myLocations, setMyLocations] = useState<Location[]>([]);
  const [togglingAvailability, setTogglingAvailability] = useState(false);

  const [formData, setFormData] = useState({ name: "", bio: "", city: "", languages: "", specialization: "", ratePerDay: "" });

  const docInputRef = useRef<HTMLInputElement>(null);
  const [verifRequest, setVerifRequest] = useState<VerificationRequest | null>(null);
  const [docType, setDocType] = useState<VerificationDocumentType>("aadhaar");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const fetchVerification = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("verification_requests")
      .select("*")
      .eq("guide_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setVerifRequest((data as VerificationRequest) ?? null);
  }, [user]);

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Upload a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5 MB.");
      return;
    }
    setUploadingDoc(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("verification-docs").upload(path, file);
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }
      const { error } = await supabase
        .from("verification_requests")
        .insert({ guide_id: user.id, document_type: docType, document_path: path });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Document submitted! We'll review it shortly.");
      fetchVerification();
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: bookings }, { data: ratingRow }] = await Promise.all([
      supabase.from("bookings").select("status, amount, traveler_id").eq("guide_id", user.id),
      supabase.from("guide_rating_stats").select("avg_rating").eq("guide_id", user.id).maybeSingle(),
    ]);
    const all = bookings ?? [];
    const relevant = all.filter((b) => b.status === "accepted" || b.status === "completed");
    setStats({
      totalTrips: all.length,
      touristsServed: new Set(relevant.map((b) => b.traveler_id)).size,
      totalEarnings: relevant.reduce((sum, b) => sum + Number(b.amount || 0), 0),
      avgRating: ratingRow?.avg_rating ?? null,
    });
    setStatusCounts({
      rejected: all.filter((b) => b.status === "declined").length,
      accepted: all.filter((b) => b.status === "accepted").length,
      completed: all.filter((b) => b.status === "completed").length,
    });
    setLoading(false);
  }, [user]);

  const fetchMyLocations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from("locations").select("*").eq("guide_id", user.id).order("created_at", { ascending: false });
    if (error) {
      console.error(error.message);
      return;
    }
    setMyLocations((data ?? []) as Location[]);
  }, [user]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        bio: user.bio || "",
        city: user.city || "",
        languages: user.languages?.join(", ") || "",
        specialization: user.specialization || "",
        ratePerDay: user.rate_per_day != null ? String(user.rate_per_day) : "",
      });
    }
    fetchStats();
    fetchMyLocations();
    fetchVerification();
  }, [user, fetchStats, fetchMyLocations, fetchVerification]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsedRate = formData.ratePerDay.trim() ? Number(formData.ratePerDay) : null;
    if (parsedRate !== null && (isNaN(parsedRate) || parsedRate <= 0 || parsedRate > 100000)) {
      toast.error("Rate must be between ₹1 and ₹1,00,000 per day.");
      return;
    }
    setEditing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: formData.name,
          bio: formData.bio,
          city: formData.city,
          specialization: formData.specialization,
          languages: formData.languages.split(",").map((l) => l.trim()).filter(Boolean),
          rate_per_day: parsedRate,
        })
        .eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await refreshProfile();
      setShowEditModal(false);
      toast.success("Profile updated!");
    } finally {
      setEditing(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error(uploadError.message);
      return;
    }
    const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("profiles").update({ profile_photo_url: publicUrl }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleToggleAvailability = async () => {
    if (!user) return;
    setTogglingAvailability(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_available: !user.is_available }).eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await refreshProfile();
    } finally {
      setTogglingAvailability(false);
    }
  };

  const earningsDisplay = stats.totalEarnings >= 1000 ? `₹${(stats.totalEarnings / 1000).toFixed(1)}k` : `₹${stats.totalEarnings}`;

  const chartData = [
    { name: "Rejected", value: statusCounts.rejected, color: "#ef4444" },
    { name: "Accepted", value: statusCounts.accepted, color: "#f59e0b" },
    { name: "Completed", value: statusCounts.completed, color: "#22c55e" },
  ];
  const hasBookingData = chartData.some((d) => d.value > 0);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-sky">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-sky pb-24 text-foreground">
      <div className="px-6 pt-8">
        {!user.is_verified && (
          <div className="glass rounded-2xl p-4 mb-4 border border-amber-500/40 bg-amber-500/5">
            {verifRequest?.status === "pending" ? (
              <>
                <p className="text-sm font-semibold text-amber-600">⏳ Verification Under Review</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your ID document was submitted on {new Date(verifRequest.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} and is being reviewed. You cannot accept bookings until verified.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-amber-600">
                  {verifRequest?.status === "rejected" ? "❌ Verification Rejected" : "⏳ Verification Required"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {verifRequest?.status === "rejected"
                    ? verifRequest.admin_note
                      ? `Reason: ${verifRequest.admin_note}. Please upload a valid document to try again.`
                      : "Your document was rejected. Please upload a valid government ID to try again."
                    : "Upload a government ID (Aadhaar, DL, passport) to get verified. Your document is stored privately and only visible to Sahayatri admins."}
                </p>
                <div className="flex gap-2 mt-3">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as VerificationDocumentType)}
                    className="flex-1 bg-background/60 border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className="px-4 py-2 rounded-xl gradient-primary text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {uploadingDoc ? "Uploading..." : "Upload ID"}
                  </button>
                  <input type="file" hidden ref={docInputRef} onChange={handleDocUpload} accept="image/jpeg,image/png,image/webp,application/pdf" />
                </div>
              </>
            )}
          </div>
        )}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass rounded-3xl p-6 shadow-elevated text-center mb-6">
          <div className="relative w-24 h-24 mx-auto mb-4 group">
            <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center text-5xl overflow-hidden border-2 border-primary/20">
              {user.profile_photo_url ? <img src={user.profile_photo_url} className="w-full h-full object-cover" /> : "👨‍🏫"}
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 p-2 rounded-full gradient-primary text-white shadow-lg active:scale-95 transition-transform">
              <Camera size={14} />
            </button>
            <input type="file" hidden ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" />
          </div>

          <h2 className="text-xl font-bold">{user.name}</h2>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="flex items-center gap-1 text-sm font-semibold">
              <Star size={14} className="text-accent fill-accent" /> {stats.avgRating ? stats.avgRating.toFixed(1) : "New"}
            </span>
            {user.is_verified ? (
              <span className="flex items-center gap-1 text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-full">
                <Shield size={10} /> VERIFIED
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold bg-secondary px-2 py-0.5 rounded-full">
                <Shield size={10} /> NOT YET VERIFIED
              </span>
            )}
          </div>
          <button onClick={() => setShowEditModal(true)} className="mt-4 px-6 py-2.5 rounded-xl gradient-accent text-accent-foreground text-xs font-bold shadow-glow active:scale-95 transition-transform">
            Edit Profile
          </button>
        </motion.div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Trips", value: stats.totalTrips },
            { label: "Tourists", value: stats.touristsServed },
            { label: "Earnings", value: earningsDisplay },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.05 }} className="glass rounded-2xl p-3 text-center shadow-card">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="glass rounded-2xl p-4 shadow-card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin size={15} className="text-primary" />
            </div>
            <p className="text-sm font-bold">My Locations</p>
          </div>

          {myLocations.length > 0 ? (
            <div className="space-y-2">
              {myLocations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => navigate(`/guide-locations?edit=${loc.id}`)}
                  className="w-full flex items-center justify-between bg-primary/10 text-primary px-3 py-2 rounded-xl text-xs font-bold active:scale-[0.98] transition-transform"
                >
                  <span className="flex items-center gap-1.5 truncate"><MapPin size={11} />{loc.title}</span>
                  <ChevronRight size={12} />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center py-3 opacity-60">No locations added yet</p>
          )}
        </div>

        <div className="glass rounded-2xl p-4 shadow-card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp size={15} className="text-primary" />
            </div>
            <p className="text-sm font-bold">Analytics</p>
          </div>

          {hasBookingData ? (
            <div className="flex items-center gap-4">
              <div className="w-28 h-28 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={48} paddingAngle={2}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {chartData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-bold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center py-3 opacity-60">No bookings yet</p>
          )}
        </div>

        <div className="space-y-2 pb-6">
          <button
            onClick={handleToggleAvailability}
            disabled={togglingAvailability}
            className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4 disabled:opacity-60"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${user.is_available ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
              <span className="text-base">{user.is_available ? "✅" : "⏸️"}</span>
            </div>
            <span className="flex-1 text-sm font-medium text-left">
              {user.is_available ? "Accepting bookings" : "Not accepting bookings"}
            </span>
            <div className={`w-11 h-6 rounded-full relative transition-colors ${user.is_available ? "gradient-primary" : "bg-secondary"}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${user.is_available ? "right-0.5" : "left-0.5"}`} />
            </div>
          </button>

          <div className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-accent">
              <Globe size={18} />
            </div>
            <span className="flex-1 text-sm font-medium">Languages: {user.languages?.join(", ") || "Not set"}</span>
          </div>

          <motion.button onClick={handleLogout} className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4 mt-4 text-destructive">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <LogOut size={18} />
            </div>
            <span className="flex-1 text-sm font-bold text-left">Log Out</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-lg glass-dark rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Edit Your Profile</h2>
                <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {[
                  { label: "Full Name", key: "name", placeholder: "Your name", required: true },
                  { label: "City / Region", key: "city", placeholder: "e.g. Jaipur, Goa", required: false },
                  { label: "Languages (comma separated)", key: "languages", placeholder: "English, Hindi, Telugu", required: false },
                  { label: "Specialization", key: "specialization", placeholder: "e.g. Cultural, Adventure, Food", required: false },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-white/40 ml-1">{f.label}</label>
                    <input
                      required={f.required}
                      type="text"
                      value={formData[f.key as keyof typeof formData]}
                      onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Rate Per Day (₹)</label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={formData.ratePerDay}
                    onChange={(e) => setFormData({ ...formData, ratePerDay: e.target.value })}
                    placeholder="e.g. 2000"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell travelers about yourself..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 resize-none"
                  />
                </div>
                <button type="submit" disabled={editing} className="w-full py-4 rounded-xl gradient-primary text-white font-bold shadow-glow mt-4 active:scale-95 transition-transform disabled:opacity-50">
                  {editing ? "Saving..." : "Save Profile"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GuideBottomNav />
    </div>
  );
};

export default GuideProfile;
