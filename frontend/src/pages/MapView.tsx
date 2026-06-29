import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import type { Location, Profile } from "@/types/database";

// Fallback coordinates for cities that don't have a precise lat/lng on file
// (guides don't store their own coordinates — only their listed spots do).
const CITY_COORDS: Record<string, [number, number]> = {
  jaipur: [26.9124, 75.7873],
  kochi: [9.9312, 76.2673],
  leh: [34.1526, 77.5771],
  varanasi: [25.3176, 83.0068],
  udaipur: [24.5854, 73.7125],
  madurai: [9.9252, 78.1198],
  hyderabad: [17.385, 78.4867],
  gangtok: [27.3389, 88.6065],
  delhi: [28.6139, 77.209],
  mumbai: [19.076, 72.8777],
  agra: [27.1767, 78.0081],
  goa: [15.2993, 74.124],
};
const INDIA_CENTER: [number, number] = [22.5, 78.9];

function coordsForCity(city?: string | null): [number, number] {
  if (!city) return INDIA_CENTER;
  return CITY_COORDS[city.toLowerCase().trim()] || INDIA_CENTER;
}

const destIcon = new L.DivIcon({
  html: `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,hsl(200,62%,57%),hsl(200,80%,45%));display:flex;align-items:center;justify-content:center;color:white;font-size:14px;box-shadow:0 4px 12px rgba(77,168,218,0.4);">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: "",
});

const guideIcon = new L.DivIcon({
  html: `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,hsl(33,100%,50%),hsl(25,100%,55%));display:flex;align-items:center;justify-content:center;color:white;font-size:14px;box-shadow:0 4px 12px rgba(255,140,0,0.4);">🧭</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: "",
});

const MapView = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "destinations" | "guides">("all");
  const [locations, setLocations] = useState<Location[]>([]);
  const [guides, setGuides] = useState<Profile[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: locs }, { data: gds }] = await Promise.all([
        supabase.from("locations").select("id, title, lat, lng, rating").eq("status", "active"),
        supabase.from("profiles").select("id, name, city, rating").eq("role", "guide"),
      ]);
      setLocations((locs ?? []) as Location[]);
      setGuides((gds ?? []) as Profile[]);
    };
    load();
  }, []);

  const destMarkers = locations.map((l) => ({
    id: `loc-${l.id}`,
    locationId: l.id,
    name: l.title,
    lat: l.lat,
    lng: l.lng,
    rating: l.rating,
    type: "destination" as const,
  }));

  const guideMarkers = guides.map((g) => {
    const [lat, lng] = coordsForCity(g.city);
    return { id: `guide-${g.id}`, guideId: g.id, name: g.name, lat, lng, rating: g.rating, type: "guide" as const };
  });

  const markers = [
    ...(filter !== "guides" ? destMarkers : []),
    ...(filter !== "destinations" ? guideMarkers : []),
  ];

  return (
    <div className="h-screen flex flex-col">
      <div className="glass px-4 py-3 flex items-center gap-3 border-b border-border z-[1000] relative">
        <button onClick={() => navigate("/home")} className="p-1">
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-sm font-semibold text-foreground flex-1">Map View</h1>
        <div className="flex gap-1">
          {(["all", "destinations", "guides"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${
                filter === f ? "gradient-primary text-primary-foreground" : "glass text-foreground"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer center={INDIA_CENTER} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={m.type === "guide" ? guideIcon : destIcon}>
              <Popup>
                <div className="text-center p-1">
                  <h3 className="font-semibold text-sm">{m.name}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Star size={12} className="text-accent fill-accent" />
                    <span className="text-xs">{m.rating || "New"}</span>
                  </div>
                  <button
                    onClick={() =>
                      navigate(m.type === "guide" ? `/guide/${(m as typeof guideMarkers[number]).guideId}` : `/location/${(m as typeof destMarkers[number]).locationId}`)
                    }
                    className="mt-2 px-3 py-1 rounded-lg gradient-primary text-primary-foreground text-xs font-medium"
                  >
                    {m.type === "guide" ? "View Guide" : "View Spot"}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-24 left-4 right-4 z-[1000] glass rounded-2xl p-3 shadow-elevated"
        >
          <div className="flex items-center justify-around">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full gradient-primary" />
              <span className="text-[10px] text-foreground font-medium">{destMarkers.length} Destinations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full gradient-accent" />
              <span className="text-[10px] text-foreground font-medium">{guideMarkers.length} Guides</span>
            </div>
          </div>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default MapView;
