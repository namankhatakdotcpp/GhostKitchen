import { prisma } from "../../config/prisma.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import {
  generateTokenPair,
  generateAccessToken,
  verifyRefreshToken,
  buildTokenPayload,
  hashToken,
} from "../../utils/jwt.js";
import AppError from "../../utils/AppError.js";

const USER_SELECT = {
  id: true, name: true, email: true, phone: true,
  roles: true, activeRole: true, secondRole: true, restaurantId: true,
  createdAt: true, updatedAt: true,
};

function refreshExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

async function storeRefreshToken(userId, rawToken) {
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: refreshExpiry(),
    },
  });
}

export const registerUser = async (data) => {
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new AppError("Email already registered", 409);

  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      phone: data.phone || null,
      roles: ["CUSTOMER"],
      activeRole: "CUSTOMER",
    },
    select: USER_SELECT,
  });

  const { accessToken, refreshToken } = generateTokenPair(buildTokenPayload(user));
  await storeRefreshToken(user.id, refreshToken);

  return {
    success: true,
    message: "User registered successfully",
    data: {
      user: { ...user, role: "CUSTOMER" },
      // Tokens returned here so the controller can set them as cookies.
      // The controller MUST NOT forward them in the JSON body.
      tokens: { accessToken, refreshToken },
    },
  };
};

export const loginUser = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...USER_SELECT, password: true, isBlocked: true, isSuspended: true },
  });

  if (!user) throw new AppError("Invalid email or password", 401);

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) throw new AppError("Invalid email or password", 401);

  if (user.isBlocked) throw new AppError("Your account has been blocked. Contact support.", 403);
  if (user.isSuspended) throw new AppError("Your account is currently suspended. Contact support.", 403);

  const { password: _, ...userWithoutPassword } = user;

  const { accessToken, refreshToken } = generateTokenPair(buildTokenPayload(user));
  await storeRefreshToken(user.id, refreshToken);

  return {
    success: true,
    message: "Login successful",
    data: {
      user: { ...userWithoutPassword, role: userWithoutPassword.activeRole },
      tokens: { accessToken, refreshToken },
    },
  };
};

export const refreshAccessToken = async (rawRefreshToken) => {
  // 1. Verify signature and expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  // 2. Look up the hash in DB
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || new Date() > stored.expiresAt) {
    throw new AppError("Refresh token revoked or expired", 401);
  }

  // 3. Fetch current user info (roles/restaurantId may have changed since login)
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { ...USER_SELECT, isBlocked: true, isSuspended: true },
  });
  if (!user) throw new AppError("User not found", 404);

  // Blocked/suspended users must not be able to mint new access tokens —
  // otherwise a block only takes effect after the refresh token expires (7d).
  if (user.isBlocked || user.isSuspended) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    throw new AppError("Account is blocked or suspended", 403);
  }

  // 4. Rotate: delete old token, issue new pair.
  // deleteMany (not delete) — two concurrent refreshes with the same token
  // would make the second delete throw P2025 and surface as a 500.
  const deleted = await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  if (deleted.count === 0) {
    // Token already rotated by a concurrent request — treat as revoked.
    throw new AppError("Refresh token revoked or expired", 401);
  }

  const { isBlocked: _b, isSuspended: _s, ...safeUser } = user;
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(buildTokenPayload(safeUser));
  await storeRefreshToken(user.id, newRefreshToken);

  // Opportunistic cleanup: purge this user's expired tokens so the table
  // doesn't grow unboundedly (no separate cron needed).
  prisma.refreshToken
    .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
    .catch(() => {});

  return {
    success: true,
    message: "Token refreshed",
    data: {
      user: { ...safeUser, role: safeUser.activeRole },
      tokens: { accessToken, refreshToken: newRefreshToken },
    },
  };
};

export const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) throw new AppError("User not found", 404);

  // Auto-heal orphaned restaurant registrations. If the user owns a restaurant
  // in the DB but their user record is out of sync (roles/secondRole/restaurantId
  // missing — from a pre-transaction partial failure), repair it on read so the
  // role-switch banner appears without requiring a re-registration attempt.
  //
  // Wrapped in try/catch so a heal failure (enum mismatch, race, etc.) NEVER
  // breaks /auth/me. The endpoint must always return a user payload — if heal
  // fails we just return the unhealed user and try again next request.
  try {
    const needsHeal =
      !Array.isArray(user.roles) ||
      !user.roles.includes("RESTAURANT") ||
      !user.secondRole ||
      !user.restaurantId;

    if (needsHeal) {
      const ownedRestaurant = await prisma.restaurant.findFirst({
        where: { ownerId: userId },
        select: { id: true },
      });
      if (ownedRestaurant) {
        const currentRoles = Array.isArray(user.roles) ? user.roles : [];
        const nextRoles = Array.from(new Set([...currentRoles, "CUSTOMER", "RESTAURANT"]));
        const healed = await prisma.user.update({
          where: { id: userId },
          data: {
            roles: { set: nextRoles },
            // Only set secondRole if not already populated (don't clobber DELIVERY)
            ...(user.secondRole ? {} : { secondRole: "RESTAURANT" }),
            restaurantId: ownedRestaurant.id,
          },
          select: USER_SELECT,
        });
        return healed;
      }
    }
  } catch (healErr) {
    // Log but don't fail the request — the user can still browse the app.
    console.warn("[auth.me] heal failed, returning unhealed user:", healErr.message);
  }

  return user;
};

export const logoutUser = async (userId, rawRefreshToken) => {
  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    await prisma.refreshToken.deleteMany({ where: { userId, tokenHash } });
  }
  return { success: true, message: "Logged out successfully" };
};

export const logoutAllDevices = async (userId) => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
  return { success: true, message: "Logged out from all devices" };
};
