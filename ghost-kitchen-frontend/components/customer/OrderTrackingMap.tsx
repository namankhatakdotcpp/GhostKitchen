"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Same lightweight stack as the admin live-ops map (components/admin/
// AdminLiveOperationsMap.tsx) — react-leaflet + OpenStreetMap tiles, already
// a dependency here, no API key required (unlike Google Maps). Reusing it
// rather than adding a second map library.

type LatLng = { lat: number; lng: number };

const iconCache = new Map<string, L.DivIcon>();
function dotIcon(color: string, size: number): L.DivIcon {
  const key = `${color}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "gk-tracking-marker",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const RESTAURANT_COLOR = "#FF5200";
const CUSTOMER_COLOR = "#2E6BFF";
const RIDER_COLOR = "#16A34A";

// Keeps the map framed on all the points we have, re-fitting whenever the
// rider's live position moves rather than locking the view in place.
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [32, 32] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

export default function OrderTrackingMap({
  restaurant,
  destination,
  rider,
}: {
  restaurant: LatLng | null;
  destination: LatLng | null;
  rider: LatLng | null;
}) {
  const points = useMemo(
    () => [restaurant, rider, destination].filter((p): p is LatLng => !!p),
    [restaurant, rider, destination],
  );
  const center = points[0] ?? { lat: 28.6139, lng: 77.209 }; // fallback: Delhi NCR, matches the rest of this app's seed data
  const initialCenter = useRef<[number, number]>([center.lat, center.lng]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        Waiting for location data…
      </div>
    );
  }

  return (
    <MapContainer center={initialCenter.current} zoom={14} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />

      {restaurant ? (
        <Marker position={[restaurant.lat, restaurant.lng]} icon={dotIcon(RESTAURANT_COLOR, 18)}>
          <Popup>Restaurant</Popup>
        </Marker>
      ) : null}

      {destination ? (
        <Marker position={[destination.lat, destination.lng]} icon={dotIcon(CUSTOMER_COLOR, 18)}>
          <Popup>Delivery address</Popup>
        </Marker>
      ) : null}

      {rider ? (
        <Marker position={[rider.lat, rider.lng]} icon={dotIcon(RIDER_COLOR, 16)}>
          <Popup>Your rider</Popup>
        </Marker>
      ) : null}

      {restaurant && rider ? (
        <Polyline positions={[[restaurant.lat, restaurant.lng], [rider.lat, rider.lng]]} pathOptions={{ color: RIDER_COLOR, weight: 2, dashArray: "6 6" }} />
      ) : null}
      {rider && destination ? (
        <Polyline positions={[[rider.lat, rider.lng], [destination.lat, destination.lng]]} pathOptions={{ color: CUSTOMER_COLOR, weight: 2, dashArray: "6 6" }} />
      ) : null}
    </MapContainer>
  );
}
