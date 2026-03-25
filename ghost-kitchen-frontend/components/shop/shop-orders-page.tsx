"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getShopOrdersBoardData } from "@/lib/opsData";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import type { ShopBoardItem } from "@/types";

const columns = [
  { key: "new", label: "New Orders", headerClass: "bg-danger text-white" },
  { key: "preparing", label: "Preparing", headerClass: "bg-warning text-white" },
  { key: "ready", label: "Ready for Pickup", headerClass: "bg-[#2E6BFF] text-white" },
  { key: "completed", label: "Completed", headerClass: "bg-success text-white" },
] as const;

type ShopOrderEvent = ShopBoardItem;

function useCountdownLabel(targetDate?: string) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetDate) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [targetDate]);

  if (!targetDate) {
    return { secondsLeft: null, progress: 0 };
  }

  const total = Math.max(new Date(targetDate).getTime() - now, 0);
  return {
    secondsLeft: Math.floor(total / 1000),
    progress: total / (3 * 60 * 1000),
  };
}

function minutesSince(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  return `${minutes}m ago`;
}

function playChime() {
  const AudioContextClass =
    window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.45);
}

function OrderCard({
  order,
  onAccept,
  onReject,
  onReady,
  onPrepTimeChange,
}: {
  order: ShopBoardItem;
  onAccept: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onReady: (orderId: string) => void;
  onPrepTimeChange: (orderId: string, minutes: number) => void;
}) {
  const countdown = useCountdownLabel(order.autoRejectAt);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (countdown.progress ?? 0));

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="relative rounded-[20px] border border-border bg-white p-4 shadow-[0_16px_32px_rgba(28,28,28,0.06)]"
      initial={order.status === "new" ? { opacity: 0, y: -20, scale: 0.96 } : { opacity: 0, y: 10 }}
      transition={
        order.status === "new"
          ? { type: "spring", stiffness: 420, damping: 24 }
          : { duration: 0.22, ease: "easeOut" }
      }
    >
      {order.status === "new" ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 160 160">
          <rect x="8" y="8" width="144" height="144" rx="20" ry="20" fill="none" opacity="0.12" stroke="#FF5200" strokeWidth="3" />
          <circle
            cx="80"
            cy="80"
            fill="none"
            r={radius}
            stroke="#FF5200"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth="4"
            transform="translate(0 0)"
          />
        </svg>
      ) : null}

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary">{order.customerName}</h3>
            <p className="mt-1 text-xs text-text-secondary">{minutesSince(order.placedAt)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-text-primary">₹{order.totalAmount}</p>
            {order.status === "new" && countdown.secondsLeft !== null ? (
              <p className="mt-1 text-xs font-semibold text-danger">
                {Math.max(Math.floor(countdown.secondsLeft / 60), 0)}:
                {String(Math.max(countdown.secondsLeft % 60, 0)).padStart(2, "0")} to auto-reject
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-1 text-sm text-text-secondary">
          {order.itemsSummary.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>

        {order.status === "new" ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="h-11 rounded-[14px] bg-success text-sm font-bold text-white"
              onClick={() => onAccept(order.id)}
              type="button"
            >
              Accept
            </button>
            <button
              className="h-11 rounded-[14px] bg-danger text-sm font-bold text-white"
              onClick={() => onReject(order.id)}
              type="button"
            >
              Reject
            </button>
          </div>
        ) : null}

        {order.status === "preparing" ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[5, 10, 15, 20, 30].map((minutes) => (
                <button
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-xs font-semibold transition",
                    order.prepTimeMinutes === minutes
                      ? "border-brand bg-brand-light text-brand"
                      : "border-border bg-white text-text-secondary",
                  )}
                  key={minutes}
                  onClick={() => onPrepTimeChange(order.id, minutes)}
                  type="button"
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <Button className="h-11 w-full rounded-[14px]" onClick={() => onReady(order.id)}>
              Mark Ready
            </Button>
          </div>
        ) : null}

        {order.status === "ready" ? (
          <div className="mt-5 rounded-[14px] bg-[#F7F9FF] px-4 py-3 text-sm text-text-secondary">
            {order.assignedAgentName
              ? `Assigned to ${order.assignedAgentName}`
              : "Waiting for delivery agent assignment"}
          </div>
        ) : null}

        {order.status === "completed" ? (
          <div className="mt-5 rounded-[14px] bg-success/8 px-4 py-3 text-sm text-success">
            Completed and handed off successfully.
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function ShopOrdersPage() {
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["shop-orders-board"],
    queryFn: getShopOrdersBoardData,
  });

  useEffect(() => {
    if (!boardQuery.data) return;

    const intervalId = window.setInterval(() => {
      queryClient.setQueryData<ShopBoardItem[] | undefined>(["shop-orders-board"], (current) =>
        current?.filter((item) => {
          if (item.status !== "new" || !item.autoRejectAt) {
            return item.status !== "completed" || Date.now() - new Date(item.placedAt).getTime() < 2 * 60 * 60 * 1000;
          }

          const shouldKeep = new Date(item.autoRejectAt).getTime() > Date.now();

          if (!shouldKeep) {
            setBanner(`Order ${item.id} auto-rejected after 3 minutes.`);
          }

          return shouldKeep;
        }),
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [boardQuery.data, queryClient]);

  useEffect(() => {
    const socket = getSocket();
    const room = "shop-ghost-biryani-house";

    function maybeNotify(order: ShopBoardItem) {
      if (soundEnabled) {
        playChime();
      }

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("New GhostKitchen order", {
          body: `${order.customerName} • ₹${order.totalAmount}`,
        });
      }
    }

    function handleOrderNew(order: ShopOrderEvent) {
      queryClient.setQueryData<ShopBoardItem[] | undefined>(["shop-orders-board"], (current = []) => [
        { ...order, status: "new", autoRejectAt: new Date(Date.now() + 3 * 60 * 1000).toISOString() },
        ...current,
      ]);
      setBanner(`New order ${order.id} received.`);
      maybeNotify(order);
    }

    function handleAgentAssigned(payload: { orderId: string; agentName: string }) {
      queryClient.setQueryData<ShopBoardItem[] | undefined>(["shop-orders-board"], (current = []) =>
        current.map((item) =>
          item.id === payload.orderId ? { ...item, assignedAgentName: payload.agentName } : item,
        ),
      );
    }

    function handlePickedUp(payload: { orderId: string }) {
      queryClient.setQueryData<ShopBoardItem[] | undefined>(["shop-orders-board"], (current = []) =>
        current.map((item) =>
          item.id === payload.orderId ? { ...item, status: "completed" } : item,
        ),
      );
    }

    function handleConnect() {
      socket.emit("join-room", room);
    }

    socket.on("connect", handleConnect);
    socket.on("order:new", handleOrderNew);
    socket.on("agent:assigned", handleAgentAssigned);
    socket.on("order:picked-up", handlePickedUp);
    socket.connect();

    return () => {
      socket.emit("leave-room", room);
      socket.off("connect", handleConnect);
      socket.off("order:new", handleOrderNew);
      socket.off("agent:assigned", handleAgentAssigned);
      socket.off("order:picked-up", handlePickedUp);
      socket.disconnect();
    };
  }, [queryClient, soundEnabled]);

  function updateBoard(mutator: (item: ShopBoardItem) => ShopBoardItem | null) {
    queryClient.setQueryData<ShopBoardItem[] | undefined>(["shop-orders-board"], (current = []) =>
      current
        .map(mutator)
        .filter((item): item is ShopBoardItem => Boolean(item)),
    );
  }

  function acceptOrder(orderId: string) {
    updateBoard((item) =>
      item.id === orderId
        ? { ...item, status: "preparing", prepTimeMinutes: 15, autoRejectAt: undefined }
        : item,
    );
  }

  function rejectOrder(orderId: string) {
    updateBoard((item) => (item.id === orderId ? null : item));
    setBanner(`Order ${orderId} rejected.`);
  }

  function markReady(orderId: string) {
    updateBoard((item) =>
      item.id === orderId ? { ...item, status: "ready" } : item,
    );
  }

  function updatePrepTime(orderId: string, minutes: number) {
    updateBoard((item) =>
      item.id === orderId ? { ...item, prepTimeMinutes: minutes } : item,
    );
  }

  const board = boardQuery.data ?? [];
  const grouped = useMemo(
    () => ({
      new: board.filter((item) => item.status === "new"),
      preparing: board.filter((item) => item.status === "preparing"),
      ready: board.filter((item) => item.status === "ready"),
      completed: board.filter((item) => item.status === "completed"),
    }),
    [board],
  );

  async function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);

    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="mx-auto max-w-[1540px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Live operations
            </p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Orders board</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Accept, prepare, and hand off orders in real time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-4 py-2.5 text-sm font-semibold transition",
                soundEnabled
                  ? "border-brand bg-brand-light text-brand"
                  : "border-border bg-white text-text-secondary",
              )}
              onClick={() => {
                void toggleSound();
              }}
              type="button"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Sound {soundEnabled ? "On" : "Off"}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {banner ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[16px] border border-brand/20 bg-brand-light px-4 py-3 text-sm font-semibold text-brand"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
              onAnimationComplete={() => {
                window.setTimeout(() => setBanner(null), 2200);
              }}
            >
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4" />
                {banner}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {boardQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="bone-loader h-[420px] rounded-[22px]" key={index} />
            ))}
          </div>
        ) : boardQuery.isError ? (
          <div className="rounded-[20px] border border-border bg-white p-8 text-center">
            <p className="text-lg font-bold text-text-primary">Could not load live orders</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-4">
            {columns.map((column) => (
              <div className="rounded-[22px] border border-border bg-[#FAFAFA]" key={column.key}>
                <div className={cn("rounded-t-[22px] px-4 py-3 text-sm font-bold", column.headerClass)}>
                  {column.label}
                </div>
                <div className="space-y-3 p-3">
                  <AnimatePresence initial={false}>
                    {grouped[column.key].length ? (
                      grouped[column.key].map((order) => (
                        <OrderCard
                          key={order.id}
                          onAccept={acceptOrder}
                          onPrepTimeChange={updatePrepTime}
                          onReady={markReady}
                          onReject={rejectOrder}
                          order={order}
                        />
                      ))
                    ) : (
                      <motion.div
                        animate={{ opacity: 1 }}
                        className="rounded-[18px] border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-text-secondary"
                        initial={{ opacity: 0 }}
                      >
                        No orders here.
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
