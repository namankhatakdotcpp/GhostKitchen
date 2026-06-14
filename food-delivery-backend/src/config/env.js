import dotenv from "dotenv";

dotenv.config();

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
  'CASHFREE_ENV',
  'FRONTEND_URL',
  'BACKEND_URL',
  'ALLOWED_ORIGINS',
]

const missing = required.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error('FATAL: Missing environment variables:', missing.join(', '))
  process.exit(1)
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters')
  process.exit(1)
}
if (process.env.JWT_REFRESH_SECRET.length < 32) {
  console.error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters')
  process.exit(1)
}

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  DATABASE_URL: process.env.DATABASE_URL,
  // Redis — REDIS_URL is used by ioredis (Socket.IO adapter + fallback cache).
  // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are used by the Upstash REST client
  // for caching. Both can coexist: REST for cache, ioredis URL for Socket.IO adapter.
  REDIS_URL: process.env.REDIS_URL || null,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || null,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || null,
  CASHFREE_APP_ID: process.env.CASHFREE_APP_ID,
  CASHFREE_SECRET_KEY: process.env.CASHFREE_SECRET_KEY,
  CASHFREE_CLIENT_SECRET: process.env.CASHFREE_CLIENT_SECRET || "",
  CASHFREE_ENV: process.env.CASHFREE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  BACKEND_URL: process.env.BACKEND_URL,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  // Optional
  SENTRY_DSN: process.env.SENTRY_DSN || null,
  RESEND_API_KEY: process.env.RESEND_API_KEY || null,
  EMAIL_FROM: process.env.EMAIL_FROM || "GhostKitchen <noreply@ghostkitchen.in>",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
