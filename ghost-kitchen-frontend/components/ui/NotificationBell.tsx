"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const notifications: Notification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unreadCount ?? 0;

  // Real-time: add new notification without refetch
  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    try { socket = getSocket(); } catch { return; }
    const handler = (notif: Notification) => {
      queryClient.setQueryData(["notifications"], (old: { notifications: Notification[]; unreadCount: number } | undefined) => {
        if (!old) return old;
        return {
          notifications: [notif, ...old.notifications].slice(0, 20),
          unreadCount: old.unreadCount + 1,
        };
      });
    };
    socket.on("notification:new", handler);
    return () => { socket?.off("notification:new", handler); };
  }, [isAuthenticated, queryClient]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    queryClient.setQueryData(["notifications"], (old: { notifications: Notification[]; unreadCount: number } | undefined) => {
      if (!old) return old;
      return {
        notifications: old.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, old.unreadCount - 1),
      };
    });
  }

  if (!isAuthenticated) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-border bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-text-primary">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">No notifications yet</p>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={`w-full border-l-2 px-4 py-3 text-left transition hover:bg-[#FAFAFA] ${
                    n.isRead ? "border-transparent" : "border-brand bg-orange-50/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary">{n.title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{n.body}</p>
                  <p className="mt-1 text-[10px] text-text-muted">{timeAgo(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
