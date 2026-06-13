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
  restaurant: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
  customer: { id: string; name: string } | null;
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
