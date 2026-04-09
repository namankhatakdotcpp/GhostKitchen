/**
 * Express Application Setup
 * 
 * Middleware order is critical:
 * 1. CORS (before auth)
 * 2. Rate limiting (early)
 * 3. Request logging
 * 4. JSON/Cookie parsers (before routes)
 * 5. Routes
 * 6. Error handling (last)
 */

import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import authRoutes from "./modules/auth/auth.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import orderRoutes from "./modules/orders/orders.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import { seedDatabase } from "../prisma/seed.js";
import { globalErrorHandler } from "./middlewares/errorHandler.js";

const app = express();

/**
 * CORS Configuration for cookies
 * 
 * WHY credentials: true:
 * - Allows cookies to be sent/received from frontend
 * - Must match origin headers to work
 * 
 * WHY specific origins in production:
 * - Prevents any origin from accessing cookies
 * - Security measure against CSRF
 */
const corsOptions = {
  origin: process.env.NODE_ENV === "production"
    ? [
        "https://ghostkitchen.vercel.app",
        "https://www.ghostkitchen.vercel.app",
      ]
    : ["http://localhost:3000", "http://localhost:3001"],
  credentials: true, // Allow cookies
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Access-Token",
    "X-Refresh-Token",
  ],
  maxAge: 86400, // 24  hours
};

app.use(cors(corsOptions));

/**
 * Rate Limiting
 * 
 * WHY important:
 * - Prevents brute force attacks (password guessing)
 * - Prevents DDoS attacks (too many requests)
 * - Protects API costs (limits spam)
 * 
 * Configuration:
 * - 15-minute window
 * - Max 100 requests per IP
 * - Auth endpoints stricter (20 requests in 15 min)
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true, // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Stricter limit for auth routes (5 login/register attempts)
  message: "Too many login attempts, please try again later",
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

/**
 * Request Logging
 * 
 * WHY important:
 * - Debug issues (see what requests are coming in)
 * - Monitor API usage
 * - Detect suspicious activity
 * - Audit trail for compliance
 */
app.use((req, res, next) => {
  console.log(`📨 ${req.method.toUpperCase()} ${req.path}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

// Apply stricter rate limiter to auth routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Health checks
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Debug endpoint
app.get("/debug-db", async (req, res) => {
  try {
    const data = await prisma.restaurant.findMany();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Seed endpoint
app.get("/seed", async (req, res, next) => {
  try {
    console.log("🌱 Starting production database seeding...");
    await seedDatabase();
    res.json({
      success: true,
      message: "✅ Production DB seeded successfully 🚀",
      status: "Database populated with restaurants and menu items",
    });
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    next(error);
  }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler (MUST be last)
app.use(globalErrorHandler);

export default app;

