import { env } from "../../config/env.js";
import { saveSubscription, removeSubscription, isPushConfigured } from "./push.service.js";

// GET /api/push/vapid-public-key — the frontend needs this to call
// pushManager.subscribe({ applicationServerKey: ... }).
export const getVapidPublicKey = (req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ message: "Push notifications are not configured on this server" });
  }
  return res.json({ publicKey: env.VAPID_PUBLIC_KEY });
};

// POST /api/push/subscribe
export const subscribe = async (req, res) => {
  try {
    const subscription = req.body?.subscription ?? req.body;
    await saveSubscription(req.user.userId, subscription);
    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Invalid subscription" });
  }
};

// POST /api/push/unsubscribe
export const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "endpoint is required" });
    await removeSubscription(endpoint);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Unable to unsubscribe" });
  }
};
