import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Send, ArrowLeft, WifiOff, RotateCw, CheckCheck } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";
import { useChatRoute } from "@/hooks/useChatRoute";
import { useChatScroll } from "@/hooks/useChatScroll";
import { MAX_MESSAGE_LENGTH, formatConversationTime, formatMessageTime, validateDraft } from "@/hooks/chatState";

const FALLBACK_NAME = "User";

const ReconnectingNotice = () => (
  <div role="status" className="flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium text-amber-700 bg-amber-500/10">
    <WifiOff size={12} /> Reconnecting…
  </div>
);

const Messages = () => {
  const { user } = useAuth();
  const { partnerId, nameHint, openChat, closeChat } = useChatRoute("/messages");
  const chat = useChat({ partnerId, partnerNameHint: nameHint, fallbackName: FALLBACK_NAME });
  const { thread } = chat;
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { containerRef, onScroll } = useChatScroll(thread.messages, thread.status === "ready", user?.id);

  const sendMessage = () => {
    if (chat.send(input)) setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (chat.partner) {
    return (
      <div className="flex flex-col h-screen gradient-sky overflow-hidden">
        <div className="glass px-4 py-3 flex items-center gap-3 border-b border-border z-10">
          <button aria-label="Back to messages" onClick={closeChat} className="p-1">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
            {chat.partner.name[0]}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{chat.partner.name}</h2>
          </div>
        </div>
        {chat.connection === "reconnecting" && <ReconnectingNotice />}

        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
          {thread.status === "loading" && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {thread.status === "error" && (
            <div className="text-center py-16">
              <p className="text-xs text-muted-foreground">Couldn't load this conversation right now.</p>
              <button onClick={chat.reloadThread} className="mt-3 text-xs font-semibold text-primary">
                Try again
              </button>
            </div>
          )}
          {thread.status === "ready" && thread.hasMore && (
            <div className="flex justify-center">
              <button
                onClick={chat.loadOlder}
                disabled={thread.loadingOlder}
                className="text-[11px] font-semibold text-primary px-3 py-1.5 rounded-full bg-primary/5 disabled:opacity-50"
              >
                {thread.loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}
          {thread.status === "ready" && thread.messages.length === 0 && (
            <div className="text-center py-16 opacity-40">
              <div className="text-3xl mb-2">👋</div>
              <p className="text-xs">Say hello to {chat.partner.name}</p>
            </div>
          )}
          {thread.messages.map((msg) => {
            const mine = msg.sender_id === user?.id;
            return (
              <motion.div key={msg.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-sm ${mine ? "gradient-primary text-primary-foreground rounded-br-md" : "glass text-foreground rounded-bl-md border border-primary/5"} ${msg.delivery ? "opacity-70" : ""}`}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={`text-[8px] mt-1 flex items-center gap-1 ${mine ? "text-primary-foreground/60 justify-end" : "text-muted-foreground"}`}>
                    {msg.delivery === "sending" ? "Sending…" : formatMessageTime(msg.created_at)}
                  </div>
                </div>
                {msg.delivery === "failed" && (
                  <button onClick={() => chat.retry(msg.id)} className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-destructive">
                    <RotateCw size={11} /> Not sent · Retry
                  </button>
                )}
                {msg.id === thread.seenMessageId && (
                  <span className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                    <CheckCheck size={11} /> Seen
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 glass border-t border-border bg-background/80 backdrop-blur-md">
          <div className="max-w-xl mx-auto flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-label="Message"
              placeholder="Type a message..."
              className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button aria-label="Send message" onClick={sendMessage} disabled={!validateDraft(input)} className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow active:scale-95 transition-transform disabled:opacity-40">
              <Send size={20} className="text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleConversations = chat.conversations.filter(
    (c) => !searchQuery || (c.partner_name ?? FALLBACK_NAME).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen gradient-sky pb-24">
      {chat.connection === "reconnecting" && <ReconnectingNotice />}
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Messages</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Chat with verified guides and travel buddies</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl shadow-inner border border-primary/5">🌏</div>
      </div>

      <div className="px-6 mb-6">
        <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-card border border-primary/5">
          <Search size={18} className="text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search guides or buddies..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </div>
      </div>

      <div className="px-6 space-y-2">
        {chat.conversationsStatus === "loading" ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chat.conversationsStatus === "error" ? (
          <div className="text-center py-20">
            <p className="text-sm font-medium text-muted-foreground">Couldn't load your messages right now.</p>
            <button onClick={chat.reloadConversations} className="mt-3 text-xs font-semibold text-primary">
              Try again
            </button>
          </div>
        ) : visibleConversations.length > 0 ? (
          visibleConversations.map((c, i) => {
            const name = c.partner_name ?? FALLBACK_NAME;
            return (
              <motion.button
                key={c.partner_id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => openChat(c.partner_id, c.partner_name)}
                className="w-full glass rounded-3xl p-4 shadow-card flex items-center gap-3 text-left border border-primary/5 hover:bg-white/40 transition-all"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white gradient-primary">{name[0]}</div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground truncate">{name}</h3>
                      {c.partner_role === "guide" && c.partner_is_verified && (
                        <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">Verified</span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{formatConversationTime(c.last_message_created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-80">{c.last_message_content}</p>
                </div>
                {c.unread_count > 0 && <span aria-label={`${c.unread_count} unread`} className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </motion.button>
            );
          })
        ) : (
          <div className="text-center py-20 opacity-40">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm font-medium">{searchQuery ? "No matching chats" : "No messages yet"}</p>
            <p className="text-[10px] mt-1">Start chatting with verified guides or buddies!</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Messages;
