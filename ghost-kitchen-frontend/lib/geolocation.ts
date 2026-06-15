import type { LocationOption } from "@/types";

// Nominatim (OpenStreetMap) — free, no API key required.
// Rate limit: 1 request/second per user. Fine for interactive use.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

interface NominatimReverseResult {
  display_name: string;
  address: {
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; city: string }> {
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en&zoom=14`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en", "User-Agent": "GhostKitchen/1.0" },
  });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data: NominatimReverseResult = await res.json();
  const a = data.address;
  const neighbourhood = a.neighbourhood ?? a.suburb ?? a.village ?? null;
  const city = a.city ?? a.town ?? a.county ?? a.state ?? "Unknown";
  const label = neighbourhood ? `${neighbourhood}, ${city}` : city;
  return { label, city };
}

export interface GeoLocationResult {
  location: LocationOption;
}

export class GeoLocationError extends Error {
  constructor(
    message: string,
    public readonly code: "PERMISSION_DENIED" | "UNAVAILABLE" | "TIMEOUT" | "GEOCODE_FAILED"
  ) {
    super(message);
    this.name = "GeoLocationError";
  }
}

export function getCurrentLocationOption(): Promise<GeoLocationResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeoLocationError("Geolocation is not supported by this browser.", "UNAVAILABLE"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        try {
          const { label, city } = await reverseGeocode(lat, lng);
          resolve({
            location: { id: `gps-${lat.toFixed(4)}-${lng.toFixed(4)}`, label, city, lat, lng },
          });
        } catch {
          // Reverse geocode failed — still use coordinates with a generic label.
          resolve({
            location: {
              id: `gps-${lat.toFixed(4)}-${lng.toFixed(4)}`,
              label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              city: "Current Location",
              lat,
              lng,
            },
          });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoLocationError("Location access was denied. Please allow location in browser settings.", "PERMISSION_DENIED"));
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoLocationError("Location request timed out. Please try again.", "TIMEOUT"));
        } else {
          reject(new GeoLocationError("Your location could not be determined.", "UNAVAILABLE"));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
