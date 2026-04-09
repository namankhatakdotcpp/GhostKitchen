import dotenv from "dotenv";

dotenv.config();

// Validate required environment variables for production
const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
const paymentVars = ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY", "CASHFREE_CLIENT_SECRET"];

const isProduction = process.env.NODE_ENV === "production";
// Only require DATABASE_URL and JWT_SECRET in production; payment vars are optional
const mustCheck = requiredVars;

const missingVars = mustCheck.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  const severity = isProduction ? "ERROR" : "WARNING";
  console.warn(
    `⚠️  [${severity}] Missing environment variables: ${missingVars.join(", ")}`
  );
  
  if (isProduction) {
    throw new Error(
      `Production requires all variables. Missing: ${missingVars.join(", ")}`
    );
  }

  console.warn("⚠️  Using fallback/default values (not recommended for production)");
}

// Check payment-specific warnings (optional in production)
const missingPaymentVars = paymentVars.filter((v) => !process.env[v]);
if (missingPaymentVars.length > 0) {
  console.warn(
    `⚠️  Payment not configured: ${missingPaymentVars.join(", ")} missing`
  );
}

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_key_change_in_production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/food_delivery_db",
  CASHFREE_APP_ID: process.env.CASHFREE_APP_ID || "",
  CASHFREE_SECRET_KEY: process.env.CASHFREE_SECRET_KEY || "",
  CASHFREE_CLIENT_SECRET: process.env.CASHFREE_CLIENT_SECRET || "",
  CASHFREE_ENV: process.env.CASHFREE_ENV || "TEST",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:5000",
};

console.log("✓ Environment configured:", {
  environment: env.NODE_ENV,
  port: env.PORT,
  cashfreeMode: env.CASHFREE_ENV,
  dbConfigured: !!process.env.DATABASE_URL,
  paymentsConfigured: !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY && process.env.CASHFREE_WEBHOOK_SECRET),
});
