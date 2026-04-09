/**
 * Express Application Setup
 * 
 * Middleware order is critical:
 * 1. CORS (before auth)
 * 2. JSON/Cookie parsers (before routes)
 * 3. Routes
 * 4. Error handling (last)
 */

import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import authRoutes from "./modules/auth/auth.routes.js";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies

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

