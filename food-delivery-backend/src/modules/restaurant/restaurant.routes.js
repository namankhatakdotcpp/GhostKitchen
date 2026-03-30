import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import {
  listRestaurants,
  getRestaurant,
  getMenu,
  createNewRestaurant,
  updateExistingRestaurant,
  toggleStatus,
  addNewMenuItem,
  updateExistingMenuItem,
  toggleMenuItemStatus,
  deleteExistingMenuItem,
} from "./restaurant.controller.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", listRestaurants);
router.get("/:id", getRestaurant);
router.get("/:id/menu", getMenu);

// Authenticated routes (SHOPKEEPER role only)
router.post("/", authMiddleware, roleMiddleware(["SHOPKEEPER"]), createNewRestaurant);
router.put("/:id", authMiddleware, roleMiddleware(["SHOPKEEPER"]), updateExistingRestaurant);
router.patch("/:id/status", authMiddleware, roleMiddleware(["SHOPKEEPER"]), toggleStatus);

// Menu management routes (SHOPKEEPER role only)
router.post("/:id/menu", authMiddleware, roleMiddleware(["SHOPKEEPER"]), addNewMenuItem);
router.put("/:id/menu/:itemId", authMiddleware, roleMiddleware(["SHOPKEEPER"]), updateExistingMenuItem);
router.patch("/:id/menu/:itemId/toggle", authMiddleware, roleMiddleware(["SHOPKEEPER"]), toggleMenuItemStatus);
router.delete("/:id/menu/:itemId", authMiddleware, roleMiddleware(["SHOPKEEPER"]), deleteExistingMenuItem);

export default router;
