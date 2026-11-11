import { describe, expect, it } from "vitest";
import type { Message } from "@/types/database";
import {
  type ChatMessage,
  type Conversation,
  addPending,
  applyMessageToConversations,
  applyReadUpdate,
  compareKeys,
  formatConversationTime,
  isUuid,
  markIncomingRead,
  mergeLatestPage,
  mergeMessages,
  mergeOlderPage,
  newMessageId,
  oldestConfirmed,
  replayMessages,
  seenMessageId,
  setDelivery,
  timestampMicros,
  validateDraft,
} from "@/hooks/chatState";

const ME = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CAROL = "00000000-0000-4000-8000-00000000000c";

// Message n is sent at 10:00 plus n seconds (plus microseconds, as Postgres reports them).
const at = (n: number) => `2026-11-09T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000123+00:00`;
const msg = (n: number, from = BOB, to = ME, extra: Partial<Message> = {}): Message => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  sender_id: from,
  receiver_id: to,
  content: `message ${n}`,
  is_read: false,
  created_at: at(n),
  ...extra,
});
const ids = (messages: { id: string }[]) => messages.map((m) => Number(m.id.slice(-12)));
const newestFirst = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(to - i));

describe("timestamps and ordering", () => {
  it("keeps the microseconds Postgres sends and accepts any offset format", () => {
    expect(timestampMicros("2026-11-09T10:00:00.000002+00:00") - timestampMicros("2026-11-09T10:00:00.000001+00:00")).toBe(1);
    expect(timestampMicros("2026-11-09T15:30:00+05:30")).toBe(timestampMicros("2026-11-09T10:00:00Z"));
    expect(timestampMicros("2026-11-09 10:00:00.5+00")).toBe(timestampMicros("2026-11-09T10:00:00.500Z"));
  });

  it("orders by created_at, then id, like the database", () => {
    const a = { created_at: at(1), id: "b" };
    expect(compareKeys(a, { created_at: at(2), id: "a" })).toBe(-1);
    expect(compareKeys(a, { created_at: at(1), id: "c" })).toBe(-1);
    expect(compareKeys(a, { ...a })).toBe(0);
  });
});

describe("mergeMessages", () => {
  it("de-duplicates by id and sorts confirmed messages", () => {
    const merged = mergeMessages([msg(1), msg(3)], [msg(2), msg(3), msg(0)]);
    expect(ids(merged)).toEqual([0, 1, 2, 3]);
  });

  it("replaces an optimistic bubble with the server row and keeps unsent ones last", () => {
    const sending: ChatMessage = { ...msg(9, ME, BOB), created_at: "2099-01-01T00:00:00.000Z", delivery: "sending" };
    const failed: ChatMessage = { ...msg(8, ME, BOB), delivery: "failed" };
    let thread = addPending(addPending([msg(1)], sending), failed);
    thread = setDelivery(thread, failed.id, "failed");
    expect(ids(thread)).toEqual([1, 9, 8]);

    const echo = msg(9, ME, BOB, { created_at: at(5) });
    thread = mergeMessages(thread, [msg(6), echo]);
    expect(ids(thread)).toEqual([1, 9, 6, 8]);
    expect(thread.find((m) => m.id === echo.id)?.delivery).toBeUndefined();
    expect(thread.find((m) => m.id === failed.id)?.delivery).toBe("failed");
  });

  it("never turns a read message back to unread from a stale fetch", () => {
    const read = mergeMessages([msg(1, BOB, ME, { is_read: true })], [msg(1)]);
    expect(read[0].is_read).toBe(true);
  });

  it("only changes the delivery of messages that are still unconfirmed", () => {
    expect(setDelivery([msg(1)], msg(1).id, "failed")[0].delivery).toBeUndefined();
    expect(addPending([msg(1)], { ...msg(1) })).toHaveLength(1);
  });
});

describe("thread pages", () => {
  it("reports whether older messages exist from the extra row", () => {
    expect(mergeLatestPage([], newestFirst(1, 10), { pageSize: 10, anchor: null, hasMore: null })).toMatchObject({ hasMore: false });
    const full = mergeLatestPage([], newestFirst(0, 10), { pageSize: 10, anchor: null, hasMore: null });
    expect(full.hasMore).toBe(true);
    expect(ids(full.messages)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps live messages that arrived while the first page was loading", () => {
    const merged = mergeLatestPage([msg(21)], newestFirst(10, 20), { pageSize: 10, anchor: null, hasMore: null });
    expect(ids(merged.messages)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(merged.hasMore).toBe(true);
  });

  it("joins a resync to loaded history when the pages overlap", () => {
    const loaded = mergeMessages([], newestFirst(1, 15));
    const merged = mergeLatestPage(loaded, newestFirst(9, 19), { pageSize: 10, anchor: { created_at: at(15), id: msg(15).id }, hasMore: false });
    expect(ids(merged.messages)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(merged).toMatchObject({ hasMore: false, reset: false });
  });

  it("drops history it can't join after a long disconnect, keeping newer live and unsent messages", () => {
    const pending: ChatMessage = { ...msg(99, ME, BOB), delivery: "failed" };
    const loaded = [...mergeMessages([], newestFirst(1, 5)), msg(60), pending];
    const merged = mergeLatestPage(loaded, newestFirst(40, 50), { pageSize: 10, anchor: { created_at: at(5), id: msg(5).id }, hasMore: false });
    expect(ids(merged.messages)).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 60, 99]);
    expect(merged).toMatchObject({ hasMore: true, reset: true });
  });

  it("treats a thread that was empty when the connection dropped as having no history to keep", () => {
    const merged = mergeLatestPage([], newestFirst(0, 10), { pageSize: 10, anchor: "start", hasMore: false });
    expect(merged).toMatchObject({ hasMore: true, reset: true });
  });

  it("prepends older pages and uses the oldest confirmed message as the cursor", () => {
    const thread = mergeMessages([], newestFirst(10, 12));
    expect(oldestConfirmed(thread)).toEqual({ created_at: at(10), id: msg(10).id });
    const older = mergeOlderPage(thread, newestFirst(7, 9), 3);
    expect(ids(older.messages)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(older.hasMore).toBe(false);
    expect(mergeOlderPage(thread, newestFirst(5, 9), 4).hasMore).toBe(true);
  });
});

describe("read state", () => {
  it("marks only received messages read and shows Seen under my latest read message", () => {
    const thread = mergeMessages([], [msg(1), msg(2, ME, BOB), msg(3, ME, BOB)]);
    const marked = markIncomingRead(thread, ME);
    expect(marked.map((m) => m.is_read)).toEqual([true, false, false]);
    expect(seenMessageId(marked, ME)).toBeNull();

    const afterUpdate = applyReadUpdate(marked, { ...msg(3, ME, BOB), is_read: true });
    expect(seenMessageId(afterUpdate, ME)).toBe(msg(3).id);
    expect(applyReadUpdate(afterUpdate, { ...msg(3, ME, BOB), is_read: true })).toBe(afterUpdate);
  });

  it("ignores unsent bubbles when finding my latest message", () => {
    const thread: ChatMessage[] = [msg(1, ME, BOB, { is_read: true }), { ...msg(2, ME, BOB), delivery: "sending" }];
    expect(seenMessageId(thread, ME)).toBe(msg(1).id);
  });
});

const conversation = (partner: string, n: number, unread: number, from = partner): Conversation => ({
  partner_id: partner,
  partner_name: partner === BOB ? "Bob" : "Carol",
  partner_role: "traveler",
  partner_is_verified: false,
  last_message_id: msg(n).id,
  last_message_content: `message ${n}`,
  last_message_sender_id: from,
  last_message_created_at: at(n),
  unread_count: unread,
});

describe("conversation list", () => {
  const inbox = [conversation(CAROL, 5, 0), conversation(BOB, 3, 1)];

  it("moves a conversation to the top with the new message and counts it unread", () => {
    const next = applyMessageToConversations(inbox, msg(6), ME, null);
    expect(next.map((c) => c.partner_id)).toEqual([BOB, CAROL]);
    expect(next[0]).toMatchObject({ last_message_content: "message 6", unread_count: 2, partner_name: "Bob" });
  });

  it("does not count my own messages or the open chat's messages as unread", () => {
    expect(applyMessageToConversations(inbox, msg(6, ME, BOB), ME, null)[0].unread_count).toBe(1);
    expect(applyMessageToConversations(inbox, msg(6), ME, BOB)[0].unread_count).toBe(1);
  });

  it("is idempotent, so an echo or an older message changes nothing", () => {
    const once = applyMessageToConversations(inbox, msg(6), ME, null);
    expect(applyMessageToConversations(once, msg(6), ME, null)).toBe(once);
    expect(applyMessageToConversations(once, msg(2), ME, null)).toBe(once);
  });

  it("adds a row for a new partner, to be filled in with their profile", () => {
    const stranger = "00000000-0000-4000-8000-0000000000dd";
    const next = applyMessageToConversations(inbox, msg(7, stranger, ME), ME, null);
    expect(next[0]).toMatchObject({ partner_id: stranger, partner_name: null, unread_count: 1 });
  });

  it("replays live messages onto a fresh snapshot without double counting", () => {
    // msg 4 was already in the snapshot, msg 6 arrived after it was taken.
    const snapshot = [conversation(BOB, 4, 2), conversation(CAROL, 5, 0)];
    const next = replayMessages(snapshot, [msg(4), msg(6)], ME, null);
    expect(next[0]).toMatchObject({ partner_id: BOB, last_message_content: "message 6", unread_count: 3 });
    expect(replayMessages(snapshot, [], ME, BOB).find((c) => c.partner_id === BOB)?.unread_count).toBe(0);
  });
});

describe("helpers", () => {
  it("trims drafts and rejects empty or oversized ones", () => {
    expect(validateDraft("  hi  ")).toBe("hi");
    expect(validateDraft("   ")).toBeNull();
    expect(validateDraft("x".repeat(2001))).toBeNull();
    expect(validateDraft(` ${"x".repeat(2000)} `)).toHaveLength(2000);
  });

  it("generates UUIDs and recognises them", () => {
    expect(isUuid(newMessageId())).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("shows the time for today's conversations and the date otherwise", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    expect(formatConversationTime("2026-11-09T11:00:00+00:00", now)).toMatch(/\d/);
    expect(formatConversationTime("2026-11-09T11:00:00+00:00", now)).toBe(
      new Date("2026-11-09T11:00:00Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    expect(formatConversationTime("2026-10-01T11:00:00+00:00", now)).toBe(
      new Date("2026-10-01T11:00:00Z").toLocaleDateString([], { month: "short", day: "numeric" }),
    );
  });
});
