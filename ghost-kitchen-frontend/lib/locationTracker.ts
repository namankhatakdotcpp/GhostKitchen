"use client";

/**
 * Rider location tracking service (single source of truth).
 *
 * A singleton that owns the browser Geolocation watch, the upload throttle, and
 * the visibility / online-offline handling. React code drives it through the
 * thin `useRiderLocationTracking` hook, but the imperative API is also exposed
 * directly:
 *
 *     startTracking();  // begin streaming GPS to the backend
 *     stopTracking();   // stop and release the watch + timers
 *
 * Keeping all logic here means there is exactly one watch and one upload loop no
 * matter how many components subscribe.
 */

import { api } from "@/lib/api";
import { metersBetween } from "@/lib/liveMap";

const VISIBLE_INTERVAL_MS = 10_000; // heartbeat while tab is visible
const HIDDEN_INTERVAL_MS = 30_000; // heartbeat while tab is backgrounded
const MIN_DISTANCE_M = 20; // send if moved at least this far
const MIN_ELAPSED_MS = 10_000; // ...or at least this long since the last send

export type RiderTrackingStatus =
  | "idle" // not tracking
  | "tracking" // live, sending updates
  | "paused" // browser is offline — uploads paused, will auto-resume
  | "denied" // location permission denied
  | "unavailable" // geolocation not supported on this device
  | "error"; // GPS unavailable / timeout — will keep retrying

type Fix = { lat: number; lng: number; heading: number | null; speed: number | null };
type Listener = (status: RiderTrackingStatus) => void;

class RiderLocationTracker {
  private status: RiderTrackingStatus = "idle";
  private listeners = new Set<Listener>();
  private latest: Fix | null = null;
  private lastSent: { lat: number; lng: number; at: number } | null = null;
  private sending = false;
  private watchId: number | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private bound = false;

  getStatus(): RiderTrackingStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(next: RiderTrackingStatus) {
    if (next === this.status) return;
    this.status = next;
    this.listeners.forEach((l) => l(next));
  }

  private isOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  startTracking(): void {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      this.setStatus("unavailable");
      return;
    }
    if (this.watchId != null) return; // already tracking — idempotent

    this.latest = null;
    this.lastSent = null;

    this.watchId = navigator.geolocation.watchPosition(this.onPosition, this.onError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    });
    this.startFlush();

    if (!this.bound) {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
      document.addEventListener("visibilitychange", this.onVisibility);
      this.bound = true;
    }

    this.setStatus(this.isOffline() ? "paused" : "tracking");
  }

  stopTracking(): void {
    if (this.watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    if (this.flushTimer != null) clearInterval(this.flushTimer);
    this.watchId = null;
    this.flushTimer = null;
    this.latest = null;
    this.lastSent = null;

    if (this.bound) {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.bound = false;
    }

    this.setStatus("idle");
  }

  private intervalMs(): number {
    return typeof document !== "undefined" && document.visibilityState === "hidden"
      ? HIDDEN_INTERVAL_MS
      : VISIBLE_INTERVAL_MS;
  }

  private startFlush() {
    if (this.flushTimer != null) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => void this.send(), this.intervalMs());
  }

  private onPosition = (pos: GeolocationPosition) => {
    const { latitude, longitude, heading, speed } = pos.coords;
    this.latest = {
      lat: latitude,
      lng: longitude,
      heading: heading != null && Number.isFinite(heading) ? Math.round(heading) : null,
      // Geolocation speed is m/s; the rest of the app shows km/h.
      speed: speed != null && Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null,
    };
    if (!this.isOffline()) this.setStatus("tracking");
    void this.send(); // opportunistic — gated to ≥20m moves between heartbeats
  };

  private onError = (err: GeolocationPositionError) => {
    this.setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
  };

  private onOnline = () => {
    this.setStatus("tracking");
    void this.send();
  };

  private onOffline = () => {
    this.setStatus("paused");
  };

  private onVisibility = () => {
    this.startFlush(); // re-arm at the new cadence
    if (document.visibilityState === "visible") void this.send();
  };

  private send = async () => {
    if (this.isOffline()) {
      this.setStatus("paused");
      return;
    }
    const cur = this.latest;
    if (!cur || this.sending) return;

    const prev = this.lastSent;
    const elapsed = prev ? Date.now() - prev.at : Infinity;
    const moved = prev ? metersBetween(prev.lat, prev.lng, cur.lat, cur.lng) : Infinity;
    if (moved < MIN_DISTANCE_M && elapsed < MIN_ELAPSED_MS) return;

    this.sending = true;
    try {
      await api.post("/delivery/location", {
        latitude: cur.lat,
        longitude: cur.lng,
        ...(cur.heading != null ? { heading: cur.heading } : {}),
        ...(cur.speed != null ? { speed: cur.speed } : {}),
      });
      this.lastSent = { lat: cur.lat, lng: cur.lng, at: Date.now() };
      this.setStatus("tracking");
    } catch {
      // Network/API failure — leave lastSent untouched so the next tick retries.
    } finally {
      this.sending = false;
    }
  };
}

export const riderLocationTracker = new RiderLocationTracker();

export const startTracking = (): void => riderLocationTracker.startTracking();
export const stopTracking = (): void => riderLocationTracker.stopTracking();
