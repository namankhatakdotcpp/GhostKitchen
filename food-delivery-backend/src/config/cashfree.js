import { Cashfree } from "cashfree-pg";
import { env } from "./env.js";

/**
 * Cashfree Payment Gateway Configuration
 * 
 * WHY:
 * - Centralizes payment gateway setup
 * - Reusable across all payment endpoints
 * - Environment-aware (SANDBOX vs PRODUCTION)
 * 
 * Security:
 * - Credentials from environment variables ONLY
 * - Never hardcoded in code
 */

// Validate environment variables
if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
  console.warn(
    "⚠️ WARNING: CASHFREE_APP_ID or CASHFREE_SECRET_KEY not set in .env"
  );
}

/**
 * Initialize Cashfree SDK
 * 
 * Environment:
 * - SANDBOX: For development/testing
 * - PRODUCTION: For live payments
 */
export const cashfree = new Cashfree({
  apiVersion: "2025-01-01",
});

// Set credentials
cashfree.XClientId = env.CASHFREE_APP_ID || "";
cashfree.XClientSecret = env.CASHFREE_SECRET_KEY || "";
cashfree.XEnvironment =
  env.CASHFREE_ENV === "PRODUCTION"
    ? Cashfree.Environment.PRODUCTION
    : Cashfree.Environment.SANDBOX;

export default cashfree;
