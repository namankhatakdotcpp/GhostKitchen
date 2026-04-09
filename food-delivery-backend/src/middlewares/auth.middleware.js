/**
 * Authentication Middleware
 * 
 * Verifies JWT access token from multiple sources:
 * 1. Authorization header (Bearer scheme)
 * 2. Custom header (X-Access-Token)
 * 3. Cookies (from HTTP-only cookies)
 * 
 * Attaches decoded user info to req.user
 */

import { verifyAccessToken } from "../utils/jwt.js";
import AppError from "../utils/AppError.js";
import { roleMiddleware } from "./role.middleware.js";

export const authenticate = (req, res, next) => {
  try {
    // Get token from multiple sources
    let token = null;

    // 1. Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7); // Remove "Bearer " prefix
    }

    // 2. Custom header
    if (!token) {
      token = req.headers["x-access-token"];
    }

    // 3. Cookie (if client sends token in cookie)
    if (!token && req.cookies) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError("No token provided", 401);
    }

    // Verify and decode token
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.message.includes("expired")) {
      next(new AppError("Token expired, please refresh", 401));
    } else {
      next(new AppError("Invalid token", 401));
    }
  }
};

export const authorize = roleMiddleware;
