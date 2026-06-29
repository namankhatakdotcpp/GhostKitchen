import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as svc from "./support.service.js";

const router = Router();

// Customer
router.post("/user/support/tickets", authenticate, async (req, res) => {
  const ticket = await svc.createTicket(req.user.id, req.body);
  res.status(201).json({ ticket });
});

router.get("/user/support/tickets", authenticate, async (req, res) => {
  const tickets = await svc.getUserTickets(req.user.id);
  res.json({ tickets });
});

router.get("/user/support/tickets/:id", authenticate, async (req, res) => {
  const ticket = await svc.getTicketById(req.params.id, req.user.id);
  res.json({ ticket });
});

// Admin
router.get("/admin/support/tickets", authenticate, authorize("ADMIN"), async (req, res) => {
  const tickets = await svc.adminListTickets({ status: req.query.status });
  res.json({ tickets });
});

router.post("/admin/support/tickets/:id/reply", authenticate, authorize("ADMIN"), async (req, res) => {
  const ticket = await svc.adminReplyToTicket(req.params.id, req.body);
  res.json({ ticket });
});

export default router;
