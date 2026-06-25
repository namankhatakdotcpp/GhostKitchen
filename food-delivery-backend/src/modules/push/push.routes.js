import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getVapidPublicKey, subscribe, unsubscribe } from "./push.controller.js";

const router = express.Router();

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", authenticate, subscribe);
router.post("/unsubscribe", authenticate, unsubscribe);

export default router;
