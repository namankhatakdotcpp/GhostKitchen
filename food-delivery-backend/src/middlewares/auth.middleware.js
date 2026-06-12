import { verifyAccessToken } from "../utils/jwt.js";
import { roleMiddleware } from "./role.middleware.js";

export const authenticate = (req, res, next) => {
  try {
    // 1. HttpOnly cookie (primary — browser requests)
    let token = req.cookies?.access_token;

    // 2. Authorization header fallback (API clients / mobile / server-to-server)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
    }

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.message.includes("expired")) {
        // Structured code so the frontend interceptor can catch and auto-refresh
        return res.status(401).json({ message: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = {
      userId: decoded.userId,
      roles: decoded.roles ?? [decoded.role ?? "CUSTOMER"],
      activeRole: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
      role: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
      secondRole: decoded.secondRole ?? null,
      restaurantId: decoded.restaurantId ?? null,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Authentication failed" });
  }
};

// Like authenticate but never blocks — sets req.user if token is valid, otherwise continues
export const optionalAuthenticate = (req, res, next) => {
  try {
    let token = req.cookies?.access_token;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
    }
    if (!token) return next();
    try {
      const decoded = verifyAccessToken(token);
      req.user = {
        userId: decoded.userId,
        roles: decoded.roles ?? [decoded.role ?? "CUSTOMER"],
        activeRole: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
        role: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
        secondRole: decoded.secondRole ?? null,
        restaurantId: decoded.restaurantId ?? null,
      };
    } catch {
      // Invalid or expired — treat as unauthenticated
    }
    next();
  } catch {
    next();
  }
};

export const authorize = roleMiddleware;
