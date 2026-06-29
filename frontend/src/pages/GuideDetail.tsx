import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Star, Globe, MessageCircle, Shield, MapPin, Send, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Profile, Review } from "@/types/database";

const GuideDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isGuide } = useAuth();
  const [guide, setGuide] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingPeople, setBookingPeople] = useState(1);

  useEffect(() => {
    if (!id) return;
    const fetchGuide = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, profile_photo_url, city, rating, is_verified, bio, specialization, languages, rate_per_day, additional_cities, is_available")
        .eq("id", id)
        .eq("role", "guide")
        .single();
      if (error) {
        console.error("Failed to fetch guide:", error.message);
        setGuide(null);
      } else {
        setGuide(data as Profile);
      }
      setLoading(false);
    };
    fetchGuide();
  }, [id]);

  useEffect(() => {
    if (guide) document.title = `${guide.name} – Guide | Sahayatri`;
    return () => { document.title = "Sahayatri - Your Journey, Our Guidance"; };
  }, [guide]);

  const fetchReviews = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("reviews")
      .select("*, reviewer:profiles!reviews_reviewer_id_fkey(id, name, role, profile_photo_url)")
      .eq("guide_id", id)
      .order("created_at", { ascending: false });
    if (!error) setReviews((data ?? []) as Review[]);
  }, [id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const submitReview = async () => {
    if (!myRating || !myComment.trim() || !id || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("reviews")
        .insert({ guide_id: id, reviewer_id: user.id, rating: myRating, comment: myComment.trim() });
      if (error) {
        if (error.code === "23505") {
          toast.error("You've already reviewed this guide.");
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
      setSubmitting(false);
    }
  };

  const openBookingForm = () => {
    if (!user) {
      toast.error("Please sign in as a traveler to book a guide.");
      navigate("/auth");
      return;
    }
    if (isGuide || !guide) {
      toast.error("Only travelers can book guides.");
      return;
    }
    if (!guide.is_available) {
      toast.error(`${guide.name} isn't accepting bookings right now.`);
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setBookingDate(tomorrow.toISOString().slice(0, 10));
    setBookingPeople(1);
    setShowBookingForm(true);
  };

  const handleBookGuide = async () => {
    if (!user || !guide || !bookingDate) return;
    setBooking(true);
    try {
      const { error } = await supabase.from("bookings").insert({
        traveler_id: user.id,
        guide_id: guide.id,
        destination: guide.city || "TBD",
        date: bookingDate,
        people: bookingPeople,
        amount: guide.rate_per_day ?? 0,
      });
      if (error) {
        toast.error(error.message || "Failed to book guide");
        return;
      }
      toast.success(`Booking request sent to ${guide.name}! 🎉`);
      setShowBookingForm(false);
    } finally {
      setBooking(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center gradient-sky">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!guide) return (
    <div className="min-h-screen gradient-sky flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-xl font-bold text-foreground">Guide not found</h2>
      <p className="text-sm text-muted-foreground mt-2">The guide you're looking for doesn't exist or isn't verified.</p>
      <button onClick={() => navigate("/guides")} className="mt-6 py-3 px-8 rounded-2xl bg-primary text-white font-bold">Back to Guides</button>
    </div>
  );

  return (
    <div className="min-h-screen gradient-sky pb-28">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/guides")} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Guide Profile</h1>
      </div>

      <div className="px-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass rounded-3xl p-6 shadow-elevated text-center mb-6"
        >
          <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-5xl mx-auto mb-4 overflow-hidden">
            {guide.profile_photo_url ? (
              <img src={guide.profile_photo_url} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              "🧭"
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground">{guide.name}</h2>
          <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <MapPin size={14} /> {guide.city}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
              <Star size={16} className="text-accent fill-accent" /> {guide.rating || "New"}
            </span>
            <span className="text-xs text-muted-foreground">Local Expert</span>
            {guide.is_verified && (
              <span className="flex items-center gap-1 text-xs text-primary">
                <Shield size={14} /> Verified ✅
              </span>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-5 shadow-card mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">About</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {guide.bio || `Welcome to ${guide.city}! I'm ${guide.name}, your local expert guide. I specialize in ${guide.specialization || "showing you the best spots"} and ensuring you have an unforgettable journey.`}
          </p>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="glass rounded-2xl p-5 shadow-card mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-2"><Globe size={14} /> Languages</span>
              <span className="text-xs font-medium text-foreground">{guide.languages?.join(", ") || "Not specified"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Rate</span>
              <span className="text-sm font-bold text-primary">
                {guide.rate_per_day != null ? `₹${guide.rate_per_day.toLocaleString()}/day` : "Contact for pricing"}
              </span>
            </div>
          </div>
          {((guide.additional_cities?.length ?? 0) > 0) && (
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground flex items-center gap-2 mb-2"><MapPin size={14} /> Also guides in</span>
              <div className="flex flex-wrap gap-1.5">
                {guide.additional_cities.map((city) => (
                  <span key={city} className="text-[10px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">{city}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Reviews Section */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-5 shadow-card">
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
                    placeholder="Share your experience with this guide..."
                    className="w-full bg-background/60 border border-primary/10 rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none"
                  />
                  <button
                    onClick={submitReview}
                    disabled={!myRating || !myComment.trim() || submitting}
                    className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    {submitting ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Send size={12} />}
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
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">{r.reviewer?.name}</span>
                        </div>
                        <div className="flex mt-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Star key={j} size={9} className={j < r.rating ? "text-accent fill-accent" : "text-muted-foreground/30"} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-10">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-border">
        <div className="flex gap-3 max-w-sm mx-auto">
          <button
            onClick={openBookingForm}
            disabled={booking || !guide.is_available || !guide.is_verified}
            className={`flex-1 py-3.5 rounded-2xl font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60 ${
              guide.is_available && guide.is_verified ? "gradient-primary text-primary-foreground shadow-glow" : "bg-secondary text-muted-foreground"
            }`}
          >
            {!guide.is_verified
              ? "Guide Not Yet Verified"
              : guide.is_available
              ? "Book Guide"
              : "Not Accepting Bookings"}
          </button>
          <button
            onClick={() => navigate(`/messages?userId=${guide.id}&userName=${encodeURIComponent(guide.name)}`)}
            className="w-14 h-14 rounded-2xl glass border border-border flex items-center justify-center active:scale-95 transition-transform"
          >
            <MessageCircle size={20} className="text-primary" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showBookingForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBookingForm(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative w-full max-w-lg glass-dark rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Book {guide.name}</h2>
                <button onClick={() => setShowBookingForm(false)} className="p-1.5 rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Date</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-white/40 ml-1">Number of people</label>
                  <input
                    type="number"
                    min={1}
                    value={bookingPeople}
                    onChange={(e) => setBookingPeople(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  />
                </div>

                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                  <span className="text-xs text-white/60">Total</span>
                  <span className="text-sm font-bold text-white">
                    {guide.rate_per_day != null ? `₹${guide.rate_per_day.toLocaleString()}` : "To be discussed with guide"}
                  </span>
                </div>

                <button
                  onClick={handleBookGuide}
                  disabled={booking || !bookingDate}
                  className="w-full py-3.5 rounded-xl gradient-primary text-white font-bold shadow-glow active:scale-95 transition-transform disabled:opacity-50"
                >
                  {booking ? "Sending request..." : "Confirm Booking Request"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GuideDetail;
