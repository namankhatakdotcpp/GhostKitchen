/**
 * Authentication Routes
 * 
 * Public routes:
 * - POST /register - Register new user
 * - POST /login - Login with email/password
 * 
 * Protected routes:
 * - GET /me - Get current user
 * - POST /refresh - Refresh access token
 * - POST /logout - Logout single device
 * - POST /logout-all - Logout all devices
 */

import express from "express";
import { register, login, me, refresh, logout, logoutAll } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate, registerSchema, loginSchema } from "./auth.schema.js";

const router = express.Router();

// Public routes
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

// Protected routes
router.get("/me", authMiddleware, me);
router.post("/refresh", refresh);
router.post("/logout", authMiddleware, logout);
router.post("/logout-all", authMiddleware, logoutAll);

export default router;

