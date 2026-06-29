import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as svc from "./addons.service.js";

const router = Router();

// Public: get addons for a menu item
router.get("/menu-items/:menuItemId/addons", async (req, res) => {
  const groups = await svc.getAddonGroupsForItem(req.params.menuItemId);
  res.json({ groups });
});

// Restaurant / admin: manage addon groups
router.post(
  "/role/menu-items/:menuItemId/addons/groups",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    const group = await svc.createAddonGroup(req.params.menuItemId, req.body);
    res.status(201).json({ group });
  }
);

router.put(
  "/role/addons/groups/:groupId",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    const { name, required, multiSelect, maxSelect, sortOrder } = req.body;
    const group = await svc.updateAddonGroup(req.params.groupId, { name, required, multiSelect, maxSelect, sortOrder });
    res.json({ group });
  }
);

router.delete(
  "/role/addons/groups/:groupId",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    await svc.deleteAddonGroup(req.params.groupId);
    res.json({ ok: true });
  }
);

router.post(
  "/role/addons/groups/:groupId/options",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    const option = await svc.createAddonOption(req.params.groupId, req.body);
    res.status(201).json({ option });
  }
);

router.put(
  "/role/addons/options/:optionId",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    const option = await svc.updateAddonOption(req.params.optionId, req.body);
    res.json({ option });
  }
);

router.delete(
  "/role/addons/options/:optionId",
  authenticate,
  authorize("RESTAURANT", "ADMIN"),
  async (req, res) => {
    await svc.deleteAddonOption(req.params.optionId);
    res.json({ ok: true });
  }
);

export default router;
