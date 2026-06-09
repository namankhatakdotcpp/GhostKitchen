import cors from "cors";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { logger } from "./utils/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import orderRoutes from "./modules/orders/orders.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import reviewRoutes from "./modules/review/review.routes.js";
import couponRoutes from "./modules/coupon/coupon.routes.js";
import roleRoutes from "./modules/role/role.routes.js";
import deliveryRoutes from "./modules/delivery/delivery.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import { seedDatabase } from "../prisma/seed.js";
import { globalErrorHandler } from "./middlewares/errorHandler.js";
import { requestTracingMiddleware } from "./middlewares/requestTracing.middleware.js";
import {
  generalLimiter, authLimiter, paymentLimiter,
  roleSwitchLimiter, browseLimiter,
} from "./middlewares/rateLimiter.js";
import { sanitizeBody } from "./middlewares/sanitize.middleware.js";
import { redisHealthCheck } from "./config/redis.js";

const app = express();

// ── 1. Security headers (FIRST — before anything touches the response) ─────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://sdk.cashfree.com",
        "https://checkout.cashfree.com",
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        env.FRONTEND_URL,
        "wss:",
        "https://sdk.cashfree.com",
      ],
      frameSrc: ["https://checkout.cashfree.com"],
      objectSrc: ["'none'"],
      // Only send upgrade-insecure-requests header in production
      upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
    },
  },
  // Required for Cashfree iframe to load cross-origin
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,      // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// ── 2. Request tracing ────────────────────────────────────────────────────────
app.use(requestTracingMiddleware);

// ── 3. CORS — explicit allowlist, no wildcards ────────────────────────────────
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow all Vercel preview deployments
    if (origin.endsWith(".vercel.app")) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID"],
  maxAge: 600,  // 10 minutes preflight cache
}));

// ── 4. Compression ────────────────────────────────────────────────────────────
app.use(compression({ level: 6 }));

// ── 5. Raw body for webhook signature verification (before express.json) ─────
app.use("/api/payment/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  req.rawBody = req.body;
  next();
});

// ── 6. Body parsers + cookies ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── 7. XSS sanitisation on every request body ────────────────────────────────
app.use(sanitizeBody);

// ── 8. Request logging ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => logger.debug(`${req.method} ${req.url} ${res.statusCode} — ${Date.now() - start}ms`));
  next();
});

// ── 9. Short-circuit cache headers for API routes ────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

// ── 10. Tiered rate limiters ──────────────────────────────────────────────────
app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/refresh", authLimiter);
app.use("/api/role/switch", roleSwitchLimiter);
app.use("/api/payments", paymentLimiter);
app.use("/api/restaurants", browseLimiter);

// ── 11. Health / diagnostic endpoints ────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "GhostKitchen API running" }));

app.get("/health", async (_req, res) => {
  try {
    const redisStatus = await redisHealthCheck();
    res.json({ status: "OK", timestamp: new Date().toISOString(), environment: env.NODE_ENV, redis: redisStatus });
  } catch (error) {
    res.status(503).json({ status: "UNHEALTHY", error: error.message });
  }
});

// Seed endpoint — protected by ALLOW_SEED env gate in seed.js
app.get("/seed", async (req, res, next) => {
  try {
    await seedDatabase();
    res.json({ success: true, message: "DB seeded" });
  } catch (error) {
    next(error);
  }
});

// Bootstrap admin — one-time endpoint to grant ADMIN to a user.
// Requires BOOTSTRAP_SECRET env var to be set on Render.
// Remove BOOTSTRAP_SECRET from Render env vars after use.
app.post("/bootstrap-admin", async (req, res) => {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    return res.status(403).json({ success: false, message: "Bootstrap not enabled. Set BOOTSTRAP_SECRET env var on Render first." });
  }
  const { email, secret: provided } = req.body;
  if (!provided || provided !== secret) {
    return res.status(403).json({ success: false, message: "Invalid secret." });
  }
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
    });
    if (!user) {
      const all = await prisma.user.findMany({ select: { email: true, name: true } });
      return res.status(404).json({
        success: false,
        message: `User not found: ${email}. Register at the frontend first.`,
        registeredUsers: all.map((u) => u.email),
      });
    }
    const roles = user.roles.includes("ADMIN") ? user.roles : [...user.roles, "ADMIN"];
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { roles, activeRole: "ADMIN" },
      select: { id: true, name: true, email: true, roles: true, activeRole: true },
    });
    logger.warn("Bootstrap admin used", { email: updated.email, id: updated.id });
    return res.json({ success: true, message: "Admin role granted. Remove BOOTSTRAP_SECRET from Render env vars now.", user: updated });
  } catch (err) {
    logger.error("Bootstrap admin failed", { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 12. API routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/notifications", notificationRoutes);

// ── 13. 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));

// ── 14. Global error handler (last) ──────────────────────────────────────────
app.use(globalErrorHandler);

export default app;
