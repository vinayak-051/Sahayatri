import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarOff, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, parseISO, startOfToday } from "date-fns";
import GuideBottomNav from "@/components/GuideBottomNav";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/lib/supabaseClient";
import { friendlyDbError } from "@/lib/dbErrors";
import { useAuth } from "@/context/AuthContext";
import { MAX_NOTE_LENGTH, toIsoDate, todayIso, type UnavailableDate } from "@/lib/availability";
import { fetchUpcomingUnavailableDates } from "@/lib/useGuideUnavailableDates";

const byDate = (a: UnavailableDate, b: UnavailableDate) => a.date.localeCompare(b.date);

const GuideAvailability = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const [dates, setDates] = useState<UnavailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setDates(await fetchUpcomingUnavailableDates(userId));
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyDbError(err as { code?: string; message?: string }, "Couldn't load your availability."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => dates.map((d) => parseISO(d.date)), [dates]);

  const blockDate = async (iso: string) => {
    if (!user) return;
    const trimmed = note.trim() || null;
    const { error } = await supabase.from("guide_unavailable_dates").insert({ guide_id: user.id, date: iso, note: trimmed });
    if (error) {
      toast.error(friendlyDbError(error, "Couldn't block that date."));
      return;
    }
    setDates((prev) => [...prev, { date: iso, note: trimmed }].sort(byDate));
    toast.success(`${format(parseISO(iso), "d MMM")} marked unavailable`);
  };

  const unblockDate = async (iso: string) => {
    if (!user) return;
    const { error } = await supabase.from("guide_unavailable_dates").delete().eq("guide_id", user.id).eq("date", iso);
    if (error) {
      toast.error(friendlyDbError(error, "Couldn't remove that date."));
      return;
    }
    setDates((prev) => prev.filter((d) => d.date !== iso));
    toast.success(`${format(parseISO(iso), "d MMM")} is available again`);
  };

  const toggle = async (day: Date | undefined) => {
    if (!day || busyDate) return;
    const iso = toIsoDate(day);
    if (iso < todayIso()) return;
    setBusyDate(iso);
    try {
      if (dates.some((d) => d.date === iso)) await unblockDate(iso);
      else await blockDate(iso);
    } finally {
      setBusyDate(null);
    }
  };

  return (
    <div className="min-h-screen gradient-sky pb-24 text-foreground">
      <div className="px-6 pt-8 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/guide-locations")}
          aria-label="Back"
          className="p-2 glass rounded-full shadow-card active:scale-95 transition-transform"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Availability</h1>
      </div>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="px-6 space-y-4 max-w-lg mx-auto">
        <div className="glass rounded-2xl p-4 shadow-card space-y-3">
          <p className="text-sm text-muted-foreground">
            Tap a day to block it, tap it again to free it. Travellers can't request trips on blocked days.
          </p>
          <input
            type="text"
            maxLength={MAX_NOTE_LENGTH}
            placeholder="Note for new blocked days (optional, e.g. Festival)"
            aria-label="Note"
            className="w-full glass rounded-xl px-4 py-3 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-center">
            <Calendar
              mode="multiple"
              selected={selected}
              onSelect={(_days, day) => void toggle(day)}
              disabled={busyDate ? true : { before: startOfToday() }}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-bold mb-3">Upcoming blocked dates</h2>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="text-sm text-destructive space-y-2">
              <p role="alert">{loadError}</p>
              <button onClick={load} className="text-primary font-semibold">Try again</button>
            </div>
          ) : dates.length === 0 ? (
            <div className="flex flex-col items-center text-center py-6 text-muted-foreground">
              <CalendarOff size={28} className="mb-2" />
              <p className="text-sm">No blocked dates. You're open for bookings every day.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {dates.map((d) => (
                <li key={d.date} className="flex items-center justify-between gap-3 bg-white/40 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{format(parseISO(d.date), "EEE, d MMM yyyy")}</p>
                    {d.note && <p className="text-xs text-muted-foreground truncate">{d.note}</p>}
                  </div>
                  <button
                    onClick={() => void toggle(parseISO(d.date))}
                    disabled={busyDate !== null}
                    aria-label={`Remove ${format(parseISO(d.date), "d MMM yyyy")}`}
                    className="p-2 rounded-full text-destructive hover:bg-destructive/10 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>

      <GuideBottomNav />
    </div>
  );
};

export default GuideAvailability;
