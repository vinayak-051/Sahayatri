import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Star, MapPin, MessageCircle, Users, X, Flag, Bookmark, Clock, ShieldCheck, Send, Calendar } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Location, BuddyTrip, BookingStatus, LocationReview } from "@/types/database";

const LocationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isGuide } = useAuth();
  const [location, setLocation] = useState<Location | null>(null);
  const [otherListings, setOtherListings] = useState<Location[]>([]);
  const [buddies, setBuddies] = useState<BuddyTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuddy, setSelectedBuddy] = useState<BuddyTrip | null>(null);
  const [buddyGuideName, setBuddyGuideName] = useState<string | null>(null);
  const [loadingBuddyDetail, setLoadingBuddyDetail] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDate, setRequestDate] = useState("");
  const [requestPeople, setRequestPeople] = useState(1);
  const [requesting, setRequesting] = useState(false);
  const [myRequestStatus, setMyRequestStatus] = useState<BookingStatus | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [reviews, setReviews] = useState<LocationReview[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (location) document.title = `${location.title} | Sahayatri`;
    return () => { document.title = "Sahayatri - Your Journey, Our Guidance"; };
  }, [location]);

  const fetchMyRequest = useCallback(async (guideId: string, destination: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("status")
      .eq("traveler_id", user.id)
      .eq("guide_id", guideId)
      .eq("destination", destination)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setMyRequestStatus((data?.status as BookingStatus) ?? null);
  }, [user]);

  const fetchLocation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("locations")
      .select("*, guide:profiles!locations_guide_id_fkey(id, name, profile_photo_url, city, rating, bio, languages, is_available, is_verified)")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Failed to fetch location:", error?.message);
      setLocation(null);
      setLoading(false);
      return;
    }
    setLocation(data as Location);
    fetchMyRequest((data as Location).guide_id, (data as Location).title);

    const title = (data as Location).title;
    const [{ data: otherLocs }, { data: buddyTrips }] = await Promise.all([
      supabase
        .from("locations")
        .select("*, guide:profiles!locations_guide_id_fkey!inner(id, name, profile_photo_url, city, rating)")
        .ilike("title", `%${title}%`)
        .neq("id", id)
        .eq("status", "active")
        .eq("profiles.is_verified", true),
      supabase
        .from("buddy_trips")
        .select("*, user:profiles!buddy_trips_user_id_fkey(id, name, profile_photo_url)")
        .ilike("destination", `%${title}%`)
        .gte("start_date", new Date().toISOString().slice(0, 10)),
    ]);
    setOtherListings((otherLocs ?? []) as Location[]);
    setBuddies((buddyTrips ?? []) as BuddyTrip[]);
    setLoading(false);

    // best-effort view counter
    supabase
      .from("locations")
      .update({ views_count: ((data as Location).views_count || 0) + 1 })
      .eq("id", id)
      .then(({ error: viewCountError }) => {
        if (viewCountError) console.error("Failed to update view count:", viewCountError.message);
      });
  }, [id, fetchMyRequest]);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  useEffect(() => {
    if (!user || !id) return;
    supabase
      .from("saved_locations")
      .select("location_id")
      .eq("user_id", user.id)
      .eq("location_id", id)
      .maybeSingle()
      .then(({ data }) => setIsSaved(!!data));
  }, [user, id]);

  const fetchReviews = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("location_reviews")
      .select("*, reviewer:profiles!location_reviews_reviewer_id_fkey(id, name, role, profile_photo_url)")
      .eq("location_id", id)
      .order("created_at", { ascending: false });
    if (!error) setReviews((data ?? []) as LocationReview[]);
  }, [id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const deleteReview = async (reviewId: string) => {
    if (!window.confirm("Delete this review? This cannot be undone.")) return;
    const { error } = await supabase.from("location_reviews").delete().eq("id", reviewId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Review removed");
    fetchReviews();
  };

  const submitReview = async () => {
    if (!myRating || !myComment.trim() || !id || !user) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase
        .from("location_reviews")
        .insert({ location_id: id, reviewer_id: user.id, rating: myRating, comment: myComment.trim() });
      if (error) {
        if (error.code === "23505") {
          toast.error("You've already reviewed this spot.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      setShowReviewForm(false);
      setMyRating(0);
      setMyComment("");
      fetchReviews();
      toast.success("Review submitted!");
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (!user || !location) return;
    const channel = supabase
      .channel(`bookings-location-${user.id}-${location.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `traveler_id=eq.${user.id}` }, () => {
        fetchMyRequest(location.guide_id, location.title);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, location, fetchMyRequest]);

  const handleSave = async () => {
    if (!location || !user) return;
    if (isSaved) {
      const { error } = await supabase
        .from("saved_locations")
        .delete()
        .eq("user_id", user.id)
        .eq("location_id", location.id);
      if (error) {
        toast.error("Couldn't remove this spot right now.");
        return;
      }
      setIsSaved(false);
      setLocation({ ...location, saves_count: Math.max((location.saves_count || 0) - 1, 0) });
      toast.success("Removed from your saved spots.");
      return;
    }
    const { error } = await supabase
      .from("saved_locations")
      .insert({ user_id: user.id, location_id: location.id });
    if (error) {
      toast.error("Couldn't save this spot right now.");
      return;
    }
    setIsSaved(true);
    setLocation({ ...location, saves_count: (location.saves_count || 0) + 1 });
    toast.success("Saved to your favorites!");
  };

  const openBuddyDetail = async (t: BuddyTrip) => {
    setSelectedBuddy(t);
    setBuddyGuideName(null);
    setLoadingBuddyDetail(true);
    try {
      const { data } = await supabase
        .from("bookings")
        .select("guide:profiles!bookings_guide_id_fkey(name)")
        .eq("traveler_id", t.user_id)
        .eq("status", "accepted")
        .ilike("destination", `%${t.destination}%`)
        .limit(1)
        .maybeSingle();
      const guide = data?.guide as unknown as { name: string } | { name: string }[] | null;
      setBuddyGuideName((Array.isArray(guide) ? guide[0]?.name : guide?.name) ?? null);
    } finally {
      setLoadingBuddyDetail(false);
    }
  };

  const openRequestForm = () => {
    if (!user) {
      toast.error("Please sign in as a traveler to request a trip.");
      navigate("/auth");
      return;
    }
    if (location?.guide_id === user.id) {
      toast.error("You can't book your own spot.");
      return;
    }
    if (location?.guide && !location.guide.is_verified) {
      toast.error("This guide isn't verified yet. Booking is disabled.");
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRequestDate(tomorrow.toISOString().slice(0, 10));
    setRequestPeople(1);
    setShowRequestForm(true);
  };

  const handleRequestTrip = async () => {
    if (!user || !location || !requestDate) return;
    if (location.guide_id === user.id) {
      toast.error("You can't book your own spot.");
      return;
    }
    if (location.price_per_person != null && location.price_per_person <= 0) {
      toast.error("This location has an invalid price. Contact the guide directly.");
      return;
    }
    setRequesting(true);
    try {
      const totalAmount = (location.price_per_person ?? 0) * requestPeople;
      const { error } = await supabase.from("bookings").insert({
        traveler_id: user.id,
        guide_id: location.guide_id,
        destination: location.title,
        date: requestDate,
        people: requestPeople,
        amount: totalAmount,
      });
      if (error) {
        toast.error(error.message || "Failed to request trip");
        return;
      }
      setMyRequestStatus("pending");
      toast.success(`Trip request sent to ${location.guide?.name || "the guide"}! 🎉`);
      setShowRequestForm(false);
    } finally {
      setRequesting(false);
    }
  };

  const submitReport = async () => {
    if (!user || !location || !reportReason.trim()) return;
    setReporting(true);
    try {
      const { error } = await supabase.from("reports").insert({
        location_id: location.id,
        reported_by: user.id,
        reason: reportReason.trim(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Report submitted for review. Thank you.");
      setShowReport(false);
      setReportReason("");
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-sky">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen gradient-sky flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-foreground">Spot not found</h2>
        <p className="text-sm text-muted-foreground mt-2">This listing may have been removed.</p>
        <button onClick={() => navigate("/explore")} className="mt-6 py-3 px-8 rounded-2xl bg-primary text-white font-bold">Back to Explore</button>
      </div>
    );
  }

  const city = location.guide?.city || "India";
  const isOwnSpot = user?.id === location.guide_id;
  const isUnverifiedGuide = !location.guide || location.guide.is_verified === false;

  return (
    <div className="min-h-screen gradient-sky pb-28 text-foreground">
      <div className="relative h-[32vh] overflow-hidden">
        {location.photos?.length > 0 ? (
          <div className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            {location.photos.map((photo, idx) => (
              <div key={idx} className="relative flex-shrink-0 w-full h-full snap-start">
                <img src={photo} alt={`${location.title} ${idx + 1}`} loading={idx === 0 ? "eager" : "lazy"} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 bg-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10 pointer-events-none" />
        <button aria-label="Go back" onClick={() => navigate("/explore")} className="absolute top-6 left-6 z-10 p-2 glass rounded-full shadow-card active:scale-95 transition-transform">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <button aria-label={isSaved ? "Remove from favorites" : "Save to favorites"} onClick={handleSave} className="absolute top-6 right-6 z-10 p-2 glass rounded-full shadow-card active:scale-95 transition-transform">
          <Bookmark size={18} className={isSaved ? "text-accent fill-accent" : "text-foreground"} />
        </button>
        {location.photos?.length > 1 && (
          <div className="absolute bottom-20 right-4 z-10 px-2 py-1 rounded-full bg-black/50 text-[10px] text-white font-medium">
            {location.photos.length} photos
          </div>
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-6 pointer-events-none">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80 bg-black/30 self-start px-2.5 py-1 rounded-full mb-2">
            {location.category}
          </span>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-2xl font-extrabold text-white">
            {location.title}
          </motion.h1>
          <p className="text-sm text-white/80 mt-1 flex items-center gap-1">
            <MapPin size={14} /> {city}
          </p>
        </div>
      </div>

      {(location.photos?.length ?? 0) > 1 && (
        <div className="px-6 mt-4">
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            {location.photos.map((url, i) => (
              <img key={i} src={url} alt="" className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 border-2 border-white/20 shadow-card" />
            ))}
          </div>
        </div>
      )}

      <div className="px-6 -mt-6">
        {isUnverifiedGuide && !isOwnSpot && (
          <div className="rounded-2xl px-4 py-3 mb-4 bg-destructive/10 border border-destructive/20 flex items-center gap-2">
            <ShieldCheck size={14} className="text-destructive shrink-0" />
            <p className="text-[11px] text-destructive font-medium">This guide hasn't been verified by Sahayatri yet. Booking is disabled until verification.</p>
          </div>
        )}
        <div className="glass rounded-2xl p-5 shadow-card mb-6">
          <h2 className="text-sm font-bold text-foreground mb-2">About this spot</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">{location.detailed_content}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground"><Clock size={14} /> {location.timings || "Flexible"}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><ShieldCheck size={14} /> Safety: {location.safety_level}</div>
            {location.price_per_person != null ? (
              <div className="col-span-2 font-semibold text-primary">₹{location.price_per_person.toLocaleString()} per person</div>
            ) : location.pricing ? (
              <div className="col-span-2 font-semibold text-primary">{location.pricing}</div>
            ) : null}
          </div>
          {location.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {location.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">#{tag}</span>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-4 hover:text-destructive transition-colors"
          >
            <Flag size={11} /> Report this listing
          </button>
        </div>

        {location.guide && (
          <button
            onClick={() => navigate(`/guide/${location.guide_id}`)}
            className="w-full glass rounded-2xl p-4 shadow-card flex items-center gap-3 text-left mb-8"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary overflow-hidden flex items-center justify-center text-2xl">
              {location.guide.profile_photo_url ? (
                <img src={location.guide.profile_photo_url} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : "🧭"}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-foreground">Hosted by {location.guide.name}</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Star size={10} className="text-accent fill-accent" /> {location.guide.rating || "New"} guide
              </p>
            </div>
          </button>
        )}

        <div className="mb-8">
          <h2 className="text-base font-extrabold text-foreground mb-4 flex items-center gap-2">
            <Star size={16} className="text-accent fill-accent" /> Other Guides for {location.title}
          </h2>
          {otherListings.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
              {otherListings.map((loc) => (
                <button key={loc.id} onClick={() => navigate(`/location/${loc.id}`)} className="flex-none w-36 glass rounded-2xl p-3 shadow-card text-left">
                  <div className="w-full aspect-square rounded-xl overflow-hidden mb-2 bg-secondary flex items-center justify-center text-2xl">
                    {loc.guide?.profile_photo_url ? <img src={loc.guide.profile_photo_url} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : "🧭"}
                  </div>
                  <p className="text-xs font-bold text-foreground truncate">{loc.guide?.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Star size={9} className="text-accent fill-accent" /> {loc.guide?.rating || "New"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl py-6 text-center opacity-40 text-xs">No other guides offer this spot yet</div>
          )}
        </div>

        <div className="glass rounded-2xl p-5 shadow-card mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Reviews</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{reviews.length} from Sahayatri verified users</p>
            </div>
            {user && !isGuide && (
              <button
                onClick={() => setShowReviewForm((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl gradient-primary text-white text-[10px] font-bold active:scale-95 transition-transform"
              >
                <Star size={10} /> Write Review
              </button>
            )}
          </div>

          <AnimatePresence>
            {showReviewForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-4"
              >
                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">Your Rating</p>
                    <button onClick={() => setShowReviewForm(false)}><X size={14} className="text-muted-foreground" /></button>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setMyRating(n)}
                        className="transition-transform active:scale-110"
                      >
                        <Star
                          size={24}
                          className={`transition-colors ${
                            n <= (hoverRating || myRating) ? "text-accent fill-accent" : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={myComment}
                    onChange={(e) => setMyComment(e.target.value)}
                    rows={3}
                    placeholder="Share your experience at this spot..."
                    className="w-full bg-background/60 border border-primary/10 rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none"
                  />
                  <button
                    onClick={submitReview}
                    disabled={!myRating || !myComment.trim() || submittingReview}
                    className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    {submittingReview ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Send size={12} />}
                    Submit Review
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {reviews.length === 0 ? (
            <div className="text-center py-8 opacity-40">
              <div className="text-3xl mb-2">⭐</div>
              <p className="text-xs">No reviews yet. Be the first to review!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div key={r.id} className={`${i > 0 ? "pt-4 border-t border-border" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
                        {r.reviewer?.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground">{r.reviewer?.name}</span>
                        <div className="flex mt-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Star key={j} size={9} className={j < r.rating ? "text-accent fill-accent" : "text-muted-foreground/30"} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      {user?.is_admin && (
                        <button onClick={() => deleteReview(r.id)} className="text-[9px] font-bold text-destructive">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-10">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-extrabold text-foreground mb-4 flex items-center gap-2">
            <Users size={16} className="text-primary" /> Buddies Visiting {location.title}
          </h2>
          {buddies.length > 0 ? (
            <div className="space-y-3">
              {buddies.map((t) => (
                <button key={t.id} onClick={() => openBuddyDetail(t)} className="w-full glass rounded-2xl p-4 shadow-card border border-primary/5 text-left active:scale-[0.98] transition-transform">
                  <p className="text-xs font-bold text-foreground mb-1">{t.user?.name || "A traveler"}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{t.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl py-6 text-center opacity-40 text-xs">No current trips planned for this spot</div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-border">
        <div className="flex gap-3 max-w-sm mx-auto">
          <button
            onClick={openRequestForm}
            disabled={requesting || myRequestStatus === "pending" || myRequestStatus === "accepted" || location.guide?.is_available === false || isOwnSpot || isUnverifiedGuide}
            className={`flex-1 py-3.5 rounded-2xl font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60 ${
              myRequestStatus === "pending" || myRequestStatus === "accepted" || location.guide?.is_available === false || isOwnSpot || isUnverifiedGuide
                ? "bg-secondary text-muted-foreground"
                : "gradient-primary text-primary-foreground shadow-glow"
            }`}
          >
            {isOwnSpot
              ? "This is Your Spot"
              : isUnverifiedGuide
              ? "Guide Not Verified"
              : location.guide?.is_available === false
              ? "Guide Not Available"
              : myRequestStatus === "pending"
              ? "Requested"
              : myRequestStatus === "accepted"
              ? "Trip Accepted ✓"
              : myRequestStatus === "completed"
              ? "Request Again"
              : "Request Trip"}
          </button>
          <button
            onClick={() => navigate(`/messages?userId=${location.guide_id}&userName=${encodeURIComponent(location.guide?.name || "Guide")}`)}
            className="w-14 h-14 rounded-2xl glass border border-border flex items-center justify-center active:scale-95 transition-transform"
          >
            <MessageCircle size={20} className="text-primary" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showRequestForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowRequestForm(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-lg glass-dark rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Request Trip to {location.title}</h2>
                <button onClick={() => setShowRequestForm(false)} className="p-1.5 rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Date</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Number of people</label>
                  <input
                    type="number"
                    min={1}
                    value={requestPeople}
                    onChange={(e) => setRequestPeople(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  />
                </div>

                <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Guide Fee ({requestPeople} {requestPeople === 1 ? "person" : "people"})</span>
                    <span className="text-xs font-medium text-white/80">
                      {location.price_per_person != null ? `₹${(location.price_per_person * requestPeople).toLocaleString()}` : "To be discussed with guide"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-xs font-semibold text-white">Total</span>
                    <span className="text-sm font-bold text-white">
                      {location.price_per_person != null ? `₹${(location.price_per_person * requestPeople).toLocaleString()}` : "To be discussed with guide"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRequestTrip}
                  disabled={requesting || !requestDate}
                  className="w-full py-3.5 rounded-xl gradient-primary text-white font-bold shadow-glow active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {requesting ? "Sending request..." : <><Send size={14} /> Send Request to Guide</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReport(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm glass rounded-3xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground">Report this listing</h3>
                <button onClick={() => setShowReport(false)}><X size={16} className="text-muted-foreground" /></button>
              </div>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={3}
                placeholder="What's wrong with this listing?"
                className="w-full bg-background/60 border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none mb-3"
              />
              <button
                onClick={submitReport}
                disabled={!reportReason.trim() || reporting}
                className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-40"
              >
                {reporting ? "Submitting..." : "Submit Report"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBuddy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedBuddy(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm glass rounded-3xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground">{selectedBuddy.user?.name || "A traveler"}</h3>
                <button onClick={() => setSelectedBuddy(null)}><X size={16} className="text-muted-foreground" /></button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">{selectedBuddy.description}</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={14} />
                  {new Date(selectedBuddy.start_date).toLocaleDateString([], { month: "short", day: "numeric" })} – {new Date(selectedBuddy.end_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </div>
                {selectedBuddy.budget && <div className="flex items-center gap-2 text-muted-foreground"><span className="font-bold">₹</span> {selectedBuddy.budget}</div>}
                <div className="flex items-center gap-2 text-muted-foreground pt-2 border-t border-border">
                  <ShieldCheck size={14} />
                  {loadingBuddyDetail ? "Checking guide status..." : buddyGuideName ? `Guide accepted: ${buddyGuideName}` : "No guide assigned yet"}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LocationDetail;
