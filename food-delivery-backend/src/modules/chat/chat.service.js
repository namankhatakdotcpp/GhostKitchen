import { prisma } from "../../config/prisma.js";

export async function getChatHistory(orderId) {
  return prisma.chatMessage.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, imageUrl: true } } },
    take: 200,
  });
}

export async function sendMessage(orderId, senderId, senderRole, message) {
  if (!message?.trim()) throw new Error("Message cannot be empty");
  return prisma.chatMessage.create({
    data: { orderId, senderId, senderRole, message: message.trim().slice(0, 500) },
    include: { sender: { select: { id: true, name: true, imageUrl: true } } },
  });
}

export async function markMessagesRead(orderId, readerId) {
  await prisma.chatMessage.updateMany({
    where: { orderId, senderId: { not: readerId }, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(orderId, userId) {
  return prisma.chatMessage.count({
    where: { orderId, senderId: { not: userId }, readAt: null },
  });
}
