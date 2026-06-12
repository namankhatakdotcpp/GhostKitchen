import { logger } from "../../utils/logger.js";
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
import { cacheDelete } from "../../utils/cache.js";
import { prisma } from "../../config/prisma.js";

// Invalidate the read-through cache used by getRestaurantWithCache.
// (The previous redis.del("restaurant:<id>") calls hit keys that never
// existed, and the raw Upstash client threw when env vars were unset.)
async function invalidateRestaurant(id) {
  try {
    const r = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });
    const keys = [`restaurant:id:${id}`];
    if (r?.slug) keys.push(`restaurant:slug:${r.slug}`);
    await cacheDelete(...keys);
  } catch { /* cache invalidation is best-effort */ }
}
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
    logger.error("Error fetching own restaurant", { error: error.message });
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const listRestaurants = async (req, res) => {
  try {
    const { search, city, isVeg, minRating, page = 1, limit = 12, isOpen, cuisine } = req.query;
    const result = await getRestaurants(search, city, isVeg, minRating, parseInt(page), parseInt(limit), isOpen, cuisine);

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to fetch restaurants", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch restaurants",
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

    logger.debug("GET /restaurants/:id", { param });

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
    logger.error("GET /restaurants/:id failed", { error: err.message, param: req.params.id });
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

    // Only the actual owner of THIS restaurant (or an admin) sees unavailable items.
    // A RESTAURANT-role user who doesn't own this restaurant gets the public view.
    let isOwner = false;
    if (req.user?.role === "ADMIN") {
      isOwner = true;
    } else if (req.user?.role === "RESTAURANT") {
      const owned = await prisma.restaurant.findFirst({
        where: { id, ownerId: req.user.userId },
        select: { id: true },
      });
      isOwner = !!owned;
    }

    const menu = await getRestaurantMenu(id, isOwner);

    if (!menu) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.status(200).json(menu);
  } catch (error) {
    logger.error("Error fetching menu", { restaurantId: req.params.id, error: error?.message });
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


    return res.status(201).json({ message: "Restaurant created successfully", restaurant });
  } catch (error) {
    logger.error("Error creating restaurant", { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateExistingRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) {
        return res.status(403).json({ message: "You are not the owner of this restaurant" });
      }
    }

    const validationError = validateUpdateRestaurant(updateData);

    if (validationError) {
      return res.status(400).json({ message: "Validation error", errors: validationError });
    }

    const updated = await updateRestaurant(id, updateData);

    await invalidateRestaurant(id);

    return res.status(200).json({ message: "Restaurant updated successfully", restaurant: updated });
  } catch (error) {
    logger.error("Error updating restaurant", { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "ADMIN") {
      const restaurant = await getRestaurantByIdAndOwner(id, req.user.userId);
      if (!restaurant) {
        return res.status(403).json({ message: "You are not the owner of this restaurant" });
      }
    }

    const updated = await toggleRestaurantStatus(id);

    await invalidateRestaurant(id);

    return res.status(200).json({ message: "Restaurant status updated", restaurant: updated });
  } catch (error) {
    logger.error("Error toggling restaurant status", { error: error.message });
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
    logger.error("Error setting restaurant status", { error: error.message });
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
    logger.error("Error fetching analytics", { error: error.message });
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

    await invalidateRestaurant(id);

    return res.status(201).json({ message: "Menu item added successfully", menuItem });
  } catch (error) {
    logger.error("Error adding menu item", { error: error.message });
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

    await invalidateRestaurant(id);

    return res.status(200).json({ message: "Menu item updated successfully", menuItem: updated });
  } catch (error) {
    logger.error("Error updating menu item", { error: error.message });
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

    await invalidateRestaurant(id);

    return res.status(200).json({ message: "Menu item availability toggled", menuItem: updated });
  } catch (error) {
    logger.error("Error toggling menu item availability", { error: error.message });
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

    await invalidateRestaurant(id);

    return res.status(200).json({ message: "Menu item deleted successfully" });
  } catch (error) {
    logger.error("Error deleting menu item", { error: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Shared serializer for recommendation results
function serializeRestaurant(r) {
  return {
    id: r.id, name: r.name, slug: r.slug, imageUrl: r.imageUrl,
    cuisines: r.cuisines, rating: r.rating, reviewCount: r.reviewCount,
    isOpen: r.isOpen, statusNote: r.statusNote, address: r.address,
  };
}

const RESTAURANT_SELECT = {
  id: true, name: true, slug: true, imageUrl: true, cuisines: true,
  rating: true, reviewCount: true, isOpen: true, statusNote: true, address: true,
};

// GET /restaurants/recommendations — personalised for the authenticated user
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      // Unauthenticated: fall through to trending
      return getTrending(req, res);
    }

    // 1. What cuisines has this user ordered before?
    const pastOrders = await prisma.order.findMany({
      where: { customerId: userId, status: "DELIVERED" },
      include: { restaurant: { select: { cuisines: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const orderedRestaurantIds = new Set(pastOrders.map((o) => o.restaurantId));
    const cuisineFreq = {};
    for (const o of pastOrders) {
      for (const c of o.restaurant.cuisines ?? []) {
        cuisineFreq[c] = (cuisineFreq[c] ?? 0) + 1;
      }
    }
    const topCuisines = Object.entries(cuisineFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([c]) => c);

    // 2. Also include their favorited cuisines
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: { restaurant: { select: { cuisines: true } } },
      take: 10,
    });
    for (const f of favorites) {
      for (const c of f.restaurant.cuisines ?? []) {
        if (!topCuisines.includes(c)) topCuisines.push(c);
      }
    }

    // 3. Find open restaurants matching those cuisines, not yet ordered from
    const recommended = await prisma.restaurant.findMany({
      where: {
        isOpen: true,
        suspended: false,
        isApproved: true,
        cuisines: topCuisines.length > 0 ? { hasSome: topCuisines } : undefined,
        id: orderedRestaurantIds.size > 0 ? { notIn: [...orderedRestaurantIds] } : undefined,
      },
      select: RESTAURANT_SELECT,
      orderBy: { rating: "desc" },
      take: 8,
    });

    // Fallback: if too few results, top-rated open restaurants
    let results = recommended;
    if (results.length < 4) {
      const fallback = await prisma.restaurant.findMany({
        where: {
          isOpen: true, suspended: false, isApproved: true,
          id: { notIn: results.map((r) => r.id) },
        },
        select: RESTAURANT_SELECT,
        orderBy: { rating: "desc" },
        take: 8 - results.length,
      });
      results = [...results, ...fallback];
    }

    res.json({ restaurants: results.map(serializeRestaurant) });
  } catch (error) {
    logger.error("Error fetching recommendations", { error: error.message });
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET /restaurants/trending — by order volume in last 7 days
export const getTrending = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const grouped = await prisma.order.groupBy({
      by: ["restaurantId"],
      where: { createdAt: { gte: since }, status: { not: "CANCELLED" } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    });

    if (grouped.length === 0) {
      const topRated = await prisma.restaurant.findMany({
        where: { isOpen: true, suspended: false, isApproved: true },
        select: RESTAURANT_SELECT,
        orderBy: { rating: "desc" },
        take: 8,
      });
      return res.json({ restaurants: topRated.map(serializeRestaurant) });
    }

    const ids = grouped.map((g) => g.restaurantId);
    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: ids }, isOpen: true, suspended: false },
      select: RESTAURANT_SELECT,
    });

    const countById = new Map(grouped.map((g) => [g.restaurantId, g._count.id]));
    const sorted = restaurants.sort(
      (a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0)
    );

    res.json({ restaurants: sorted.map(serializeRestaurant) });
  } catch (error) {
    logger.error("Error fetching trending", { error: error.message });
    res.status(500).json({ message: "Internal server error" });
  }
};
