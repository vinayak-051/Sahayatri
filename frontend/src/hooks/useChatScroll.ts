// Keeps a chat thread scrolled sensibly: to the bottom when it opens, along with
// new messages while the reader is at the bottom (or sent them), and in place
// when earlier messages are added above.
import { useCallback, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "./chatState";

const NEAR_BOTTOM_PX = 120;

export function useChatScroll(messages: ChatMessage[], ready: boolean, me: string | undefined) {
  const containerRef = useRef<HTMLDivElement>(null);
  const last = useRef({ firstId: undefined as string | undefined, lastId: undefined as string | undefined, height: 0, ready: false });
  const nearBottom = useRef(true);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      last.current = { firstId: undefined, lastId: undefined, height: 0, ready: false };
      return;
    }
    const prev = last.current;
    const firstId = messages[0]?.id;
    const newest = messages[messages.length - 1];
    if (ready && !prev.ready) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
    } else if (newest && newest.id !== prev.lastId) {
      if (nearBottom.current || newest.sender_id === me) el.scrollTo?.({ top: el.scrollHeight, behavior: "smooth" });
    } else if (firstId !== prev.firstId && prev.height > 0) {
      el.scrollTop += el.scrollHeight - prev.height;
    }
    last.current = { firstId, lastId: newest?.id, height: el.scrollHeight, ready };
  }, [messages, ready, me]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  return { containerRef, onScroll };
}
