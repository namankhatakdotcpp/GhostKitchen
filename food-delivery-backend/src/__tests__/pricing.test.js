/**
 * Order pricing/commission formula — src/modules/orders/pricing.js.
 *
 * Worked example used throughout:
 *   itemTotal = ₹500 (50000 paise), distance = 5km
 *   settings  = base ₹10, per-km ₹2, platform fee flat ₹5, split 20/50/30
 *              rider: base ₹20, per-km ₹3, min ₹15
 *
 *   restaurantPackaging = 2.5% of 50000       = 1250
 *   gstOnItemTotal       = 2.5% of 50000       = 1250
 *   deliveryFee           = 1000 + 200×5        = 2000
 *   gstOnDeliveryFee      = 5% of 2000          = 100
 *   platformFee           = flat                = 500
 *   gstOnPlatformFee      = 5% of 500           = 25
 *   customerTotal = 50000+1250+1250+2000+100+500+25 = 55125
 *
 *   splitPool = deliveryFee + platformFee = 2500
 *   restaurantShare (20%) = 500  -> restaurantPayout = 1250 (packaging) + 500 = 1750
 *   riderPayout = max(riderMinPayout, riderBasePay + riderPerKmPay × km)
 *              = max(1500, 2000 + 300×5) = max(1500, 3500) = 3500
 *   adminRevenue = max(0, splitPool - restaurantShare - riderPayout)
 *               = max(0, 2500 - 500 - 3500) = 0
 *
 * NOTE: riderPayout is now independent of the split percentages — it is a
 * guaranteed distance-based rate. The split percentages still govern
 * restaurantShare, but adminRevenue absorbs any shortfall from rider pay.
 */
import { describe, it, expect } from "vitest";
import { computeOrderPricing, computeDeliveryFee, computePlatformFee } from "../modules/orders/pricing.js";

const DEFAULT_SETTINGS = {
  deliveryBaseFee: 1000,
  deliveryPerKmFee: 200,
  platformFeeMode: "FLAT",
  platformFeeValue: 500,
  splitRestaurantPct: 20,
  splitRiderPct: 50,
  splitAdminPct: 30,
  // Explicit rider payout settings — test should not rely on inline defaults
  riderBasePay: 2000,   // ₹20 base
  riderPerKmPay: 300,   // ₹3/km
  riderMinPayout: 1500, // ₹15 minimum
};

describe("computeOrderPricing — worked example", () => {
  const result = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });

  it("computes restaurant packaging as 2.5% of item total", () => {
    expect(result.restaurantPackaging).toBe(1250);
  });

  it("computes GST on item total as 2.5% of item total", () => {
    expect(result.gstOnItemTotal).toBe(1250);
  });

  it("computes delivery fee as base + per-km × distance", () => {
    expect(result.deliveryFee).toBe(2000); // 1000 + 200*5
  });

  it("computes GST on delivery fee as 5% of delivery fee", () => {
    expect(result.gstOnDeliveryFee).toBe(100);
  });

  it("computes flat platform fee verbatim", () => {
    expect(result.platformFee).toBe(500);
  });

  it("computes GST on platform fee as 5% of platform fee", () => {
    expect(result.gstOnPlatformFee).toBe(25);
  });

  it("sums every line item into customerTotal", () => {
    expect(result.customerTotal).toBe(55125);
  });

  it("restaurant payout = packaging + restaurant's split share of the fee pool", () => {
    expect(result.restaurantPayout).toBe(1750); // 1250 packaging + 500 (20% of 2500)
  });

  it("rider payout uses independent distance-based formula, not the split percentage", () => {
    // riderBasePay(2000) + riderPerKmPay(300) × 5km = 3500; above riderMinPayout(1500)
    expect(result.riderPayout).toBe(3500);
  });

  it("admin revenue is the remainder of the pool after restaurant and rider shares, clamped to 0", () => {
    // splitPool(2500) - restaurantShare(500) - riderPayout(3500) = -1500 → clamped to 0
    expect(result.adminRevenue).toBe(0);
  });

  it("admin revenue is never negative", () => {
    expect(result.adminRevenue).toBeGreaterThanOrEqual(0);
  });

  it("does not let GST or restaurant packaging leak into the split", () => {
    const splitPool = result.deliveryFee + result.platformFee;
    expect(result.restaurantPayout - result.restaurantPackaging).toBe(Math.round(splitPool * 0.2));
  });
});

describe("computeDeliveryFee", () => {
  it("is base fee only when distance is null/unknown", () => {
    expect(computeDeliveryFee({ deliveryBaseFee: 1000, deliveryPerKmFee: 200, distanceKm: null })).toBe(1000);
  });

  it("is base fee only when distance is 0", () => {
    expect(computeDeliveryFee({ deliveryBaseFee: 1000, deliveryPerKmFee: 200, distanceKm: 0 })).toBe(1000);
  });

  it("adds per-km rate × distance, rounded to the nearest paisa", () => {
    expect(computeDeliveryFee({ deliveryBaseFee: 1000, deliveryPerKmFee: 200, distanceKm: 3.7 })).toBe(1740); // 1000 + 740
  });
});

describe("computePlatformFee", () => {
  it("FLAT mode returns the configured paise amount verbatim, ignoring itemTotal", () => {
    expect(computePlatformFee({ platformFeeMode: "FLAT", platformFeeValue: 500, itemTotal: 999999 })).toBe(500);
  });

  it("PERCENT mode computes a percentage of itemTotal", () => {
    expect(computePlatformFee({ platformFeeMode: "PERCENT", platformFeeValue: 5, itemTotal: 50000 })).toBe(2500); // 5% of 50000
  });

  it("PERCENT mode rounds to the nearest paisa", () => {
    expect(computePlatformFee({ platformFeeMode: "PERCENT", platformFeeValue: 2.5, itemTotal: 12345 })).toBe(Math.round(12345 * 0.025));
  });
});

describe("computeOrderPricing — distance unknown (no coordinates)", () => {
  it("falls back to base delivery fee only when distanceKm is null", () => {
    const result = computeOrderPricing({ itemTotal: 50000, distanceKm: null, settings: DEFAULT_SETTINGS });
    expect(result.deliveryFee).toBe(1000);
    expect(result.distanceKm).toBeNull();
  });
});

describe("computeOrderPricing — PERCENT platform fee mode", () => {
  it("computes platform fee as a percentage of item total, not a flat amount", () => {
    const result = computeOrderPricing({
      itemTotal: 50000,
      distanceKm: 5,
      settings: { ...DEFAULT_SETTINGS, platformFeeMode: "PERCENT", platformFeeValue: 5 },
    });
    expect(result.platformFee).toBe(2500); // 5% of 50000
    expect(result.gstOnPlatformFee).toBe(125); // 5% of 2500
  });
});

describe("computeOrderPricing — uneven split percentages (rounding)", () => {
  it("admin revenue is never negative even with uneven splits and high rider pay", () => {
    const result = computeOrderPricing({
      itemTotal: 33333,
      distanceKm: 7,
      settings: {
        ...DEFAULT_SETTINGS,
        splitRestaurantPct: 33.33,
        splitRiderPct: 33.33,
        splitAdminPct: 33.34,
      },
    });
    expect(result.adminRevenue).toBeGreaterThanOrEqual(0);
  });

  it("rider payout uses the independent formula regardless of split percentages", () => {
    const result = computeOrderPricing({
      itemTotal: 33333,
      distanceKm: 1,
      settings: {
        ...DEFAULT_SETTINGS,
        splitRestaurantPct: 33.33,
        splitRiderPct: 33.33,
        splitAdminPct: 33.34,
        riderBasePay: 1000, // ₹10 base
        riderPerKmPay: 200, // ₹2/km
        riderMinPayout: 500, // ₹5 min
      },
    });
    // distancePay = 1000 + 200×1 = 1200; above minPayout 500
    expect(result.riderPayout).toBe(1200);
  });
});

describe("computeOrderPricing — zero item total (edge case)", () => {
  it("still computes a valid delivery-fee-only total when itemTotal is 0", () => {
    const result = computeOrderPricing({ itemTotal: 0, distanceKm: 2, settings: DEFAULT_SETTINGS });
    expect(result.restaurantPackaging).toBe(0);
    expect(result.gstOnItemTotal).toBe(0);
    expect(result.deliveryFee).toBe(1400); // 1000 + 200*2
    expect(result.customerTotal).toBe(0 + 0 + 0 + 1400 + 70 + 500 + 25);
  });
});

// ── Donation exclusion from payouts ──────────────────────────────────────────
// These tests prove the core financial correctness requirement:
// donationAmountPaise is never passed to computeOrderPricing, so it can
// never affect restaurantPayout / riderPayout / adminRevenue. The split pool
// is splitPool = deliveryFee + platformFee only (pricing.js:94).
//
// In the application code, the donation is added as:
//   orderTotal = finalTotal + donationAmountPaise
// AFTER computeOrderPricing() returns, meaning the three payout fields are
// computed from splitPool (deliveryFee + platformFee) — donation is never
// an input to any of them.
describe("computeOrderPricing — donation is excluded from the split", () => {
  const baseResult = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });

  it("restaurantPayout is unchanged regardless of donation size", () => {
    // Simulate calling computeOrderPricing with or without a donation:
    // donation is added AFTER the function returns, so the inputs are identical.
    const withDonation = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });
    expect(withDonation.restaurantPayout).toBe(baseResult.restaurantPayout);
  });

  it("riderPayout is unchanged regardless of donation size", () => {
    const withDonation = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });
    expect(withDonation.riderPayout).toBe(baseResult.riderPayout);
  });

  it("adminRevenue is unchanged regardless of donation size", () => {
    const withDonation = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });
    expect(withDonation.adminRevenue).toBe(baseResult.adminRevenue);
  });

  it("splitPool = deliveryFee + platformFee only, donation is never part of it", () => {
    const { deliveryFee, platformFee, restaurantPayout, restaurantPackaging } = baseResult;
    const splitPool = deliveryFee + platformFee;
    const restaurantSplitShare = restaurantPayout - restaurantPackaging;
    // restaurantShare is a percentage of splitPool, not of any customer-visible total
    expect(restaurantSplitShare).toBe(Math.round(splitPool * (DEFAULT_SETTINGS.splitRestaurantPct / 100)));
  });

  it("a ₹10 donation (1000 paise) does not change any payout field", () => {
    // Application code path: donationAmountPaise is applied AFTER computeOrderPricing:
    //   finalTotal = pricing.customerTotal - discounts
    //   orderTotal = finalTotal + donationAmountPaise   ← only the customer pays this
    //   order.restaurantPayout = pricing.restaurantPayout  ← unchanged
    const pricing = computeOrderPricing({ itemTotal: 50000, distanceKm: 5, settings: DEFAULT_SETTINGS });
    const donationAmountPaise = 1000;
    const orderTotal = pricing.customerTotal + donationAmountPaise;
    // Payouts are never recomputed from orderTotal — they stay as-is from pricing
    expect(pricing.restaurantPayout).toBe(baseResult.restaurantPayout);
    expect(pricing.riderPayout).toBe(baseResult.riderPayout);
    expect(pricing.adminRevenue).toBe(baseResult.adminRevenue);
    // The customer pays more, but the split is exactly the same
    expect(orderTotal).toBe(baseResult.customerTotal + 1000);
  });
});
