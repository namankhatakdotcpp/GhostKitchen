"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type LatLng = { lat: number; lng: number; heading?: number | null };

// ── Icon factory ─────────────────────────────────────────────────────────────

const iconCache = new Map<string, L.DivIcon>();

function dotIcon(color: string, size: number, label?: string): L.DivIcon {
  const key = `dot:${color}:${size}:${label ?? ""}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const labelHtml = label
    ? `<span style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;background:${color};padding:2px 6px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.3)">${label}</span>`
    : "";
  const icon = L.divIcon({
    className: "gk-tracking-marker",
    html: `<div style="position:relative">${labelHtml}<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

// Heading-aware rider icon: directional arrow when heading is known, pulsing
// dot when it isn't. The arrow body is the canonical teardrop/shield shape
// used by Google Maps / Swiggy rider icons.
function riderIcon(heading: number | null | undefined, size = 22): L.DivIcon {
  const deg = heading != null && Number.isFinite(heading) ? Math.round(heading) : null;
  const key = `rider:${deg ?? "dot"}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  let innerHtml: string;
  if (deg !== null) {
    // Rotated directional arrow — SVG so it scales cleanly
    innerHtml = `
      <div style="position:relative;width:${size}px;height:${size}px">
        <span style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;background:#16A34A;padding:2px 6px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.3)">Rider</span>
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${deg}deg);display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">
          <circle cx="12" cy="12" r="10" fill="#16A34A" stroke="#fff" stroke-width="2"/>
          <polygon points="12,3 8,14 12,11 16,14" fill="#fff" opacity="0.9"/>
        </svg>
      </div>`;
  } else {
    // No heading — pulsing dot
    innerHtml = `
      <div style="position:relative;width:${size}px;height:${size}px">
        <span style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;background:#16A34A;padding:2px 6px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.3)">Rider</span>
        <span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:#16A34A;border:3px solid #fff;box-shadow:0 0 0 3px rgba(22,163,74,0.3)"></span>
      </div>`;
  }

  const icon = L.divIcon({
    className: "gk-tracking-marker",
    html: innerHtml,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const RESTAURANT_COLOR = "#FF5200";
const CUSTOMER_COLOR = "#2E6BFF";

// ── Auto-fit bounds ───────────────────────────────────────────────────────────

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const serialized = JSON.stringify(points.map((p) => [p.lat, p.lng]));
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], 14); return; }
    map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [48, 48] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
  return null;
}

// ── OSRM routing ─────────────────────────────────────────────────────────────

interface RouteResult {
  polyline: [number, number][];
  distanceM: number;
  durationS: number;
}

async function fetchRoute(origin: LatLng, dest: LatLng): Promise<RouteResult | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const polyline: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    );
    return polyline.length ? { polyline, distanceM: route.distance, durationS: route.duration } : null;
  } catch {
    return null;
  }
}

// Haversine distance in metres (for debounce check)
function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

// ── Component ────────────────────────────────────────────────────────────────

export interface OrderTrackingMapProps {
  restaurant: LatLng | null;
  destination: LatLng | null;
  rider: LatLng | null;    // lat/lng/heading from socket
  etaLabel?: string | null;
  riderEnRoute?: boolean;
}

export default function OrderTrackingMap({
  restaurant,
  destination,
  rider,
  etaLabel,
  riderEnRoute = false,
}: OrderTrackingMapProps) {
  const points = useMemo(
    () => [restaurant, rider, destination].filter((p): p is LatLng => !!p),
    [restaurant, rider, destination],
  );
  const center = points[0] ?? { lat: 28.6139, lng: 77.209 };
  const initialCenter = useRef<[number, number]>([center.lat, center.lng]);

  const [pickupRoute, setPickupRoute] = useState<RouteResult | null>(null);
  const [deliveryRoute, setDeliveryRoute] = useState<RouteResult | null>(null);

  // Track last position that triggered an OSRM fetch — only re-fetch when the
  // rider has moved >50m (avoids hammering the OSRM demo server every GPS tick).
  const lastRoutedRider = useRef<LatLng | null>(null);
  const lastRoutedAt = useRef<number>(0);

  const shouldReroute = (nextRider: LatLng): boolean => {
    const prev = lastRoutedRider.current;
    if (!prev) return true;
    const moved = haversineM(prev, nextRider) > 50;
    const elapsed = Date.now() - lastRoutedAt.current > 15_000;
    return moved || elapsed;
  };

  // Pickup route: rider → restaurant (when rider hasn't picked up yet)
  useEffect(() => {
    if (!rider || !restaurant || riderEnRoute) { setPickupRoute(null); return; }
    if (!shouldReroute(rider)) return;
    lastRoutedRider.current = rider;
    lastRoutedAt.current = Date.now();
    let cancelled = false;
    fetchRoute(rider, restaurant).then((r) => { if (!cancelled) setPickupRoute(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.lat, rider?.lng, restaurant?.lat, restaurant?.lng, riderEnRoute]);

  // Delivery route: rider → destination (when rider is en-route to customer)
  useEffect(() => {
    if (!rider || !destination || !riderEnRoute) { setDeliveryRoute(null); return; }
    if (!shouldReroute(rider)) return;
    lastRoutedRider.current = rider;
    lastRoutedAt.current = Date.now();
    let cancelled = false;
    fetchRoute(rider, destination).then((r) => { if (!cancelled) setDeliveryRoute(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.lat, rider?.lng, destination?.lat, destination?.lng, riderEnRoute]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        Waiting for location data…
      </div>
    );
  }

  const activeRoute = riderEnRoute ? deliveryRoute : pickupRoute;
  const fallbackPoints: [number, number][] | null = rider
    ? riderEnRoute && destination
      ? [[rider.lat, rider.lng], [destination.lat, destination.lng]]
      : !riderEnRoute && restaurant
        ? [[rider.lat, rider.lng], [restaurant.lat, restaurant.lng]]
        : null
    : null;

  const routePolyline = activeRoute?.polyline ?? fallbackPoints;
  const routeIsReal = !!activeRoute;

  // Remaining distance label from OSRM
  const remainingLabel = activeRoute
    ? activeRoute.distanceM >= 1000
      ? `${(activeRoute.distanceM / 1000).toFixed(1)} km away`
      : `${Math.round(activeRoute.distanceM)} m away`
    : null;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={initialCenter.current} zoom={14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />

        {restaurant && (
          <Marker position={[restaurant.lat, restaurant.lng]} icon={dotIcon(RESTAURANT_COLOR, 18, "Restaurant")}>
            <Popup>Restaurant pickup point</Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={dotIcon(CUSTOMER_COLOR, 18, "You")}>
            <Popup>Your delivery address</Popup>
          </Marker>
        )}

        {rider && (
          <Marker position={[rider.lat, rider.lng]} icon={riderIcon(rider.heading, 22)}>
            <Popup>
              Your rider{etaLabel ? ` · ${etaLabel}` : ""}
              {remainingLabel ? ` · ${remainingLabel}` : ""}
            </Popup>
          </Marker>
        )}

        {/* Active route: rider → restaurant (pickup) or rider → customer (delivery) */}
        {routePolyline && (
          <Polyline
            positions={routePolyline}
            pathOptions={{
              color: riderEnRoute ? CUSTOMER_COLOR : "#16A34A",
              weight: routeIsReal ? 4 : 2,
              dashArray: routeIsReal ? undefined : "6 6",
              opacity: 0.85,
            }}
          />
        )}

        {/* Restaurant → destination reference line (always shown for context) */}
        {restaurant && destination && (
          <Polyline
            positions={[[restaurant.lat, restaurant.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: "#9CA3AF", weight: 1, dashArray: "4 8", opacity: 0.4 }}
          />
        )}
      </MapContainer>

      {/* ETA + remaining distance overlay */}
      {(etaLabel || remainingLabel) && (
        <div className="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 flex items-center gap-2 rounded-full bg-white/95 px-4 py-1.5 shadow-md">
          {etaLabel && (
            <span className="text-xs font-semibold text-text-primary">🛵 {etaLabel}</span>
          )}
          {etaLabel && remainingLabel && (
            <span className="text-xs text-text-muted">·</span>
          )}
          {remainingLabel && (
            <span className="text-xs text-text-secondary">{remainingLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
