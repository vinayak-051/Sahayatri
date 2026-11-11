import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, MapPin, DollarSign, Users, Calendar, X, MessageCircle, Trash2, Check, Clock, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { friendlyDbError } from "@/lib/dbErrors";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BuddyRequestStatus, BuddyTrip } from "@/types/database";

export const MAX_DESTINATION_LENGTH = 100;
export const MAX_BUDGET_LENGTH = 50;
export const MAX_DESCRIPTION_LENGTH = 500;

export interface TripFormValues {
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  description: string;
}

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Checks the create-trip form before it is sent. `today` is the traveller's local
// date as YYYY-MM-DD; dates in that format compare correctly as strings.
// eslint-disable-next-line react-refresh/only-export-components
export function validateTripForm(values: TripFormValues, today: string): TripFormErrors {
  const errors: TripFormErrors = {};

  const destination = values.destination.trim();
  if (!destination) {
    errors.destination = "Tell others where you're going.";
  } else if (destination.length > MAX_DESTINATION_LENGTH) {
    errors.destination = `Keep the destination to ${MAX_DESTINATION_LENGTH} characters or fewer.`;
  }

  const hasStartDate = DATE_PATTERN.test(values.startDate);
  if (!hasStartDate) {
    errors.startDate = "Pick a start date.";
  } else if (values.startDate < today) {
    errors.startDate = "The start date can't be in the past.";
  }

  if (!DATE_PATTERN.test(values.endDate)) {
    errors.endDate = "Pick an end date.";
  } else if (hasStartDate && values.endDate < values.startDate) {
    errors.endDate = "The end date must be on or after the start date.";
  }

  if (values.budget.trim().length > MAX_BUDGET_LENGTH) {
    errors.budget = `Keep the budget to ${MAX_BUDGET_LENGTH} characters or fewer.`;
  }
  if (values.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  return errors;
}

// The signed-in traveller's own request on someone else's trip.
interface MyRequest {
  id: string;
  trip_id: string;
  status: BuddyRequestStatus;
}

// A request on one of the signed-in traveller's trips.
interface TripRequest {
  id: string;
  trip_id: string;
  traveler_id: string;
  traveler_name: string;
  status: BuddyRequestStatus;
}

type ProfileEmbed = { id: string; name: string | null } | { id: string; name: string | null }[] | null;

interface TripRequestRow {
  id: string;
  trip_id: string;
  traveler_id: string;
  status: BuddyRequestStatus;
  traveler: ProfileEmbed;
}

const EMPTY_FORM: TripFormValues = { destination: "", startDate: "", endDate: "", budget: "", description: "" };

const FIELD_IDS: Record<keyof TripFormValues, string> = {
  destination: "trip-destination",
  startDate: "trip-start-date",
  endDate: "trip-end-date",
  budget: "trip-budget",
  description: "trip-description",
};

const REQUEST_BADGES: Record<BuddyRequestStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Requested", className: "bg-amber-500/10 text-amber-600", icon: Clock },
  accepted: { label: "Accepted", className: "bg-green-500/10 text-green-600", icon: Check },
  rejected: { label: "Declined", className: "bg-red-500/10 text-red-500", icon: X },
};

// The traveller's local date as YYYY-MM-DD (toISOString would give the UTC date).
function localDateString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// new Date("YYYY-MM-DD") is UTC midnight, which can show the previous day; build a local date.
function formatTripDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const displayName = (name: string | null | undefined) => name?.trim() || "Traveller";

const fieldClass = (hasError: boolean) =>
  `w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 ${
    hasError ? "border-red-400/70" : "border-white/10"
  }`;

const RequestBadge = ({ status }: { status: BuddyRequestStatus }) => {
  const { label, className, icon: Icon } = REQUEST_BADGES[status];
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg ${className}`}>
      <Icon size={11} /> {label}
    </span>
  );
};

const Field = ({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-[10px] uppercase font-bold text-white/40 ml-1">{label}</label>
      {hint}
    </div>
    {children}
    {error && <p id={`${id}-error`} className="text-[11px] text-red-300 ml-1">{error}</p>}
  </div>
);

const TravelBuddy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const [trips, setTrips] = useState<BuddyTrip[]>([]);
  const [myRequests, setMyRequests] = useState<Record<string, MyRequest>>({});
  const [tripRequests, setTripRequests] = useState<Record<string, TripRequest[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joiningTripId, setJoiningTripId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<TripFormValues>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BuddyTrip | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const today = localDateString();
  const formErrors: TripFormErrors = showErrors ? validateTripForm(form, today) : {};

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!userId) return;
      if (mode === "initial") {
        setLoading(true);
        setLoadError(null);
      }

      // Only trips that haven't ended. Expired trips are filtered out here, never deleted.
      const [tripsRes, myRequestsRes] = await Promise.all([
        supabase
          .from("buddy_trips")
          .select("*, user:profiles!buddy_trips_user_id_fkey(id, name, profile_photo_url)")
          .gte("end_date", localDateString())
          .order("start_date", { ascending: true }),
        supabase.from("buddy_requests").select("id, trip_id, status").eq("traveler_id", userId),
      ]);
      let error = tripsRes.error ?? myRequestsRes.error;
      const tripsData = (tripsRes.data ?? []) as BuddyTrip[];
      const myTripIds = tripsData.filter((t) => t.user_id === userId).map((t) => t.id);

      let requestRows: TripRequestRow[] = [];
      if (!error && myTripIds.length > 0) {
        const requestsRes = await supabase
          .from("buddy_requests")
          .select("id, trip_id, traveler_id, status, traveler:profiles!buddy_requests_traveler_id_fkey(id, name)")
          .in("trip_id", myTripIds)
          .order("created_at", { ascending: true });
        error = requestsRes.error;
        requestRows = (requestsRes.data ?? []) as unknown as TripRequestRow[];
      }

      if (error) {
        const message = friendlyDbError(error, "Check your connection and try again.");
        if (mode === "initial") setLoadError(message);
        else toast.error(message);
        setLoading(false);
        return;
      }

      const grouped: Record<string, TripRequest[]> = {};
      for (const row of requestRows) {
        const traveler = Array.isArray(row.traveler) ? row.traveler[0] : row.traveler;
        const list = grouped[row.trip_id] ?? [];
        list.push({
          id: row.id,
          trip_id: row.trip_id,
          traveler_id: row.traveler_id,
          traveler_name: displayName(traveler?.name),
          status: row.status,
        });
        grouped[row.trip_id] = list;
      }

      setTrips(tripsData);
      setMyRequests(Object.fromEntries(((myRequestsRes.data ?? []) as MyRequest[]).map((r) => [r.trip_id, r])));
      setTripRequests(grouped);
      setLoadError(null);
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openChat = (otherUserId: string, otherUserName: string) => {
    navigate(`/messages?${new URLSearchParams({ userId: otherUserId, userName: otherUserName }).toString()}`);
  };

  const setRequestStatus = (tripId: string, requestId: string, status: BuddyRequestStatus) => {
    setTripRequests((prev) => ({
      ...prev,
      [tripId]: (prev[tripId] ?? []).map((r) => (r.id === requestId ? { ...r, status } : r)),
    }));
  };

  // Optimistic: the request moves straight away and moves back if the database refuses.
  const handleRequestAction = async (request: TripRequest, status: "accepted" | "rejected") => {
    const previous = request.status;
    setRequestStatus(request.trip_id, request.id, status);
    const { data, error } = await supabase.from("buddy_requests").update({ status }).eq("id", request.id).select("id");
    if (error || !data?.length) {
      setRequestStatus(request.trip_id, request.id, previous);
      toast.error(friendlyDbError(error, "Couldn't update the request. Please try again."));
      return;
    }
    toast.success(status === "accepted" ? `${request.traveler_name} can join your trip` : `Declined ${request.traveler_name}'s request`);
  };

  const handleJoinTrip = async (trip: BuddyTrip) => {
    if (!userId || joiningTripId) return;
    setJoiningTripId(trip.id);
    const { data, error } = await supabase
      .from("buddy_requests")
      .insert({ trip_id: trip.id, traveler_id: userId })
      .select("id, trip_id, status")
      .single();
    setJoiningTripId(null);
    if (error) {
      toast.error(friendlyDbError(error, "Couldn't send your request. Please try again."));
      // Already asked (e.g. from another tab): refresh so the real request state shows.
      if (error.code === "23505") loadData("refresh");
      return;
    }
    const request = data as MyRequest;
    setMyRequests((prev) => ({ ...prev, [trip.id]: request }));
    toast.success(`Request sent to ${displayName(trip.user?.name)}`);
  };

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setShowErrors(false);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!creating) setShowCreateModal(false);
  };

  const updateField = (field: keyof TripFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fieldProps = (field: keyof TripFormValues) => ({
    id: FIELD_IDS[field],
    "aria-invalid": Boolean(formErrors[field]),
    "aria-describedby": formErrors[field] ? `${FIELD_IDS[field]}-error` : undefined,
    className: fieldClass(Boolean(formErrors[field])),
  });

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const errors = validateTripForm(form, localDateString());
    const firstInvalid = (Object.keys(FIELD_IDS) as (keyof TripFormValues)[]).find((field) => errors[field]);
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("buddy_trips").insert({
        user_id: userId,
        destination: form.destination.trim(),
        start_date: form.startDate,
        end_date: form.endDate,
        budget: form.budget.trim() || null,
        description: form.description.trim() || null,
      });
      if (error) {
        toast.error(friendlyDbError(error, "Couldn't post your trip. Please try again."));
        return;
      }
      toast.success("Trip posted! We'll let you know when someone asks to join.");
      setShowCreateModal(false);
      loadData("refresh");
    } finally {
      setCreating(false);
    }
  };

  const askDeleteTrip = (trip: BuddyTrip) => {
    setDeleteTarget(trip);
    setDeleteOpen(true);
  };

  const confirmDeleteTrip = async () => {
    if (!deleteTarget) return;
    const tripId = deleteTarget.id;
    setDeleting(true);
    const { error } = await supabase.from("buddy_trips").delete().eq("id", tripId);
    setDeleting(false);
    if (error) {
      toast.error(friendlyDbError(error, "Couldn't delete the trip. Please try again."));
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    setDeleteOpen(false);
    toast.success("Trip deleted");
  };

  const descriptionLength = form.description.trim().length;

  return (
    <div className="min-h-screen gradient-sky pb-20">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button aria-label="Go back" onClick={() => navigate("/home")} className="p-1"><ArrowLeft size={22} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Travel Buddy</h1>
      </div>

      <div className="px-6 mb-6">
        <motion.button
          onClick={openCreateModal}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full glass rounded-2xl p-5 flex items-center gap-4 shadow-card border border-dashed border-primary/30 active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
            <Plus size={22} className="text-primary-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">Create a Trip</h3>
            <p className="text-xs text-muted-foreground">Find companions for your journey</p>
          </div>
        </motion.button>
      </div>

      <div className="px-6">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center justify-center gap-2 bg-primary/10 py-2 rounded-xl">
          <Users size={16} className="text-primary" /> Upcoming trips from Sahayatri members
        </h2>
        <div className="space-y-3">
          {loading ? (
            <div role="status" aria-label="Loading trips" className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="text-center py-10 px-6 glass rounded-3xl">
              <AlertCircle size={28} className="mx-auto mb-3 text-destructive" />
              <p className="text-sm font-semibold text-foreground mb-1">Couldn't load trips</p>
              <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
              <button
                onClick={() => loadData()}
                className="text-xs font-bold text-primary bg-primary/10 px-4 py-2 rounded-xl active:scale-95 transition-transform hover:bg-primary/20"
              >
                Try again
              </button>
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-10 px-6 glass rounded-3xl">
              <Users size={28} className="mx-auto mb-3 text-primary" />
              <p className="text-sm font-semibold text-foreground mb-1">No upcoming trips yet</p>
              <p className="text-xs text-muted-foreground mb-4">Post your plans and let fellow travellers find you.</p>
              <button
                onClick={openCreateModal}
                className="text-xs font-bold text-primary bg-primary/10 px-4 py-2 rounded-xl active:scale-95 transition-transform hover:bg-primary/20"
              >
                Post a trip
              </button>
            </div>
          ) : (
            trips.map((t, i) => {
              const isMine = t.user_id === userId;
              const ownerName = displayName(t.user?.name);
              const myRequest = myRequests[t.id];
              const requests = tripRequests[t.id] ?? [];
              const pending = requests.filter((r) => r.status === "pending");
              const accepted = requests.filter((r) => r.status === "accepted");
              return (
                <motion.div
                  key={t.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.05, 0.4) }}
                  className={`glass rounded-2xl p-4 shadow-card border ${isMine ? "border-primary/30" : "border-primary/5"}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {t.user?.profile_photo_url ? (
                      <img src={t.user.profile_photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">👤</div>
                    )}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-foreground truncate">{ownerName}</h3>
                      {isMine ? (
                        <span className="text-[8px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">My Trip</span>
                      ) : (
                        <button
                          onClick={() => openChat(t.user_id, ownerName)}
                          aria-label={`Message ${ownerName}`}
                          className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform hover:bg-primary/20"
                        >
                          <MessageCircle size={12} /> Message
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-secondary/30 p-2 rounded-xl min-w-0">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Destination</p>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1 break-words">
                        <MapPin size={10} className="text-primary shrink-0" /> {t.destination}
                      </p>
                    </div>
                    <div className="bg-secondary/30 p-2 rounded-xl min-w-0">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Budget</p>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1 break-words">
                        <DollarSign size={10} className="text-primary shrink-0" /> {t.budget || "Flexible"}
                      </p>
                    </div>
                  </div>

                  {t.description && (
                    <p className="text-xs text-foreground mb-3 leading-relaxed opacity-80 whitespace-pre-line break-words">{t.description}</p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Calendar size={12} />
                      <span>{formatTripDate(t.start_date)} – {formatTripDate(t.end_date)}</span>
                    </div>

                    {isMine ? (
                      <button
                        onClick={() => askDeleteTrip(t)}
                        aria-label={`Delete trip to ${t.destination}`}
                        className="p-1.5 rounded-lg bg-destructive/10 text-destructive active:scale-95 transition-transform"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : myRequest ? (
                      <RequestBadge status={myRequest.status} />
                    ) : (
                      <button
                        onClick={() => handleJoinTrip(t)}
                        disabled={joiningTripId === t.id}
                        className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg active:scale-95 transition-transform hover:bg-primary/20 disabled:opacity-50"
                      >
                        {joiningTripId === t.id ? "Sending..." : "Request to Join"}
                      </button>
                    )}
                  </div>

                  {isMine && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                        Join requests{pending.length > 0 ? ` (${pending.length})` : ""}
                      </p>
                      {pending.length === 0 && accepted.length === 0 && (
                        <p className="text-xs text-muted-foreground">No requests yet. We'll notify you when someone asks to join.</p>
                      )}
                      {pending.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-secondary/30 rounded-xl px-3 py-2">
                          <span className="text-xs font-semibold text-foreground truncate">{r.traveler_name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => openChat(r.traveler_id, r.traveler_name)}
                              aria-label={`Message ${r.traveler_name}`}
                              className="p-1.5 rounded-lg bg-secondary text-foreground active:scale-90 transition-transform"
                            >
                              <MessageCircle size={13} />
                            </button>
                            <button
                              onClick={() => handleRequestAction(r, "accepted")}
                              aria-label={`Accept ${r.traveler_name}`}
                              className="p-1.5 rounded-lg bg-primary/10 text-primary active:scale-90 transition-transform"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => handleRequestAction(r, "rejected")}
                              aria-label={`Decline ${r.traveler_name}`}
                              className="p-1.5 rounded-lg bg-destructive/10 text-destructive active:scale-90 transition-transform"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {accepted.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-secondary/30 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate">{r.traveler_name}</span>
                            <span className="text-[9px] font-bold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">Accepted</span>
                          </div>
                          <button
                            onClick={() => openChat(r.traveler_id, r.traveler_name)}
                            aria-label={`Message ${r.traveler_name}`}
                            className="p-1.5 rounded-lg bg-secondary text-foreground active:scale-90 transition-transform shrink-0"
                          >
                            <MessageCircle size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCreateModal} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-trip-title"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg glass-dark rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 id="create-trip-title" className="text-lg font-bold text-primary-foreground">Create a Buddy Trip</h2>
                <button aria-label="Close" onClick={closeCreateModal} className="p-1.5 rounded-full bg-white/10 text-white"><X size={18} /></button>
              </div>

              <form onSubmit={handleCreateTrip} noValidate className="space-y-4">
                <Field id={FIELD_IDS.destination} label="Where are you going?" error={formErrors.destination}>
                  <input
                    {...fieldProps("destination")}
                    value={form.destination}
                    onChange={(e) => updateField("destination", e.target.value)}
                    placeholder="e.g. Goa, Manali, Paris"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field id={FIELD_IDS.startDate} label="Start Date" error={formErrors.startDate}>
                    <input
                      {...fieldProps("startDate")}
                      type="date"
                      min={today}
                      value={form.startDate}
                      onChange={(e) => updateField("startDate", e.target.value)}
                    />
                  </Field>
                  <Field id={FIELD_IDS.endDate} label="End Date" error={formErrors.endDate}>
                    <input
                      {...fieldProps("endDate")}
                      type="date"
                      min={form.startDate || today}
                      value={form.endDate}
                      onChange={(e) => updateField("endDate", e.target.value)}
                    />
                  </Field>
                </div>

                <Field id={FIELD_IDS.budget} label="Budget (optional)" error={formErrors.budget}>
                  <input
                    {...fieldProps("budget")}
                    value={form.budget}
                    onChange={(e) => updateField("budget", e.target.value)}
                    placeholder="e.g. ₹20,000 or $500"
                  />
                </Field>

                <Field
                  id={FIELD_IDS.description}
                  label="Description (optional)"
                  error={formErrors.description}
                  hint={
                    <span className={`text-[10px] mr-1 ${descriptionLength > MAX_DESCRIPTION_LENGTH ? "text-red-300" : "text-white/40"}`}>
                      {descriptionLength}/{MAX_DESCRIPTION_LENGTH}
                    </span>
                  }
                >
                  <textarea
                    {...fieldProps("description")}
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Tell others about your trip plans..."
                    rows={3}
                    className={`${fieldClass(Boolean(formErrors.description))} resize-none`}
                  />
                </Field>

                <button type="submit" disabled={creating} className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow mt-4 active:scale-95 transition-transform disabled:opacity-50">
                  {creating ? "Posting Trip..." : "Post Trip"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your trip to {deleteTarget?.destination}?</AlertDialogTitle>
            <AlertDialogDescription>
              The trip and all its join requests will be removed for everyone. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep trip</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                // Stay open until the delete finishes; closed on success.
                e.preventDefault();
                confirmDeleteTrip();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete trip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TravelBuddy;
