"use client";

/**
 * Thin React bindings over the singleton rider location tracker (see
 * lib/locationTracker.ts). All tracking logic lives in the service; these hooks
 * only drive start/stop and surface the live status to components.
 */

import { useEffect, useState } from "react";

import {
  riderLocationTracker,
  startTracking,
  stopTracking,
  type RiderTrackingStatus,
} from "@/lib/locationTracker";

export type { RiderTrackingStatus };

/**
 * Controls tracking: starts when `enabled` is true, stops when it flips false or
 * the component unmounts (logout / role switch / leaving the delivery portal).
 */
export function useRiderLocationTracking(enabled: boolean): RiderTrackingStatus {
  const [status, setStatus] = useState<RiderTrackingStatus>(riderLocationTracker.getStatus());

  useEffect(() => {
    const unsubscribe = riderLocationTracker.subscribe(setStatus);
    if (enabled) startTracking();
    else stopTracking();
    setStatus(riderLocationTracker.getStatus());

    return () => {
      unsubscribe();
      if (enabled) stopTracking();
    };
  }, [enabled]);

  return status;
}

/** Read-only subscription to the tracker status — for displaying presence. */
export function useRiderTrackingStatus(): RiderTrackingStatus {
  const [status, setStatus] = useState<RiderTrackingStatus>(riderLocationTracker.getStatus());

  useEffect(() => {
    setStatus(riderLocationTracker.getStatus());
    return riderLocationTracker.subscribe(setStatus);
  }, []);

  return status;
}
