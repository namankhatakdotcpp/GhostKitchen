import { prisma } from "../../config/prisma.js";
import { redis } from "../../lib/redis.js";
import AppError from "../../utils/AppError.js";
import { getSiteConfigCached } from "../config/config.service.js";

export const getRestaurants = async (
  search,
  city,
  isVeg,
  minRating,
  page = 1,
  limit = 12
) => {
  try {
    const where = {
      isApproved: true,
      suspended: false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(minRating && { rating: { gte: parseFloat(minRating) } }),
    };

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { rating: "desc" },
      }),
      prisma.restaurant.count({ where }),
    ]);

    return {
      restaurants: restaurants || [],
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error("❌ getRestaurants DB error:", error.message);
    throw error;
  }
};

export const getRestaurantById = async (param) => {
  const conditions = [];

  // Always look up by string ID directly (covers UUIDs and legacy ids like "rest-001")
  conditions.push({ id: param });

  // Also try slug lookup
  conditions.push({ slug: param });


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

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
  if (isUUID) {
    conditions.push({ id: param });
  } else {
    conditions.push({ slug: param });
  }

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
    statusNote: restaurant.statusNote ?? null,
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
  const cfg = await getSiteConfigCached();
  const count = await prisma.menuItem.count({ where: { restaurantId } });
  if (count >= cfg.maxMenuItems) {
    throw new AppError(`Menu item limit of ${cfg.maxMenuItems} reached for this restaurant`, 400);
  }
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

export const setRestaurantStatusAndNote = async (id, isOpen, statusNote) => {
  const current = await prisma.restaurant.findUnique({ where: { id }, select: { slug: true } });
  const updated = await prisma.restaurant.update({
    where: { id },
    data: {
      isOpen: Boolean(isOpen),
      statusNote: statusNote || null,
    },
  });
  await invalidateRestaurantCache(id, current?.slug);
  return updated;
};

export const getRestaurantByIdAndOwner = async (restaurantId, ownerId) => {
  return prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      ownerId,
    },
  });
};

export const getRestaurantAnalyticsData = async (restaurantId, range) => {
  const now = new Date();
  let startDate = new Date(now);

  if (range === "today") {
    startDate.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // week (default)
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
  }

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { not: "CANCELLED" },
      createdAt: { gte: startDate },
    },
    select: {
      id: true,
      customerId: true,
      total: true,
      items: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Peak ordering hour
  const hourCounts = {};
  for (const o of orders) {
    const h = new Date(o.createdAt).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const peakEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  let peakOrderingHour = "N/A";
  if (peakEntry) {
    const h = parseInt(peakEntry[0]);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    peakOrderingHour = `${h12}:00 ${ampm}`;
  }

  // Repeat customer rate
  const customerCounts = {};
  for (const o of orders) {
    if (o.customerId) customerCounts[o.customerId] = (customerCounts[o.customerId] || 0) + 1;
  }
  const uniqueCustomers = Object.keys(customerCounts).length;
  const repeats = Object.values(customerCounts).filter((c) => c > 1).length;
  const repeatCustomerRate = uniqueCustomers > 0 ? `${Math.round((repeats / uniqueCustomers) * 100)}%` : "0%";

  // Timeline grouped by day
  const byDate = {};
  for (const o of orders) {
    const d = new Date(o.createdAt);
    const label =
      range === "month"
        ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : d.toLocaleDateString("en-IN", { weekday: "short" });
    if (!byDate[label]) byDate[label] = { orders: 0, revenue: 0 };
    byDate[label].orders++;
    byDate[label].revenue += o.total || 0;
  }
  const timeline = Object.entries(byDate).map(([label, v]) => ({
    label,
    orders: v.orders,
    revenue: Math.round(v.revenue),
  }));

  // Top items by quantity sold (from JSON items array on each order)
  const itemCounts = {};
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const item of items) {
      const name = item.name || "Item";
      if (!itemCounts[name]) itemCounts[name] = { name, value: 0 };
      itemCounts[name].value += item.quantity || 1;
    }
  }
  const topItems = Object.values(itemCounts)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    keyMetrics: { avgOrderValue, peakOrderingHour, repeatCustomerRate },
    timeline,
    topItems,
  };
};
