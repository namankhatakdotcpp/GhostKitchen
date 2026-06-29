import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as svc from "./giftcard.service.js";

const router = Router();

// Public check (used at checkout)
router.post("/gift-cards/check", authenticate, async (req, res) => {
  const card = await svc.checkGiftCard(req.body.code ?? "");
  res.json({
    code: card.code,
    remainingValuePaise: card.remainingValuePaise,
    originalValuePaise: card.originalValuePaise,
    expiresAt: card.expiresAt,
  });
});

// Admin: CRUD
router.post("/admin/gift-cards", authenticate, authorize("ADMIN"), async (req, res) => {
  const card = await svc.adminCreateGiftCard(req.body);
  res.status(201).json({ card });
});

router.get("/admin/gift-cards", authenticate, authorize("ADMIN"), async (req, res) => {
  const cards = await svc.adminListGiftCards();
  res.json({ cards });
});

export default router;
