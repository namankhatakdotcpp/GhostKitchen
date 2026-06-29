import { prisma } from "../../config/prisma.js";
import { createNotification } from "../notification/notification.service.js";
import { sendPushToUser } from "../push/push.service.js";

export async function createTicket(userId, { subject, description, orderId = null }) {
  return prisma.supportTicket.create({
    data: { userId, subject, description: description.slice(0, 2000), orderId: orderId || null },
  });
}

export async function getUserTickets(userId) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getTicketById(id, userId) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error("Ticket not found");
  if (userId && ticket.userId !== userId) throw new Error("Not found");
  return ticket;
}

export async function adminListTickets({ status } = {}) {
  return prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 200,
  });
}

export async function adminReplyToTicket(ticketId, { adminReply, status = "RESOLVED" }) {
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { adminReply, status, repliedAt: new Date() },
  });

  await createNotification({
    userId: ticket.userId,
    title: "Support ticket update",
    body: `Your ticket "${ticket.subject}" has been ${status.toLowerCase()}.`,
    type: "SUPPORT",
    entityId: ticket.id,
  });

  await sendPushToUser(ticket.userId, {
    title: "Support ticket update",
    body: adminReply.slice(0, 120),
    data: { type: "SUPPORT", ticketId: ticket.id },
  }).catch(() => {});

  return ticket;
}
