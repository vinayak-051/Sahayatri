import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

const Splash = lazy(() => import("./pages/Splash"));
const RoleSelect = lazy(() => import("./pages/RoleSelect"));
const Auth = lazy(() => import("./pages/Auth"));
const GuideAuth = lazy(() => import("./pages/GuideAuth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const Home = lazy(() => import("./pages/Home"));
const Explore = lazy(() => import("./pages/Explore"));
const Trips = lazy(() => import("./pages/Trips"));
const Profile = lazy(() => import("./pages/Profile"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Guides = lazy(() => import("./pages/Guides"));
const GuideDetail = lazy(() => import("./pages/GuideDetail"));
const Safety = lazy(() => import("./pages/Safety"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const MapView = lazy(() => import("./pages/MapView"));
const LocationDetail = lazy(() => import("./pages/LocationDetail"));
const GuideDashboard = lazy(() => import("./pages/GuideDashboard"));
const GuideBookings = lazy(() => import("./pages/GuideBookings"));
const GuideProfile = lazy(() => import("./pages/GuideProfile"));
const GuideMessenger = lazy(() => import("./pages/GuideMessenger"));
const GuideLocations = lazy(() => import("./pages/GuideLocations"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen gradient-sky flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Splash />} />
              <Route path="/role-select" element={<RoleSelect />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/guide-auth" element={<GuideAuth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/complete-profile" element={<ProtectedRoute role="any"><CompleteProfile /></ProtectedRoute>} />

              {/* Traveler */}
              <Route path="/home" element={<ProtectedRoute role="traveler"><Home /></ProtectedRoute>} />
              <Route path="/explore" element={<ProtectedRoute role="traveler"><Explore /></ProtectedRoute>} />
              <Route path="/trips" element={<ProtectedRoute role="traveler"><Trips /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute role="traveler"><Profile /></ProtectedRoute>} />
              <Route path="/ai-guide" element={<ProtectedRoute role="traveler"><ComingSoon /></ProtectedRoute>} />
              <Route path="/travel-buddy" element={<ProtectedRoute role="traveler"><ComingSoon /></ProtectedRoute>} />
              <Route path="/guides" element={<ProtectedRoute role="traveler"><Guides /></ProtectedRoute>} />
              <Route path="/guide/:id" element={<ProtectedRoute role="traveler"><GuideDetail /></ProtectedRoute>} />
              <Route path="/safety" element={<ProtectedRoute role="any"><Safety /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute role="traveler"><Messages /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute role="any"><Notifications /></ProtectedRoute>} />
              <Route path="/map" element={<ProtectedRoute role="traveler"><MapView /></ProtectedRoute>} />
              <Route path="/location/:id" element={<ProtectedRoute role="traveler"><LocationDetail /></ProtectedRoute>} />

              {/* Guide */}
              <Route path="/guide-dashboard" element={<ProtectedRoute role="guide"><GuideDashboard /></ProtectedRoute>} />
              <Route path="/guide-bookings" element={<ProtectedRoute role="guide"><GuideBookings /></ProtectedRoute>} />
              <Route path="/guide-profile" element={<ProtectedRoute role="guide"><GuideProfile /></ProtectedRoute>} />
              <Route path="/guide-messages" element={<ProtectedRoute role="guide"><GuideMessenger /></ProtectedRoute>} />
              <Route path="/guide-locations" element={<ProtectedRoute role="guide"><GuideLocations /></ProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute role="any"><AdminDashboard /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
