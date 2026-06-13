"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  computeRiderStatus,
  riderColor,
  MAP_COLORS,
  type LiveMapData,
  type LiveRestaurant,
  type LiveRider,
  type LiveActiveOrder,
  type RiderLocationUpdate,
} from "@/lib/liveMap";

// Default view centers on Delhi NCR — where the seed data lives.
const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];
const DEFAULT_ZOOM = 11;

// ── Marker icons (cached so repeated markers reuse one L.DivIcon instance) ──────
const iconCache = new Map<string, L.DivIcon>();

function dotIcon(color: string, size: number): L.DivIcon {
  const key = `dot:${color}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gk-marker",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function squareIcon(color: string, size: number): L.DivIcon {
  const key = `sq:${color}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gk-marker",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:5px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function ringIcon(color: string, size: number): L.DivIcon {
  const key = `ring:${color}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gk-marker",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:transparent;border:3px solid ${color};box-shadow:0 0 6px ${color}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN");
};

// ── Restaurant marker (memoized) ────────────────────────────────────────────────
const RestaurantMarker = memo(function RestaurantMarker({ r }: { r: LiveRestaurant }) {
  return (
    <Marker position={[r.latitude, r.longitude]} icon={squareIcon(MAP_COLORS.restaurant, 18)}>
      <Popup>
        <div className="space-y-0.5 text-[13px]">
          <p className="text-sm font-bold">{r.name}</p>
          <p>Today&apos;s orders: <b>{r.todaysOrders}</b></p>
          <p>Active orders: <b>{r.activeOrders}</b></p>
          <p>Average rating: <b>{r.rating.toFixed(1)}</b> ★</p>
          <p>Status: <b>{r.status}</b></p>
        </div>
      </Popup>
    </Marker>
  );
}, (a, b) =>
  a.r.latitude === b.r.latitude &&
  a.r.longitude === b.r.longitude &&
  a.r.activeOrders === b.r.activeOrders &&
  a.r.todaysOrders === b.r.todaysOrders &&
  a.r.status === b.r.status &&
  a.r.rating === b.r.rating,
);

// ── Rider marker (memoized — only re-renders when its own data changes) ──────────
const RiderMarker = memo(function RiderMarker({ rider }: { rider: LiveRider }) {
  return (
    <Marker position={[rider.latitude, rider.longitude]} icon={dotIcon(riderColor(rider.status), 16)}>
      <Popup>
        <div className="space-y-0.5 text-[13px]">
          <p className="text-sm font-bold">{rider.name}</p>
          <p>Status: <b>{rider.status}</b></p>
          <p>Current deliveries: <b>{rider.activeDeliveries}</b></p>
          <p>Last seen: <b>{fmtTime(rider.lastSeenAt)}</b></p>
          <p>Latitude: <b>{rider.latitude.toFixed(5)}</b></p>
          <p>Longitude: <b>{rider.longitude.toFixed(5)}</b></p>
          <p>Speed: <b>{rider.speed != null ? `${rider.speed} km/h` : "—"}</b></p>
          <p>Heading: <b>{rider.heading != null ? `${rider.heading}°` : "—"}</b></p>
        </div>
      </Popup>
    </Marker>
  );
}, (a, b) =>
  a.rider.latitude === b.rider.latitude &&
  a.rider.longitude === b.rider.longitude &&
  a.rider.status === b.rider.status &&
  a.rider.activeDeliveries === b.rider.activeDeliveries &&
  a.rider.lastSeenAt === b.rider.lastSeenAt &&
  a.rider.speed === b.rider.speed &&
  a.rider.heading === b.rider.heading,
);

// ── Active-delivery marker (memoized) ────────────────────────────────────────────
const ActiveDeliveryMarker = memo(function ActiveDeliveryMarker({
  order, lat, lng,
}: { order: LiveActiveOrder; lat: number; lng: number }) {
  return (
    <Marker position={[lat, lng]} icon={ringIcon(MAP_COLORS.delivery, 28)}>
      <Popup>
        <div className="space-y-0.5 text-[13px]">
          <p className="text-sm font-bold">Order #{order.orderNumber}</p>
          <p>Status: <b>{order.status}</b></p>
          <p>Restaurant: <b>{order.restaurant?.name ?? "—"}</b></p>
          <p>Customer: <b>{order.customer?.name ?? "—"}</b></p>
          <p>Rider: <b>{order.rider?.name ?? "Unassigned"}</b></p>
        </div>
      </Popup>
    </Marker>
  );
}, (a, b) => a.lat === b.lat && a.lng === b.lng && a.order.status === b.order.status && a.order.id === b.order.id);

// ── Main component ───────────────────────────────────────────────────────────────
export default function AdminLiveOperationsMap() {
  const [ridersById, setRidersById] = useState<Record<string, LiveRider>>({});
  const [restaurants, setRestaurants] = useState<LiveRestaurant[]>([]);
  const [activeOrders, setActiveOrders] = useState<LiveActiveOrder[]>([]);
  // Ticking clock so rider markers decay ONLINE → IDLE → OFFLINE between pings.
  const [nowTick, setNowTick] = useState(() => Date.now());

  const { data, isLoading, isError } = useQuery<LiveMapData>({
    queryKey: ["admin-live-map"],
    queryFn: () => api.get("/admin/live-map").then((r) => r.data),
    // Reconciles restaurants + active orders. Rider positions stream over the
    // socket below, so this only fills gaps / catches riders joining or leaving.
    refetchInterval: 30_000,
  });

  // Seed / reconcile from the snapshot without clobbering fresher socket pings.
  useEffect(() => {
    if (!data) return;
    setRestaurants(data.restaurants);
    setActiveOrders(data.activeOrders);
    setRidersById((prev) => {
      const next: Record<string, LiveRider> = {};
      for (const rider of data.riders) {
        const existing = prev[rider.id];
        // Keep the local copy if it was updated more recently than the snapshot.
        next[rider.id] =
          existing && new Date(existing.lastSeenAt).getTime() > new Date(rider.lastSeenAt).getTime()
            ? existing
            : rider;
      }
      return next;
    });
  }, [data]);

  // Live rider movement — patch only the affected marker, never refetch.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
    } catch {
      return;
    }

    const onLocation = (u: RiderLocationUpdate) => {
      setRidersById((prev) => {
        const existing = prev[u.riderId];
        return {
          ...prev,
          [u.riderId]: {
            id: u.riderId,
            name: existing?.name ?? "Rider",
            status: u.status,
            latitude: u.latitude,
            longitude: u.longitude,
            heading: u.heading,
            speed: u.speed,
            lastSeenAt: u.lastSeenAt,
            activeDeliveries: existing?.activeDeliveries ?? 0,
          },
        };
      });
    };

    socket.on("rider:location:update", onLocation);
    return () => {
      socket?.off("rider:location:update", onLocation);
    };
  }, []);

  // Decay clock — recompute statuses every 20s.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  // Riders with client-side decayed status applied.
  const riders = useMemo(
    () =>
      Object.values(ridersById).map((r) => ({
        ...r,
        status: computeRiderStatus(r.lastSeenAt, nowTick),
      })),
    [ridersById, nowTick],
  );

  const onlineCount = riders.filter((r) => r.status === "ONLINE").length;

  // Resolve a position for each active delivery: rider position first, else restaurant.
  const deliveryMarkers = useMemo(
    () =>
      activeOrders
        .map((o) => {
          const lat = o.rider?.latitude ?? o.restaurant?.latitude ?? null;
          const lng = o.rider?.longitude ?? o.restaurant?.longitude ?? null;
          return lat != null && lng != null ? { order: o, lat, lng } : null;
        })
        .filter((x): x is { order: LiveActiveOrder; lat: number; lng: number } => x !== null),
    [activeOrders],
  );

  const initialCenter = useRef<[number, number]>(DEFAULT_CENTER).current;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Operations</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Live Operations Map</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Real-time view of restaurants, riders and active deliveries. Rider positions update live over Socket.IO.
          </p>
        </div>
        <div className="flex gap-3">
          {[
            { label: "Restaurants", value: restaurants.length },
            { label: "Riders online", value: onlineCount, highlight: true },
            { label: "Active deliveries", value: deliveryMarkers.length },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-white px-5 py-3 text-center">
              <p className="text-xs text-text-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold ${s.highlight ? "text-green-600" : "text-text-primary"}`}>
                {isLoading ? "—" : s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white px-4 py-2 text-xs text-text-secondary">
        <LegendDot color={MAP_COLORS.restaurant} square label="Restaurant" />
        <LegendDot color={MAP_COLORS.riderOnline} label="Rider online" />
        <LegendDot color={MAP_COLORS.riderIdle} label="Rider idle" />
        <LegendDot color={MAP_COLORS.riderOffline} label="Rider offline" />
        <LegendDot color={MAP_COLORS.delivery} ring label="Active delivery" />
      </div>

      {isError ? (
        <div className="flex h-[60vh] items-center justify-center rounded-2xl border border-border bg-white text-sm text-red-600">
          Failed to load the operations map.
        </div>
      ) : (
        <div className="h-[calc(100vh-17rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border">
          <MapContainer center={initialCenter} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {restaurants.map((r) => (
              <RestaurantMarker key={r.id} r={r} />
            ))}
            {riders.map((rider) => (
              <RiderMarker key={rider.id} rider={rider} />
            ))}
            {deliveryMarkers.map(({ order, lat, lng }) => (
              <ActiveDeliveryMarker key={order.id} order={order} lat={lat} lng={lng} />
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, square, ring }: { color: string; label: string; square?: boolean; ring?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3"
        style={{
          background: ring ? "transparent" : color,
          border: ring ? `2px solid ${color}` : "none",
          borderRadius: square ? "3px" : "9999px",
        }}
      />
      {label}
    </span>
  );
}
