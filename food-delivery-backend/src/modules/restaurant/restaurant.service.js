import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { getSiteConfigCached } from "../config/config.service.js";
import { cacheGet, cacheSet, cacheDelete, CACHE_KEYS, CACHE_TTL } from "../../utils/cache.js";
import { logger } from "../../utils/logger.js";

// Geocodes a free-text address via OpenStreetMap's Nominatim (no API key).
// Never throws — returns null on any failure so callers can store lat/lng as
// null and let the restaurant simply be excluded from GPS-filtered search
// (see getRestaurants above) rather than silently get a wrong location.
let lastGeocodeAt = 0;
export async function geocodeAddress(addressText) {
  if (!addressText || !addressText.trim()) return null;

  // Nominatim's usage policy requires >=1 request/second — serialize calls
  // process-wide rather than per-restaurant so concurrent creates can't burst it.
  const waitMs = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastGeocodeAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressText)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { "User-Agent": "GhostKitchen/1.0 (restaurant geocoding)" },
    });
    if (!response.ok) {
      logger.warn("Geocoding failed — non-OK response", { addressText, status: response.status });
      return null;
    }
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!first?.lat || !first?.lon) {
      logger.warn("Geocoding failed — no results", { addressText });
      return null;
    }
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
  } catch (error) {
    logger.warn("Geocoding failed — request error", { addressText, error: error.message });
    return null;
  }
}

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

// Distinct cities with at least one open restaurant — backs the city
// picker in location-modal.tsx. Purely additive: does not change how
// getRestaurants itself filters (still GPS-radius + lenient city fallback).
export const getCities = async () => {
  const rows = await prisma.restaurant.findMany({
    where: { isOpen: true, city: { not: null } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return rows.map((r) => r.city).filter(Boolean);
};

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
    // A restaurant with no real lat/lng has no determinable distance from
    // the user — it used to be included anyway "to be safe," which is how a
    // restaurant in Bahadurgarh showed up as "nearby" for a customer 900km
    // away in Vadodara. Excluded entirely from GPS-filtered results now;
    // the tighter Haversine check below also strictly requires coordinates.
    if (latN !== null && lngN !== null) {
      const latDelta = radiusN / 111;
      const lngDelta = radiusN / (111 * Math.cos(latN * Math.PI / 180));
      where.AND = [
        { lat: { not: null } },
        { lng: { not: null } },
        {
          lat: { gte: latN - latDelta, lte: latN + latDelta },
          lng: { gte: lngN - lngDelta, lte: lngN + lngDelta },
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
    // The WHERE clause above already excludes no-coordinate restaurants from
    // `restaurants`, so every row here has real lat/lng — no fallback branch.
    if (latN !== null && lngN !== null) {
      const withDistance = restaurants.map((r) => ({
        ...r,
        distanceKm: Math.round(haversineKm(latN, lngN, r.lat, r.lng) * 10) / 10,
      }));

      const filtered = withDistance.filter((r) => r.distanceKm <= (r.deliveryRadius ?? radiusN));
      filtered.sort((a, b) => a.distanceKm - b.distanceKm);

      total = filtered.length;
      const start = (page - 1) * limit;
      restaurants = filtered.slice(start, start + limit);

      logger.info("Restaurant list filtered by location", {
        userLat: latN, userLng: lngN, userCity, radiusKm: radiusN,
        dbRows: withDistance.length, afterFilter: total,
      });

      // Visibility into restaurants that are currently unreachable by GPS
      // search at all because they've never been geocoded — this is exactly
      // the gap that previously caused the Bahadurgarh-from-Vadodara bug.
      const uncoded = await prisma.restaurant.findMany({
        where: { ...where, AND: undefined, OR: [{ lat: null }, { lng: null }] },
        select: { id: true },
        take: 50,
      });
      for (const r of uncoded) {
        logger.warn("Restaurant excluded from nearby results — no coordinates", { restaurantId: r.id });
      }
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

  // Onboarding only collects a city name, not a street address, so that's
  // the best signal available to geocode from. Never falls back to a
  // default location on failure — lat/lng simply stay null, which now
  // correctly excludes the restaurant from GPS-filtered search (see
  // getRestaurants) instead of letting it show up at a fake location.
  let lat = null, lng = null;
  if (data.lat != null && data.lng != null) {
    lat = data.lat;
    lng = data.lng;
  } else if (data.city) {
    const geocoded = await geocodeAddress(`${data.city}, India`);
    if (geocoded) {
      ({ lat, lng } = geocoded);
    } else {
      logger.warn("Restaurant created without coordinates — geocoding failed", { city: data.city });
    }
  }

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
      // Scalar mirror of address.city — see schema.prisma comment.
      city: data.city || null,
      lat,
      lng,
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
    // Scalar mirror of address.city — see schema.prisma comment.
    if (data.city !== undefined) updateData.city = data.city || null;

    // City changed — re-geocode so lat/lng stay accurate. Never falls back
    // to a default on failure; clears coordinates instead so a stale
    // location from the old city can't linger and mismatch the new one.
    if (data.city !== undefined) {
      if (data.city) {
        const geocoded = await geocodeAddress(`${data.city}, India`);
        if (geocoded) {
          updateData.lat = geocoded.lat;
          updateData.lng = geocoded.lng;
        } else {
          logger.warn("Restaurant city updated without new coordinates — geocoding failed", { restaurantId: id, city: data.city });
          updateData.lat = null;
          updateData.lng = null;
        }
      } else {
        updateData.lat = null;
        updateData.lng = null;
      }
    }
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
      restaurantPayout: true,
      restaurantPackaging: true,
      items: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // What the restaurant actually nets per order — restaurantPayout (its
  // share of the delivery fee + platform fee split) plus restaurantPackaging
  // (100% theirs), NOT the customer-facing `total`, which also includes
  // GST passthrough and the platform's own cut. Orders placed before the
  // pricing system shipped have no breakdown (restaurantPayout is null) —
  // those fall back to gross `total` as the closest available approximation
  // rather than silently contributing ₹0 to the period's revenue.
  const restaurantRevenueOf = (o) =>
    o.restaurantPayout != null ? o.restaurantPayout + (o.restaurantPackaging ?? 0) : o.total || 0;

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + restaurantRevenueOf(o), 0);
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
    byDate[label].revenue += restaurantRevenueOf(o);
  }
  const timeline = Object.entries(byDate).map(([label, v]) => ({
    label,
    orders: v.orders,
    revenue: Math.round(v.revenue),
  }));

  // Best-selling items — by quantity AND by revenue (item.price × quantity,
  // gross of the per-order fee split since menu-item pricing has no payout
  // breakdown of its own; the restaurant-payout adjustment above is an
  // order-level concept, not a per-item one).
  const itemStats = {};
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const item of items) {
      const name = item.name || "Item";
      if (!itemStats[name]) itemStats[name] = { name, value: 0, revenue: 0 };
      const qty = item.quantity || 1;
      itemStats[name].value += qty;
      itemStats[name].revenue += (item.price || 0) * qty;
    }
  }
  const allItems = Object.values(itemStats).map((i) => ({ ...i, revenue: Math.round(i.revenue) }));
  const topItems = [...allItems].sort((a, b) => b.value - a.value).slice(0, 5);
  const topItemsByRevenue = [...allItems].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const result = {
    keyMetrics: {
      totalOrders,
      totalRevenue: Math.round(totalRevenue),
      avgOrderValue,
      peakOrderingHour,
      repeatCustomerRate,
    },
    timeline,
    topItemsByRevenue,
    topItems,
  };
  await cacheSet(cacheKey, result, CACHE_TTL.ANALYTICS);
  return result;
};
