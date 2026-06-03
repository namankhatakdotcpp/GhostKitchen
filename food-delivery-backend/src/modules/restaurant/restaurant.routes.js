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
} from "./restaurant.controller.js";

const router = express.Router();

// Authenticated shop owner route — must come before /:id to avoid conflict
router.get("/mine", authenticate, authorize(["RESTAURANT", "ADMIN"]), getMyRestaurant);

// Public routes (no authentication required)
router.get("/", listRestaurants);
router.get("/:id", getRestaurant);
router.get("/:id/menu", getMenu);

// Authenticated routes (RESTAURANT role only)
router.post("/", authenticate, authorize(["RESTAURANT"]), createNewRestaurant);
router.put("/:id", authenticate, authorize(["RESTAURANT"]), updateExistingRestaurant);
router.patch("/:id/status", authenticate, authorize(["RESTAURANT"]), toggleStatus);

// Menu management routes (RESTAURANT role only)
router.post("/:id/menu", authenticate, authorize(["RESTAURANT"]), addNewMenuItem);
router.put("/:id/menu/:itemId", authenticate, authorize(["RESTAURANT"]), updateExistingMenuItem);
router.patch("/:id/menu/:itemId/toggle", authenticate, authorize(["RESTAURANT"]), toggleMenuItemStatus);
router.delete("/:id/menu/:itemId", authenticate, authorize(["RESTAURANT"]), deleteExistingMenuItem);

export default router;
