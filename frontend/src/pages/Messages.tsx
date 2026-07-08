import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Send, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import type { Message } from "@/types/database";

interface Conversation {
  userId: string;
  userName: string;
  isVerifiedGuide: boolean;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

const Messages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeChat, setActiveChat] = useState<{ id: string; name: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConversations(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    if (error || !data) {
      console.error("Failed to fetch conversations:", error?.message);
      toast.error("Couldn't load your messages right now.");
      setLoadingConversations(false);
      return;
    }

    const byPartner = new Map<string, Message>();
    const unreadByPartner = new Set<string>();
    for (const m of data as Message[]) {
      const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!byPartner.has(partnerId)) byPartner.set(partnerId, m);
      if (m.receiver_id === user.id && !m.is_read) unreadByPartner.add(partnerId);
    }

    const partnerIds = Array.from(byPartner.keys());
    if (partnerIds.length === 0) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }
    const { data: profiles } = await supabase.from("profiles").select("id, name, role, is_verified").in("id", partnerIds);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    setConversations(
      partnerIds.map((id) => {
        const m = byPartner.get(id)!;
        const p = profileById.get(id);
        return {
          userId: id,
          userName: p?.name || "User",
          isVerifiedGuide: p?.role === "guide" && !!p?.is_verified,
          lastMessage: m.content,
          timestamp: m.created_at,
          unread: unreadByPartner.has(id),
        };
      })
    );
    setLoadingConversations(false);
  }, [user]);

  const fetchMessages = useCallback(
    async (partnerId: string) => {
      if (!user) return;
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (!error) {
        setMessages((data ?? []) as Message[]);
        setTimeout(scrollToBottom, 100);
      } else {
        console.error("Failed to fetch messages:", error.message);
        toast.error("Couldn't load this conversation right now.");
      }
      setLoadingMessages(false);
      await supabase.from("messages").update({ is_read: true }).eq("sender_id", partnerId).eq("receiver_id", user.id).eq("is_read", false);
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        fetchConversations();
        setActiveChat((current) => {
          if (current && (msg.sender_id === current.id || msg.receiver_id === current.id)) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            setTimeout(scrollToBottom, 100);
          }
          return current;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeChat) fetchMessages(activeChat.id);
  }, [activeChat, fetchMessages]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userId = params.get("userId");
    const userName = params.get("userName");
    if (userId && userName) setActiveChat({ id: userId, name: userName });
  }, [location]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChat || !user) return;
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, receiver_id: activeChat.id, content });
    if (error) {
      console.error("Failed to send message:", error.message);
      toast.error("Message failed to send.");
      setInput(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (activeChat) {
    return (
      <div className="flex flex-col h-screen gradient-sky overflow-hidden">
        <div className="glass px-4 py-3 flex items-center gap-3 border-b border-border z-10">
          <button aria-label="Back to messages" onClick={() => { setActiveChat(null); navigate("/messages"); }} className="p-1">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
            {activeChat.name[0]}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{activeChat.name}</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
          {loadingMessages && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-sm ${msg.sender_id === user?.id ? "gradient-primary text-primary-foreground rounded-br-md" : "glass text-foreground rounded-bl-md border border-primary/5"}`}>
                <p>{msg.content}</p>
                <div className={`text-[8px] mt-1 flex items-center gap-1 ${msg.sender_id === user?.id ? "text-primary-foreground/60 justify-end" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 glass border-t border-border bg-background/80 backdrop-blur-md">
          <div className="max-w-xl mx-auto flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button aria-label="Send message" onClick={sendMessage} className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow active:scale-95 transition-transform">
              <Send size={20} className="text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-sky pb-24">
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
        {loadingConversations ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.filter((c) => !searchQuery || c.userName.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
          conversations.filter((c) => !searchQuery || c.userName.toLowerCase().includes(searchQuery.toLowerCase())).map((c, i) => (
            <motion.button
              key={c.userId}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveChat({ id: c.userId, name: c.userName })}
              className="w-full glass rounded-3xl p-4 shadow-card flex items-center gap-3 text-left border border-primary/5 hover:bg-white/40 transition-all"
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white gradient-primary">{c.userName[0]}</div>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground truncate">{c.userName}</h3>
                    {c.isVerifiedGuide && (
                      <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">Verified</span>
                    )}
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">
                    {new Date(c.timestamp).toLocaleDateString() === new Date().toLocaleDateString()
                      ? new Date(c.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : new Date(c.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-80">{c.lastMessage}</p>
              </div>
              {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
            </motion.button>
          ))
        ) : (
          <div className="text-center py-20 opacity-40">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-[10px] mt-1">Start chatting with verified guides or buddies!</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Messages;
