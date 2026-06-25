import webpush from "web-push";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const vapidConfigured = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
} else {
  logger.warn("Web Push not configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing) — push sends will be skipped");
}

export const isPushConfigured = () => vapidConfigured;

// Upsert on endpoint, not (userId, endpoint) — the Push API spec guarantees
// one endpoint per subscribed device, so re-subscribing the same browser
// (e.g. after clearing permissions and re-granting) naturally replaces its
// old keys rather than accumulating duplicate rows.
export async function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error("Invalid push subscription payload");
  }
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

export async function removeSubscription(endpoint) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Sends to every device a user has subscribed on. Never throws — a push
// failure must not block the order-status transition it's attached to.
// A 404/410 response means the push service itself says the subscription is
// gone (browser uninstalled, permission revoked, etc.) — prune it so this
// user's future sends don't keep retrying a dead endpoint forever.
export async function sendPushToUser(userId, { title, body, url }) {
  if (!vapidConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url ?? "/" });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeSubscription(sub.endpoint).catch(() => {});
        } else {
          logger.error("Push send failed", { userId, endpoint: sub.endpoint, error: err.message, statusCode: err.statusCode });
        }
      }
    }),
  );
}
