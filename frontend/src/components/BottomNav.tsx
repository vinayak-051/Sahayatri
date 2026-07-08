import { Home, Compass, Briefcase, User, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

const tabs = [
  { icon: Home, label: "Home", path: "/home" },
  { icon: Compass, label: "Explore", path: "/explore" },
  { icon: Briefcase, label: "Trips", path: "/trips" },
  { icon: MessageCircle, label: "Messages", path: "/messages" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
      <div className="flex items-center justify-around py-2 px-4 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <motion.button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              whileTap={{ scale: 0.88 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -top-2 w-8 h-1 rounded-full gradient-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <motion.div
                animate={{ scale: isActive ? 1.15 : 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <tab.icon
                  size={22}
                  className={`transition-colors duration-200 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                />
              </motion.div>
              <motion.span
                animate={{ opacity: isActive ? 1 : 0.7 }}
                transition={{ duration: 0.2 }}
                className={`text-[10px] transition-all duration-200 ${
                  isActive ? "text-primary font-semibold" : "text-muted-foreground font-medium"
                }`}
              >
                {tab.label}
              </motion.span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
