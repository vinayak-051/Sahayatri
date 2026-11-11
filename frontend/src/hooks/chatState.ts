// Pure chat state logic shared by the traveller and guide messengers: ordering,
// merging and de-duplicating messages, keeping the inbox in sync with live
// events, and formatting. No React or Supabase here, so it is easy to test.
import type { Message } from "@/types/database";

export const PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGE_COLUMNS = "id, sender_id, receiver_id, content, is_read, created_at";

/** A message in the open thread. `delivery` is set only while it exists just on this device. */
export interface ChatMessage extends Message {
  delivery?: "sending" | "failed";
}

/** One row of public.my_conversations(). */
export interface Conversation {
  partner_id: string;
  partner_name: string | null;
  partner_role: string | null;
  partner_is_verified: boolean;
  last_message_id: string;
  last_message_content: string;
  last_message_sender_id: string;
  last_message_created_at: string;
  unread_count: number;
}

export interface MessageKey {
  created_at: string;
  id: string;
}

/**
 * Where the thread was known to be complete when the realtime connection dropped:
 * the newest message we had, "start" if we had none, or null while connected.
 */
export type SyncAnchor = MessageKey | "start" | null;

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Microseconds since the epoch. Postgres timestamps carry microseconds, which Date drops. */
export function timestampMicros(ts: string): number {
  const match = TIMESTAMP.exec(ts);
  if (!match) {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? 0 : ms * 1000;
  }
  const [, date, time, fraction = "", zone = "Z"] = match;
  let offset = zone.toUpperCase();
  if (offset !== "Z") {
    const digits = offset.slice(1).replace(":", "");
    offset = `${offset[0]}${digits.slice(0, 2)}:${digits.slice(2, 4) || "00"}`;
  }
  const ms = Date.parse(`${date}T${time}${offset}`);
  if (Number.isNaN(ms)) return 0;
  return ms * 1000 + Number(`${fraction}000000`.slice(0, 6));
}

export function toDate(ts: string): Date {
  return new Date(Math.floor(timestampMicros(ts) / 1000));
}

/** Thread order, the same as the database's: (created_at, id). */
export function compareKeys(a: MessageKey, b: MessageKey): number {
  const diff = timestampMicros(a.created_at) - timestampMicros(b.created_at);
  if (diff !== 0) return diff < 0 ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function partnerOf(message: Pick<Message, "sender_id" | "receiver_id">, me: string): string {
  return message.sender_id === me ? message.receiver_id : message.sender_id;
}

/**
 * Adds server rows to the thread. A server row replaces a local copy with the same id
 * (the optimistic bubble or a stale version); read state only ever moves to read.
 * Confirmed messages are sorted by (created_at, id); unconfirmed ones stay at the end
 * in the order they were written, so a device clock never reorders the thread.
 */
export function mergeMessages(current: ChatMessage[], incoming: Message[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, {
      id: m.id,
      sender_id: m.sender_id,
      receiver_id: m.receiver_id,
      content: m.content,
      created_at: m.created_at,
      is_read: Boolean(m.is_read) || (existing !== undefined && !existing.delivery && existing.is_read),
    });
  }
  const confirmed: ChatMessage[] = [];
  const local: ChatMessage[] = [];
  for (const m of byId.values()) (m.delivery ? local : confirmed).push(m);
  confirmed.sort(compareKeys);
  const localOrder = new Map(current.map((m, i) => [m.id, i]));
  local.sort((a, b) => (localOrder.get(a.id) ?? 0) - (localOrder.get(b.id) ?? 0));
  return [...confirmed, ...local];
}

function confirmedOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !m.delivery);
}

export function newestConfirmed(messages: ChatMessage[]): MessageKey | null {
  const confirmed = confirmedOnly(messages);
  const last = confirmed[confirmed.length - 1];
  return last ? { created_at: last.created_at, id: last.id } : null;
}

export function oldestConfirmed(messages: ChatMessage[]): MessageKey | null {
  const first = messages.find((m) => !m.delivery);
  return first ? { created_at: first.created_at, id: first.id } : null;
}

export interface PageMerge {
  messages: ChatMessage[];
  hasMore: boolean;
  /** True when older history was dropped because it could no longer be joined up. */
  reset: boolean;
}

/**
 * Applies a fetch of the latest messages (newest first, up to pageSize + 1 rows) to the
 * thread. `hasMore` is the thread's current value, or null when nothing was loaded yet.
 * If the connection dropped (anchor set) and more than a page arrived meanwhile, the
 * loaded history can't be joined to the new page without a gap: keep only the page
 * and anything newer, and let "Load earlier messages" fetch the rest.
 */
export function mergeLatestPage(
  current: ChatMessage[],
  page: Message[],
  { pageSize, anchor, hasMore }: { pageSize: number; anchor: SyncAnchor; hasMore: boolean | null },
): PageMerge {
  const pageHasMore = page.length > pageSize;
  const rows = page.slice(0, pageSize);
  if (!pageHasMore) return { messages: mergeMessages(current, rows), hasMore: false, reset: false };

  const oldest = rows[rows.length - 1];
  const gap = anchor !== null && (anchor === "start" || compareKeys(oldest, anchor) > 0);
  if (!gap) {
    const known = hasMore === null || confirmedOnly(current).length === 0 ? true : hasMore;
    return { messages: mergeMessages(current, rows), hasMore: known, reset: false };
  }
  const keep = current.filter((m) => m.delivery || compareKeys(m, oldest) > 0);
  return { messages: mergeMessages(keep, rows), hasMore: true, reset: true };
}

/** Applies a page of older messages (newest first, up to pageSize + 1 rows). */
export function mergeOlderPage(current: ChatMessage[], page: Message[], pageSize: number) {
  return { messages: mergeMessages(current, page.slice(0, pageSize)), hasMore: page.length > pageSize };
}

export function addPending(current: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (current.some((m) => m.id === message.id)) return current;
  return [...current, { ...message, delivery: "sending" }];
}

/** Changes the delivery state of a message that is still unconfirmed. */
export function setDelivery(current: ChatMessage[], id: string, delivery: "sending" | "failed"): ChatMessage[] {
  return current.map((m) => (m.id === id && m.delivery ? { ...m, delivery } : m));
}

export function hasUnreadIncoming(messages: ChatMessage[], me: string): boolean {
  return messages.some((m) => !m.delivery && m.receiver_id === me && !m.is_read);
}

export function markIncomingRead(messages: ChatMessage[], me: string): ChatMessage[] {
  if (!hasUnreadIncoming(messages, me)) return messages;
  return messages.map((m) => (!m.delivery && m.receiver_id === me && !m.is_read ? { ...m, is_read: true } : m));
}

/** Applies a realtime UPDATE (only is_read can change, and only to true). */
export function applyReadUpdate(messages: ChatMessage[], update: Message): ChatMessage[] {
  if (!update.is_read) return messages;
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== update.id || m.is_read) return m;
    changed = true;
    return { ...m, is_read: true };
  });
  return changed ? next : messages;
}

/** My latest confirmed message, if the other person has read it. */
export function seenMessageId(messages: ChatMessage[], me: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.delivery && m.sender_id === me) return m.is_read ? m.id : null;
  }
  return null;
}

const conversationKey = (c: Conversation): MessageKey => ({ created_at: c.last_message_created_at, id: c.last_message_id });

export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => compareKeys(conversationKey(b), conversationKey(a)));
}

/**
 * Applies a new message to the inbox. Idempotent: a message the row already reflects
 * (same id, or older than its last message) changes nothing, so live events can be
 * replayed safely on top of a fresh snapshot. Messages in the open chat are read on
 * arrival, so they don't add to its unread count.
 */
export function applyMessageToConversations(
  list: Conversation[],
  message: Message,
  me: string,
  activePartnerId: string | null,
): Conversation[] {
  const partnerId = partnerOf(message, me);
  const existing = list.find((c) => c.partner_id === partnerId);
  if (existing && (existing.last_message_id === message.id || compareKeys(message, conversationKey(existing)) < 0)) {
    return list;
  }
  const unread = message.receiver_id === me && !message.is_read && partnerId !== activePartnerId ? 1 : 0;
  const updated: Conversation = {
    partner_id: partnerId,
    partner_name: existing?.partner_name ?? null,
    partner_role: existing?.partner_role ?? null,
    partner_is_verified: existing?.partner_is_verified ?? false,
    last_message_id: message.id,
    last_message_content: message.content,
    last_message_sender_id: message.sender_id,
    last_message_created_at: message.created_at,
    unread_count: (existing?.unread_count ?? 0) + unread,
  };
  return sortConversations([updated, ...list.filter((c) => c.partner_id !== partnerId)]);
}

/** A fetched inbox plus the live messages that arrived while it was loading. */
export function replayMessages(
  snapshot: Conversation[],
  events: Message[],
  me: string,
  activePartnerId: string | null,
): Conversation[] {
  const replayed = events.reduce((list, m) => applyMessageToConversations(list, m, me, activePartnerId), sortConversations(snapshot));
  return activePartnerId ? clearUnread(replayed, activePartnerId) : replayed;
}

export function clearUnread(list: Conversation[], partnerId: string): Conversation[] {
  const row = list.find((c) => c.partner_id === partnerId);
  if (!row || row.unread_count === 0) return list;
  return list.map((c) => (c.partner_id === partnerId ? { ...c, unread_count: 0 } : c));
}

export function patchPartner(
  list: Conversation[],
  profile: { id: string; name: string | null; role?: string | null; is_verified?: boolean | null },
): Conversation[] {
  return list.map((c) =>
    c.partner_id === profile.id
      ? {
          ...c,
          partner_name: profile.name,
          partner_role: profile.role ?? c.partner_role,
          partner_is_verified: profile.is_verified ?? c.partner_is_verified,
        }
      : c,
  );
}

/** The text to send, or null when the draft is empty or too long. */
export function validateDraft(draft: string): string | null {
  const text = draft.trim();
  return text.length > 0 && text.length <= MAX_MESSAGE_LENGTH ? text : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID.test(value);
}

/** A v4 UUID for a new message. crypto.randomUUID needs a secure context, so fall back. */
export function newMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatMessageTime(ts: string): string {
  return toDate(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Time for today's conversations, otherwise the date. */
export function formatConversationTime(ts: string, now: Date = new Date()): string {
  const date = toDate(ts);
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
