import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Map, Shield, LogOut, Compass, User, Camera, X, Check, Lock, MapPin, Globe, Briefcase, FileText, Lightbulb, ShieldCheck, Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

import { validateImageFile } from "@/lib/validateImage";

const baseMenuItems = [
  { icon: Compass, label: "Become a Guide", path: "/role-select" },
  { icon: Map, label: "My Trips", path: "/trips" },
  { icon: Bookmark, label: "Saved Places", path: "/saved" },
  { icon: Lightbulb, label: "Trip Tips", path: "/ai-guide" },
  { icon: Shield, label: "Safety", path: "/safety" },
];

const Profile = () => {
  const navigate = useNavigate();
  const { user, isGuide, isAdmin, logout, refreshProfile } = useAuth();
  const menuItems = [
    ...baseMenuItems,
    ...(isAdmin ? [{ icon: ShieldCheck, label: "Admin Dashboard", path: "/admin" }] : []),
  ];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editPassword, setEditPassword] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.profile_photo_url || null);
  useEffect(() => { setPreviewUrl(user?.profile_photo_url || null); }, [user?.profile_photo_url]);

  const [editCity, setEditCity] = useState(user?.city || "");
  const [editLanguages, setEditLanguages] = useState(user?.languages?.join(", ") || "");
  const [editSpecialization, setEditSpecialization] = useState(user?.specialization || "");
  const [editBio, setEditBio] = useState(user?.bio || "");

  const [saving, setSaving] = useState(false);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setEditPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let photoUrl = user.profile_photo_url;
      if (editPhoto) {
        const ext = editPhoto.name.split(".").pop();
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, editPhoto, { upsert: true });
        if (uploadError) {
          toast.error(uploadError.message);
          return;
        }
        photoUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      if (editPassword) {
        const { error: pwError } = await supabase.auth.updateUser({ password: editPassword });
        if (pwError) {
          toast.error(pwError.message);
          return;
        }
      }

      const updates: Record<string, unknown> = { name: editName, profile_photo_url: photoUrl };
      if (isGuide) {
        updates.city = editCity;
        updates.languages = editLanguages.split(",").map((l) => l.trim()).filter(Boolean);
        updates.specialization = editSpecialization;
        updates.bio = editBio;
      }

      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }

      await refreshProfile();
      setShowEdit(false);
      setEditPassword("");
      setEditPhoto(null);
      toast.success("Profile updated!");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const displayName = user?.name || "Guest";
  const displayEmail = user?.email || "";
  const displayRole = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Traveler";

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handleFileChange} />

      <div className="px-6 pt-8">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass rounded-3xl p-6 shadow-elevated text-center mb-6">
          <div className="relative w-20 h-20 mx-auto mb-3 group cursor-pointer" onClick={handlePhotoClick}>
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-primary/30">
              {previewUrl ? <img src={previewUrl} alt={displayName} className="w-full h-full object-cover" /> : <User size={36} className="text-muted-foreground" />}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full gradient-primary flex items-center justify-center shadow-glow">
              <Camera size={12} className="text-white" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-foreground">{displayName}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{displayEmail}</p>
          <span className="inline-block mt-1 px-3 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{displayRole}</span>

          {isGuide && user?.city && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <MapPin size={12} /> {user.city}
              {user.specialization && ` • ${user.specialization}`}
            </p>
          )}

          <div className="mt-4">
            <button
              onClick={() => {
                setEditName(user?.name || "");
                setEditPassword("");
                if (isGuide) {
                  setEditCity(user?.city || "");
                  setEditLanguages(user?.languages?.join(", ") || "");
                  setEditSpecialization(user?.specialization || "");
                  setEditBio(user?.bio || "");
                }
                setShowEdit(true);
              }}
              className="px-5 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-medium shadow-glow"
            >
              Edit Profile
            </button>
          </div>
        </motion.div>

        <div className="space-y-2">
          {menuItems.map((item, i) => (
            <motion.button
              key={item.label}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              onClick={() => navigate(item.path)}
              className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <item.icon size={18} className="text-primary" />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground text-left">{item.label}</span>
              <ChevronRight size={18} className="text-muted-foreground" />
            </motion.button>
          ))}

          <motion.button
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={handleLogout}
            className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-4 mt-4"
          >
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <LogOut size={18} className="text-destructive" />
            </div>
            <span className="flex-1 text-sm font-medium text-destructive text-left">Log Out</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100] flex items-end justify-center"
            onClick={(e) => e.target === e.currentTarget && setShowEdit(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-background rounded-t-3xl p-6 pb-12 space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] scrollbar-hide"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-foreground">Edit Profile</h3>
                <button onClick={() => setShowEdit(false)} className="p-1">
                  <X size={20} className="text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-full bg-secondary overflow-hidden cursor-pointer border-2 border-primary/30 group" onClick={handlePhotoClick}>
                  {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" /> : <User size={28} className="text-muted-foreground m-auto mt-4" />}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                    <Camera size={16} className="text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Profile Photo</p>
                  <button onClick={handlePhotoClick} className="text-xs text-primary mt-0.5">Tap to change</button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email (cannot be changed)</label>
                <input type="email" value={displayEmail} disabled
                  className="w-full px-4 py-3 rounded-xl bg-secondary/20 border border-border text-sm text-muted-foreground cursor-not-allowed opacity-60" />
              </div>

              {isGuide && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><MapPin size={14} /> City / Region</label>
                    <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="e.g. Mumbai" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Globe size={14} /> Languages Spoken</label>
                    <input type="text" value={editLanguages} onChange={(e) => setEditLanguages(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="e.g. English, Hindi, Spanish" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Briefcase size={14} /> Specialization</label>
                    <input type="text" value={editSpecialization} onChange={(e) => setEditSpecialization(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="e.g. Historical Tours, Food Walks" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText size={14} /> Background Bio</label>
                    <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Tell travelers about yourself..." />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password (optional)</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Leave blank to keep current" />
                </div>
              </div>

              <button onClick={handleSave} disabled={saving} className="w-full py-3.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? "Saving..." : <><Check size={16} /> Save Changes</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default Profile;
