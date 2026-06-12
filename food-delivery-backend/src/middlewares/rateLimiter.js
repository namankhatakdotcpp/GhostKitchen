import rateLimit from "express-rate-limit";

// ── Auth endpoints — tightest limit ──────────────────────────────────────────
// Prevents brute-force on login/register/refresh
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ── Role switching — prevents enumeration attacks ─────────────────────────────
export const roleSwitchLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 5,
  message: { error: "Too many role switches." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Payment endpoints — strict ────────────────────────────────────────────────
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many payment requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── General API — generous global fallback ────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Too many requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Browse/search — most generous (read-only public data) ────────────────────
export const browseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Order creation — prevent order-spam / cart-flooding ───────────────────────
export const orderCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many orders in a short period. Please wait." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Coupon validation — prevent brute-force enumeration ──────────────────────
export const couponValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,
  message: { error: "Too many coupon validation attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Role registration — restaurant / rider sign-up ────────────────────────────
export const roleRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { error: "Too many registration attempts. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});
