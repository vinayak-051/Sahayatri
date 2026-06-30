import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  role?: "traveler" | "guide" | "any" | "admin";
}

const ProtectedRoute = ({ children, role = "any" }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Admin is locked to /admin only — bypass all role/onboarding checks
  if (user.is_admin) {
    if (location.pathname !== "/admin") return <Navigate to="/admin" replace />;
    return <>{children}</>;
  }

  if (!user.onboarded && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }

  if (role === "admin" && !user.is_admin) {
    return <Navigate to={user.role === "guide" ? "/guide-dashboard" : "/home"} replace />;
  }

  if (role !== "any" && role !== "admin" && user.role !== role) {
    return <Navigate to={user.role === "guide" ? "/guide-dashboard" : "/home"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
