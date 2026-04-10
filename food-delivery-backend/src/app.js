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
import compression from "compression";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { logger, httpLogger } from "./utils/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import orderRoutes from "./modules/order/order.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import reviewRoutes from "./modules/review/review.routes.js";
import couponRoutes from "./modules/coupon/coupon.routes.js";
import { seedDatabase } from "../prisma/seed.js";
import { globalErrorHandler } from "./middlewares/errorHandler.js";
import { requestTracingMiddleware } from "./middlewares/requestTracing.middleware.js";
import { generalLimiter, authLimiter, paymentLimiter } from "./middlewares/rateLimiter.js";
import { redisHealthCheck } from "./config/redis.js";

const app = express();

/**
 * REQUEST TRACING (FIRST MIDDLEWARE)
 * 
 * Assigns unique ID to each request
 * Used for debugging production incidents
 */
app.use(requestTracingMiddleware);

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
 * 
 * RENDER + VERCEL SETUP:
 * - Frontend: Vercel (CORS_ORIGIN env var)
 * - Backend: Render
 * - Both have different domains → credentials: true required
 */
const corsOptions = {
  origin: [
    "https://ghost-kitchen-mw4mnfcmo-namans-projects-dfbad539.vercel.app", 
    "http://localhost:3000", 
    "http://localhost:3001"
  ],
  credentials: true, // Allow cookies (CRITICAL for cross-origin)
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Access-Token",
    "X-Refresh-Token",
  ],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

/**
 * Rate Limiting (Redis-based)
 * 
 * Benefits over express-rate-limit:
 * - Distributed across multiple instances (via Redis)
 * - Automatic TTL expiration
 * - Better performance
 * - Consistent across replicas
 * 
 * Configuration:
 * - General: 100 requests per 15 minutes
 * - Auth: 20 requests per 15 minutes
 * - Payment: 5 requests per 1 minute
 */
app.use(generalLimiter);

/**
 * GZIP Compression (Production Performance)
 * 
 * Reduces response size by 70-80% for JSON/HTML
 * Critical for Render deployment where bandwidth matters
 * Automatically detected by browsers via Accept-Encoding
 */
app.use(compression({ level: 6 })); // level 6 = good balance between speed and compression

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
  const start = Date.now();

  res.on("finish", () => {
    console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`);
  });

  logger.debug(`${req.method.toUpperCase()} ${req.path}`);
  next();
});

/**
 * 🔥 RAW BODY FOR WEBHOOK SIGNATURE VERIFICATION
 * 
 * IMPORTANT: Must come BEFORE express.json()
 * Cashfree signature verification needs the raw request body,
 * not the parsed JSON. The parsed body loses the original formatting.
 * 
 * This middleware captures the raw body for /api/payment/webhook
 * while allowing normal JSON parsing for other routes.
 */
app.use("/api/payment/webhook", express.raw({ type: "application/json" }), (req, res, next) => {
  // Store raw body for signature verification
  req.rawBody = req.body;
  next();
});

// JSON and URL parsers for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

/**
 * Cache Control Headers (Production Performance)
 * 
 * Reduces bandwidth and improves response times
 * Different cache times for different endpoint types
 */
app.use((req, res, next) => {
  // API responses: short cache (60 seconds)
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "public, max-age=60, must-revalidate");
  }
  next();
});

// Apply stricter rate limiter to auth routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Health checks
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

app.get("/health", async (req, res) => {
  try {
    const redisStatus = await redisHealthCheck();
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      redis: redisStatus,
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "UNHEALTHY",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      error: error.message,
    });
  }
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
    logger.info("Starting production database seeding...");
    await seedDatabase();
    res.json({
      success: true,
      message: "✅ Production DB seeded successfully 🚀",
      status: "Database populated with restaurants and menu items",
    });
  } catch (error) {
    logger.error("Seeding failed", { error: error.message });
    next(error);
  }
});

// API Routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);

app.use("/api/cart", cartRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);

app.use("/api/payments/webhook", paymentLimiter); // Stricter for payment endpoint
app.use("/api/payments", paymentLimiter);
app.use("/api/payments", paymentRoutes);

app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/admin", adminRoutes);

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

