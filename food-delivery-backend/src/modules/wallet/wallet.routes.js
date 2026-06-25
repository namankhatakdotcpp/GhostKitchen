import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getWallet, redeemPreview } from "./wallet.controller.js";

const router = express.Router();

router.get("/", authenticate, getWallet);
router.post("/redeem-preview", authenticate, redeemPreview);

export default router;
