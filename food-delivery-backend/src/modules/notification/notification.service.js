import { prisma } from "../../config/prisma.js";
import { getIO } from "../../socket/socketServer.js";
import { logger } from "../../utils/logger.js";

export async function createNotification({ userId, title, body, type, entityId }) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, body, type, entityId: entityId ?? null },
    });
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit("notification:new", notification);
    } catch {
      // Socket not initialized or user offline — notification is still persisted
    }
    return notification;
  } catch (error) {
    logger.error("Failed to create notification", { userId, type, error: error.message });
  }
}

export async function getNotifications(userId, { cursor, limit = 20 } = {}) {
  const take = Math.min(Number(limit) || 20, 50);
  const [notifications, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1, // fetch one extra to determine if there's a next page
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return { notifications: items, unreadCount, nextCursor, hasMore };
}

export async function markAllRead(userId) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export async function markOneRead(userId, notificationId) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

export async function deleteNotification(userId, notificationId) {
  await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
}

export async function deleteAllNotifications(userId) {
  await prisma.notification.deleteMany({ where: { userId } });
}
