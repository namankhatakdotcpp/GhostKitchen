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
  // Accept a single role string too — `"ADMIN".includes("ADMIN")` happens to
  // pass via String.prototype.includes, but only by coincidence.
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Not authenticated", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required roles: ${roles.join(", ")}`,
          403
        )
      );
    }

    next();
  };
};

  