import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import heroImg from "@/assets/hero-travel.jpg";
import { useAuth } from "@/context/AuthContext";

const loginSchema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Please enter your full name"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});

type FormValues = z.infer<typeof signupSchema>;

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, login, register: registerAccount, loginWithGoogle } = useAuth();

  // Already logged in
  if (user?.is_admin) { navigate("/admin"); return null; }
  if (user?.role === "traveler") { navigate("/home"); return null; }
  if (user?.role === "guide") { navigate("/guide-dashboard"); return null; }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(isLogin ? loginSchema : signupSchema),
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await login(values.email, values.password, "traveler");
        if (error) {
          toast.error(error);
          return;
        }
        navigate("/home");
      } else {
        const { error, needsEmailConfirmation } = await registerAccount({
          email: values.email,
          password: values.password,
          name: values.name,
          role: "traveler",
        });
        if (error) {
          toast.error(error);
          return;
        }
        if (needsEmailConfirmation) {
          toast.success("Check your inbox to confirm your email before signing in.");
        } else {
          toast.success("Account created! You're all set.");
          navigate("/home");
          return;
        }
        setIsLogin(true);
        reset();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await loginWithGoogle("/complete-profile?role=traveler");
    if (error) toast.error(error);
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
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow mx-auto mb-4">
              <span className="text-2xl">🌏</span>
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground">
              {isLogin ? "Welcome Back" : "Join Sahayatri"}
            </h1>
            <p className="text-primary-foreground/60 text-sm mt-1">
              {isLogin ? "Sign in to continue" : "Create your account"}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-3xl p-6 space-y-4">
            {!isLogin && (
              <div>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Full Name"
                    {...register("name")}
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 [::-ms-reveal]:hidden [::-ms-clear]:hidden"
                  />
                </div>
                {errors.name && <p className="text-xs text-destructive mt-1 ml-1">{errors.name.message}</p>}
              </div>
            )}

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
            </div>

            <div>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  {...register("password")}
                  className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive mt-1 ml-1">{errors.password.message}</p>}
            </div>

            {isLogin && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password?role=traveler")}
                  className="text-xs text-primary-foreground/70 hover:text-accent transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full py-3.5 rounded-xl bg-secondary border border-border text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9577-2.1805l-2.9087-2.2581c-.7959.5345-1.8164.8523-3.049.8523-2.3422 0-4.3282-1.5818-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>
                <path fill="#FBBC05" d="M3.9641 10.71c-.1814-.5455-.2823-1.1264-.2823-1.71s.1009-1.1645.2823-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418l3.0068-2.3318z"/>
                <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1614 6.6577 3.5795 9 3.5795z"/>
              </svg> Continue with Google
            </button>
          </form>

          {!isLogin && (
            <p className="text-center text-[11px] text-primary-foreground/50 mt-4">
              By creating an account, you agree to our{" "}
              <button onClick={() => navigate("/terms")} className="underline">Terms</button> and{" "}
              <button onClick={() => navigate("/privacy")} className="underline">Privacy Policy</button>.
            </p>
          )}

          <p className="text-center text-sm text-primary-foreground/60 mt-6">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setIsLogin(!isLogin); reset(); }}
              className="text-accent font-semibold"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Auth;
