import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Pencil, MapPin, ArrowLeft, Image as ImageIcon, AlertTriangle, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import GuideBottomNav from "@/components/GuideBottomNav";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { validateImageFile } from "@/lib/validateImage";
import type { Location, Report } from "@/types/database";

const pickerIcon = new L.DivIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,hsl(200,62%,57%),hsl(200,80%,45%));display:flex;align-items:center;justify-content:center;color:white;font-size:13px;box-shadow:0 4px 12px rgba(77,168,218,0.4);">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  className: "",
});

const LocationPicker = ({ lat, lng, onPick }: { lat: number; lng: number; onPick: (lat: number, lng: number) => void }) => {
  const ClickHandler = () => {
    useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
  };
  const Recenter = () => {
    const map = useMap();
    useEffect(() => {
      map.setView([lat, lng]);
    }, [lat, lng, map]);
    return null;
  };
  return (
    <MapContainer center={[lat, lng]} zoom={5} style={{ height: "200px", width: "100%", borderRadius: "0.75rem" }}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler />
      <Recenter />
      <Marker position={[lat, lng]} icon={pickerIcon} />
    </MapContainer>
  );
};

const GuideLocations = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoEditApplied = useRef(false);
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    cost: "",
    days: "",
    lat: "20.5937",
    lng: "78.9629",
    category: "Nature",
    safetyLevel: "moderate",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [reportsByLocation, setReportsByLocation] = useState<Record<string, Report[]>>({});
  const [expandedReports, setExpandedReports] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);

  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) return;
    setSearchingPlace(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeQuery)}&format=json&limit=5`);
      const data = await res.json();
      setPlaceResults(data);
      if (data.length === 0) toast.error("No places found for that search");
    } catch {
      toast.error("Place search failed");
    } finally {
      setSearchingPlace(false);
    }
  };

  const handlePickPlace = (result: { lat: string; lon: string }) => {
    setFormData((prev) => ({ ...prev, lat: result.lat, lng: result.lon }));
    setPlaceResults([]);
    setPlaceQuery("");
  };

  const fetchReports = useCallback(async (locationIds: string[]) => {
    if (locationIds.length === 0) {
      setReportsByLocation({});
      return;
    }
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .in("location_id", locationIds)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch reports:", error.message);
      return;
    }
    const grouped: Record<string, Report[]> = {};
    for (const r of (data ?? []) as Report[]) {
      grouped[r.location_id] = grouped[r.location_id] || [];
      grouped[r.location_id].push(r);
    }
    setReportsByLocation(grouped);
  }, []);

  const fetchLocations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("locations").select("*").eq("guide_id", user.id).order("created_at", { ascending: false });
    if (error) {
      console.error(error.message);
    } else {
      const locs = (data ?? []) as Location[];
      setLocations(locs);
      await fetchReports(locs.map((l) => l.id));
    }
    setLoading(false);
  }, [user, fetchReports]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleFilesChange = (fileList: FileList | null) => {
    if (!fileList) {
      setFiles(null);
      return;
    }
    for (const file of Array.from(fileList)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(`${file.name}: ${validationError}`);
        setFiles(null);
        return;
      }
    }
    setFiles(fileList);
  };

  const handleDismissReport = async (reportId: string, locationId: string) => {
    const { error } = await supabase.from("reports").update({ status: "dismissed" }).eq("id", reportId);
    if (error) {
      toast.error("Failed to dismiss report");
      return;
    }
    setReportsByLocation((prev) => ({ ...prev, [locationId]: (prev[locationId] || []).filter((r) => r.id !== reportId) }));
    toast.success("Report dismissed");
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setFormData({
      title: loc.title,
      description: loc.detailed_content || loc.short_description,
      cost: loc.price_per_person != null ? String(loc.price_per_person) : loc.pricing?.match(/\d+/)?.[0] || "",
      days: loc.timings?.match(/\d+/)?.[0] || "",
      lat: String(loc.lat),
      lng: String(loc.lng),
      category: loc.category,
      safetyLevel: loc.safety_level,
    });
    setFiles(null);
    setShowAddForm(true);
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && !autoEditApplied.current && locations.length > 0) {
      const loc = locations.find((l) => l.id === editId);
      if (loc) {
        startEdit(loc);
        autoEditApplied.current = true;
      }
    }
  }, [searchParams, locations]);

  const resetForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFiles(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const existing = editingId ? locations.find((l) => l.id === editingId) : undefined;
      const photos: string[] = [...(existing?.photos || [])];
      const videos: string[] = [...(existing?.videos || [])];
      if (files) {
        for (const file of Array.from(files)) {
          const path = `${user.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("location-media").upload(path, file);
          if (uploadError) {
            toast.error(uploadError.message);
            continue;
          }
          const url = supabase.storage.from("location-media").getPublicUrl(path).data.publicUrl;
          if (file.type.startsWith("video/")) videos.push(url);
          else photos.push(url);
        }
      }

      const payload = {
        title: formData.title,
        short_description: formData.description.trim().slice(0, 140),
        detailed_content: formData.description.trim(),
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        category: formData.category,
        pricing: formData.cost ? `₹${formData.cost} per person` : null,
        price_per_person: formData.cost ? Number(formData.cost) : null,
        timings: formData.days ? `${formData.days} day(s)` : null,
        safety_level: formData.safetyLevel,
        photos,
        videos,
      };

      const { error } = editingId
        ? await supabase.from("locations").update(payload).eq("id", editingId)
        : await supabase.from("locations").insert({ ...payload, guide_id: user.id, status: "active" });

      if (error) {
        toast.error(error.message || "Failed to save location");
        return;
      }
      toast.success(editingId ? "Location updated!" : "Location added successfully!");
      resetForm();
      fetchLocations();
    } finally {
      setSaving(false);
    }
  };

  const deleteLocation = (id: string) => {
    toast("Delete this location?", {
      action: {
        label: "Delete",
        onClick: async () => {
          const { error } = await supabase.from("locations").delete().eq("id", id);
          if (error) {
            toast.error("Delete failed");
            return;
          }
          fetchLocations();
        },
      },
    });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center gradient-sky"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen gradient-sky pb-24 text-foreground">
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/guide-dashboard")} className="p-2 glass rounded-full shadow-card active:scale-95 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">My Locations</h1>
        </div>
        <button
          onClick={() => (showAddForm ? resetForm() : setShowAddForm(true))}
          className="p-2 md:px-4 md:py-2 gradient-primary text-primary-foreground rounded-xl shadow-card active:scale-95 transition-transform font-semibold text-sm flex items-center gap-1"
        >
          {showAddForm ? "Cancel" : <><Plus size={16} /> Add New</>}
        </button>
      </div>

      {showAddForm ? (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="px-6 py-4">
          <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 shadow-card space-y-4">
            <h2 className="text-lg font-bold mb-4">{editingId ? "Edit Location" : "Add New Location"}</h2>

            <input required type="text" placeholder="Location" className="w-full glass rounded-xl px-4 py-3 text-sm" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />

            <textarea required placeholder="Description & timeline (e.g. Day 1: Arrival & sightseeing, Day 2: Trek...)" className="w-full glass rounded-xl px-4 py-3 text-sm h-24" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />

            <div className="grid grid-cols-2 gap-3">
              <input required type="number" min={0} placeholder="Cost per person (₹)" className="w-full glass rounded-xl px-4 py-3 text-sm" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} />
              <input required type="number" min={1} placeholder="Number of days" className="w-full glass rounded-xl px-4 py-3 text-sm" value={formData.days} onChange={(e) => setFormData({ ...formData, days: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <select className="w-full glass rounded-xl px-4 py-3 text-sm" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                <option value="Nature">Nature</option>
                <option value="Heritage">Heritage</option>
                <option value="Cultural">Cultural</option>
                <option value="Temple">Temple</option>
                <option value="Spiritual">Spiritual</option>
                <option value="Mountain">Mountain</option>
                <option value="Beach">Beach</option>
              </select>
              <select className="w-full glass rounded-xl px-4 py-3 text-sm" value={formData.safetyLevel} onChange={(e) => setFormData({ ...formData, safetyLevel: e.target.value })}>
                <option value="high">High Safety</option>
                <option value="moderate">Moderate Safety</option>
                <option value="low">Low Safety</option>
              </select>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Search a place, or tap on the map to set this location's position</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handlePlaceSearch())}
                  placeholder="e.g. Gokarna Beach, Karnataka"
                  className="flex-1 glass rounded-xl px-4 py-2.5 text-sm"
                />
                <button type="button" onClick={handlePlaceSearch} disabled={searchingPlace} className="px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                  {searchingPlace ? "..." : "Search"}
                </button>
              </div>
              {placeResults.length > 0 && (
                <div className="glass rounded-xl divide-y divide-border overflow-hidden">
                  {placeResults.map((r, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => handlePickPlace(r)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-primary/5 transition-colors"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
              <LocationPicker
                key={editingId ?? "new"}
                lat={parseFloat(formData.lat) || 22.5}
                lng={parseFloat(formData.lng) || 78.9}
                onPick={(lat, lng) => setFormData({ ...formData, lat: String(lat), lng: String(lng) })}
              />
              <p className="text-[10px] text-muted-foreground text-right">{parseFloat(formData.lat).toFixed(4)}, {parseFloat(formData.lng).toFixed(4)}</p>
            </div>

            <div className="border border-dashed border-primary/50 rounded-xl p-4 flex flex-col items-center gap-2">
              <ImageIcon className="text-primary/50" />
              <p className="text-xs text-muted-foreground text-center">Upload Photos</p>
              <input type="file" multiple accept="image/*" onChange={(e) => handleFilesChange(e.target.files)} className="text-xs" />
            </div>

            <button type="submit" disabled={saving} className="w-full gradient-primary text-primary-foreground font-bold py-3 rounded-xl mt-4 shadow-card hover:brightness-110 active:scale-95 transition-all disabled:opacity-60">
              {saving ? "Saving..." : editingId ? "Update Location" : "Save Location"}
            </button>
          </form>
        </motion.div>
      ) : (
        <div className="px-6 space-y-4">
          {locations.map((loc) => {
            const reports = reportsByLocation[loc.id] || [];
            return (
              <div key={loc.id}>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-4 shadow-card flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-secondary flex-shrink-0 overflow-hidden">
                    {loc.photos?.length > 0 ? (
                      <img src={loc.photos[0]} alt={loc.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-base">{loc.title}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {loc.category}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <span className="text-[10px] px-2 py-1 rounded-md glass font-medium">👀 {loc.views_count || 0} views</span>
                      <span className="text-[10px] px-2 py-1 rounded-md glass font-medium">❤️ {loc.saves_count || 0} saves</span>
                      {reports.length > 0 && (
                        <button
                          onClick={() => setExpandedReports(expandedReports === loc.id ? null : loc.id)}
                          className="text-[10px] px-2 py-1 rounded-md bg-destructive/10 text-destructive font-medium flex items-center gap-1"
                        >
                          <AlertTriangle size={10} /> {reports.length} report{reports.length > 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 justify-center">
                    <button onClick={() => startEdit(loc)} className="p-2 glass rounded-lg text-foreground active:scale-95"><Pencil size={16} /></button>
                    <button onClick={() => deleteLocation(loc.id)} className="p-2 glass rounded-lg text-destructive active:scale-95"><Trash2 size={16} /></button>
                  </div>
                </motion.div>

                {expandedReports === loc.id && reports.length > 0 && (
                  <div className="mt-2 ml-4 space-y-2">
                    {reports.map((r) => (
                      <div key={r.id} className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{r.reason}</p>
                          {r.description && <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>}
                          <p className="text-[9px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => handleDismissReport(r.id, loc.id)} className="p-1 text-muted-foreground hover:text-foreground">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {locations.length === 0 && (
            <div className="text-center py-12 glass rounded-2xl border border-dashed border-foreground/10">
              <MapPin size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="text-sm font-bold text-foreground">No Locations Yet</h3>
              <p className="text-xs text-muted-foreground mt-1">Start adding your guided spots.</p>
            </div>
          )}
        </div>
      )}

      <GuideBottomNav />
    </div>
  );
};

export default GuideLocations;
