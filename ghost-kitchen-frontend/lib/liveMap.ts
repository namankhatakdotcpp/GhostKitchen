// Shared types + helpers for the admin live operations map.

export type RiderStatus = "ONLINE" | "IDLE" | "OFFLINE";
export type RestaurantStatus = "OPEN" | "CLOSED" | "SUSPENDED";

export interface LiveRestaurant {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: number;
  status: RestaurantStatus;
  activeOrders: number;
  todaysOrders: number;
}

export interface LiveRider {
  id: string;
  name: string;
  status: RiderStatus;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  lastSeenAt: string;
  activeDeliveries: number;
}

export interface LiveActiveOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  estimatedDelivery: string | null;
  restaurant: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
  customer: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
  rider: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
}

export interface LiveMapData {
  restaurants: LiveRestaurant[];
  riders: LiveRider[];
  activeOrders: LiveActiveOrder[];
}

// Socket payload for `rider:location:update`.
export interface RiderLocationUpdate {
  riderId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  status: RiderStatus;
  lastSeenAt: string;
}

export const RIDER_ONLINE_MS = 60 * 1000; // 60 seconds
export const RIDER_IDLE_MS = 5 * 60 * 1000; // 5 minutes

// Mirror of the backend rider-status thresholds so markers visibly decay to
// IDLE/OFFLINE on the client between GPS pings without waiting for a refetch.
export function computeRiderStatus(lastSeenAt: string | null | undefined, now: number = Date.now()): RiderStatus {
  if (!lastSeenAt) return "OFFLINE";
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return "OFFLINE";
  const elapsed = now - seen;
  if (elapsed < 0) return "ONLINE";
  if (elapsed < RIDER_ONLINE_MS) return "ONLINE";
  if (elapsed < RIDER_IDLE_MS) return "IDLE";
  return "OFFLINE";
}

// Marker colors. Restaurants are red, riders green/amber/gray by presence, and
// active deliveries are yellow (see AdminLiveOperationsMap legend).
export const MAP_COLORS = {
  restaurant: "#dc2626",
  riderOnline: "#16a34a",
  riderIdle: "#f59e0b",
  riderOffline: "#6b7280",
  delivery: "#eab308",
} as const;

export function riderColor(status: RiderStatus): string {
  if (status === "ONLINE") return MAP_COLORS.riderOnline;
  if (status === "IDLE") return MAP_COLORS.riderIdle;
  return MAP_COLORS.riderOffline;
}

// Great-circle distance between two coordinates, in metres (Haversine).
// Used to throttle rider GPS pings so we only send when meaningfully moved.
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Filtering & search ──────────────────────────────────────────────────────

export interface RiderFilters {
  online: boolean; // ONLINE or IDLE riders
  offline: boolean; // OFFLINE riders
  busy: boolean; // riders with an active delivery
}

export const DEFAULT_RIDER_FILTERS: RiderFilters = { online: true, offline: true, busy: true };

// Returns riders matching the active filters and the (name or id) search term.
// A rider is shown if it satisfies ANY enabled facet, then must match the search.
export function filterRiders(riders: LiveRider[], filters: RiderFilters, search: string): LiveRider[] {
  const q = search.trim().toLowerCase();
  return riders.filter((r) => {
    const isOffline = r.status === "OFFLINE";
    const isBusy = r.activeDeliveries > 0;
    const facet =
      (filters.online && !isOffline) ||
      (filters.offline && isOffline) ||
      (filters.busy && isBusy);
    if (!facet) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
  });
}

export function filterRestaurants(restaurants: LiveRestaurant[], search: string): LiveRestaurant[] {
  const q = search.trim().toLowerCase();
  if (!q) return restaurants;
  return restaurants.filter((r) => r.name.toLowerCase().includes(q));
}

// ── Fleet statistics ────────────────────────────────────────────────────────

export interface FleetStats {
  online: number;
  offline: number;
  idle: number;
  activeDeliveries: number;
  avgEtaMin: number | null; // average minutes until ETA across active orders
  avgSpeedKmh: number | null; // average speed of moving riders
}

export function computeFleetStats(
  riders: LiveRider[],
  activeOrders: LiveActiveOrder[],
  now: number = Date.now(),
): FleetStats {
  let online = 0;
  let offline = 0;
  let idle = 0;
  for (const r of riders) {
    if (r.status === "ONLINE") online += 1;
    else if (r.status === "IDLE") idle += 1;
    else offline += 1;
  }

  const speeds = riders.map((r) => r.speed).filter((s): s is number => s != null && s > 0);
  const avgSpeedKmh = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;

  const etas = activeOrders
    .map((o) => (o.estimatedDelivery ? new Date(o.estimatedDelivery).getTime() : null))
    .filter((t): t is number => t != null && Number.isFinite(t) && t > now)
    .map((t) => (t - now) / 60_000);
  const avgEtaMin = etas.length ? Math.round(etas.reduce((a, b) => a + b, 0) / etas.length) : null;

  return { online, offline, idle, activeDeliveries: activeOrders.length, avgEtaMin, avgSpeedKmh };
}

// ── Route lines for the order-centric view ──────────────────────────────────

export type LatLng = [number, number];

export interface OrderRoute {
  riderToRestaurant: [LatLng, LatLng] | null;
  riderToCustomer: [LatLng, LatLng] | null;
  focus: LatLng | null; // where to centre the map (the rider, if known)
}

// Builds the polylines for a single order: rider → restaurant and rider → customer.
export function routeLinesForOrder(order: LiveActiveOrder): OrderRoute {
  const rider =
    order.rider && order.rider.latitude != null && order.rider.longitude != null
      ? ([order.rider.latitude, order.rider.longitude] as LatLng)
      : null;
  const rest =
    order.restaurant && order.restaurant.latitude != null && order.restaurant.longitude != null
      ? ([order.restaurant.latitude, order.restaurant.longitude] as LatLng)
      : null;
  const cust =
    order.customer && order.customer.latitude != null && order.customer.longitude != null
      ? ([order.customer.latitude, order.customer.longitude] as LatLng)
      : null;

  return {
    riderToRestaurant: rider && rest ? [rider, rest] : null,
    riderToCustomer: rider && cust ? [rider, cust] : null,
    focus: rider ?? rest ?? cust,
  };
}

// ── Heatmap ─────────────────────────────────────────────────────────────────

export type HeatPoint = [number, number, number]; // [lat, lng, intensity 0..1]

// Order-density hotspots: each active delivery contributes a point at its
// drop-off (or rider) location; restaurants contribute weighted by active load.
export function heatPoints(restaurants: LiveRestaurant[], activeOrders: LiveActiveOrder[]): HeatPoint[] {
  const points: HeatPoint[] = [];

  for (const o of activeOrders) {
    const lat = o.customer?.latitude ?? o.rider?.latitude ?? o.restaurant?.latitude ?? null;
    const lng = o.customer?.longitude ?? o.rider?.longitude ?? o.restaurant?.longitude ?? null;
    if (lat != null && lng != null) points.push([lat, lng, 0.8]);
  }

  const maxLoad = Math.max(1, ...restaurants.map((r) => r.activeOrders));
  for (const r of restaurants) {
    if (r.latitude == null || r.longitude == null || r.activeOrders <= 0) continue;
    points.push([r.latitude, r.longitude, Math.min(1, r.activeOrders / maxLoad)]);
  }

  return points;
}
