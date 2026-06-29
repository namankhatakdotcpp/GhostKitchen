import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import * as svc from "./referral.service.js";

const router = Router();

router.get("/user/referral/stats", authenticate, async (req, res) => {
  const stats = await svc.getReferralStats(req.user.id);
  res.json(stats);
});

router.post("/user/referral/apply", authenticate, async (req, res) => {
  const referral = await svc.applyReferralCode(req.user.id, req.body.code ?? "");
  res.status(201).json({ referral });
});

export default router;
