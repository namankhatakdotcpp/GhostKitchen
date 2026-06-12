"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Trash2, CheckCheck, ChevronDown } from "lucide-react";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import { useConfigStore } from "@/store/configStore";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotifPage {
  notifications: Notification[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const { isAuthenticated } = useAuthStore();
  const setConfig = useConfigStore((s) => s.setConfig);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<NotifPage>({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) =>
      api
        .get("/notifications", { params: { cursor: pageParam, limit: 20 } })
        .then((r) => r.data),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAuthenticated,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const allNotifications: Notification[] = data?.pages.flatMap((p) => p.notifications) ?? [];
  const unreadCount: number = data?.pages[0]?.unreadCount ?? 0;

  // Real-time: prepend new notification without refetch
  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    try { socket = getSocket(); } catch { return; }

    const onNew = (notif: Notification) => {
      qc.setQueryData<{ pages: NotifPage[] }>(["notifications"], (old) => {
        if (!old?.pages) return old;
        const pages = [...old.pages];
        pages[0] = {
          ...pages[0],
          notifications: [notif, ...pages[0].notifications],
          unreadCount: pages[0].unreadCount + 1,
        };
        return { ...old, pages };
      });
    };

    // Maintenance socket events — show global toast
    const onMaintenanceScheduled = (payload: { title: string; body: string }) => {
      toast(payload.body ?? "Maintenance has been scheduled.", {
        icon: "🔧",
        duration: 8000,
      });
    };
    const onMaintenanceStarted = (payload: { reason?: string }) => {
      toast.error(payload.reason ? `Maintenance: ${payload.reason}` : "Platform maintenance has started.", {
        duration: 10000,
      });
      // Refresh config so maintenance page redirect kicks in
      api.get("/config").then((r) => setConfig(r.data)).catch(() => {});
    };
    const onMaintenanceEnded = () => {
      toast.success("Platform maintenance has ended. You can resume browsing.", { duration: 6000 });
      api.get("/config").then((r) => setConfig(r.data)).catch(() => {});
    };
    const onMaintenanceCancelled = () => {
      toast("Scheduled maintenance has been cancelled.", { icon: "✅", duration: 5000 });
    };

    socket.on("notification:new", onNew);
    socket.on("maintenance:scheduled", onMaintenanceScheduled);
    socket.on("maintenance:started", onMaintenanceStarted);
    socket.on("maintenance:ended", onMaintenanceEnded);
    socket.on("maintenance:cancelled", onMaintenanceCancelled);

    return () => {
      socket?.off("notification:new", onNew);
      socket?.off("maintenance:scheduled", onMaintenanceScheduled);
      socket?.off("maintenance:started", onMaintenanceStarted);
      socket?.off("maintenance:ended", onMaintenanceEnded);
      socket?.off("maintenance:cancelled", onMaintenanceCancelled);
    };
  }, [isAuthenticated, qc, setConfig]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    qc.setQueryData<{ pages: NotifPage[] }>(["notifications"], (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          notifications: page.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
          unreadCount: Math.max(0, page.unreadCount - (page.notifications.find((n) => n.id === id && !n.isRead) ? 1 : 0)),
        })),
      };
    });
  }

  async function deleteNotif(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api.delete(`/notifications/${id}`);
    qc.setQueryData<{ pages: NotifPage[] }>(["notifications"], (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          notifications: page.notifications.filter((n) => n.id !== id),
        })),
      };
    });
  }

  async function deleteAll() {
    await api.delete("/notifications/all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  if (!isAuthenticated) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((p) => !p)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-border bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-text-primary" id="notif-panel-title">Notifications</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  aria-label="Mark all notifications as read"
                  onClick={markAllRead}
                  className="rounded-lg p-1 text-brand hover:bg-brand-light transition"
                >
                  <CheckCheck aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
              {allNotifications.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear all notifications"
                  onClick={deleteAll}
                  className="rounded-lg p-1 text-text-muted hover:bg-red-50 hover:text-red-500 transition"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {allNotifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">No notifications yet</p>
            ) : (
              allNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex w-full items-start gap-2 border-l-2 px-4 py-3 transition hover:bg-[#FAFAFA] ${
                    n.isRead ? "border-transparent" : "border-brand bg-orange-50/40"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Mark "${n.title}" as read`}
                    onClick={() => markRead(n.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-semibold text-text-primary">{n.title}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{n.body}</p>
                    <p className="mt-1 text-[10px] text-text-muted">{timeAgo(n.createdAt)}</p>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete notification: ${n.title}`}
                    onClick={(e) => deleteNotif(n.id, e)}
                    className="mt-1 shrink-0 rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 text-text-muted"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}

            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border py-3 text-xs font-semibold text-brand hover:bg-brand-light transition disabled:opacity-50"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
