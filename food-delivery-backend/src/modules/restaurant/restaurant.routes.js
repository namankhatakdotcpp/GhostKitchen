import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  listRestaurants,
  getRestaurant,
  getMenu,
  getMyRestaurant,
  createNewRestaurant,
  updateExistingRestaurant,
  toggleStatus,
  addNewMenuItem,
  updateExistingMenuItem,
  toggleMenuItemStatus,
  deleteExistingMenuItem,
  getRestaurantAnalytics,
} from "./restaurant.controller.js";

const router = express.Router();

// Authenticated shop owner route — must come before /:id to avoid conflict
router.get("/mine", authenticate, authorize(["RESTAURANT", "ADMIN"]), getMyRestaurant);

// Public routes (no authentication required)
router.get("/", listRestaurants);
router.get("/:id", getRestaurant);
router.get("/:id/menu", getMenu);

// Authenticated routes
router.post("/", authenticate, authorize(["RESTAURANT"]), createNewRestaurant);
router.put("/:id", authenticate, authorize(["RESTAURANT", "ADMIN"]), updateExistingRestaurant);
router.patch("/:id/status", authenticate, authorize(["RESTAURANT", "ADMIN"]), toggleStatus);

// Analytics (owner or admin)
router.get("/:id/analytics", authenticate, authorize(["RESTAURANT", "ADMIN"]), getRestaurantAnalytics);

// Menu management routes (owner or admin)
router.post("/:id/menu", authenticate, authorize(["RESTAURANT", "ADMIN"]), addNewMenuItem);
router.put("/:id/menu/:itemId", authenticate, authorize(["RESTAURANT", "ADMIN"]), updateExistingMenuItem);
router.patch("/:id/menu/:itemId/toggle", authenticate, authorize(["RESTAURANT", "ADMIN"]), toggleMenuItemStatus);
router.delete("/:id/menu/:itemId", authenticate, authorize(["RESTAURANT", "ADMIN"]), deleteExistingMenuItem);

export default router;
