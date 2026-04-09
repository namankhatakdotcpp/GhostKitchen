import crypto from "crypto";
import { logger } from "./logger.js";

/**
 * Cashfree Webhook Signature Verification
 * 
 * WHY THIS MATTERS:
 * - Ensures webhook comes from Cashfree (not spoofed)
 * - Prevents man-in-the-middle attacks
 * - Verifies data integrity
 * 
 * IMPORTANT:
 * - Use raw body (not JSON parsed)
 * - Use exact webhook secret from Cashfree
 * - Always verify before processing
 */

/**
 * Verify Cashfree webhook signature
 * 
 * @param {string} rawBody - Raw request body (string, not parsed JSON)
 * @param {string} signature - Signature from x-webhook-signature header
 * @param {string} secret - Cashfree webhook secret
 * @returns {boolean} true if signature is valid
 */
export const verifyCashfreeSignature = (rawBody, signature, secret) => {
  try {
    // Compute expected signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    // Compare (constant-time comparison prevents timing attacks)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );

    if (!isValid) {
      logger.warn("Webhook signature verification failed", {
        expectedSignature: expectedSignature.substring(0, 10) + "...",
        providedSignature: signature.substring(0, 10) + "...",
      });
    }

    return isValid;
  } catch (error) {
    logger.error("Signature verification error", { error: error.message });
    return false;
  }
};

export default { verifyCashfreeSignature };
