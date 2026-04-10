import { prisma } from "../../config/prisma.js";
import { redis } from "../../lib/redis.js";

export const getRestaurants = async (
  search,
  city,
  isVeg,
  minRating,
  page = 1,
  limit = 12
) => {
  try {
    console.log("PARAMS:", { search, city, page, limit });

    const restaurants = await prisma.restaurant.findMany({
      take: limit,
      skip: (page - 1) * limit,
    });

    console.log("DB RESULT:", restaurants);

    return {
      restaurants: restaurants || [],
      pagination: { page, limit }
    };
  } catch (error) {
    console.error("❌ getRestaurants DB error:", error.message);
    throw error;
  }
};

export const getRestaurantById = async (param) => {
  // Build conditions array to avoid NaN issues
  const conditions = [];

  // Only add numeric ID condition if param is a valid number
  if (!isNaN(Number(param)) && param !== "") {
    conditions.push({ id: Number(param) });
  }

  // Always try slug lookup (more reliable)
  conditions.push({ slug: param });

  // If no conditions, return null
  if (conditions.length === 0) {
    return null;
  }

  return await prisma.restaurant.findFirst({
    where: {
      OR: conditions,
    },
    include: {
      owner: {
        select: { id: true, name: true, email: true, phone: true },
      },
      menuItems: {
        orderBy: { category: "asc" },
      },
    },
  });
};

export const getRestaurantWithCache = async (param) => {
  // Normalize cache key to prevent collision between ID and slug lookups
  const normalizedKey = isNaN(Number(param))
    ? `slug:${param}`
    : `id:${param}`;
  const cacheKey = `restaurant:${normalizedKey}`;

  // 1. CHECK CACHE WITH ERROR HANDLING
  let cached = null;
  try {
    cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ CACHE HIT:", cacheKey);
      return cached;
    }
  } catch (redisError) {
    console.warn("[Cache] Redis read failed:", redisError.message);
    // Continue with DB query if cache fails
  }

  console.log("🐢 CACHE MISS:", cacheKey);

  const conditions = [];

  if (!isNaN(Number(param))) {
    conditions.push({ id: param });
  }

  conditions.push({ slug: param });

  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: conditions },
    include: {
      menuItems: {
        select: {
          id: true,
          name: true,
          price: true,
          description: true,
          category: true,
          imageUrl: true,
          isVeg: true,
          isAvailable: true,
          isBestseller: true,
        },
      },
    },
  });

  if (!restaurant) return null;

  const formatted = {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    cuisines: restaurant.cuisines,
    rating: restaurant.rating ?? 0,
    imageUrl: restaurant.imageUrl,
    menu: restaurant.menuItems ?? [],
    ownerId: restaurant.ownerId,
    address: restaurant.address,
    isOpen: restaurant.isOpen,
    deliveryRadius: restaurant.deliveryRadius,
  };

  // 2. CACHE RESULT WITH ERROR HANDLING
  try {
    await redis.set(cacheKey, formatted, { ex: 60 });
  } catch (redisError) {
    console.warn("[Cache] Redis write failed:", redisError.message);
    // Still return data even if cache write fails
  }

  return formatted;
};

// CACHE INVALIDATION helper
const invalidateRestaurantCache = async (id, slug) => {
  try {
    if (id) await redis.del(`restaurant:id:${id}`);
    if (slug) await redis.del(`restaurant:slug:${slug}`);
    await redis.del("restaurants:all");
  } catch (redisError) {
    console.warn("[Cache] Invalidation failed:", redisError.message);
    // Don't crash if cache invalidation fails
  }
};

export const getRestaurantMenu = async (id, isOwner = false) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      menuItems: {
        where: isOwner ? {} : { isAvailable: true },
        orderBy: { category: "asc" },
      },
    },
  });

  if (!restaurant) {
    return null;
  }

  const groupedMenu = {};
  restaurant.menuItems.forEach((item) => {
    if (!groupedMenu[item.category]) {
      groupedMenu[item.category] = [];
    }
    groupedMenu[item.category].push(item);
  });

  return groupedMenu;
};

export const createRestaurant = async (data, ownerId) => {
  // Generate slug from restaurant name
  const slug = data.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .slice(0, 50); // Limit slug length

  return prisma.restaurant.create({
    data: {
      name: data.name,
      slug,
      description: data.description || "",
      cuisines: data.cuisines,
      ownerId,
      imageUrl: data.imageUrl || "",
      address: {
        city: data.city,
        deliveryFee: data.deliveryFee,
        deliveryTime: data.deliveryTime,
        minOrder: data.minOrder,
      },
      deliveryRadius: data.deliveryRadius || 5,
    },
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });
};

export const updateRestaurant = async (id, data) => {
  // Fetch current restaurant to get slug
  const current = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });

  const updateData = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
    // Generate slug when name changes
    const slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
    updateData.slug = slug;
  }
  
  if (data.description !== undefined) updateData.description = data.description;
  if (data.cuisines !== undefined) updateData.cuisines = data.cuisines;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.deliveryRadius !== undefined) updateData.deliveryRadius = data.deliveryRadius;

  if (data.city || data.deliveryFee !== undefined || data.deliveryTime !== undefined || data.minOrder !== undefined) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { address: true },
    });

    const address = restaurant?.address || {};
    if (data.city !== undefined) address.city = data.city;
    if (data.deliveryFee !== undefined) address.deliveryFee = data.deliveryFee;
    if (data.deliveryTime !== undefined) address.deliveryTime = data.deliveryTime;
    if (data.minOrder !== undefined) address.minOrder = data.minOrder;

    updateData.address = address;
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data: updateData,
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Invalidate cache for both old and new slug
  await invalidateRestaurantCache(id, current?.slug || updateData.slug);

  return updated;
};

export const toggleRestaurantStatus = async (id) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: { isOpen: true, slug: true },
  });

  if (!restaurant) return null;

  const updated = await prisma.restaurant.update({
    where: { id },
    data: { isOpen: !restaurant.isOpen },
    include: {
      owner: {
        select: { id: true, name: true },
      },
    },
  });

  // Invalidate cache
  await invalidateRestaurantCache(id, restaurant.slug);

  return updated;
};

export const addMenuItem = async (restaurantId, data) => {
  return prisma.menuItem.create({
    data: {
      restaurantId,
      name: data.name,
      description: data.description || "",
      price: parseFloat(data.price),
      category: data.category,
      imageUrl: data.imageUrl || "",
      isVeg: data.isVeg || false,
      isAvailable: true,
      isBestseller: data.isBestseller || false,
    },
  });
};

export const updateMenuItem = async (restaurantId, itemId, data) => {
  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = parseFloat(data.price);
  if (data.category !== undefined) updateData.category = data.category;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.isVeg !== undefined) updateData.isVeg = data.isVeg;
  if (data.isBestseller !== undefined) updateData.isBestseller = data.isBestseller;

  return prisma.menuItem.update({
    where: { id: itemId },
    data: updateData,
  });
};

export const toggleMenuItemAvailability = async (itemId) => {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { isAvailable: true },
  });

  return prisma.menuItem.update({
    where: { id: itemId },
    data: { isAvailable: !item.isAvailable },
  });
};

export const deleteMenuItem = async (itemId) => {
  return prisma.menuItem.delete({
    where: { id: itemId },
  });
};

export const getMenuItemByIdAndRestaurant = async (itemId, restaurantId) => {
  return prisma.menuItem.findFirst({
    where: {
      id: itemId,
      restaurantId,
    },
  });
};

export const getRestaurantByIdAndOwner = async (restaurantId, ownerId) => {
  return prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      ownerId,
    },
  });
};
