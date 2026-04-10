import dotenv from "dotenv";

dotenv.config();

const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
const paymentVars = ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY", "CASHFREE_CLIENT_SECRET"];

const missingVars = requiredVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`⚠️  WARNING: Missing environment variables: ${missingVars.join(", ")}`);
}

const missingPaymentVars = paymentVars.filter((v) => !process.env[v]);
if (missingPaymentVars.length > 0) {
  console.warn(`⚠️  Payment not configured: ${missingPaymentVars.join(", ")} missing. Server will NOT crash.`);
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

console.log("✓ Environment configured safely");
