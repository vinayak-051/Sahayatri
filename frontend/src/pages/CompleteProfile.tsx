import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MapPin, Globe, Camera } from "lucide-react";
import heroImg from "@/assets/hero-travel.jpg";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/types/database";

const schema = z.object({
  city: z.string().optional(),
  languages: z.string().optional(),
  specialization: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const CompleteProfile = () => {
  const [searchParams] = useSearchParams();
  const presetRole = searchParams.get("role") === "guide" ? "guide" : searchParams.get("role") === "traveler" ? "traveler" : null;

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<Role>(presetRole ?? "traveler");
  const navigate = useNavigate();
  const { user, refreshProfile, logout } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (user.is_admin) { navigate("/admin", { replace: true }); return; }
    // Only skip the form if already onboarded AND the stored role matches
    // the page they came from. If they're stored as traveler but selected
    // the guide login, fall through to show the guide profile form.
    if (user.onboarded && (!presetRole || presetRole === user.role)) {
      navigate(user.role === "guide" ? "/guide-dashboard" : "/home", { replace: true });
    }
  }, [user, navigate, presetRole]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    if (role === "guide" && !values.city) {
      toast.error("City / region is required for guides");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          role,
          city: values.city || null,
          languages: values.languages ? values.languages.split(",").map((l) => l.trim()).filter(Boolean) : [],
          specialization: values.specialization || null,
          onboarded: true,
        })
        .eq("id", user.id);

      if (error) {
        toast.error(error.message);
        return;
      }
      await refreshProfile();
      toast.success("Profile complete!");
      navigate(role === "guide" ? "/guide-dashboard" : "/home");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img src={heroImg} alt="" className="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
      <div className="absolute inset-0 bg-black/50" />

      <button
        aria-label="Sign out"
        onClick={async () => { await logout(); navigate("/auth"); }}
        className="absolute top-6 right-6 z-20 text-xs font-semibold text-primary-foreground/70 underline"
      >
        Sign out
      </button>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary-foreground">One last step</h1>
            <p className="text-primary-foreground/60 text-sm mt-1">
              {presetRole ? "Just a few details to finish setup" : "Tell us how you'll use Sahayatri"}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-3xl p-6 space-y-4">
            {presetRole ? (
              <p className="text-sm text-center text-muted-foreground">
                {presetRole === "guide" ? "🧭 Signing up as a Guide" : "🎒 Signing up as a Traveler"}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("traveler")}
                  className={`py-4 rounded-xl border text-sm font-medium transition-colors ${
                    role === "traveler" ? "gradient-primary text-primary-foreground border-transparent shadow-glow" : "bg-secondary/50 border-border text-foreground"
                  }`}
                >
                  🎒 I'm a Traveler
                </button>
                <button
                  type="button"
                  onClick={() => setRole("guide")}
                  className={`py-4 rounded-xl border text-sm font-medium transition-colors ${
                    role === "guide" ? "gradient-accent text-accent-foreground border-transparent shadow-accent-glow" : "bg-secondary/50 border-border text-foreground"
                  }`}
                >
                  🧭 I'm a Guide
                </button>
              </div>
            )}

            {role === "guide" && (
              <>
                <div>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="City / Region *" {...register("city")}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                  </div>
                  {errors.city && <p className="text-xs text-destructive mt-1 ml-1">{errors.city.message}</p>}
                </div>
                <div className="relative">
                  <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Languages (e.g. Hindi, English)" {...register("languages")}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div className="relative">
                  <Camera size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Specialization (e.g. Cultural, Food)" {...register("specialization")}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default CompleteProfile;
