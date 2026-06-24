/**
 * Order pricing/commission formula — src/modules/orders/pricing.js.
 *
 * Worked example used throughout (also in the PR summary, so it can be
 * checked independently against the spec):
 *   itemTotal = ₹500 (50000 paise), distance = 5km
 *   settings  = base ₹10, per-km ₹2, platform fee flat ₹5, split 20/50/30
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
 *   riderShare (50%)      = 1250 -> riderPayout = 1250
 *   adminShare (remainder)= 750  -> adminRevenue = 750
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

  it("applies the 3-way split to (deliveryFee + platformFee) only", () => {
    expect(result.restaurantPayout).toBe(1750); // 1250 packaging + 500 (20% of 2500)
    expect(result.riderPayout).toBe(1250); // 50% of 2500
    expect(result.adminRevenue).toBe(750); // remainder of 2500
  });

  it("split payouts sum exactly to the fees-only pool (no paisa drift)", () => {
    const splitPool = result.deliveryFee + result.platformFee;
    const restaurantSplitShare = result.restaurantPayout - result.restaurantPackaging;
    expect(restaurantSplitShare + result.riderPayout + result.adminRevenue).toBe(splitPool);
  });

  it("does not let GST or restaurant packaging leak into the split", () => {
    // restaurantPayout minus packaging should equal exactly the 20% split share —
    // none of gstOnItemTotal/gstOnDeliveryFee/gstOnPlatformFee should appear anywhere here.
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
  it("the three payout shares still sum exactly to the fees-only pool", () => {
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
    const splitPool = result.deliveryFee + result.platformFee;
    const restaurantSplitShare = result.restaurantPayout - result.restaurantPackaging;
    expect(restaurantSplitShare + result.riderPayout + result.adminRevenue).toBe(splitPool);
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
