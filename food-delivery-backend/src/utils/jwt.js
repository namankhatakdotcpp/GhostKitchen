/**
 * JWT Token Management
 * 
 * WHY two tokens:
 * - Access Token: Short-lived (15 minutes), used for API calls
 * - Refresh Token: Long-lived (7 days), used to get new access tokens
 * 
 * Benefits:
 * - If access token is leaked, exposure is minimal (15 min)
 * - If refresh token is leaked, user can logout from all devices
 * - Refresh token can be stored in HTTP-only cookies (CSRF protected)
 * - Access token can be stored in memory or localStorage
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Generate Access Token
 * @param {Object} payload - Data to encode in token
 * @returns {string} Signed JWT access token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "15m", // Short-lived
    algorithm: "HS256",
  });
};

/**
 * Generate Refresh Token
 * @param {Object} payload - Data to encode in token
 * @returns {string} Signed JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d", // Long-lived
    algorithm: "HS256",
  });
};

/**
 * Generate both tokens (utility)
 * @param {Object} payload - Data to encode in tokens
 * @returns {Object} Object with accessToken and refreshToken
 */
export const generateTokenPair = (payload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

/**
 * Verify Access Token
 * @param {string} token - JWT to verify
 * @returns {Object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Access token expired");
    }
    throw new Error("Invalid access token");
  }
};

/**
 * Verify Refresh Token
 * @param {string} token - JWT to verify
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Refresh token expired");
    }
    throw new Error("Invalid refresh token");
  }
};

/**
 * Legacy function for backward compatibility
 * @deprecated Use generateAccessToken instead
 */
export const generateToken = (payload) => {
  return generateAccessToken(payload);
};

/**
 * Legacy function for backward compatibility
 * @deprecated Use verifyAccessToken instead
 */
export const verifyToken = (token) => {
  return verifyAccessToken(token);
};

