import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { getRiderStatus } from "../../utils/riderStatus.js";
import { emitRiderLocationUpdate } from "../../socket/socket.server.js";

// Validates a single coordinate component and returns it as a finite Number.
const coord = (value, { min, max, label }) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return n;
};

// Optional numeric field (heading/speed) — returns null when absent, validates otherwise.
const optionalNumber = (value, { min, max, label }) => {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return n;
};

/**
 * Upserts a rider's live GPS position, mirrors it onto the User row (so the
 * existing nearest-agent assignment keeps working off currentLat/currentLng),
 * and broadcasts the update to the admin live map.
 *
 * The rider id is always the authenticated user — never trusted from the body.
 */
export const updateRiderLocation = async (riderId, { latitude, longitude, heading, speed } = {}) => {
  const lat = coord(latitude, { min: -90, max: 90, label: "latitude" });
  const lng = coord(longitude, { min: -180, max: 180, label: "longitude" });
  const head = optionalNumber(heading, { min: 0, max: 360, label: "heading" });
  const spd = optionalNumber(speed, { min: 0, max: 1000, label: "speed" });

  const location = await prisma.riderLocation.upsert({
    where: { riderId },
    create: { riderId, latitude: lat, longitude: lng, heading: head, speed: spd },
    update: { latitude: lat, longitude: lng, heading: head, speed: spd },
  });

  // Keep the legacy User location columns in sync for proximity assignment.
  await prisma.user.update({
    where: { id: riderId },
    data: { currentLat: lat, currentLng: lng },
  });

  const status = getRiderStatus(location.lastSeenAt);

  emitRiderLocationUpdate({
    riderId,
    latitude: location.latitude,
    longitude: location.longitude,
    heading: location.heading,
    speed: location.speed,
    status,
    lastSeenAt: location.lastSeenAt,
  });

  return { ...location, status };
};
