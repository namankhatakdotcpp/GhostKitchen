import {
  getRestaurants,
  getRestaurantById,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  toggleRestaurantStatus,
  setRestaurantStatusAndNote,
  addMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  getMenuItemByIdAndRestaurant,
  getRestaurantByIdAndOwner,
  getRestaurantWithCache,
  getRestaurantAnalyticsData,
} from "./restaurant.service.js";
import { redis } from "../../lib/redis.js";
import { prisma } from "../../config/prisma.js";
import {
  validateRestaurant,
  validateMenuItem,
  validateUpdateRestaurant,
} from "./restaurant.validation.js";

export const getMyRestaurant = async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { ownerId: req.user.userId },
      include: {
        menuItems: { where: { isAvailable: true }, orderBy: { category: "asc" } },
        _count: { select: { orders: true } },
      },
    });

    if (!restaurant) {
      return res.status(404).json({ success: false, message: "No restaurant found for this account" });
    }

    return res.json({ success: true, data: restaurant });
  } catch (error) {
    console.error("Error fetching own restaurant:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const listRestaurants = async (req, res) => {
  try {
    const { search, city, isVeg, minRating, page = 1, limit = 12 } = req.query;

    console.log("📋 Fetching restaurants:", { search, city, minRating, page, limit });

    const result = await getRestaurants(search, city, isVeg, minRating, parseInt(page), parseInt(limit));

    console.log(`✅ Found ${result?.restaurants?.length || 0} restaurants`);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch restaurants",
      error: error?.message,
    });
  }
};

export const getRestaurant = async (req, res) => {
  try {
    const param = req.params.id;

    if (!param) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID required",
      });
    }

    console.log("[Restaurant API]", {
      route: "/restaurants/:id",
      param,
      time: new Date().toISOString(),
    });

    const data = await getRestaurantWithCache(param);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    return res.json({
      success: true,
      data,
    });

  } catch (err) {
    console.error("[Restaurant API ERROR]", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getMenu = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Restaurant ID is required" });
    }

    const isOwner = req.user && req.user.role === "RESTAURANT";

    console.log("📖 Fetching menu for restaurant:", { id, isOwner });
    const menu = await getRestaurantMenu(id, isOwner);

    if (!menu) {
      console.warn("⚠️ Restaurant not found or no menu:", id);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    console.log("✅ Menu fetched:", { restaurantId: id, categories: Object.keys(menu).length });
    return res.status(200).json(menu);
  } catch (error) {
    console.error("❌ Error fetching menu:", {
      message: error?.message,
      restaurantId: req.params.id,
    });
    return res.status(500).json({
      message: "Failed to fetch menu",
      error: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  }
};

export const createNewRestaurant = async (req, res) => {
  try {
    const { name, cuisines, city, deliveryFee, deliveryTime, minOrder, description, imageUrl, deliveryRadius } = req.body;

    const validationError = validateRestaurant({
      name,
      cuisines,
      city,
      deliveryFee,
      deliveryTime,
      minOrder,
    });

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const restaurant = await createRestaurant(
      {
        name,
        cuisines,
        city,
        deliveryFee,
        deliveryTime,
        minOrder,
        description,
        imageUrl,
        deliveryRadius,
      },
      req.user.userId
    );

    await redis.del("restaurants:all");

    return res.status(201).json({ message: "Restaurant created successfully", restaurant });
  } catch (error) {
    console.error("Error creating restaurant:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateExistingRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const validationError = validateUpdateRestaurant(updateData);

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const updated = await updateRestaurant(id, updateData);

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(200).json({ message: "Restaurant updated successfully", restaurant: updated });
  } catch (error) {
    console.error("Error updating restaurant:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);

    if (!restaurant) {
      return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const updated = await toggleRestaurantStatus(id);

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(200).json({ message: "Restaurant status updated", restaurant: updated });
  } catch (error) {
    console.error("Error toggling restaurant status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const setRestaurantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isOpen, statusNote } = req.body;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const updated = await setRestaurantStatusAndNote(id, isOpen, statusNote ?? null);
    return res.json({ success: true, restaurant: updated });
  } catch (error) {
    console.error("Error setting restaurant status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getRestaurantAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { range = "week" } = req.query;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const data = await getRestaurantAnalyticsData(id, range);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const addNewMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, description, imageUrl, isVeg, isBestseller } = req.body;

    // ADMIN can manage any restaurant's menu
    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const validationError = validateMenuItem({ name, price, category, description, imageUrl, isVeg, isBestseller });

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const menuItem = await addMenuItem(id, {
      name,
      price,
      category,
      description,
      imageUrl,
      isVeg,
      isBestseller,
    });

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(201).json({ message: "Menu item added successfully", menuItem });
  } catch (error) {
    console.error("Error adding menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateExistingMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const updateData = req.body;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const validationError = validateMenuItem(updateData);

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const updated = await updateMenuItem(id, itemId, updateData);

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(200).json({ message: "Menu item updated successfully", menuItem: updated });
  } catch (error) {
    console.error("Error updating menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleMenuItemStatus = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const updated = await toggleMenuItemAvailability(itemId);

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(200).json({ message: "Menu item availability toggled", menuItem: updated });
  } catch (error) {
    console.error("Error toggling menu item availability:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteExistingMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) return res.status(403).json({ message: "You are not the owner of this restaurant" });
    }

    const menuItem = await getMenuItemByIdAndRestaurant(itemId, id);

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    await deleteMenuItem(itemId);

    await redis.del(`restaurant:${id}`);
    await redis.del("restaurants:all");

    return res.status(200).json({ message: "Menu item deleted successfully" });
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
