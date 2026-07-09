import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { subscribeToPush } from "@/lib/push";
import type { Profile, Role } from "@/types/database";

interface RegisterParams {
  email: string;
  password: string;
  name: string;
  role: Role;
  city?: string;
  languages?: string[];
  specialization?: string;
  bio?: string;
}

interface AuthContextValue {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isGuide: boolean;
  isTraveler: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, expectedRole?: Role) => Promise<{ error: string | null }>;
  register: (params: RegisterParams) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  loginWithGoogle: (redirectPath?: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) {
      console.error("Failed to load profile:", error.message);
      setUser(null);
      return null;
    }
    setUser(data as Profile);
    return data as Profile;
  }, []);

  useEffect(() => {
    // Surfaces OAuth failures that happen on Supabase's server during the
    // redirect (e.g. blocked by the profiles.email unique constraint when
    // the same email already has an account under a different provider) —
    // these never reach signInWithOAuth()'s return value, only this URL.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, "") || window.location.search);
    const oauthError = params.get("error_description");
    if (oauthError) {
      toast.error(decodeURIComponent(oauthError.replace(/\+/g, " ")));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        const profile = await fetchProfile(data.session.user.id);
        if (profile?.is_admin && window.location.pathname !== "/admin" && window.location.pathname !== "/reset-password") {
          navigate("/admin");
        }
      }
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // Navigate to reset form immediately without loading profile so pages
      // like Auth.tsx don't see a user and redirect away before the form loads.
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password");
        setIsLoading(false);
        return;
      }
      setSession(newSession);
      if (newSession?.user) {
        const profile = await fetchProfile(newSession.user.id);
        if (event === "SIGNED_IN" && profile?.is_admin) {
          navigate("/admin");
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile, navigate]);

  const login = async (email: string, password: string, expectedRole?: Role) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message || "Something went wrong. Please try again." };

    if (expectedRole && data.user) {
      const { data: profile } = await supabase.from("profiles").select("role, is_admin").eq("id", data.user.id).single();
      // Admin can log in through any login form — skip role enforcement
      if (!profile?.is_admin && profile?.role !== expectedRole) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        return { error: "Invalid credentials" };
      }
    }

    return { error: null };
  };

  const register = async ({ email, password, name, role, city, languages, specialization, bio }: RegisterParams) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          city,
          languages: languages?.join(","),
          specialization,
          bio,
        },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) return { error: error.message || "Something went wrong. Please try again.", needsEmailConfirmation: false };
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const loginWithGoogle = async (redirectPath = "/complete-profile") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${redirectPath}`,
        // Forces Google's account chooser every time instead of silently
        // reusing whichever Google account is already signed in on this device.
        queryParams: { prompt: "select_account" },
      },
    });
    return { error: error ? error.message || "Something went wrong. Please try again." : null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const userId = user?.id;
  useEffect(() => {
    if (userId) subscribeToPush(userId);
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isGuide: user?.role === "guide",
        isTraveler: user?.role === "traveler",
        isAdmin: user?.is_admin === true,
        login,
        register,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
