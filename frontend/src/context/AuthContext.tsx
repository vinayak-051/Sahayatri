import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { disablePush } from "@/lib/push";
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

// Every profile column a client may read. Email is private (column-level grants),
// so the signed-in user's email comes from the auth session instead.
export const PROFILE_COLUMNS =
  "id, name, role, profile_photo_url, city, additional_cities, languages, specialization, bio, rating, rate_per_day, is_available, is_verified, is_admin, is_banned, onboarded, created_at";

// Pages an admin is never bounced away from when they sign in.
const ADMIN_REDIRECT_EXEMPT = ["/admin", "/reset-password"];

async function fetchProfile(authUser: { id: string; email?: string }): Promise<Profile | null> {
  try {
    const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", authUser.id).single();
    if (error) {
      console.error("Failed to load profile:", error.message);
      return null;
    }
    return { ...(data as Omit<Profile, "email">), email: authUser.email ?? "" } as Profile;
  } catch (err) {
    console.error("Failed to load profile:", err);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // False until Supabase reports the initial session.
  const [sessionKnown, setSessionKnown] = useState(false);
  // The profile together with the user it was loaded for, so a profile is only
  // ever exposed for the session it belongs to.
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);
  const navigate = useNavigate();

  // useNavigate() returns a new function on every route change; a ref keeps the
  // auth subscription below from being torn down and recreated on navigation.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const sessionUserIdRef = useRef<string | null>(null);
  // Set when a user appears on initial load or sign-in: an admin is sent to
  // /admin once their profile arrives.
  const adminRedirectRef = useRef(false);

  const sessionUser = session?.user ?? null;
  const sessionUserId = sessionUser?.id ?? null;
  const sessionEmail = sessionUser?.email;
  const user = sessionUserId && loaded?.userId === sessionUserId ? loaded.profile : null;
  const isLoading = !sessionKnown || (sessionUserId !== null && loaded?.userId !== sessionUserId);

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
    // Kept synchronous on purpose: awaiting a Supabase call inside this callback
    // can deadlock the auth client. It only records the session; the profile
    // loads in the effect below. INITIAL_SESSION delivers the session on load.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      const nextUserId = newSession?.user?.id ?? null;
      if (event === "PASSWORD_RECOVERY") {
        // Straight to the reset form, and never bounce an admin away from it.
        adminRedirectRef.current = false;
        navigateRef.current("/reset-password");
      } else if (nextUserId !== sessionUserIdRef.current) {
        adminRedirectRef.current = event === "INITIAL_SESSION" || event === "SIGNED_IN";
      }
      sessionUserIdRef.current = nextUserId;
      setSession(newSession);
      setSessionKnown(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Once per session user: token refreshes and repeat SIGNED_IN events for the
  // same user don't reload it.
  useEffect(() => {
    if (!sessionUserId) return;
    let cancelled = false;
    fetchProfile({ id: sessionUserId, email: sessionEmail }).then((profile) => {
      if (cancelled) return;
      setLoaded({ userId: sessionUserId, profile });
      if (adminRedirectRef.current) {
        adminRedirectRef.current = false;
        if (profile?.is_admin && !ADMIN_REDIRECT_EXEMPT.includes(window.location.pathname)) {
          navigateRef.current("/admin");
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // The email is read when the user changes; on its own it isn't a reason to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  const login = async (email: string, password: string, expectedRole?: Role) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message || "Something went wrong. Please try again." };

    if (expectedRole && data.user) {
      const { data: profile } = await supabase.from("profiles").select("role, is_admin").eq("id", data.user.id).single();
      // Admin can log in through any login form — skip role enforcement
      if (!profile?.is_admin && profile?.role !== expectedRole) {
        await supabase.auth.signOut();
        setLoaded(null);
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
    // Stop this browser receiving the signed-out user's push notifications (shared
    // devices). Best effort: it must never block signing out.
    await disablePush().catch(() => undefined);
    await supabase.auth.signOut();
    setLoaded(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (!sessionUser) return;
    const profile = await fetchProfile(sessionUser);
    // Ignore the result if someone else signed in meanwhile.
    if (sessionUserIdRef.current === sessionUser.id) setLoaded({ userId: sessionUser.id, profile });
  };

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
