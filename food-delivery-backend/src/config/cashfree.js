import { Cashfree, CFEnvironment } from "cashfree-pg";
import { env } from "./env.js";

if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
  console.warn("⚠️ WARNING: CASHFREE_APP_ID or CASHFREE_SECRET_KEY not set in .env");
}

// SDK v5 constructor: new Cashfree(XEnvironment, XClientId, XClientSecret)
// Cashfree.Environment does not exist — CFEnvironment is the correct export.
const xEnvironment = env.CASHFREE_ENV === "PRODUCTION"
  ? CFEnvironment.PRODUCTION
  : CFEnvironment.SANDBOX;

export const cashfree = new Cashfree(
  xEnvironment,
  env.CASHFREE_APP_ID,
  env.CASHFREE_SECRET_KEY,
);

export default cashfree;
