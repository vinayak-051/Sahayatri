import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Compass } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useNavigate } from "react-router-dom";
import { friendlyDbError } from "@/lib/dbErrors";
import { PRICE_BANDS, cursorAfter, searchSpots, type PriceBand, type SpotCursor, type SpotSearchResult } from "@/lib/spotSearch";

const categories = [
  { id: "All", emoji: "🏠", label: "All" },
  { id: "Nature", emoji: "🌿", label: "Nature" },
  { id: "Beach", emoji: "🏖️", label: "Beach" },
  { id: "Mountain", emoji: "🏔️", label: "Mountain" },
  { id: "Cultural", emoji: "🏛️", label: "Cultural" },
  { id: "Spiritual", emoji: "🧘", label: "Spiritual" },
  { id: "Temple", emoji: "🛕", label: "Temple" },
  { id: "Heritage", emoji: "🏯", label: "Heritage" },
];

const PAGE_SIZE = 12;
const LOAD_ERROR = "Couldn't load destinations right now.";

const Explore = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [priceFilter, setPriceFilter] = useState<PriceBand>("all");
  const [locations, setLocations] = useState<SpotSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update the list: older ones are aborted, and the
  // sequence number drops any response that still arrives late.
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    document.title = "Explore India | Sahayatri";
    return () => { document.title = "Sahayatri - Your Journey, Our Guidance"; };
  }, []);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    requestSeq.current += 1;
    inFlight.current?.abort();
  }, []);

  const fetchLocations = useCallback(async (after: SpotCursor | null) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const seq = ++requestSeq.current;
    if (after) setLoadingMore(true); else { setLoading(true); setLoadingMore(false); setError(null); }

    const band = PRICE_BANDS[priceFilter];
    const { rows, error: searchError } = await searchSpots(
      {
        query: debouncedSearch,
        category: selectedCategory === "All" ? null : selectedCategory,
        minPrice: band.minPrice,
        maxPrice: band.maxPrice,
        after,
        limit: PAGE_SIZE,
      },
      controller.signal,
    );
    if (seq !== requestSeq.current) return;
    inFlight.current = null;

    if (searchError) {
      console.error("Failed to load locations:", searchError.message);
      const message = friendlyDbError(searchError, LOAD_ERROR);
      if (after) toast.error(message); else setError(message);
    } else {
      setLocations((prev) => (after ? [...prev, ...rows] : rows));
      if (rows.length > 0) setTotal(rows[0].total_count); else if (!after) setTotal(0);
      setHasMore(rows.length === PAGE_SIZE);
    }
    if (after) setLoadingMore(false); else setLoading(false);
  }, [debouncedSearch, selectedCategory, priceFilter]);

  useEffect(() => {
    fetchLocations(null);
  }, [fetchLocations]);

  const loadMore = () => {
    const last = locations[locations.length - 1];
    if (last) fetchLocations(cursorAfter(last));
  };

  const filteredItems = locations;

  return (
    <div className="min-h-screen gradient-sky pb-24 text-foreground">
      <div className="px-6 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-foreground font-display">Explore India</h1>
        <p className="text-sm text-muted-foreground mt-1">Discover guide-authored spots in every city</p>
      </div>

      <div className="px-6 mb-6">
        <div className="glass rounded-3xl px-5 py-4 flex items-center gap-4 shadow-elevated border border-primary/10 input-polished">
          <Search size={22} className="text-primary/80 shrink-0" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => setDebouncedSearch(e.target.value), 400);
            }}
            placeholder="Search spots, cities, tags..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-6 mb-3 hide-scrollbar">
        {(Object.keys(PRICE_BANDS) as PriceBand[]).map((p) => {
          return (
            <button
              key={p}
              onClick={() => setPriceFilter(p)}
              className={`px-4 py-2 rounded-2xl text-[12px] font-bold whitespace-nowrap transition-all ${priceFilter === p ? "gradient-primary text-primary-foreground shadow-glow" : "glass text-foreground border border-primary/5"}`}
            >
              {PRICE_BANDS[p].label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 overflow-x-auto px-6 mb-8 hide-scrollbar">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`px-5 py-3 rounded-2xl text-[13px] font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              selectedCategory === c.id
                ? "gradient-primary text-primary-foreground shadow-glow scale-105"
                : "glass text-foreground border border-primary/5 hover:bg-white/40"
            }`}
          >
            <span className="text-lg">{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="px-6">
        <h2 className="text-xs font-bold text-foreground mb-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Compass size={14} className="text-primary animate-spin-slow" />
            {search ? `Searching for "${search}"` : `${selectedCategory} Destinations & Spots`}
          </span>
          {!loading && !error && (
            <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">
              {total} found
            </span>
          )}
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-[2rem] skeleton" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center glass rounded-3xl border border-dashed border-foreground/10">
            <p className="text-sm font-bold text-foreground">{error}</p>
            <button
              onClick={() => fetchLocations(null)}
              className="mt-4 px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.length > 0 ? (
              filteredItems.map((loc, i) => (
                <motion.button
                  key={loc.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.05, 0.5) }}
                  onClick={() => navigate(`/location/${loc.id}`)}
                  className="flex flex-col text-left group card-lift"
                >
                  <div className="relative aspect-[3/4] w-full rounded-[2rem] overflow-hidden shadow-card mb-2 border border-white/20 bg-secondary">
                    {loc.photos?.[0] ? (
                      <img
                        src={loc.photos[0]}
                        alt={loc.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <MapPin size={28} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

                    <div className="absolute top-3 right-3 h-6 px-2.5 glass-dark rounded-full flex items-center text-[8px] font-extrabold text-white uppercase tracking-wider">
                      {loc.category}
                    </div>

                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-white/80 text-[10px] font-bold flex items-center gap-1 mb-1">
                        <MapPin size={10} className="text-accent fill-accent/20" /> {loc.city || loc.guide?.city || "India"}
                      </p>
                      <h3 className="text-white text-sm font-extrabold leading-tight line-clamp-2">{loc.title}</h3>
                      <p className="text-[9px] text-white/60 font-semibold truncate mt-1">
                        By {loc.guide?.name || "Local Guide"}
                      </p>
                    </div>
                  </div>
                </motion.button>
              ))
            ) : (
              <div className="col-span-2 py-20 text-center glass rounded-3xl border border-dashed border-foreground/10">
                <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🏙️</span>
                </div>
                <p className="text-sm font-bold text-foreground">No destinations found</p>
                <p className="text-xs text-muted-foreground mt-1">Try another category or search query</p>
              </div>
            )}
          </div>
        )}

        {hasMore && !loading && !error && filteredItems.length > 0 && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-2xl gradient-primary text-primary-foreground text-sm font-semibold shadow-glow disabled:opacity-60 flex items-center gap-2"
            >
              {loadingMore ? (
                <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Loading...</>
              ) : "Load More"}
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Explore;
