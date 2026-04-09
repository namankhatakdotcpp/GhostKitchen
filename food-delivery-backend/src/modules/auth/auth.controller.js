/**
 * Authentication Controller
 * 
 * Handles HTTP requests and responses for auth endpoints
 * Manages cookies and sends consistent JSON responses
 */

import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
  logoutAllDevices,
} from "./auth.service.js";
import AppError from "../../utils/AppError.js";

/**
 * Cookie configuration for HTTP-only, secure cookies
 * 
 * WHY HTTP-only:
 * - Prevents XSS attacks from accessing token
 * - Only sent with HTTP requests, not accessible via JS
 * 
 * Secure flag:
 * - Only sent over HTTPS in production
 *
 * SameSite:
 * - Prevents CSRF attacks
 * - Lax: Allows cookies for navigation, not for XHR
 */
const COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "lax", // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

/**
 * Register endpoint
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", result.data.tokens.refreshToken, COOKIE_CONFIG);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Login endpoint
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body.email, req.body.password);

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", result.data.tokens.refreshToken, COOKIE_CONFIG);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const me = async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.userId);
    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 * POST /api/auth/refresh
 * 
 * Client can send refresh token in:
 * 1. cookies (automatically sent)
 * 2. request body
 * 3. Authorization header (refresh-token scheme)
 */
export const refresh = async (req, res, next) => {
  try {
    // Get refresh token from multiple sources
    const refreshToken =
      req.cookies.refreshToken ||
      req.body.refreshToken ||
      req.headers["x-refresh-token"];

    if (!refreshToken) {
      throw new AppError("Refresh token missing", 401);
    }

    const result = await refreshAccessToken(refreshToken);

    // Set new refresh token in cookie
    res.cookie("refreshToken", result.data.refreshToken || refreshToken, COOKIE_CONFIG);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Logout endpoint
 * POST /api/auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    const refreshToken =
      req.cookies.refreshToken ||
      req.body.refreshToken ||
      req.headers["x-refresh-token"];

    await logoutUser(req.user.userId, refreshToken);

    // Clear refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout from all devices
 * POST /api/auth/logout-all
 */
export const logoutAll = async (req, res, next) => {
  try {
    await logoutAllDevices(req.user.userId);

    // Clear refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (error) {
    next(error);
  }
};

