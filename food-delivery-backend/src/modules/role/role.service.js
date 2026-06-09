import { prisma } from "../../config/prisma.js";
import { generateTokenPair, buildTokenPayload } from "../../utils/jwt.js";
import AppError from "../../utils/AppError.js";

const USER_ROLE_SELECT = {
  id: true, name: true, email: true, phone: true,
  roles: true, activeRole: true, secondRole: true, restaurantId: true,
};

async function issueNewToken(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_ROLE_SELECT });
  if (!user) throw new AppError("User not found", 404);
  const { accessToken } = generateTokenPair(buildTokenPayload(user));
  return { token: accessToken, user };
}

export async function switchRole(userId, requestedRole) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_ROLE_SELECT });
  if (!user) throw new AppError("User not found", 404);

  if (!user.roles.includes(requestedRole)) {
    throw new AppError(`You do not have the ${requestedRole} role`, 403);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { activeRole: requestedRole },
    select: USER_ROLE_SELECT,
  });

  const { accessToken } = generateTokenPair(buildTokenPayload(updated));
  return { token: accessToken, activeRole: requestedRole, user: updated };
}

export async function registerRestaurant(userId, restaurantData) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_ROLE_SELECT });
  if (!user) throw new AppError("User not found", 404);

  // Check if user already owns a restaurant (handles partial-failure recovery:
  // restaurant row may exist in DB from a previous 500 where user.update never ran)
  const ownerRestaurants = await prisma.restaurant.findMany({
    where: { ownerId: userId },
    select: { id: true, address: true },
  });

  if (ownerRestaurants.length > 0) {
    // User already has at least one restaurant — make registration idempotent.
    // Whether or not the user record needs healing, return success with the
    // existing restaurant so the frontend can update its store and redirect.
    // (Previously we 409'd when state was already correct, which forced an
    // extra getCurrentUser round-trip on the frontend — now we just return.)
    const existingRestaurant = ownerRestaurants[0];
    const needsHeal = !user.secondRole || !user.restaurantId || !user.roles.includes("RESTAURANT");
    const healed = needsHeal
      ? await prisma.user.update({
          where: { id: userId },
          data: {
            // Only set secondRole if not already populated — preserve DELIVERY
            ...(user.secondRole ? {} : { secondRole: "RESTAURANT" }),
            roles: {
              set: Array.from(new Set([...(user.roles || []), "CUSTOMER", "RESTAURANT"])),
            },
            restaurantId: existingRestaurant.id,
          },
          select: USER_ROLE_SELECT,
        })
      : user;
    const { accessToken } = generateTokenPair(buildTokenPayload(healed));
    const fullRestaurant = await prisma.restaurant.findUnique({ where: { id: existingRestaurant.id } });
    return { token: accessToken, restaurant: fullRestaurant, user: healed };
  }

  if (user.secondRole && user.secondRole !== "RESTAURANT") {
    // They have a non-restaurant second role (DELIVERY) — block.
    throw new AppError("You already have a second role. Remove it before adding another.", 409);
  }

  // Validate required fields up front so we 400 cleanly instead of 500.
  if (!restaurantData?.name || typeof restaurantData.name !== "string" || !restaurantData.name.trim()) {
    throw new AppError("Restaurant name is required", 400);
  }

  const slug = restaurantData.name
    .toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50)
    + "-" + Date.now().toString(36);

  // Wrap create + user-update in a transaction so a partial failure can never
  // leave the restaurant row orphaned with the user roles un-updated.
  const { restaurant, updated } = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name: restaurantData.name,
        slug,
        description: restaurantData.description || "",
        cuisines: restaurantData.cuisines || [],
        ownerId: userId,
        imageUrl: restaurantData.imageUrl || "",
        address: {
          line1: restaurantData.addressLine || "",
          city: restaurantData.city || "",
          deliveryFee: restaurantData.deliveryFee || 3000,
          deliveryTime: restaurantData.deliveryTime || 30,
          minOrder: restaurantData.minOrder || 9900,
        },
        lat: restaurantData.lat ?? null,
        lng: restaurantData.lng ?? null,
        deliveryRadius: restaurantData.deliveryRadius || 5,
      },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        secondRole: "RESTAURANT",
        roles: Array.from(new Set([...(user.roles || []), "CUSTOMER", "RESTAURANT"])),
        restaurantId: restaurant.id,
      },
      select: USER_ROLE_SELECT,
    });

    return { restaurant, updated };
  });

  const { accessToken } = generateTokenPair(buildTokenPayload(updated));
  return { token: accessToken, restaurant, user: updated };
}

export async function addRestaurant(userId, restaurantData) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_ROLE_SELECT });
  if (!user) throw new AppError("User not found", 404);

  if (!user.roles.includes("RESTAURANT")) {
    throw new AppError("You are not a restaurant owner", 403);
  }

  const ownerRestaurants2 = await prisma.restaurant.findMany({
    where: { ownerId: userId },
    select: { id: true, address: true },
  });
  const targetCity2 = (restaurantData.city || "").toLowerCase().trim();
  const existingInCity2 = ownerRestaurants2.find(
    (r) => ((r.address?.city) || "").toLowerCase().trim() === targetCity2
  );
  if (existingInCity2) {
    throw new AppError("You already have a restaurant in this city", 409);
  }

  const slug = restaurantData.name
    .toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50)
    + "-" + Date.now().toString(36);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: restaurantData.name,
      slug,
      description: restaurantData.description || "",
      cuisines: restaurantData.cuisines || [],
      ownerId: userId,
      imageUrl: restaurantData.imageUrl || "",
      address: {
        line1: restaurantData.addressLine || "",
        city: restaurantData.city || "",
        deliveryFee: restaurantData.deliveryFee || 3000,
        deliveryTime: restaurantData.deliveryTime || 30,
        minOrder: restaurantData.minOrder || 9900,
      },
      lat: restaurantData.lat ?? null,
      lng: restaurantData.lng ?? null,
      deliveryRadius: restaurantData.deliveryRadius || 5,
    },
  });

  return restaurant;
}

export async function registerRider(userId, riderData) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_ROLE_SELECT });
  if (!user) throw new AppError("User not found", 404);

  if (user.secondRole) {
    throw new AppError("You already have a second role", 409);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      secondRole: "DELIVERY",
      roles: { set: ["CUSTOMER", "DELIVERY"] },
      vehicleType: riderData.vehicleType || "BIKE",
      vehicleNumber: riderData.vehicleNumber || null,
      isAvailable: false,
    },
    select: USER_ROLE_SELECT,
  });

  const { accessToken } = generateTokenPair(buildTokenPayload(updated));
  return { token: accessToken, user: updated };
}

export async function getMyRestaurants(userId) {
  return prisma.restaurant.findMany({
    where: { ownerId: userId },
    include: {
      menuItems: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateMyRestaurant(userId, restaurantId, data) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, ownerId: userId },
  });
  if (!restaurant) throw new AppError("Restaurant not found or unauthorized", 404);

  const updateData = {};
  if (data.name) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.cuisines) updateData.cuisines = data.cuisines;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.deliveryRadius) updateData.deliveryRadius = data.deliveryRadius;
  if (data.isOpen !== undefined) updateData.isOpen = data.isOpen;
  if (data.lat !== undefined) updateData.lat = data.lat;
  if (data.lng !== undefined) updateData.lng = data.lng;

  if (data.city || data.addressLine || data.deliveryFee || data.deliveryTime || data.minOrder) {
    const current = restaurant.address || {};
    updateData.address = {
      ...current,
      ...(data.addressLine && { line1: data.addressLine }),
      ...(data.city && { city: data.city }),
      ...(data.deliveryFee !== undefined && { deliveryFee: data.deliveryFee }),
      ...(data.deliveryTime !== undefined && { deliveryTime: data.deliveryTime }),
      ...(data.minOrder !== undefined && { minOrder: data.minOrder }),
    };
  }

  return prisma.restaurant.update({ where: { id: restaurantId }, data: updateData });
}
