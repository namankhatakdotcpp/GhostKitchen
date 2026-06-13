"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  computeRiderStatus,
  computeFleetStats,
  filterRiders,
  filterRestaurants,
  routeLinesForOrder,
  heatPoints,
  riderColor,
  MAP_COLORS,
  DEFAULT_RIDER_FILTERS,
  type LiveMapData,
  type LiveRestaurant,
  type LiveRider,
  type LiveActiveOrder,
  type RiderLocationUpdate,
  type LatLng,
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

// ── Markers (memoized — only re-render when their own data changes) ──────────────
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

// ── Map sub-layers ──────────────────────────────────────────────────────────────
// Smoothly recenters the map on the focused order's rider.
function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target || !map) return;
    const zoom = Math.max(typeof map.getZoom === "function" ? map.getZoom() : DEFAULT_ZOOM, 15);
    map.flyTo(target, zoom, { duration: 0.8 });
  }, [target, map]);
  return null;
}

// Order-density heatmap via the leaflet.heat plugin.
function HeatLayer({ points, visible }: { points: Array<[number, number, number]>; visible: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    const heat = (L as unknown as { heatLayer?: (pts: unknown, opts: unknown) => L.Layer }).heatLayer;
    if (!map || typeof heat !== "function") return;

    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }
    if (!layerRef.current) {
      layerRef.current = heat(points, { radius: 28, blur: 18, maxZoom: 16 });
      layerRef.current.addTo(map);
    } else {
      (layerRef.current as unknown as { setLatLngs: (p: unknown) => void }).setLatLngs(points);
    }
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, visible]);

  return null;
}

// ── Main component ───────────────────────────────────────────────────────────────
export default function AdminLiveOperationsMap() {
  const [ridersById, setRidersById] = useState<Record<string, LiveRider>>({});
  const [restaurants, setRestaurants] = useState<LiveRestaurant[]>([]);
  const [activeOrders, setActiveOrders] = useState<LiveActiveOrder[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Search + filter + selection state
  const [riderSearch, setRiderSearch] = useState("");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [riderFilters, setRiderFilters] = useState(DEFAULT_RIDER_FILTERS);
  const [showRestaurants, setShowRestaurants] = useState(true);
  const [showDeliveries, setShowDeliveries] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<LiveMapData>({
    queryKey: ["admin-live-map"],
    queryFn: () => api.get("/admin/live-map").then((r) => r.data),
    refetchInterval: 30_000, // reconciles restaurants + orders; riders stream over the socket
  });

  useEffect(() => {
    if (!data) return;
    setRestaurants(data.restaurants);
    setActiveOrders(data.activeOrders);
    setRidersById((prev) => {
      const next: Record<string, LiveRider> = {};
      for (const rider of data.riders) {
        const existing = prev[rider.id];
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

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  // Riders with client-side decayed status applied.
  const riders = useMemo(
    () => Object.values(ridersById).map((r) => ({ ...r, status: computeRiderStatus(r.lastSeenAt, nowTick) })),
    [ridersById, nowTick],
  );

  const visibleRiders = useMemo(
    () => filterRiders(riders, riderFilters, riderSearch),
    [riders, riderFilters, riderSearch],
  );
  const visibleRestaurants = useMemo(
    () => (showRestaurants ? filterRestaurants(restaurants, restaurantSearch) : []),
    [restaurants, restaurantSearch, showRestaurants],
  );
  const stats = useMemo(() => computeFleetStats(riders, activeOrders, nowTick), [riders, activeOrders, nowTick]);
  const heat = useMemo(() => heatPoints(restaurants, activeOrders), [restaurants, activeOrders]);

  const selectedOrder = useMemo(
    () => activeOrders.find((o) => o.id === selectedOrderId) ?? null,
    [activeOrders, selectedOrderId],
  );
  const route = useMemo(() => (selectedOrder ? routeLinesForOrder(selectedOrder) : null), [selectedOrder]);

  const deliveryMarkers = useMemo(
    () =>
      (showDeliveries ? activeOrders : [])
        .map((o) => {
          const lat = o.rider?.latitude ?? o.restaurant?.latitude ?? null;
          const lng = o.rider?.longitude ?? o.restaurant?.longitude ?? null;
          return lat != null && lng != null ? { order: o, lat, lng } : null;
        })
        .filter((x): x is { order: LiveActiveOrder; lat: number; lng: number } => x !== null),
    [activeOrders, showDeliveries],
  );

  const initialCenter = useRef<[number, number]>(DEFAULT_CENTER).current;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Operations</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Live Operations Map</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time fleet view. Rider positions stream over Socket.IO — no refresh needed.
        </p>
      </div>

      {/* Fleet statistics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Riders online", value: stats.online, highlight: true },
          { label: "Riders offline", value: stats.offline },
          { label: "Active deliveries", value: stats.activeDeliveries },
          { label: "Avg ETA", value: stats.avgEtaMin != null ? `${stats.avgEtaMin}m` : "—" },
          { label: "Avg speed", value: stats.avgSpeedKmh != null ? `${stats.avgSpeedKmh} km/h` : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-white px-4 py-3">
            <p className="text-xs text-text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.highlight ? "text-green-600" : "text-text-primary"}`}>
              {isLoading ? "—" : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar: search, filters, order list */}
        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <div className="space-y-2 rounded-2xl border border-border bg-white p-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Search riders
              <input
                value={riderSearch}
                onChange={(e) => setRiderSearch(e.target.value)}
                placeholder="Name or rider ID…"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Search restaurants
              <input
                value={restaurantSearch}
                onChange={(e) => setRestaurantSearch(e.target.value)}
                placeholder="Restaurant name…"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
          </div>

          {/* Filters */}
          <fieldset className="space-y-2 rounded-2xl border border-border bg-white p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Layers</legend>
            <FilterToggle label="Online riders" checked={riderFilters.online} onChange={(v) => setRiderFilters((f) => ({ ...f, online: v }))} dot={MAP_COLORS.riderOnline} />
            <FilterToggle label="Offline riders" checked={riderFilters.offline} onChange={(v) => setRiderFilters((f) => ({ ...f, offline: v }))} dot={MAP_COLORS.riderOffline} />
            <FilterToggle label="Busy riders" checked={riderFilters.busy} onChange={(v) => setRiderFilters((f) => ({ ...f, busy: v }))} dot={MAP_COLORS.riderIdle} />
            <FilterToggle label="Restaurants" checked={showRestaurants} onChange={setShowRestaurants} dot={MAP_COLORS.restaurant} square />
            <FilterToggle label="Active deliveries" checked={showDeliveries} onChange={setShowDeliveries} dot={MAP_COLORS.delivery} ring />
            <FilterToggle label="Heatmap" checked={showHeatmap} onChange={setShowHeatmap} />
          </fieldset>

          {/* Active order list — click to focus */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Active deliveries ({activeOrders.length})
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Active deliveries">
              {activeOrders.length === 0 ? (
                <li className="py-6 text-center text-sm text-text-muted">No active deliveries.</li>
              ) : (
                activeOrders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(o.id)}
                      aria-pressed={selectedOrderId === o.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedOrderId === o.id
                          ? "border-brand bg-brand/5"
                          : "border-transparent hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <span className="font-semibold text-text-primary">#{o.orderNumber}</span>
                      <span className="ml-2 text-xs text-text-muted">{o.rider?.name ?? "Unassigned"}</span>
                      <span className="block text-xs text-text-secondary">{o.restaurant?.name ?? "—"}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>

        {/* Map */}
        {isError ? (
          <div className="flex h-[60vh] flex-1 items-center justify-center rounded-2xl border border-border bg-white text-sm text-red-600">
            Failed to load the operations map.
          </div>
        ) : (
          <div className="h-[calc(100vh-19rem)] min-h-[460px] flex-1 overflow-hidden rounded-2xl border border-border">
            <MapContainer center={initialCenter} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <HeatLayer points={heat} visible={showHeatmap} />
              <FlyTo target={route?.focus ?? null} />

              {visibleRestaurants.map((r) => (
                <RestaurantMarker key={r.id} r={r} />
              ))}

              {/* Rider markers clustered for 1000+ scale */}
              <MarkerClusterGroup chunkedLoading maxClusterRadius={60} showCoverageOnHover={false}>
                {visibleRiders.map((rider) => (
                  <RiderMarker key={rider.id} rider={rider} />
                ))}
              </MarkerClusterGroup>

              {deliveryMarkers.map(({ order, lat, lng }) => (
                <ActiveDeliveryMarker key={order.id} order={order} lat={lat} lng={lng} />
              ))}

              {/* Highlighted route for the selected order */}
              {route?.riderToRestaurant && (
                <Polyline positions={route.riderToRestaurant} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }} />
              )}
              {route?.riderToCustomer && (
                <Polyline positions={route.riderToCustomer} pathOptions={{ color: MAP_COLORS.delivery, weight: 4, opacity: 0.85, dashArray: "6 8" }} />
              )}
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterToggle({
  label, checked, onChange, dot, square, ring,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  dot?: string;
  square?: boolean;
  ring?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand" />
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3"
          style={{
            background: ring ? "transparent" : dot,
            border: ring ? `2px solid ${dot}` : "none",
            borderRadius: square ? "3px" : "9999px",
          }}
        />
      )}
      {label}
    </label>
  );
}
