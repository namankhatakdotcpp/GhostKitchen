import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import * as notifService from "./notification.service.js";

const router = express.Router();

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const result = await notifService.getNotifications(req.user.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    await notifService.markAllRead(req.user.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    await notifService.markOneRead(req.user.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
