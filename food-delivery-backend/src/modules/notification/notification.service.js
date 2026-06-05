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

export async function getNotifications(userId) {
  const [notifications, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { notifications, unreadCount };
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
