import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getIO } from "../../socket/socketServer.js";
import * as svc from "./chat.service.js";

const router = Router();

router.get("/orders/:orderId/chat", authenticate, async (req, res) => {
  await svc.markMessagesRead(req.params.orderId, req.user.id);
  const messages = await svc.getChatHistory(req.params.orderId);
  res.json({ messages });
});

router.post("/orders/:orderId/chat", authenticate, async (req, res) => {
  const role = req.user.activeRole === "DELIVERY" ? "RIDER" : "CUSTOMER";
  const msg = await svc.sendMessage(req.params.orderId, req.user.id, role, req.body.message);

  try { getIO().to(`order-${req.params.orderId}`).emit("chat:message", msg); } catch (_) {}

  res.status(201).json({ message: msg });
});

router.post("/orders/:orderId/chat/read", authenticate, async (req, res) => {
  await svc.markMessagesRead(req.params.orderId, req.user.id);
  res.json({ ok: true });
});

export default router;
