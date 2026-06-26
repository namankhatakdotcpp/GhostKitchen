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
import userRoutes from "./modules/user/user.routes.js";
import opsRoutes from "./modules/ops/ops.routes.js";
import execRoutes from "./modules/exec/exec.routes.js";
import walletRoutes from "./modules/wallet/wallet.routes.js";
import pushRoutes from "./modules/push/push.routes.js";
import uploadRoutes from "./modules/upload/upload.routes.js";
import { seedDatabase } from "../prisma/seed.js";
import { globalErrorHandler } from "./middlewares/errorHandler.js";
import { requestTracingMiddleware } from "./middlewares/requestTracing.middleware.js";
import {
  generalLimiter, authLimiter, paymentLimiter,
  roleSwitchLimiter, browseLimiter,
  orderCreationLimiter, couponValidateLimiter, roleRegistrationLimiter,
} from "./middlewares/rateLimiter.js";
import { sanitizeBody } from "./middlewares/sanitize.middleware.js";
import { redisHealthCheck } from "./config/redis.js";
import { getSiteConfigCached, applyMaintenanceSchedule } from "./modules/config/config.service.js";
import { getIO } from "./socket/socketServer.js";
import { verifyAccessToken } from "./utils/jwt.js";
import { incidentJobStatus } from "./jobs/incident.job.js";
import { housekeepingJobStatus } from "./jobs/orderTimeout.job.js";

const app = express();

// Behind Render's proxy — required so express-rate-limit and req.ip see the
// real client IP instead of the proxy's (otherwise all users share one bucket).
app.set("trust proxy", 1);

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

// Permissions-Policy — restrict browser APIs the API server has no reason to use.
// Helmet does not set this header by default.
app.use((_req, res, next) => {
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=()"
  );
  next();
});

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
    // Allow this project's Vercel preview deployments only — a blanket
    // *.vercel.app rule would let any attacker-deployed Vercel app make
    // credentialed requests.
    if (/^https:\/\/ghost-kitchen[a-z0-9-]*\.vercel\.app$/.test(origin)) return cb(null, true);
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
// NOTE: must match the mounted route exactly (/api/payments/webhook, plural) —
// signature verification needs the original bytes, not re-stringified JSON.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
  req.rawBody = req.body;
  next();
});

// ── 6. Body parsers + cookies ─────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
app.use(cookieParser());

// ── 7. XSS sanitisation on every request body ────────────────────────────────
app.use(sanitizeBody);

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
// Webhook is exempt — Cashfree retries from shared IPs would trip the limiter
app.use("/api/payments", (req, res, next) =>
  req.path === "/webhook" ? next() : paymentLimiter(req, res, next));
app.use("/api/restaurants", browseLimiter);
app.use("/api/orders", (req, res, next) =>
  req.method === "POST" && req.path === "/" ? orderCreationLimiter(req, res, next) : next());
app.use("/api/coupons/validate", couponValidateLimiter);
app.use("/api/role/register-restaurant", roleRegistrationLimiter);
app.use("/api/role/register-rider", roleRegistrationLimiter);

// ── 11. Health / diagnostic endpoints ────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "GhostKitchen API running" }));

app.get("/health", async (_req, res) => {
  try {
    const [redisStatus, dbStatus] = await Promise.allSettled([
      redisHealthCheck(),
      (async () => {
        const t0 = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { status: "healthy", latencyMs: Date.now() - t0 };
      })(),
    ]);
    const redis = redisStatus.status === "fulfilled" ? redisStatus.value : { status: "unhealthy", message: redisStatus.reason?.message };
    const db = dbStatus.status === "fulfilled" ? dbStatus.value : { status: "unhealthy", message: dbStatus.reason?.message };
    // DB down = hard failure (503). Redis down = degraded but still serving (200).
    const overall = db.status !== "healthy" ? "DOWN" : redis.status !== "healthy" ? "DEGRADED" : "OK";
    res.status(overall === "DOWN" ? 503 : 200).json({
      status: overall,
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      redis,
      db,
    });
  } catch (error) {
    res.status(503).json({ status: "UNHEALTHY", error: error.message });
  }
});

// Extended health — admin-only: requires a valid ADMIN JWT
app.get("/health/extended", (req, res, next) => {
  let token = req.cookies?.access_token;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const decoded = verifyAccessToken(token);
    if (!(decoded.roles ?? [decoded.role]).includes("ADMIN")) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}, async (_req, res) => {
  try {
    const t0 = Date.now();
    const [redisStatus, dbStatus, activeOrders, onlineAgents, cfgResult] = await Promise.allSettled([
      redisHealthCheck(),
      (async () => {
        const t = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { status: "healthy", latencyMs: Date.now() - t };
      })(),
      prisma.order.count({ where: { status: { notIn: ["DELIVERED", "CANCELLED"] } } }),
      prisma.user.count({ where: { roles: { has: "DELIVERY" }, isAvailable: true } }),
      getSiteConfigCached(),
    ]);

    const redis = redisStatus.status === "fulfilled" ? redisStatus.value : { status: "unhealthy", message: redisStatus.reason?.message };
    const db = dbStatus.status === "fulfilled" ? dbStatus.value : { status: "unhealthy", message: dbStatus.reason?.message };
    const cfg = cfgResult.status === "fulfilled" ? cfgResult.value : null;

    let socketConnections = 0;
    let adapterType = "in-memory";
    try {
      const io = getIO();
      socketConnections = io.engine.clientsCount;
      const adapterName = io.adapter?.constructor?.name ?? "";
      adapterType = adapterName.toLowerCase().includes("redis") ? "redis" : "in-memory";
    } catch {}

    const overall = db.status !== "healthy" ? "DOWN" : redis.status !== "healthy" ? "DEGRADED" : "OK";

    res.status(overall === "DOWN" ? 503 : 200).json({
      status: overall,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      release: process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || "unknown",
      db,
      redis,
      socket: { connections: socketConnections, adapterType },
      jobs: {
        incidentEngine: incidentJobStatus,
        housekeeping: housekeepingJobStatus,
      },
      maintenance: cfg
        ? {
            mode: cfg.maintenanceMode,
            reason: cfg.maintenanceReason ?? null,
            scheduledAt: cfg.maintenanceScheduledAt ?? null,
            endsAt: cfg.maintenanceEndsAt ?? null,
          }
        : null,
      platform: {
        activeOrders: activeOrders.status === "fulfilled" ? activeOrders.value : 0,
        onlineAgents: onlineAgents.status === "fulfilled" ? onlineAgents.value : 0,
        apiLatencyMs: Date.now() - t0,
      },
    });
  } catch (error) {
    res.status(503).json({ status: "UNHEALTHY", error: error.message });
  }
});

// Seed endpoint — requires ALLOW_SEED=true in every environment
app.get("/seed", async (req, res, next) => {
  if (process.env.ALLOW_SEED !== "true") {
    return res.status(403).json({ success: false, message: "Seeding disabled. Set ALLOW_SEED=true to enable." });
  }
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
      return res.status(404).json({
        success: false,
        message: `User not found: ${email}. Register at the frontend first.`,
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

// ── 12. Public config endpoint ────────────────────────────────────────────────
app.get("/api/config", async (_req, res, next) => {
  try {
    const cfg = await getSiteConfigCached();
    res.json({
      maintenanceMode:         cfg.maintenanceMode,
      maintenanceReason:       cfg.maintenanceReason ?? null,
      maintenanceScheduledAt:  cfg.maintenanceScheduledAt ?? null,
      maintenanceEndsAt:       cfg.maintenanceEndsAt ?? null,
      cashOnDelivery:          cfg.cashOnDelivery,
      codMinOrder:             cfg.codMinOrder,
      maxDeliveryRadius:       cfg.maxDeliveryRadius,
      defaultDeliveryFee:      cfg.defaultDeliveryFee,
      newRestaurantReg:        cfg.newRestaurantReg,
      riderRegistrations:      cfg.riderRegistrations,
      allowBranches:           cfg.allowBranches,
      maxMenuItems:            cfg.maxMenuItems,
      requireApproval:         cfg.requireApproval,
    });
  } catch (err) { next(err); }
});

// ── 13. Maintenance mode gate ─────────────────────────────────────────────────
// Runs AFTER the public /api/config endpoint so the frontend can still read config.
// Admins bypass the gate (checked by decoding their JWT without a DB lookup).
// Auth endpoints that must stay reachable during maintenance, otherwise an
// admin with no (or an expired) token could never log in to bypass the gate.
// New sign-ups (/auth/register) stay blocked so maintenance still halts growth.
const MAINTENANCE_AUTH_ALLOWLIST = ["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout", "/auth/logout-all"];

app.use("/api", async (req, res, next) => {
  // Skip admin routes — admins always get through
  if (req.path.startsWith("/admin")) return next();
  // Allow authentication so admins can log in and bypass the gate below.
  if (MAINTENANCE_AUTH_ALLOWLIST.includes(req.path)) return next();
  try {
    let cfg = await getSiteConfigCached();
    cfg = await applyMaintenanceSchedule(cfg);
    if (!cfg.maintenanceMode) return next();
    // Peek at the token — if they are an ADMIN, let them through
    let token = req.cookies?.access_token;
    if (!token) {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    }
    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        if ((decoded.roles ?? [decoded.role]).includes("ADMIN")) return next();
      } catch { /* expired or invalid — fall through to 503 */ }
    }
    return res.status(503).json({
      success: false,
      message: "The platform is currently under maintenance. Please try again later.",
      code: "MAINTENANCE_MODE",
    });
  } catch { next(); }
});

// ── 14. API routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ops", opsRoutes);
app.use("/api/exec", execRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/user", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/upload", uploadRoutes);

// ── 15. 404───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found" }));

// ── 16. Global error handler (last) ──────────────────────────────────────────
app.use(globalErrorHandler);

export default app;
