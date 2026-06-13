/**
 * Derives a delivery rider's live presence status from the timestamp of their
 * last GPS ping. Shared by the location service (broadcast payloads) and the
 * admin live-map service so both agree on the same thresholds.
 *
 *   ONLINE  — last seen within 60 seconds
 *   IDLE    — last seen between 60 seconds and 5 minutes ago
 *   OFFLINE — last seen more than 5 minutes ago, or never
 */

export const RIDER_ONLINE_MS = 60 * 1000;        // 60 seconds
export const RIDER_IDLE_MS = 5 * 60 * 1000;      // 5 minutes

export const RIDER_STATUS = Object.freeze({
  ONLINE: "ONLINE",
  IDLE: "IDLE",
  OFFLINE: "OFFLINE",
});

/**
 * @param {Date|string|number|null|undefined} lastSeenAt
 * @param {Date} [now] - injectable clock for deterministic tests
 * @returns {"ONLINE"|"IDLE"|"OFFLINE"}
 */
export const getRiderStatus = (lastSeenAt, now = new Date()) => {
  if (!lastSeenAt) return RIDER_STATUS.OFFLINE;

  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  const seenMs = seen.getTime();
  if (!Number.isFinite(seenMs)) return RIDER_STATUS.OFFLINE;

  const elapsed = now.getTime() - seenMs;
  if (elapsed < 0) return RIDER_STATUS.ONLINE; // clock skew — treat a future ping as live
  if (elapsed < RIDER_ONLINE_MS) return RIDER_STATUS.ONLINE;
  if (elapsed < RIDER_IDLE_MS) return RIDER_STATUS.IDLE;
  return RIDER_STATUS.OFFLINE;
};
