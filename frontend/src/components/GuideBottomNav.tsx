import { LayoutDashboard, Calendar, MessageCircle, User, MapPin } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

const tabs = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/guide-dashboard" },
  { icon: Calendar, label: "Bookings", path: "/guide-bookings" },
  { icon: MapPin, label: "Locations", path: "/guide-locations" },
  { icon: MessageCircle, label: "Messages", path: "/guide-messages" },
  { icon: User, label: "Profile", path: "/guide-profile" },
];

const GuideBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
      <div className="flex items-center justify-around py-2 px-4 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="guideActiveTab"
                  className="absolute -top-2 w-8 h-1 rounded-full gradient-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <tab.icon size={22} className={isActive ? "text-accent" : "text-muted-foreground"} />
              <span className={`text-[10px] font-medium ${isActive ? "text-accent" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GuideBottomNav;
