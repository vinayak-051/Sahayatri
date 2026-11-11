import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Send, ArrowLeft, Briefcase, WifiOff, RotateCw, CheckCheck } from "lucide-react";
import GuideBottomNav from "@/components/GuideBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";
import { useChatRoute } from "@/hooks/useChatRoute";
import { useChatScroll } from "@/hooks/useChatScroll";
import { MAX_MESSAGE_LENGTH, formatConversationTime, formatMessageTime, validateDraft } from "@/hooks/chatState";

const FALLBACK_NAME = "Traveler";

const ReconnectingNotice = () => (
  <div role="status" className="flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium text-amber-700 bg-amber-500/10">
    <WifiOff size={12} /> Reconnecting…
  </div>
);

const GuideMessenger = () => {
  const { user } = useAuth();
  const { partnerId, nameHint, openChat, closeChat } = useChatRoute("/guide-messages");
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
          <button aria-label="Back to inquiries" onClick={closeChat} className="p-1">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="w-9 h-9 rounded-full gradient-accent flex items-center justify-center text-base font-bold text-white">
            {chat.partner.name[0]}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{chat.partner.name}</h2>
            <p className="text-[10px] text-accent">Traveler • In Chat</p>
          </div>
        </div>
        {chat.connection === "reconnecting" && <ReconnectingNotice />}

        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
          {thread.status === "loading" && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {thread.status === "error" && (
            <div className="text-center py-16">
              <p className="text-xs text-muted-foreground">Couldn't load this conversation right now.</p>
              <button onClick={chat.reloadThread} className="mt-3 text-xs font-semibold text-accent">
                Try again
              </button>
            </div>
          )}
          {thread.status === "ready" && thread.hasMore && (
            <div className="flex justify-center">
              <button
                onClick={chat.loadOlder}
                disabled={thread.loadingOlder}
                className="text-[11px] font-semibold text-accent px-3 py-1.5 rounded-full bg-accent/5 disabled:opacity-50"
              >
                {thread.loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}
          {thread.status === "ready" && thread.messages.length === 0 && (
            <div className="text-center py-16 opacity-40">
              <div className="text-3xl mb-2">💼</div>
              <p className="text-xs">Start the conversation with this traveler</p>
            </div>
          )}
          {thread.messages.map((msg) => {
            const mine = msg.sender_id === user?.id;
            return (
              <motion.div key={msg.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-sm ${mine ? "gradient-accent text-white rounded-br-md" : "glass text-foreground rounded-bl-md border border-accent/10"} ${msg.delivery ? "opacity-70" : ""}`}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={`text-[8px] mt-1 flex items-center gap-1 ${mine ? "text-white/60 justify-end" : "text-muted-foreground"}`}>
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
              placeholder="Reply to traveler..."
              className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button aria-label="Send message" onClick={sendMessage} disabled={!validateDraft(input)} className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center shadow-glow active:scale-95 transition-transform disabled:opacity-40">
              <Send size={20} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleConversations = chat.conversations.filter(
    (c) => !searchQuery || (c.partner_name ?? FALLBACK_NAME).toLowerCase().includes(searchQuery.toLowerCase())
  );
  const unreadChats = chat.conversations.filter((c) => c.unread_count > 0).length;

  return (
    <div className="min-h-screen gradient-sky pb-24">
      {chat.connection === "reconnecting" && <ReconnectingNotice />}
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Business Inquiries</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Travelers reaching out to you</p>
        </div>
        <div className="w-10 h-10 rounded-2xl gradient-accent flex items-center justify-center shadow-glow">
          <Briefcase size={20} className="text-white" />
        </div>
      </div>

      <div className="px-6 mb-5">
        <div className="glass rounded-2xl px-5 py-3 flex items-center justify-between border border-accent/10">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{chat.conversations.length}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Chats</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{unreadChats}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Unread</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-lg font-bold text-accent">✓</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Active</p>
          </div>
        </div>
      </div>

      <div className="px-6 mb-4">
        <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-card border border-primary/5">
          <Search size={18} className="text-muted-foreground" />
          <input placeholder="Search by traveler name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </div>
      </div>

      <div className="px-6 space-y-2">
        {chat.conversationsStatus === "loading" ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chat.conversationsStatus === "error" ? (
          <div className="text-center py-20">
            <p className="text-sm font-medium text-muted-foreground">Couldn't load your inquiries right now.</p>
            <button onClick={chat.reloadConversations} className="mt-3 text-xs font-semibold text-accent">
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
                className="w-full glass rounded-3xl p-4 shadow-card flex items-center gap-3 text-left border border-accent/10 hover:bg-accent/[0.03] transition-colors"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl gradient-accent flex items-center justify-center text-lg font-bold text-white">{name[0]}</div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground truncate">{name}</h3>
                      <span className="text-[8px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">Traveler</span>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{formatConversationTime(c.last_message_created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-80">{c.last_message_content}</p>
                </div>
                {c.unread_count > 0 && <span aria-label={`${c.unread_count} unread`} className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />}
              </motion.button>
            );
          })
        ) : (
          <div className="text-center py-20 opacity-40">
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-medium">{searchQuery ? "No matching inquiries" : "No inquiries yet"}</p>
            <p className="text-[10px] mt-1">When travelers message you, they'll appear here.</p>
          </div>
        )}
      </div>

      <GuideBottomNav />
    </div>
  );
};

export default GuideMessenger;
