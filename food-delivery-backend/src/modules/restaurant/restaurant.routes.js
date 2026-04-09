import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
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
router.post("/", authenticate, authorize(["SHOPKEEPER"]), createNewRestaurant);
router.put("/:id", authenticate, authorize(["SHOPKEEPER"]), updateExistingRestaurant);
router.patch("/:id/status", authenticate, authorize(["SHOPKEEPER"]), toggleStatus);

// Menu management routes (SHOPKEEPER role only)
router.post("/:id/menu", authenticate, authorize(["SHOPKEEPER"]), addNewMenuItem);
router.put("/:id/menu/:itemId", authenticate, authorize(["SHOPKEEPER"]), updateExistingMenuItem);
router.patch("/:id/menu/:itemId/toggle", authenticate, authorize(["SHOPKEEPER"]), toggleMenuItemStatus);
router.delete("/:id/menu/:itemId", authenticate, authorize(["SHOPKEEPER"]), deleteExistingMenuItem);

export default router;
