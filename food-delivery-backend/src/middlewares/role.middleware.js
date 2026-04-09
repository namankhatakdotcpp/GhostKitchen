/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Usage:
 * router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteUser)
 * 
 * Only ADMIN role can access this route
 */

import AppError from "../utils/AppError.js";

export const roleMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Not authenticated", 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required roles: ${allowedRoles.join(", ")}`,
          403
        )
      );
    }

    next();
  };
};

  