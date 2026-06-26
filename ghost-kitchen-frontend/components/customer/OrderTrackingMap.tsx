"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Same lightweight stack as the admin live-ops map — react-leaflet + OpenStreetMap.
// Route polylines are fetched from the public OSRM demo instance, which requires
// no API key. If OSRM is unreachable we fall back to straight-line dashes.

type LatLng = { lat: number; lng: number };

const iconCache = new Map<string, L.DivIcon>();
function dotIcon(color: string, size: number, label?: string): L.DivIcon {
  const key = `${color}:${size}:${label ?? ""}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const labelHtml = label
    ? `<span style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;background:${color};padding:1px 5px;border-radius:4px">${label}</span>`
    : "";
  const icon = L.divIcon({
    className: "gk-tracking-marker",
    html: `<div style="position:relative">${labelHtml}<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

// Animated dot for the rider so it's visually distinct when moving
function riderIcon(size = 18): L.DivIcon {
  const key = `rider:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gk-tracking-marker",
    html: `<div style="position:relative">
      <span style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;background:#16A34A;padding:1px 5px;border-radius:4px">Rider</span>
      <span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:#16A34A;border:3px solid #ffffff;box-shadow:0 0 0 3px rgba(22,163,74,0.3)"></span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const RESTAURANT_COLOR = "#FF5200";
const CUSTOMER_COLOR = "#2E6BFF";

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], 14); return; }
    map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

// Fetch a road-route polyline from OSRM's public routing API.
// Returns an array of [lat, lng] pairs, or null on failure.
async function fetchRoute(origin: LatLng, dest: LatLng): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const coords: [number, number][] = data?.routes?.[0]?.geometry?.coordinates?.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    ) ?? null;
    return coords?.length ? coords : null;
  } catch {
    return null;
  }
}

export interface OrderTrackingMapProps {
  restaurant: LatLng | null;
  destination: LatLng | null;
  rider: LatLng | null;
  /** ETA string to show on map — e.g. "Arriving in 12 min" */
  etaLabel?: string | null;
  /** Whether the rider is en-route to customer (true) or still at/heading to restaurant (false) */
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

  // Route polylines — rider→restaurant (pickup) and rider→destination (delivery)
  const [pickupRoute, setPickupRoute] = useState<[number, number][] | null>(null);
  const [deliveryRoute, setDeliveryRoute] = useState<[number, number][] | null>(null);

  // Fetch pickup route: rider → restaurant (when rider hasn't picked up yet)
  useEffect(() => {
    if (!rider || !restaurant || riderEnRoute) { setPickupRoute(null); return; }
    let cancelled = false;
    fetchRoute(rider, restaurant).then(r => { if (!cancelled) setPickupRoute(r); });
    return () => { cancelled = true; };
  }, [rider?.lat, rider?.lng, restaurant?.lat, restaurant?.lng, riderEnRoute]);

  // Fetch delivery route: rider → destination (when rider is en-route to customer)
  useEffect(() => {
    if (!rider || !destination || !riderEnRoute) { setDeliveryRoute(null); return; }
    let cancelled = false;
    fetchRoute(rider, destination).then(r => { if (!cancelled) setDeliveryRoute(r); });
    return () => { cancelled = true; };
  }, [rider?.lat, rider?.lng, destination?.lat, destination?.lng, riderEnRoute]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        Waiting for location data…
      </div>
    );
  }

  // Straight-line fallback when OSRM didn't respond
  const fallbackPickup: [number, number][] | null =
    rider && restaurant && !riderEnRoute
      ? [[rider.lat, rider.lng], [restaurant.lat, restaurant.lng]]
      : null;
  const fallbackDelivery: [number, number][] | null =
    rider && destination && riderEnRoute
      ? [[rider.lat, rider.lng], [destination.lat, destination.lng]]
      : null;

  const activePickupRoute = pickupRoute ?? fallbackPickup;
  const activeDeliveryRoute = deliveryRoute ?? fallbackDelivery;
  const routeIsReal = (pickupRoute || deliveryRoute) !== null;

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
            <Popup>Restaurant</Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={dotIcon(CUSTOMER_COLOR, 18, "You")}>
            <Popup>Your delivery address</Popup>
          </Marker>
        )}

        {rider && (
          <Marker position={[rider.lat, rider.lng]} icon={riderIcon(20)}>
            <Popup>Your rider{etaLabel ? ` · ${etaLabel}` : ""}</Popup>
          </Marker>
        )}

        {/* Pickup route: rider → restaurant */}
        {activePickupRoute && (
          <Polyline
            positions={activePickupRoute}
            pathOptions={{ color: "#16A34A", weight: routeIsReal ? 4 : 2, dashArray: routeIsReal ? undefined : "6 6", opacity: 0.8 }}
          />
        )}

        {/* Delivery route: rider → customer */}
        {activeDeliveryRoute && (
          <Polyline
            positions={activeDeliveryRoute}
            pathOptions={{ color: CUSTOMER_COLOR, weight: routeIsReal ? 4 : 2, dashArray: routeIsReal ? undefined : "6 6", opacity: 0.8 }}
          />
        )}

        {/* Restaurant → destination straight line (always shown for context when both are known) */}
        {restaurant && destination && (
          <Polyline
            positions={[[restaurant.lat, restaurant.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: "#9CA3AF", weight: 1, dashArray: "4 8", opacity: 0.4 }}
          />
        )}
      </MapContainer>

      {/* ETA overlay */}
      {etaLabel && (
        <div className="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-text-primary shadow-md">
          🛵 {etaLabel}
        </div>
      )}
    </div>
  );
}
