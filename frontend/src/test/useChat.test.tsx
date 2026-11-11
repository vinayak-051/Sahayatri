import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types/database";
import { useChat } from "@/hooks/useChat";

const ME = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

type Result = { data: unknown; error: { code?: string; message: string } | null };
type Listener = { filter: { event: string; filter: string }; callback: (payload: unknown) => void };

const state = vi.hoisted(() => ({
  rpc: {} as Record<string, (args: unknown) => Result>,
  rpcCalls: [] as { name: string; args: unknown }[],
  inserts: [] as Record<string, unknown>[],
  insertResults: [] as Result[],
  updates: [] as { values: unknown; filters: unknown[][] }[],
  channels: [] as { topic: string; listeners: Listener[]; status?: (status: string, err?: Error) => void }[],
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: state.toastError } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: ME } }) }));

vi.mock("@/lib/supabaseClient", () => {
  // A chainable stand-in for the query builder: filters are recorded, awaiting resolves `result`.
  const builder = (result: () => Result, onFilter: (args: unknown[]) => void = () => {}) => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "eq", "not", "in"]) {
      q[name] = (...args: unknown[]) => {
        if (name !== "select") onFilter([name, ...args]);
        return q;
      };
    }
    q.single = () => Promise.resolve(result());
    q.maybeSingle = () => Promise.resolve(result());
    q.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      rpc: (name: string, args: unknown) => {
        state.rpcCalls.push({ name, args });
        return Promise.resolve(state.rpc[name]?.(args) ?? { data: [], error: null });
      },
      from: (table: string) => ({
        select: () => builder(() => ({ data: table === "profiles" ? { id: BOB, name: "Bob" } : null, error: null })),
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          const result = state.insertResults.shift() ?? { data: null, error: { message: "no result queued" } };
          return builder(() => result);
        },
        update: (values: unknown) => {
          const entry = { values, filters: [] as unknown[][] };
          state.updates.push(entry);
          return builder(() => ({ data: null, error: null }), (f) => entry.filters.push(f));
        },
      }),
      channel: (topic: string) => {
        const record = { topic, listeners: [] as Listener[], status: undefined as ((s: string, e?: Error) => void) | undefined };
        state.channels.push(record);
        const channel = {
          on: (_type: string, filter: Listener["filter"], callback: Listener["callback"]) => {
            record.listeners.push({ filter, callback });
            return channel;
          },
          subscribe: (cb: (s: string, e?: Error) => void) => {
            record.status = cb;
            return channel;
          },
        };
        return channel;
      },
      removeChannel: vi.fn(() => Promise.resolve("ok")),
    },
  };
});

const message = (n: number, from = BOB, to = ME, extra: Partial<Message> = {}): Message => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  sender_id: from,
  receiver_id: to,
  content: `message ${n}`,
  is_read: false,
  created_at: `2026-11-09T10:00:${String(n).padStart(2, "0")}.000001+00:00`,
  ...extra,
});

const bobConversation = {
  partner_id: BOB,
  partner_name: "Bob",
  partner_role: "guide",
  partner_is_verified: true,
  last_message_id: message(1).id,
  last_message_content: "message 1",
  last_message_sender_id: BOB,
  last_message_created_at: message(1).created_at,
  unread_count: 1,
};

const channel = () => state.channels[state.channels.length - 1];
const emit = (eventType: "INSERT" | "UPDATE", row: Message) =>
  act(() => {
    // The realtime server delivers each change to the listener whose filter matches it.
    const listener = channel().listeners.find((l) => l.filter.filter === (row.receiver_id === ME ? `receiver_id=eq.${ME}` : `sender_id=eq.${ME}`));
    listener?.callback({ eventType, new: row, old: { id: row.id } });
  });
const setStatus = (status: string) => act(() => channel().status?.(status));
const calls = (name: string) => state.rpcCalls.filter((c) => c.name === name).length;

beforeEach(() => {
  state.rpc = { my_conversations: () => ({ data: [bobConversation], error: null }) };
  state.rpcCalls = [];
  state.inserts = [];
  state.insertResults = [];
  state.updates = [];
  state.channels = [];
  state.toastError.mockReset();
});

describe("useChat realtime", () => {
  it("listens on one channel for messages to and from me, and resyncs on every (re)subscribe", async () => {
    const { result, unmount } = renderHook(() => useChat({ partnerId: null, fallbackName: "User" }));
    await waitFor(() => expect(result.current.conversationsStatus).toBe("ready"));

    expect(state.channels).toHaveLength(1);
    expect(channel().listeners.map((l) => [l.filter.event, l.filter.filter])).toEqual([
      ["*", `receiver_id=eq.${ME}`],
      ["*", `sender_id=eq.${ME}`],
    ]);

    setStatus("SUBSCRIBED");
    expect(result.current.connection).toBe("live");
    await waitFor(() => expect(calls("my_conversations")).toBe(2));

    setStatus("CHANNEL_ERROR");
    expect(result.current.connection).toBe("reconnecting");
    setStatus("SUBSCRIBED");
    expect(result.current.connection).toBe("live");
    await waitFor(() => expect(calls("my_conversations")).toBe(3));

    unmount();
    const { supabase } = await import("@/lib/supabaseClient");
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it("updates the inbox from live messages without refetching it", async () => {
    const { result } = renderHook(() => useChat({ partnerId: null, fallbackName: "User" }));
    await waitFor(() => expect(result.current.conversationsStatus).toBe("ready"));

    emit("INSERT", message(2));
    emit("INSERT", message(2));
    expect(result.current.conversations[0]).toMatchObject({ last_message_content: "message 2", unread_count: 2 });
    expect(calls("my_conversations")).toBe(1);
  });

  it("opens a chat, marks what arrives read, and shows Seen when my message is read", async () => {
    state.rpc.conversation_messages = () => ({ data: [message(1)], error: null });
    const { result } = renderHook(() => useChat({ partnerId: BOB, fallbackName: "User" }));
    await waitFor(() => expect(result.current.thread.status).toBe("ready"));
    expect(result.current.partner).toEqual({ id: BOB, name: "Bob" });
    expect(state.rpcCalls.find((c) => c.name === "conversation_messages")?.args).toMatchObject({ p_partner_id: BOB, p_limit: 51 });

    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0].values).toEqual({ is_read: true });
    expect(state.updates[0].filters).toEqual([
      ["eq", "sender_id", BOB],
      ["eq", "receiver_id", ME],
      ["eq", "is_read", false],
    ]);
    expect(result.current.thread.messages[0].is_read).toBe(true);

    emit("INSERT", message(2));
    await waitFor(() => expect(state.updates).toHaveLength(2));

    const mine = message(3, ME, BOB);
    emit("INSERT", mine);
    expect(result.current.thread.seenMessageId).toBeNull();
    emit("UPDATE", { ...mine, is_read: true });
    expect(result.current.thread.seenMessageId).toBe(mine.id);
  });

  it("sends optimistically, marks a failed send, and retries it with the same id", async () => {
    state.rpc.conversation_messages = () => ({ data: [], error: null });
    const { result } = renderHook(() => useChat({ partnerId: BOB, fallbackName: "User" }));
    await waitFor(() => expect(result.current.thread.status).toBe("ready"));

    expect(result.current.send("   ")).toBe(false);
    expect(state.inserts).toHaveLength(0);

    state.insertResults.push({ data: null, error: { code: "P0001", message: "Rate limit exceeded: too many messages, slow down." } });
    act(() => {
      expect(result.current.send("  Hello Bob  ")).toBe(true);
    });
    expect(result.current.thread.messages[0]).toMatchObject({ content: "Hello Bob", delivery: "sending" });
    await waitFor(() => expect(result.current.thread.messages[0].delivery).toBe("failed"));
    expect(state.toastError).toHaveBeenCalledWith("Rate limit exceeded: too many messages, slow down.");

    const sent = state.inserts[0];
    expect(Object.keys(sent).sort()).toEqual(["content", "id", "receiver_id", "sender_id"]);
    const saved = message(5, ME, BOB, { id: sent.id as string, content: "Hello Bob" });
    state.insertResults.push({ data: saved, error: null });
    act(() => result.current.retry(sent.id as string));
    await waitFor(() => expect(result.current.thread.messages[0].delivery).toBeUndefined());
    expect(state.inserts[1].id).toBe(sent.id);

    emit("INSERT", saved);
    expect(result.current.thread.messages).toHaveLength(1);
    expect(result.current.conversations[0]).toMatchObject({ last_message_content: "Hello Bob", unread_count: 0 });
  });

  it("looks up the partner's name when the link only carries their id", async () => {
    state.rpc.my_conversations = () => ({ data: [], error: null });
    state.rpc.conversation_messages = () => ({ data: [], error: null });
    const { result } = renderHook(() => useChat({ partnerId: BOB, fallbackName: "User" }));
    expect(result.current.partner?.name).toBe("User");
    await waitFor(() => expect(result.current.partner?.name).toBe("Bob"));
  });

  it("shows an error state when the inbox can't load", async () => {
    state.rpc.my_conversations = () => ({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useChat({ partnerId: null, fallbackName: "User" }));
    await waitFor(() => expect(result.current.conversationsStatus).toBe("error"));
  });
});
