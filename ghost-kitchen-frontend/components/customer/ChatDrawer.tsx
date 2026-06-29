"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";

type Message = {
  id: string;
  senderId: string;
  senderRole: string;
  message: string;
  createdAt: string;
  sender: { id: string; name: string; imageUrl: string | null };
};

export function ChatDrawer({ orderId, open, onClose }: { orderId: string; open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.get(`/orders/${orderId}/chat`)
      .then((r) => setMessages(r.data.messages ?? []))
      .catch(() => toast.error("Could not load chat"));
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return;
    const socket = getSocket();
    const room = `order-${orderId}`;

    function handleConnect() { socket.emit("join-room", room); }
    function handleMsg(msg: Message) {
      setMessages((prev) => [...prev, msg]);
      if (!open) setUnread((n) => n + 1);
    }

    socket.on("connect", handleConnect);
    socket.on("chat:message", handleMsg);
    socket.connect();

    return () => {
      socket.emit("leave-room", room);
      socket.off("connect", handleConnect);
      socket.off("chat:message", handleMsg);
    };
  }, [orderId, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      api.post(`/orders/${orderId}/chat/read`).catch(() => {});
    }
  }, [open, orderId]);

  async function send() {
    if (!input.trim()) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    try {
      await api.post(`/orders/${orderId}/chat`, { message: text });
    } catch {
      toast.error("Could not send message");
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating chat button when closed */}
      {!open && (
        <button
          onClick={() => onClose()}
          className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg text-white hover:bg-brand/90 transition"
          type="button"
        >
          <MessageSquare className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[11px] font-bold text-white flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ y: 0, opacity: 1 }}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white rounded-t-3xl shadow-xl max-h-[70vh]"
            exit={{ y: "100%", opacity: 0 }}
            initial={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brand" />
                <p className="font-bold text-[#1C1C1C]">Chat with rider</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-surface" type="button">
                <X className="h-5 w-5 text-[#686B78]" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-[#686B78] py-8">No messages yet. Say hello!</p>
              ) : messages.map((m) => {
                const isMe = m.senderId === user?.id;
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? "bg-brand text-white rounded-br-sm" : "bg-surface text-[#1C1C1C] rounded-bl-sm"}`}>
                      {!isMe && <p className="text-[10px] font-semibold text-[#686B78] mb-0.5">{m.sender.name}</p>}
                      <p className="text-sm leading-snug">{m.message}</p>
                      <p className={`text-[10px] mt-1 ${isMe ? "text-white/70" : "text-[#686B78]"}`}>
                        {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type a message…"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="rounded-xl bg-brand p-2.5 text-white hover:bg-brand/90 disabled:opacity-60 transition"
                type="button"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ChatButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[#1C1C1C] hover:bg-surface transition"
        type="button"
      >
        <MessageSquare className="h-4 w-4 text-brand" />
        Chat with rider
      </button>
      <ChatDrawer orderId={orderId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
