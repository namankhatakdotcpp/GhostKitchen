import { z } from "zod";

// All ₹ amounts are paise. platformFeeValue is paise when mode is FLAT,
// a raw percentage (e.g. 5 means 5%) when mode is PERCENT.
export const platformSettingsSchema = z
  .object({
    deliveryBaseFee: z.number().finite().min(0),
    deliveryPerKmFee: z.number().finite().min(0),
    platformFeeMode: z.enum(["FLAT", "PERCENT"]),
    platformFeeValue: z.number().finite().min(0),
    splitRestaurantPct: z.number().finite().min(0).max(100),
    splitRiderPct: z.number().finite().min(0).max(100),
    splitAdminPct: z.number().finite().min(0).max(100),
    loyaltyEarnRate: z.number().finite().min(0),
    loyaltyPointValuePaise: z.number().finite().min(0),
    loyaltyRedemptionCapPct: z.number().finite().min(0).max(100),
  })
  .partial()
  .refine(
    (data) => {
      const { splitRestaurantPct, splitRiderPct, splitAdminPct } = data;
      // Only enforce the sum-to-100 rule when all three are present in this
      // update — a partial PATCH touching only deliveryBaseFee, say, must not
      // be rejected just because it didn't also resend the split.
      if (splitRestaurantPct === undefined && splitRiderPct === undefined && splitAdminPct === undefined) {
        return true;
      }
      if (splitRestaurantPct === undefined || splitRiderPct === undefined || splitAdminPct === undefined) {
        return false;
      }
      // Floating point tolerance — 20 + 50 + 30 must pass, but so should
      // something like 33.33 + 33.33 + 33.34.
      return Math.abs(splitRestaurantPct + splitRiderPct + splitAdminPct - 100) < 0.01;
    },
    {
      message:
        "splitRestaurantPct + splitRiderPct + splitAdminPct must sum to 100, and all three must be provided together when changing the split",
      path: ["splitRestaurantPct"],
    }
  );

// Validates a FULL settings object (e.g. before persisting a row that must
// always be internally consistent) — same rule, but every field required.
export const fullPlatformSettingsSchema = z
  .object({
    deliveryBaseFee: z.number().finite().min(0),
    deliveryPerKmFee: z.number().finite().min(0),
    platformFeeMode: z.enum(["FLAT", "PERCENT"]),
    platformFeeValue: z.number().finite().min(0),
    splitRestaurantPct: z.number().finite().min(0).max(100),
    splitRiderPct: z.number().finite().min(0).max(100),
    splitAdminPct: z.number().finite().min(0).max(100),
    loyaltyEarnRate: z.number().finite().min(0),
    loyaltyPointValuePaise: z.number().finite().min(0),
    loyaltyRedemptionCapPct: z.number().finite().min(0).max(100),
  })
  .refine(
    (data) => Math.abs(data.splitRestaurantPct + data.splitRiderPct + data.splitAdminPct - 100) < 0.01,
    {
      message: "splitRestaurantPct + splitRiderPct + splitAdminPct must sum to 100",
      path: ["splitRestaurantPct"],
    }
  );
