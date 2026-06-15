import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { getSiteConfigCached } from "../config/config.service.js";
import { cacheGet, cacheSet, cacheDelete, CACHE_KEYS, CACHE_TTL } from "../../utils/cache.js";
import { logger } from "../../utils/logger.js";

// Haversine formula — returns distance in km between two lat/lng pairs.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export const getRestaurants = async (
  search,
  city,
  isVeg,
  minRating,
  page = 1,
  limit = 12,
  isOpen,
  cuisine,
  lat,
  lng,
  radius = 15  // km — default service radius
) => {
  try {
    const latN = lat ? parseFloat(lat) : null;
    const lngN = lng ? parseFloat(lng) : null;
    const radiusN = parseFloat(radius) || 15;
    const userCity = city ? city.toLowerCase().trim() : null;

    const where = {
      isApproved: true,
      suspended: false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { cuisines: { has: search } },
        ],
      }),
      ...(minRating && { rating: { gte: parseFloat(minRating) } }),
      ...(isOpen === "true" && { isOpen: true }),
      // Restaurant has no isVeg column — "pure veg" means every available
      // menu item is vegetarian. (`isVeg: true` in this WHERE threw a Prisma
      // validation error and 500'd the whole browse page.)
      ...(isVeg === "true" && {
        menuItems: { some: {}, none: { isVeg: false, isAvailable: true } },
      }),
      ...(cuisine && { cuisines: { has: cuisine } }),
    };

    // Bounding-box pre-filter when user coordinates are provided.
    // Restaurants that have no lat/lng stored are always included (we can't
    // determine their distance, so we err on the side of showing them).
    // The tighter Haversine check runs in JS below after the DB fetch.
    if (latN !== null && lngN !== null) {
      const latDelta = radiusN / 111;
      const lngDelta = radiusN / (111 * Math.cos(latN * Math.PI / 180));
      where.AND = [
        {
          OR: [
            { lat: null },
            { lng: null },
            {
              lat: { gte: latN - latDelta, lte: latN + latDelta },
              lng: { gte: lngN - lngDelta, lte: lngN + lngDelta },
            },
          ],
        },
      ];
    }

    // Fetch more than the page size when doing in-JS distance filtering,
    // because the bounding box over-selects (corners are ~41% larger).
    const fetchLimit = (latN !== null && lngN !== null) ? limit * 2 : limit;
    const fetchSkip = (latN !== null && lngN !== null) ? 0 : (page - 1) * limit;

    let [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        take: fetchLimit,
        skip: fetchSkip,
        orderBy: { rating: "desc" },
      }),
      prisma.restaurant.count({ where }),
    ]);

    // Location filtering pass — runs in JS after the DB bounding-box pre-filter.
    // Priority: Haversine (most accurate) > city match (text) > no filter.
    if (latN !== null && lngN !== null) {
      const withDistance = restaurants.map((r) => ({
        ...r,
        distanceKm:
          r.lat != null && r.lng != null
            ? Math.round(haversineKm(latN, lngN, r.lat, r.lng) * 10) / 10
            : null,
      }));

      const filtered = withDistance.filter((r) => {
        if (r.distanceKm !== null) {
          // Has GPS coords: Haversine check against restaurant's own delivery radius
          return r.distanceKm <= (r.deliveryRadius ?? radiusN);
        }
        // No GPS coords: fall back to city string match so a Bahadurgarh user
        // doesn't see Delhi restaurants that happen to have no coordinates.
        const rc = (r.address?.city || "").toLowerCase().trim();
        if (!rc || !userCity) return true; // Truly unknown — show anyway
        return rc === userCity;
      });

      // Sort: nearest-first for restaurants with coordinates; then by rating.
      filtered.sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return b.rating - a.rating;
      });

      total = filtered.length;
      const start = (page - 1) * limit;
      restaurants = filtered.slice(start, start + limit);

      logger.info("Restaurant list filtered by location", {
        userLat: latN, userLng: lngN, userCity, radiusKm: radiusN,
        dbRows: withDistance.length, afterFilter: total,
      });
    } else if (userCity) {
      // No GPS — use city string only. Never show restaurants from a different city.
      // Restaurants with no address.city are shown anyway (can't determine location).
      const allForCity = restaurants.filter((r) => {
        const rc = (r.address?.city || "").toLowerCase().trim();
        if (!rc) return true; // No city stored — benefit of the doubt
        return rc === userCity;
      });

      logger.info("Restaurant list filtered by city", {
        userCity, dbRows: restaurants.length, afterFilter: allForCity.length,
      });

      total = allForCity.length;
      const start = (page - 1) * limit;
      restaurants = allForCity.slice(start, start + limit);
    }

    return {
      restaurants: restaurants || [],
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error("getRestaurants DB error", { error: error.message });
    throw error;
  }
};

export const getRestaurantById = async (param) => {
  return await prisma.restaurant.findFirst({
    where: {
      OR: [{ id: param }, { slug: param }],
      suspended: false,
      isApproved: true,
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
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
  const cacheKey = `restaurant:${isUUID ? "id" : "slug"}:${param}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const restaurant = await prisma.restaurant.findFirst({
    where: {
      OR: isUUID ? [{ id: param }] : [{ slug: param }],
      suspended: false,
      isApproved: true,
    },
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

  await cacheSet(cacheKey, formatted, 60);
  return formatted;
};

const invalidateRestaurantCache = async (id, slug) => {
  const keys = [];
  if (id) keys.push(`restaurant:id:${id}`);
  if (slug) keys.push(`restaurant:slug:${slug}`);
  if (keys.length) await cacheDelete(...keys);
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
  const cfg = await getSiteConfigCached().catch(() => null);

  const slug = data.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50) + "-" + Date.now().toString(36);

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
      isApproved: cfg ? !cfg.requireApproval : true,
      isOpen: cfg ? !cfg.requireApproval : true,
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
    // Generate slug when name changes (unique suffix avoids collisions)
    updateData.slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) + "-" + Date.now().toString(36);
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
  const cacheKey = CACHE_KEYS.ANALYTICS(restaurantId, range ?? "week");
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
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

  const result = {
    keyMetrics: {
      totalOrders,
      totalRevenue: Math.round(totalRevenue),
      avgOrderValue,
      peakOrderingHour,
      repeatCustomerRate,
    },
    timeline,
    topItems,
  };
  await cacheSet(cacheKey, result, CACHE_TTL.ANALYTICS);
  return result;
};
