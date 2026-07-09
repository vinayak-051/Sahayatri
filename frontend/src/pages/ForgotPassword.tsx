import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft } from "lucide-react";
import heroImg from "@/assets/hero-travel.jpg";
import { supabase } from "@/lib/supabaseClient";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

const ForgotPassword = () => {
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") === "guide" ? "guide" : "traveler";
  const authPath = role === "guide" ? "/guide-auth" : "/auth";

  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

  const onSubmit = async ({ email }: FormValues) => {
    setLoading(true);
    setRoleError(null);
    try {
      const isAdmin = adminEmail && email.toLowerCase() === adminEmail.toLowerCase();

      if (!isAdmin) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("role")
          .eq("email", email)
          .eq("role", role);

        if (!profiles || profiles.length === 0) {
          setRoleError(
            `No ${role === "guide" ? "guide" : "traveller"} account found for this email.`
          );
          return;
        }
      }

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img src={heroImg} alt="" className="absolute inset-0 w-full h-full object-cover blur-sm scale-105" />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <Link to={authPath} className="inline-flex items-center gap-1 text-primary-foreground/70 text-sm mb-6">
            <ArrowLeft size={16} /> Back to sign in
          </Link>

          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow mx-auto mb-4">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground">Reset Password</h1>
            <p className="text-primary-foreground/60 text-sm mt-1">
              We'll email you a link to reset it
            </p>
          </div>

          <div className="glass rounded-3xl p-6 space-y-4">
            {sent ? (
              <p className="text-sm text-center text-foreground">
                A reset link has been sent to your email. Check your inbox.
              </p>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="Email address"
                      {...register("email")}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive mt-1 ml-1">{errors.email.message}</p>}
                  {roleError && <p className="text-xs text-destructive mt-1 ml-1">{roleError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;
