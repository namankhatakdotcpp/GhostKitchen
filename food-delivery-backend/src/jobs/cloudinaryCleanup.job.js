import cron from "node-cron";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { captureException } from "../config/sentry.js";
import { acquireRedisLock, releaseRedisLock } from "../utils/redisLock.js";
import { env } from "../config/env.js";

const LOCK_KEY = "lock:cloudinary-cleanup";
const LOCK_TTL_SEC = 3500; // slightly under the 1-hour schedule
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000; // only delete assets older than 24h

function isCloudinaryConfigured() {
  return !!(env.CLOUDINARY_URL || (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET));
}

/**
 * Collect all image URLs currently referenced in the database so we know
 * which Cloudinary assets are still live. Only ghost-kitchen/* folders are
 * managed by this app — we never touch assets uploaded outside that prefix.
 */
async function collectLiveUrls() {
  const [users, restaurants, menuItems] = await Promise.all([
    prisma.user.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.restaurant.findMany({ select: { imageUrl: true } }),
    prisma.menuItem.findMany({ select: { imageUrl: true } }),
  ]);

  const urls = new Set();
  for (const { imageUrl } of [...users, ...restaurants, ...menuItems]) {
    if (imageUrl) urls.add(imageUrl);
  }
  return urls;
}

/**
 * Fetch all Cloudinary resources under a prefix, handling pagination.
 */
async function listCloudinaryResources(prefix) {
  const resources = [];
  let nextCursor;

  do {
    const response = await cloudinary.api.resources({
      type: "upload",
      prefix,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    resources.push(...response.resources);
    nextCursor = response.next_cursor;
  } while (nextCursor);

  return resources;
}

export const runCloudinaryCleanup = async () => {
  if (!isCloudinaryConfigured()) return;

  if (env.CLOUDINARY_URL) {
    cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
  } else {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }

  const liveUrls = await collectLiveUrls();
  const cutoff = Date.now() - ORPHAN_AGE_MS;

  const prefixes = ["ghostkitchen/"];
  let inspected = 0;
  let deleted = 0;

  for (const prefix of prefixes) {
    let resources;
    try {
      resources = await listCloudinaryResources(prefix);
    } catch (err) {
      logger.error("Cloudinary cleanup: failed to list resources", { prefix, error: err.message });
      continue;
    }

    for (const asset of resources) {
      inspected++;
      const createdAt = new Date(asset.created_at).getTime();
      if (createdAt > cutoff) continue; // uploaded recently — may still be mid-save
      if (liveUrls.has(asset.secure_url)) continue; // referenced in DB

      try {
        await cloudinary.uploader.destroy(asset.public_id);
        deleted++;
        logger.info("Cloudinary cleanup: deleted orphaned asset", { publicId: asset.public_id });
      } catch (err) {
        logger.warn("Cloudinary cleanup: failed to delete asset", { publicId: asset.public_id, error: err.message });
      }
    }
  }

  logger.info("Cloudinary cleanup completed", { inspected, deleted });
  return { inspected, deleted };
};

export const cloudinaryCleanupJobStatus = { lastRunAt: null, lastError: null };

export const startCloudinaryCleanupJob = () => {
  if (!isCloudinaryConfigured()) {
    logger.info("Cloudinary cleanup job skipped — credentials not configured");
    return;
  }

  // Runs once per hour. The 24h age guard means assets uploaded during the
  // current session are never touched — only genuinely abandoned uploads.
  cron.schedule("0 * * * *", async () => {
    const acquired = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      const result = await runCloudinaryCleanup();
      cloudinaryCleanupJobStatus.lastRunAt = new Date().toISOString();
      cloudinaryCleanupJobStatus.lastError = null;
      return result;
    } catch (err) {
      logger.error("Cloudinary cleanup job error", { error: err.message });
      captureException(err, { job: "cloudinary-cleanup" });
      cloudinaryCleanupJobStatus.lastError = err.message;
      cloudinaryCleanupJobStatus.lastRunAt = new Date().toISOString();
    } finally {
      await releaseRedisLock(LOCK_KEY);
    }
  });

  logger.info("Cloudinary cleanup job scheduled (every hour, distributed-lock guarded)");
};
