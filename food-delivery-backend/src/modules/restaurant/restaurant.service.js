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
  const where = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { cuisines: { has: search } },
    ];
  }

  // City filtering via JSON is complex; skipping for now or implement raw SQL
  // if (city) {
  //   where.AND = [
  //     { address: { path: ["city"], string_contains: city } },
  //   ];
  // }

  if (minRating !== undefined) {
    where.rating = { gte: parseFloat(minRating) };
  }

  const skip = (page - 1) * limit;

  try {
    const cacheKey = "restaurants:all";
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.restaurant.count({ where }),
    ]);

    const formatted = restaurants.map(r => ({
      ...r,
      name: r.name || r.title,
      cuisines: r.cuisines || r.category || [],
      rating: r.rating ?? 0,
      image: r.imageUrl || r.image || null,
      imageUrl: r.imageUrl || r.image || null,
    }));

    const pages = Math.ceil(total / limit);

    const result = {
      restaurants: formatted || [],
      total: total || 0,
      page,
      pages,
    };

    if (!search && !city && !minRating && page === 1) {
      await redis.set(cacheKey, result, { ex: 120 });
    }

    return result;
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
  const cacheKey = `restaurant:${param}`;

  // 1. CHECK CACHE
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("⚡ CACHE HIT:", cacheKey);
    return cached;
  }

  console.log("🐢 CACHE MISS:", cacheKey);

  const conditions = [];

  if (!isNaN(Number(param))) {
    // Only push if UUID fallback works or it's genuinely a digit ID
    // We kept string for id so we push it directly if it matches our general assumption
    conditions.push({ id: param });
  } else {
    // Push anyway if param is a string UUID
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
    cuisines: restaurant.cuisines,
    rating: restaurant.rating ?? 0,
    image: restaurant.imageUrl ?? null,
    menu: restaurant.menuItems ?? [],
    ownerId: restaurant.ownerId,
    address: restaurant.address,
    isOpen: restaurant.isOpen,
    deliveryRadius: restaurant.deliveryRadius,
  };

  // 2. STORE CACHE
  await redis.set(cacheKey, formatted, { ex: 60 });

  return formatted;
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

  return prisma.restaurant.update({
    where: { id },
    data: updateData,
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });
};

export const toggleRestaurantStatus = async (id) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: { isOpen: true },
  });

  return prisma.restaurant.update({
    where: { id },
    data: { isOpen: !restaurant.isOpen },
    include: {
      owner: {
        select: { id: true, name: true },
      },
    },
  });
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
