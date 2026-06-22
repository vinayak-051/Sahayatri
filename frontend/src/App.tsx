import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Splash from "./pages/Splash";
import RoleSelect from "./pages/RoleSelect";
import Auth from "./pages/Auth";
import GuideAuth from "./pages/GuideAuth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CompleteProfile from "./pages/CompleteProfile";
import Home from "./pages/Home";
import AIGuide from "./pages/AIGuide";
import TravelBuddy from "./pages/TravelBuddy";
import Guides from "./pages/Guides";
import GuideDetail from "./pages/GuideDetail";
import Safety from "./pages/Safety";
import Profile from "./pages/Profile";
import Explore from "./pages/Explore";
import Trips from "./pages/Trips";
import GuideDashboard from "./pages/GuideDashboard";
import GuideBookings from "./pages/GuideBookings";
import GuideProfile from "./pages/GuideProfile";
import Messages from "./pages/Messages";
import GuideMessenger from "./pages/GuideMessenger";
import Notifications from "./pages/Notifications";
import MapView from "./pages/MapView";
import GuideLocations from "./pages/GuideLocations";
import LocationDetail from "./pages/LocationDetail";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
            <Route path="/ai-guide" element={<ProtectedRoute role="traveler"><AIGuide /></ProtectedRoute>} />
            <Route path="/travel-buddy" element={<ProtectedRoute role="traveler"><TravelBuddy /></ProtectedRoute>} />
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

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
