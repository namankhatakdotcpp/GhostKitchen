"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type {
  AgentLocation,
  ApiErrorPayload,
  OrderResponse,
  OrderStatus,
  TimelineStage,
  TrackedOrder,
} from "@/types";

type OrderTrackingPageProps = {
  orderId: string;
};

type StatusUpdateEvent = {
  status: OrderStatus;
  timestamp?: string;
  estimatedDelivery?: string;
};

type AgentLocationEvent = {
  lat: number;
  lng: number;
};

const STATUS_ORDER: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const headlineByStatus: Record<OrderStatus, string> = {
  PLACED: "Your order has been placed",
  CONFIRMED: "Restaurant has confirmed your order",
  PREPARING: "Your order is being prepared",
  OUT_FOR_DELIVERY: "Your rider is on the way",
  DELIVERED: "Your order has been delivered",
  CANCELLED: "This order was cancelled",
};

const subTextByStatus: Record<OrderStatus, string> = {
  PLACED: "The kitchen has your order and is reviewing the queue.",
  CONFIRMED: "Your station is locked in and ingredients are being assembled.",
  PREPARING: "Fresh batch in progress. The kitchen is plating your food now.",
  OUT_FOR_DELIVERY: "Your rider has picked up the order and is navigating to you.",
  DELIVERED: "Enjoy your meal. Order again whenever you are ready.",
  CANCELLED: "The order was cancelled before fulfillment.",
};

function BackIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M6.6 10.8a15.3 15.3 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1.02-.24 11.2 11.2 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.06 21 3 13.94 3 5a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.2 11.2 0 0 0 .56 3.5 1 1 0 0 1-.24 1.02l-2.2 2.28Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="m5 12 4.2 4.2L19 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function formatRelativeCountdown(dateString?: string) {
  if (!dateString) {
    return "Calculating ETA";
  }

  const diff = new Date(dateString).getTime() - Date.now();

  if (diff <= 0) {
    return "Arriving any moment now";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${String(seconds).padStart(2, "0")}s remaining`;
}

function formatTimelineTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function patchTimeline(
  timeline: TimelineStage[],
  status: OrderStatus,
  timestamp: string,
) {
  return timeline.map((stage) =>
    stage.status === status ? { ...stage, timestamp } : stage,
  );
}

async function fetchTrackedOrder(orderId: string) {
  return api.get(`/orders/${orderId}`).then(r => r.data);
}

function StageNode({
  stage,
  currentIndex,
  index,
}: {
  stage: TimelineStage;
  currentIndex: number;
  index: number;
}) {
  const isCompleted = index < currentIndex;
  const isCurrent = index === currentIndex;
  const isUpcoming = index > currentIndex;

  return (
    <motion.div
      animate={{
        opacity: 1,
        x: 0,
      }}
      className="grid grid-cols-[28px_1fr] gap-4"
      initial={{
        opacity: isUpcoming ? 0.55 : 0,
        x: 18,
      }}
      transition={{ duration: 0.28, ease: "easeOut", delay: index * 0.06 }}
    >
      <div className="relative flex justify-center">
        <span
          className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
            isCompleted
              ? "border-brand bg-brand text-white"
              : isCurrent
                ? "track-pulse border-brand bg-brand text-white"
                : "border-dashed border-border bg-white text-text-muted"
          }`}
        >
          {isCompleted ? <CheckIcon /> : null}
        </span>
        {index < STATUS_ORDER.length - 1 ? (
          <span
            className={`absolute top-7 h-[calc(100%-12px)] w-px ${
              isCompleted
                ? "bg-brand"
                : "border-r border-dashed border-border"
            }`}
          />
        ) : null}
      </div>

      <div className="pb-8">
        <div
          className={`text-sm ${
            isUpcoming ? "text-text-muted" : "text-text-primary"
          }`}
        >
          <div className="font-semibold">{stage.label}</div>
          <div className="mt-1 text-[13px] leading-5 text-text-secondary">
            {stage.subText}
          </div>
          <div className="mt-2 text-xs font-medium text-text-muted">
            {formatTimelineTimestamp(stage.timestamp)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-shell px-4 py-6 md:px-6 lg:px-8">
      <div className="bone-loader h-14 rounded-2xl" />
      <div className="mt-5 bone-loader h-40 rounded-[28px]" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bone-loader h-[480px] rounded-[28px]" />
        <div className="bone-loader h-[260px] rounded-[28px]" />
      </div>
    </div>
  );
}

export function OrderTrackingPage({ orderId }: OrderTrackingPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [showReconnectToast, setShowReconnectToast] = useState(false);
  const [countdownLabel, setCountdownLabel] = useState("Calculating ETA");

  const query = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchTrackedOrder(orderId),
    retry: false,
    refetchInterval: 30_000, // Poll every 30 seconds as fallback if socket disconnects
  });

  const order = query.data;
  const currentIndex = useMemo(
    () => STATUS_ORDER.findIndex((stage) => stage === order?.status),
    [order?.status],
  );

  useEffect(() => {
    if (!order?.estimatedDelivery) {
      return;
    }

    setCountdownLabel(formatRelativeCountdown(order.estimatedDelivery));

    const intervalId = window.setInterval(() => {
      setCountdownLabel(formatRelativeCountdown(order.estimatedDelivery));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [order?.estimatedDelivery]);

  useEffect(() => {
    if (!order || order.status === "DELIVERED") {
      return;
    }

    const socket = getSocket();
    const room = `order-${orderId}`;

    function patchOrderStatus(payload: StatusUpdateEvent) {
      const timestamp = payload.timestamp ?? new Date().toISOString();
      queryClient.setQueryData<TrackedOrder | undefined>(["order", orderId], (current) =>
        current
          ? {
              ...current,
              status: payload.status,
              estimatedDelivery:
                payload.estimatedDelivery ?? current.estimatedDelivery,
              timeline: patchTimeline(current.timeline, payload.status, timestamp),
            }
          : current,
      );
    }

    function patchAgentLocation(payload: AgentLocationEvent) {
      const nextLocation: AgentLocation = {
        lat: payload.lat,
        lng: payload.lng,
      };

      queryClient.setQueryData<TrackedOrder | undefined>(["order", orderId], (current) =>
        current ? { ...current, agentLocation: nextLocation } : current,
      );
    }

    function handleConnect() {
      setIsSocketConnected(true);
      setShowReconnectToast(false);
      socket.emit("join-room", room);
    }

    function handleDisconnect() {
      setIsSocketConnected(false);
      setShowReconnectToast(true);
    }

    function handleReconnectAttempt() {
      setShowReconnectToast(true);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect_attempt", handleReconnectAttempt);
    socket.on("order:status-updated", patchOrderStatus);
    socket.on("agent:location", patchAgentLocation);
    socket.connect();

    return () => {
      socket.emit("leave-room", room);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect_attempt", handleReconnectAttempt);
      socket.off("order:status-updated", patchOrderStatus);
      socket.off("agent:location", patchAgentLocation);
      socket.disconnect();
      setIsSocketConnected(false);
    };
  }, [order, orderId, queryClient]);

  if (query.isLoading) {
    return <LoadingState />;
  }

  if (query.isError) {
    const error = query.error as ApiErrorPayload;

    if (error.code === 404) {
      return (
        <div className="mx-auto max-w-shell px-4 py-10 md:px-6 lg:px-8">
          <div className="rounded-[28px] border border-border bg-white p-8 text-center shadow-[0_18px_40px_rgba(28,28,28,0.05)]">
            <h1 className="text-3xl font-bold text-text-primary">Order not found</h1>
            <p className="mt-3 text-sm text-text-secondary">
              We could not find a live order with ID {orderId}. Check the link or
              open your order history.
            </p>
            <Link href="/orders">
              <Button className="mt-6">View orders</Button>
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-shell px-4 py-10 md:px-6 lg:px-8">
        <div className="rounded-[28px] border border-border bg-white p-8 text-center shadow-[0_18px_40px_rgba(28,28,28,0.05)]">
          <h1 className="text-3xl font-bold text-text-primary">Tracking unavailable</h1>
          <p className="mt-3 text-sm text-text-secondary">
            {error.error}
          </p>
          <Button className="mt-6" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const isDelivered = order.status === "DELIVERED";

  return (
    <div className="min-h-screen bg-surface pb-10">
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
              onClick={() => router.back()}
              type="button"
            >
              <BackIcon />
            </button>
            <div className="min-w-0">
              <h1 className="line-clamp-1 text-base font-bold text-text-primary md:text-lg">
                Track Order
              </h1>
              <p className="line-clamp-1 text-xs text-text-secondary">
                #{order.id}
              </p>
            </div>
          </div>
          <Link className="text-sm font-semibold text-brand" href={`/restaurant/${order.restaurant.id}`}>
            Order again
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-shell px-4 py-6 md:px-6 lg:px-8">
        <AnimatePresence>
          {showReconnectToast ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="fixed right-4 top-20 z-50 rounded-pill bg-text-primary px-4 py-2 text-sm font-medium text-white shadow-[0_16px_30px_rgba(28,28,28,0.18)]"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
            >
              Reconnecting...
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                    Live status
                  </p>
                  <h2 className="mt-3 text-[24px] font-bold text-text-primary">
                    {headlineByStatus[order.status]}
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    {isDelivered
                      ? "Delivered successfully"
                      : `Estimated delivery: ${countdownLabel}`}
                  </p>
                </div>
                <div className="track-pulse flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-3xl">
                  {order.restaurantTypeEmoji}
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-text-secondary">
                {subTextByStatus[order.status]}
              </p>
            </section>

            <section className="rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <h3 className="text-xl font-bold text-text-primary">Order status timeline</h3>
              <div className="mt-6">
                {order.timeline.map((stage, index) => (
                  <StageNode
                    currentIndex={currentIndex}
                    index={index}
                    key={stage.status}
                    stage={stage}
                  />
                ))}
              </div>
            </section>

            {order.status === "OUT_FOR_DELIVERY" && order.deliveryAgent ? (
              <section className="rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-lg font-bold text-brand">
                      {order.deliveryAgent.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">
                        {order.deliveryAgent.name}
                      </h3>
                      <p className="mt-1 text-sm text-text-secondary">
                        {order.deliveryAgent.rating.toFixed(1)} rating •{" "}
                        {order.deliveryAgent.vehicleNumber}
                      </p>
                    </div>
                  </div>
                  <a
                    className="inline-flex h-11 items-center gap-2 rounded-pill border border-brand bg-white px-4 text-sm font-semibold text-brand"
                    href={`tel:${order.deliveryAgent.phone}`}
                  >
                    <CallIcon />
                    Call
                  </a>
                </div>
                <div className="mt-5 rounded-[22px] border border-border bg-surface p-5">
                  <p className="text-sm font-semibold text-text-primary">Live location</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    Rider location updates are streaming. Map embed placeholder for
                    Google Maps goes here.
                  </p>
                  <div className="mt-4 rounded-[18px] border border-dashed border-border bg-white p-4 text-sm text-text-secondary">
                    Lat {order.agentLocation?.lat.toFixed(4) ?? "--"} • Lng{" "}
                    {order.agentLocation?.lng.toFixed(4) ?? "--"}
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5">
            <section className="rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <button
                className="flex w-full items-center justify-between gap-3"
                onClick={() => setIsSummaryOpen((currentState) => !currentState)}
                type="button"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-text-primary">Order summary</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {order.items.length} items from {order.restaurant.name}
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand">
                  {isSummaryOpen ? "Hide" : "Show"}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isSummaryOpen ? (
                  <motion.div
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden"
                    exit={{ height: 0, opacity: 0 }}
                    initial={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <div className="mt-5 space-y-4">
                      {order.items.map((item) => (
                        <div className="flex items-start justify-between gap-3" key={item.menuItem.id}>
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-semibold text-text-primary">
                              {item.menuItem.name}
                            </p>
                            <p className="mt-1 text-xs text-text-secondary">
                              Qty {item.quantity}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-text-primary">
                            ₹{item.price * item.quantity}
                          </span>
                        </div>
                      ))}

                      <div className="space-y-2 border-t border-border pt-4 text-sm text-text-secondary">
                        <div className="flex items-center justify-between">
                          <span>Subtotal</span>
                          <span className="font-semibold text-text-primary">
                            ₹{order.subtotal ?? order.total - order.deliveryFee}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Delivery fee</span>
                          <span className="font-semibold text-text-primary">
                            ₹{order.deliveryFee}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Discount</span>
                          <span className="font-semibold text-success">
                            -₹{order.discount ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-3 text-base">
                          <span className="font-semibold text-text-primary">Total</span>
                          <span className="font-bold text-text-primary">₹{order.total}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            <section className="rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <p className="text-sm font-semibold text-text-primary">Restaurant info</p>
              <h3 className="mt-3 text-lg font-bold text-text-primary">
                {order.restaurant.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {order.restaurant.address.line1}, {order.restaurant.address.city}
              </p>
              <Link href={`/restaurant/${order.restaurant.id}`}>
                <Button className="mt-5 w-full" variant="ghost">
                  Order again
                </Button>
              </Link>
            </section>

            {isDelivered ? (
              <section className="rounded-[28px] border border-success/20 bg-success/5 p-5">
                <p className="text-sm font-semibold text-success">Delivered</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  This order is complete. Live updates have stopped and your final
                  summary is locked in.
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
