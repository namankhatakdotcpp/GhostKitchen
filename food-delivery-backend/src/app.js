import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import authRoutes from "./modules/auth/auth.routes.js";
import orderRoutes from "./modules/orders/orders.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import { seedDatabase } from "../prisma/seed.js";

const app = express();

// CORS configuration - Dynamic verification for all Vercel deployments
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without origin (same-origin requests)
    // Allow all vercel.app domains (preview + production)
    // Allow localhost for development
    if (!origin || origin.includes("vercel.app") || origin.includes("localhost")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(express.json());

// root health check
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: env.CASHFREE_ENV,
  });
});

// debug endpoint - test database connection
app.get("/debug-db", async (req, res) => {
  try {
    const data = await prisma.restaurant.findMany();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🌱 Seed endpoint - seeds production database
app.get("/seed", async (req, res) => {
  try {
    console.log('🌱 Starting production database seeding...');
    await seedDatabase();
    res.json({ 
      success: true, 
      message: "✅ Production DB seeded successfully 🚀",
      status: "Database populated with restaurants and menu items"
    });
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    res.status(500).json({ 
      success: false, 
      message: "❌ Seeding failed",
      error: error.message 
    });
  }
});

// auth routes
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

export default app;
