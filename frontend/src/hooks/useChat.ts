// Data layer for the traveller and guide messengers: the inbox, the open thread,
// sending and the realtime connection. The pages only render what this returns.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { friendlyDbError } from "@/lib/dbErrors";
import { useAuth } from "@/context/AuthContext";
import type { Message } from "@/types/database";
import {
  MESSAGE_COLUMNS,
  PAGE_SIZE,
  type ChatMessage,
  type Conversation,
  type MessageKey,
  type SyncAnchor,
  addPending,
  applyMessageToConversations,
  applyReadUpdate,
  clearUnread,
  hasUnreadIncoming,
  markIncomingRead,
  mergeLatestPage,
  mergeMessages,
  mergeOlderPage,
  newMessageId,
  newestConfirmed,
  oldestConfirmed,
  partnerOf,
  patchPartner,
  replayMessages,
  seenMessageId,
  setDelivery,
  validateDraft,
} from "./chatState";

export type ConnectionState = "connecting" | "live" | "reconnecting";
export type LoadStatus = "idle" | "loading" | "ready" | "error";

interface ThreadState {
  partnerId: string | null;
  messages: ChatMessage[];
  status: LoadStatus;
  hasMore: boolean;
  loadingOlder: boolean;
  /** Bumped when older history is dropped, so an in-flight "load earlier" is discarded. */
  epoch: number;
}

const idleThread = (partnerId: string | null): ThreadState => ({
  partnerId,
  messages: [],
  status: partnerId ? "loading" : "idle",
  hasMore: false,
  loadingOlder: false,
  epoch: 0,
});

// Topics must be unique per subscription: supabase.channel() returns an existing
// channel with the same topic, which may still be closing after a remount.
let channelCounter = 0;

const fetchPage = (partnerId: string, before: MessageKey | null) =>
  supabase.rpc("conversation_messages", {
    p_partner_id: partnerId,
    p_before_created_at: before?.created_at ?? null,
    p_before_id: before?.id ?? null,
    p_limit: PAGE_SIZE + 1,
  });

function useDocumentVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

interface UseChatOptions {
  /** The person whose chat is open, or null for the inbox. */
  partnerId: string | null;
  /** A name to show before (or instead of) looking the partner up. */
  partnerNameHint?: string | null;
  /** Shown when the partner's name is unknown. */
  fallbackName: string;
}

export function useChat({ partnerId, partnerNameHint = null, fallbackName }: UseChatOptions) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const visible = useDocumentVisible();

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsStatus, setConversationsStatus] = useState<LoadStatus>("loading");
  const [thread, setThread] = useState<ThreadState>(() => idleThread(partnerId));
  const [fetchedName, setFetchedName] = useState<{ id: string; name: string | null } | null>(null);

  // Latest values for realtime callbacks, which are registered once per channel.
  const partnerIdRef = useRef(partnerId);
  partnerIdRef.current = partnerId;
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const liveRef = useRef(false);
  const anchorRef = useRef<SyncAnchor>(null);
  const threadSeqRef = useRef(0);
  const listSeqRef = useRef(0);
  const listInFlightRef = useRef(false);
  const eventSeqRef = useRef(0);
  const eventLogRef = useRef<{ seq: number; message: Message }[]>([]);
  const requestedProfilesRef = useRef(new Set<string>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ---------------------------------------------------------------- inbox
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const seq = ++listSeqRef.current;
    const since = eventSeqRef.current;
    listInFlightRef.current = true;
    const { data, error } = await supabase.rpc("my_conversations");
    if (seq !== listSeqRef.current) return;
    const events = eventLogRef.current.filter((e) => e.seq > since).map((e) => e.message);
    eventLogRef.current = [];
    listInFlightRef.current = false;
    if (error) {
      console.error("Failed to load conversations:", error.message);
      setConversationsStatus((status) => (status === "ready" ? status : "error"));
      return;
    }
    setConversations(replayMessages((data ?? []) as Conversation[], events, userId, partnerIdRef.current));
    setConversationsStatus("ready");
  }, [userId]);

  const reloadConversations = useCallback(() => {
    setConversationsStatus((status) => (status === "error" ? "loading" : status));
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Partners that first appear through a live message have no profile details yet.
  useEffect(() => {
    for (const c of conversations) {
      if (c.partner_name !== null || requestedProfilesRef.current.has(c.partner_id)) continue;
      requestedProfilesRef.current.add(c.partner_id);
      supabase
        .from("profiles")
        .select("id, name, role, is_verified")
        .eq("id", c.partner_id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) console.error("Failed to load profile:", error.message);
          if (data) setConversations((list) => patchPartner(list, data));
        });
    }
  }, [conversations]);

  // ---------------------------------------------------------------- thread
  const loadLatest = useCallback(async (pid: string, mode: "initial" | "resync") => {
    const seq = ++threadSeqRef.current;
    const { data, error } = await fetchPage(pid, null);
    if (seq !== threadSeqRef.current || partnerIdRef.current !== pid) return;
    if (error) {
      console.error("Failed to load conversation:", error.message);
      setThread((prev) => (prev.partnerId === pid && prev.status !== "ready" ? { ...prev, status: "error" } : prev));
      return;
    }
    const page = (data ?? []) as Message[];
    const anchor = mode === "resync" ? anchorRef.current : null;
    setThread((prev) => {
      if (prev.partnerId !== pid) return prev;
      const merged = mergeLatestPage(prev.messages, page, {
        pageSize: PAGE_SIZE,
        anchor,
        hasMore: prev.status === "ready" ? prev.hasMore : null,
      });
      return {
        ...prev,
        messages: merged.messages,
        hasMore: merged.hasMore,
        status: "ready",
        epoch: merged.reset ? prev.epoch + 1 : prev.epoch,
      };
    });
    if (mode === "resync") {
      anchorRef.current = null;
    } else if (!liveRef.current && anchorRef.current === null) {
      // Loaded while realtime is down: the next resync must join up from here.
      anchorRef.current = page[0] ? { created_at: page[0].created_at, id: page[0].id } : "start";
    }
  }, []);

  useEffect(() => {
    anchorRef.current = null;
    setThread(idleThread(partnerId));
    if (partnerId) {
      setConversations((list) => clearUnread(list, partnerId));
      void loadLatest(partnerId, "initial");
    } else {
      threadSeqRef.current++;
    }
  }, [partnerId, loadLatest]);

  const reloadThread = useCallback(() => {
    const pid = partnerIdRef.current;
    if (!pid) return;
    setThread((prev) => (prev.partnerId === pid ? { ...prev, status: "loading" } : prev));
    void loadLatest(pid, "initial");
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    const current = threadRef.current;
    const pid = current.partnerId;
    const cursor = oldestConfirmed(current.messages);
    if (!pid || pid !== partnerIdRef.current || !current.hasMore || current.loadingOlder || !cursor) return;
    const { epoch } = current;
    setThread((prev) => (prev.partnerId === pid ? { ...prev, loadingOlder: true } : prev));
    const { data, error } = await fetchPage(pid, cursor);
    if (error) {
      console.error("Failed to load earlier messages:", error.message);
      toast.error(friendlyDbError(error, "Couldn't load earlier messages."));
    }
    setThread((prev) => {
      if (prev.partnerId !== pid) return prev;
      if (error || prev.epoch !== epoch) return { ...prev, loadingOlder: false };
      return { ...prev, ...mergeOlderPage(prev.messages, (data ?? []) as Message[], PAGE_SIZE), loadingOlder: false };
    });
  }, []);

  // Mark what the partner sent as read while the chat is open and on screen.
  useEffect(() => {
    if (!userId || !partnerId || !visible || thread.partnerId !== partnerId) return;
    if (!hasUnreadIncoming(thread.messages, userId)) return;
    setThread((prev) => (prev.partnerId === partnerId ? { ...prev, messages: markIncomingRead(prev.messages, userId) } : prev));
    setConversations((list) => clearUnread(list, partnerId));
    supabase
      .from("messages")
      .update({ is_read: true })
      .eq("sender_id", partnerId)
      .eq("receiver_id", userId)
      .eq("is_read", false)
      .then(({ error }) => {
        if (error) console.error("Failed to mark messages read:", error.message);
      });
  }, [thread.messages, thread.partnerId, partnerId, userId, visible]);

  // ---------------------------------------------------------------- live events
  const applyConfirmed = useCallback(
    (message: Message) => {
      if (!userId) return;
      const pid = partnerOf(message, userId);
      setConversations((list) => applyMessageToConversations(list, message, userId, partnerIdRef.current));
      if (pid === partnerIdRef.current) {
        setThread((prev) => (prev.partnerId === pid ? { ...prev, messages: mergeMessages(prev.messages, [message]) } : prev));
      }
    },
    [userId],
  );

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Message>) => {
      if (!userId) return;
      const message = payload.new as Message;
      if (payload.eventType === "INSERT") {
        eventSeqRef.current++;
        if (listInFlightRef.current) eventLogRef.current.push({ seq: eventSeqRef.current, message });
        applyConfirmed(message);
      } else if (payload.eventType === "UPDATE") {
        const pid = partnerOf(message, userId);
        if (pid === partnerIdRef.current) {
          setThread((prev) => (prev.partnerId === pid ? { ...prev, messages: applyReadUpdate(prev.messages, message) } : prev));
        }
        // Read on another device: unread counts can't be adjusted one event at a time
        // without double counting, so fetch the inbox again (once per burst).
        const row = conversationsRef.current.find((c) => c.partner_id === pid);
        if (message.receiver_id === userId && message.is_read && pid !== partnerIdRef.current && row && row.unread_count > 0) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => void loadConversations(), 500);
        }
      }
    },
    [userId, applyConfirmed, loadConversations],
  );

  // Postgres Changes don't replay what was missed while disconnected: every time the
  // channel (re)subscribes, fetch the inbox and the open thread again.
  const resync = useCallback(() => {
    void loadConversations();
    const pid = partnerIdRef.current;
    if (pid) void loadLatest(pid, "resync");
  }, [loadConversations, loadLatest]);

  const markDisconnected = useCallback(() => {
    if (anchorRef.current !== null || !partnerIdRef.current) return;
    anchorRef.current = newestConfirmed(threadRef.current.messages) ?? "start";
  }, []);

  const callbacksRef = useRef({ handleChange, resync, markDisconnected });
  callbacksRef.current = { handleChange, resync, markDisconnected };

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const onChange = (payload: RealtimePostgresChangesPayload<Message>) => {
      if (!disposed) callbacksRef.current.handleChange(payload);
    };

    const connect = () => {
      const ch = supabase
        .channel(`chat:${userId}:${++channelCounter}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${userId}` }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${userId}` }, onChange);
      channel = ch;
      ch.subscribe((status, err) => {
        if (disposed || ch !== channel) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          liveRef.current = true;
          setConnection("live");
          callbacksRef.current.resync();
          return;
        }
        if (err) console.error(`Chat connection ${status}:`, err);
        liveRef.current = false;
        setConnection("reconnecting");
        callbacksRef.current.markDisconnected();
        // The client retries errors and timeouts itself, but never rejoins a closed channel.
        if (status === "CLOSED") {
          channel = null;
          void supabase.removeChannel(ch);
          retryTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt++));
        }
      });
    };

    connect();
    return () => {
      disposed = true;
      liveRef.current = false;
      clearTimeout(retryTimer);
      clearTimeout(refreshTimerRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  // ---------------------------------------------------------------- sending
  const deliver = useCallback(
    async (message: ChatMessage) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({ id: message.id, sender_id: message.sender_id, receiver_id: message.receiver_id, content: message.content })
        .select(MESSAGE_COLUMNS)
        .single();
      let saved = (data as Message | null) ?? null;
      // A retry after a lost response: the first attempt already saved it.
      if (error?.code === "23505" && error.message.includes("messages_pkey")) {
        const existing = await supabase
          .from("messages")
          .select(MESSAGE_COLUMNS)
          .eq("id", message.id)
          .eq("sender_id", message.sender_id)
          .maybeSingle();
        saved = (existing.data as Message | null) ?? null;
      }
      if (saved) {
        applyConfirmed(saved);
        return;
      }
      console.error("Failed to send message:", error?.message);
      toast.error(friendlyDbError(error, "Message failed to send."));
      setThread((prev) => ({ ...prev, messages: setDelivery(prev.messages, message.id, "failed") }));
    },
    [applyConfirmed],
  );

  /** Sends a message optimistically. Returns false (and sends nothing) for an empty or too-long draft. */
  const send = useCallback(
    (draft: string) => {
      const content = validateDraft(draft);
      const pid = partnerIdRef.current;
      if (!content || !pid || !userId) return false;
      const message: ChatMessage = {
        id: newMessageId(),
        sender_id: userId,
        receiver_id: pid,
        content,
        is_read: false,
        created_at: new Date().toISOString(),
        delivery: "sending",
      };
      setThread((prev) => (prev.partnerId === pid ? { ...prev, messages: addPending(prev.messages, message) } : prev));
      void deliver(message);
      return true;
    },
    [userId, deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const message = threadRef.current.messages.find((m) => m.id === id && m.delivery === "failed");
      if (!message) return;
      setThread((prev) => ({ ...prev, messages: setDelivery(prev.messages, id, "sending") }));
      void deliver(message);
    },
    [deliver],
  );

  // ---------------------------------------------------------------- partner
  const listName = partnerId ? conversations.find((c) => c.partner_id === partnerId)?.partner_name ?? null : null;
  const needsLookup = !!partnerId && !partnerNameHint && !listName && conversationsStatus !== "loading";

  useEffect(() => {
    if (!needsLookup || !partnerId || fetchedName?.id === partnerId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, name")
      .eq("id", partnerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load profile:", error.message);
        setFetchedName({ id: partnerId, name: data?.name ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, partnerId, fetchedName]);

  const partnerName =
    partnerNameHint || listName || (fetchedName?.id === partnerId ? fetchedName.name : null) || fallbackName;
  const threadForPartner = thread.partnerId === partnerId ? thread : idleThread(partnerId);

  return {
    connection,
    conversations,
    conversationsStatus,
    reloadConversations,
    partner: partnerId ? { id: partnerId, name: partnerName } : null,
    thread: {
      messages: threadForPartner.messages,
      status: threadForPartner.status,
      hasMore: threadForPartner.hasMore,
      loadingOlder: threadForPartner.loadingOlder,
      seenMessageId: userId ? seenMessageId(threadForPartner.messages, userId) : null,
    },
    loadOlder,
    reloadThread,
    send,
    retry,
  };
}
