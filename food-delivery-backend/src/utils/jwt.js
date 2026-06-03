import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";

// ── Token generators ──────────────────────────────────────────────────────────

export const generateAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m", algorithm: "HS256" });

export const generateRefreshToken = (payload) =>
  // Refresh tokens carry only userId — minimal surface area
  jwt.sign(
    { userId: payload.userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
  );

export const generateTokenPair = (payload) => ({
  accessToken: generateAccessToken(payload),
  refreshToken: generateRefreshToken(payload),
});

// ── Token verifiers ───────────────────────────────────────────────────────────

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    if (error.name === "TokenExpiredError") throw new Error("Access token expired");
    throw new Error("Invalid access token");
  }
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    if (error.name === "TokenExpiredError") throw new Error("Refresh token expired");
    throw new Error("Invalid refresh token");
  }
};

// ── Token hashing ─────────────────────────────────────────────────────────────
// Store SHA-256 hash in DB — never the raw token.
// If the database is breached, raw tokens cannot be replayed.

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// ── Payload builder ───────────────────────────────────────────────────────────

export const buildTokenPayload = (user) => ({
  userId: user.id,
  roles: user.roles ?? ["CUSTOMER"],
  activeRole: user.activeRole ?? "CUSTOMER",
  secondRole: user.secondRole ?? null,
  restaurantId: user.restaurantId ?? null,
});

// ── Legacy aliases (keep existing callers working) ────────────────────────────
export const generateToken = generateAccessToken;
export const verifyToken = verifyAccessToken;
