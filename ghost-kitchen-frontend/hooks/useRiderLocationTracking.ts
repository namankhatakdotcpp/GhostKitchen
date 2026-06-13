"use client";

/**
 * useRiderLocationTracking
 *
 * Streams a delivery rider's GPS position to POST /api/delivery/location while
 * they are online. The rider's identity is taken from their auth token on the
 * server (never sent from the client), so this hook only needs coordinates.
 *
 * Behaviour (per ops requirements):
 *  - Uses navigator.geolocation.watchPosition (OS-coalesced — battery friendly)
 *    to keep the latest fix, plus a flush timer as a heartbeat.
 *  - Heartbeat every 10s while the tab is visible, every 30s while backgrounded.
 *  - A send only happens when the rider moved ≥20m OR ≥10s elapsed since the
 *    last successful send — so we never spam the API while stationary.
 *  - Network failures leave the "last sent" marker untouched, so the next tick
 *    naturally retries.
 *  - Stops (clears watch + timer) when disabled, and on unmount — which covers
 *    going offline, logout, and role switch (all unmount the delivery shell).
 */

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { metersBetween } from "@/lib/liveMap";

const VISIBLE_INTERVAL_MS = 10_000; // 10s while visible
const HIDDEN_INTERVAL_MS = 30_000; // 30s while backgrounded
const MIN_DISTANCE_M = 20; // send if moved at least this far
const MIN_ELAPSED_MS = 10_000; // ...or at least this much time has passed

export type RiderTrackingStatus = "idle" | "tracking" | "denied" | "unavailable" | "error";

type Fix = { lat: number; lng: number; heading: number | null; speed: number | null };

export function useRiderLocationTracking(enabled: boolean): RiderTrackingStatus {
  const [status, setStatus] = useState<RiderTrackingStatus>("idle");

  const latest = useRef<Fix | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const sending = useRef(false);
  const watchId = useRef<number | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    let cancelled = false;
    lastSent.current = null;

    const send = async () => {
      const cur = latest.current;
      if (!cur || sending.current) return;

      const prev = lastSent.current;
      const elapsed = prev ? Date.now() - prev.at : Infinity;
      const moved = prev ? metersBetween(prev.lat, prev.lng, cur.lat, cur.lng) : Infinity;
      if (moved < MIN_DISTANCE_M && elapsed < MIN_ELAPSED_MS) return;

      sending.current = true;
      try {
        await api.post("/delivery/location", {
          latitude: cur.lat,
          longitude: cur.lng,
          ...(cur.heading != null ? { heading: cur.heading } : {}),
          ...(cur.speed != null ? { speed: cur.speed } : {}),
        });
        lastSent.current = { lat: cur.lat, lng: cur.lng, at: Date.now() };
        if (!cancelled) setStatus("tracking");
      } catch {
        // Network failure: leave lastSent untouched so the next tick retries.
      } finally {
        sending.current = false;
      }
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude, heading, speed } = pos.coords;
        latest.current = {
          lat: latitude,
          lng: longitude,
          heading: heading != null && Number.isFinite(heading) ? Math.round(heading) : null,
          // Geolocation speed is m/s; the rest of the app shows km/h.
          speed: speed != null && Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null,
        };
        setStatus("tracking");
        void send(); // opportunistic — gated to ≥20m moves between heartbeats
      },
      (err) => {
        if (cancelled) return;
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    const intervalFor = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? HIDDEN_INTERVAL_MS
        : VISIBLE_INTERVAL_MS;

    const startFlush = () => {
      if (flushTimer.current != null) clearInterval(flushTimer.current);
      flushTimer.current = setInterval(() => void send(), intervalFor());
    };
    startFlush();

    const onVisibility = () => {
      startFlush(); // re-arm at the new cadence
      if (document.visibilityState === "visible") void send();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (flushTimer.current != null) clearInterval(flushTimer.current);
      watchId.current = null;
      flushTimer.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return status;
}
