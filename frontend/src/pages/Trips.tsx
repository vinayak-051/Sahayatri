import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, CheckCircle2, XCircle, AlertCircle, MessageSquare, Ban, IndianRupee, Banknote } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { openRazorpayCheckout, type RazorpayOrder } from "@/lib/razorpay";
import { useAuth } from "@/context/AuthContext";
import type { Booking } from "@/types/database";

const halfAmount = (b: Booking) => Math.round(Number(b.amount) * 50) / 100;

const Trips = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackInput, setFeedbackInput] = useState<{ [key: string]: string }>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);
  const [payingBooking, setPayingBooking] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("*, guide:profiles!bookings_guide_id_fkey(id, name, profile_photo_url)")
      .eq("traveler_id", user.id)
      .order("date", { ascending: false });
    if (error) {
      console.error("Failed to fetch trips:", error.message);
    } else {
      setBookings((data ?? []) as Booking[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bookings-traveler-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `traveler_id=eq.${user.id}` }, () => {
        fetchBookings();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchBookings]);

  const handleFeedbackSubmit = async (booking: Booking, status: "completed" | "cancelled") => {
    setSubmittingFeedback(booking.id);
    const feedbackText = feedbackInput[booking.id] || "";
    try {
      // paid bookings can't be cancelled by a direct update (a refund must be
      // issued), so route those through the payments Edge Function
      if (status === "cancelled" && booking.status === "confirmed") {
        const { data, error } = await supabase.functions.invoke("payments-api", {
          body: { action: "cancel", booking_id: booking.id },
        });
        if (error || data?.error) {
          toast.error(data?.error ?? "Failed to cancel trip");
          return;
        }
        if (feedbackText) await supabase.from("bookings").update({ feedback: feedbackText }).eq("id", booking.id);
        toast.success(`Trip cancelled. ₹${data.refund} will be refunded to your payment method.`);
      } else {
        const { error } = await supabase.from("bookings").update({ status, feedback: feedbackText }).eq("id", booking.id);
        if (error) {
          toast.error("Failed to submit feedback.");
          return;
        }
        toast.success(`Trip marked as ${status}. Thank you!`);
      }
      fetchBookings();
    } finally {
      setSubmittingFeedback(null);
    }
  };

  const isTripConcluded = (bookingDate: string) => bookingDate < new Date().toISOString().slice(0, 10);

  const startPayment = async (booking: Booking, stage: "advance" | "final") => {
    setPayingBooking(booking.id);
    try {
      const { data, error } = await supabase.functions.invoke("payments-api", {
        body: { action: "create_order", booking_id: booking.id, stage },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? "Could not start payment");
        return;
      }
      await openRazorpayCheckout(data as RazorpayOrder, () => {
        toast.success("Payment received! Confirming your booking…");
        fetchBookings();
      });
    } catch {
      toast.error("Could not open payment window");
    } finally {
      setPayingBooking(null);
    }
  };

  const confirmCashPaid = (booking: Booking) => {
    toast(`Confirm you paid ₹${halfAmount(booking)} in cash to ${booking.guide?.name ?? "your guide"}?`, {
      action: {
        label: "Yes, Paid",
        onClick: async () => {
          const { data, error } = await supabase.functions.invoke("payments-api", {
            body: { action: "confirm_cash", booking_id: booking.id },
          });
          if (error || data?.error) {
            toast.error(data?.error ?? "Could not record cash payment");
            return;
          }
          toast.success("Cash payment recorded");
          fetchBookings();
        },
      },
    });
  };

  const handleCancelBooking = (booking: Booking) => {
    const paid = booking.status === "confirmed";
    toast(paid ? "Cancel this trip? Within 5 days of the trip date a 10% cancellation fee applies." : "Cancel this trip request?", {
      action: {
        label: "Cancel Trip",
        onClick: async () => {
          if (paid) {
            const { data, error } = await supabase.functions.invoke("payments-api", {
              body: { action: "cancel", booking_id: booking.id },
            });
            if (error || data?.error) {
              toast.error(data?.error ?? "Failed to cancel trip");
              return;
            }
            toast.success(
              data.fee > 0
                ? `Trip cancelled. ₹${data.refund} refunded (₹${data.fee} cancellation fee).`
                : `Trip cancelled. ₹${data.refund} refunded in full.`
            );
          } else {
            const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
            if (error) {
              toast.error("Failed to cancel trip");
              return;
            }
            toast.success("Trip cancelled");
          }
          fetchBookings();
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-sky flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingFeedbackBookings = bookings.filter((b) => (b.status === "accepted" || b.status === "confirmed") && isTripConcluded(b.date));
  const upcomingTrips = bookings.filter((b) => (b.status === "accepted" || b.status === "confirmed") && !isTripConcluded(b.date));
  const completedTrips = bookings.filter((b) => b.status === "completed");
  const pendingApprovalTrips = bookings.filter((b) => b.status === "pending");
  const rejectedTrips = bookings.filter((b) => b.status === "declined");
  const cancelledTrips = bookings.filter((b) => b.status === "cancelled");

  return (
    <div className="min-h-screen gradient-sky pb-28 text-foreground">
      <div className="px-6 pt-8 pb-4">
        <h1 className="text-2xl font-bold font-display">My Trips</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your bookings, travel history, and trip feedback</p>
      </div>

      <div className="px-6 space-y-6">
        {pendingFeedbackBookings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-accent uppercase tracking-wider flex items-center gap-1">
              <AlertCircle size={14} className="text-accent animate-pulse" /> Concluded Trips • Your Feedback Needed
            </h2>
            <div className="space-y-4">
              {pendingFeedbackBookings.map((b) => (
                <motion.div key={b.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-dark border border-accent/20 rounded-3xl overflow-hidden shadow-elevated">
                  <div className="relative h-28 bg-secondary flex items-center justify-center">
                    <MapPin size={28} className="text-muted-foreground" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                    <div className="absolute bottom-2 left-4">
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-1">
                        <MapPin size={12} className="text-accent" /> {b.destination}
                      </h3>
                      <p className="text-[10px] text-white/70 mt-0.5">Guide: {b.guide?.name}</p>
                    </div>
                    <div className="absolute top-3 right-3 bg-accent/20 text-accent border border-accent/30 px-2.5 py-0.5 rounded-full text-[8px] font-extrabold uppercase">
                      Awaiting Completion Feedback
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    {b.status === "confirmed" && !b.final_payment_mode ? (
                      <>
                        <p className="text-xs text-white/90 font-medium">
                          Your trip on <strong className="text-accent">{new Date(b.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</strong> has concluded. Settle the remaining <strong className="text-accent">₹{halfAmount(b)}</strong> (final 50%) to finish up.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            disabled={payingBooking === b.id}
                            onClick={() => startPayment(b, "final")}
                            className="gradient-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform flex items-center justify-center gap-1 shadow-glow hover:brightness-110"
                          >
                            <IndianRupee size={12} /> Pay ₹{halfAmount(b)} Online
                          </button>
                          <button
                            onClick={() => confirmCashPaid(b)}
                            className="glass border border-white/15 text-white font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-white/10"
                          >
                            <Banknote size={12} /> Paid Cash to Guide
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-white/90 font-medium">
                          Your scheduled trip on <strong className="text-accent">{new Date(b.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</strong> has concluded. Please confirm whether the trip was completed.
                        </p>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                            <MessageSquare size={14} className="text-white/40 shrink-0" />
                            <input
                              type="text"
                              value={feedbackInput[b.id] || ""}
                              onChange={(e) => setFeedbackInput({ ...feedbackInput, [b.id]: e.target.value })}
                              placeholder="Optional: How was the guide and trip?"
                              className="w-full bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              disabled={submittingFeedback === b.id}
                              onClick={() => handleFeedbackSubmit(b, "completed")}
                              className="gradient-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform flex items-center justify-center gap-1 shadow-glow hover:brightness-110"
                            >
                              <CheckCircle2 size={12} /> Yes, Completed
                            </button>
                            <button
                              disabled={submittingFeedback === b.id}
                              onClick={() => handleFeedbackSubmit(b, "cancelled")}
                              className="glass border border-white/15 text-white font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform flex items-center justify-center gap-1 hover:bg-white/10"
                            >
                              <XCircle size={12} /> No, Cancelled
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {upcomingTrips.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Upcoming Trips</h2>
            <div className="space-y-3">
              {upcomingTrips.map((t) => (
                <motion.div key={t.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass rounded-3xl overflow-hidden shadow-card border border-primary/5">
                  <div className="relative h-32 bg-secondary flex items-center justify-center">
                    <MapPin size={28} className="text-muted-foreground" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                    <div className="absolute top-3 right-3 gradient-accent px-3 py-0.5 rounded-full text-[8px] font-extrabold text-white uppercase tracking-wider shadow-sm">
                      {t.status === "confirmed" ? "✓ Advance Paid" : "Upcoming"}
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <MapPin size={14} className="text-primary" /> {t.destination}
                      </h3>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 font-medium">
                        <Calendar size={12} className="text-primary" /> {new Date(t.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground font-semibold">Guide Partner</p>
                      <p className="text-xs font-extrabold text-foreground mt-0.5">{t.guide?.name}</p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-2">
                    {t.status === "accepted" && (
                      <button
                        disabled={payingBooking === t.id}
                        onClick={() => startPayment(t, "advance")}
                        className="w-full gradient-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-transform flex items-center justify-center gap-1.5 shadow-glow hover:brightness-110"
                      >
                        <IndianRupee size={12} /> Pay ₹{halfAmount(t)} Advance to Confirm
                      </button>
                    )}
                    <button
                      onClick={() => handleCancelBooking(t)}
                      className="w-full py-2 rounded-xl bg-secondary border border-border text-xs font-medium text-destructive flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <Ban size={12} /> Cancel Trip
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {completedTrips.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Completed Trips</h2>
            <div className="space-y-3">
              {completedTrips.map((t) => (
                <motion.div key={t.id} className="glass rounded-3xl overflow-hidden shadow-card border border-primary/5 opacity-80 hover:opacity-100 transition-opacity">
                  <div className="relative h-28 bg-secondary flex items-center justify-center">
                    <MapPin size={28} className="text-muted-foreground" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                    <div className="absolute top-3 right-3 gradient-primary px-3 py-0.5 rounded-full text-[8px] font-extrabold text-white uppercase tracking-wider shadow-sm">✓ Completed</div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <MapPin size={14} className="text-primary" /> {t.destination}
                      </h3>
                      <span className="text-[10px] text-muted-foreground font-semibold">{new Date(t.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                    {t.feedback && (
                      <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 mt-2">
                        <p className="text-[9px] uppercase font-bold text-primary tracking-wider flex items-center gap-1">
                          <MessageSquare size={10} /> Your Review
                        </p>
                        <p className="text-xs text-foreground/80 mt-1 italic font-medium">"{t.feedback}"</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {pendingApprovalTrips.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-primary uppercase tracking-wider">Requested</h2>
            <div className="space-y-3">
              {pendingApprovalTrips.map((t) => (
                <div key={t.id} className="glass rounded-3xl p-4 shadow-card border border-primary/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-xl">⏳</div>
                    <div>
                      <h3 className="text-xs font-bold text-foreground">{t.destination} Spot</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Booking with {t.guide?.name}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <span className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Requested</span>
                    <p className="text-[10px] text-muted-foreground font-bold">₹{t.amount}</p>
                    <button onClick={() => handleCancelBooking(t)} className="text-[10px] font-bold text-destructive">Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rejectedTrips.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-destructive uppercase tracking-wider">Rejected</h2>
            <div className="space-y-3">
              {rejectedTrips.map((t) => (
                <div key={t.id} className="glass rounded-3xl p-4 shadow-card border border-destructive/10 flex items-center justify-between opacity-80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-destructive/10 rounded-2xl flex items-center justify-center text-xl">✕</div>
                    <div>
                      <h3 className="text-xs font-bold text-foreground">{t.destination} Spot</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Declined by {t.guide?.name}</p>
                    </div>
                  </div>
                  <span className="text-[8px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Rejected</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cancelledTrips.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Cancelled</h2>
            <div className="space-y-3">
              {cancelledTrips.map((t) => (
                <div key={t.id} className="glass rounded-3xl p-4 shadow-card border border-border flex items-center justify-between opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-xl">🚫</div>
                    <div>
                      <h3 className="text-xs font-bold text-foreground">{t.destination} Spot</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Cancelled • was with {t.guide?.name}</p>
                    </div>
                  </div>
                  <span className="text-[8px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Cancelled</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {bookings.length === 0 && (
          <div className="text-center py-24 glass rounded-3xl border border-dashed border-foreground/10">
            <Calendar size={36} className="mx-auto text-muted-foreground opacity-30 mb-3" />
            <h3 className="text-sm font-bold text-foreground">No Trips Yet</h3>
            <p className="text-xs text-muted-foreground mt-1">Explore destinations to book your first guide spot!</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Trips;
