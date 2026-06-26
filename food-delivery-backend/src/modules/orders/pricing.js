// Order pricing/commission formula — the single source of truth for every
// money calculation in this app. Both the COD path (orders.service.js
// createOrder) and the paid path (payment.service.js, via
// orders.service.js calculateOrderTotal) call computeOrderPricing so the
// math can never drift between them.
//
// All monetary values are in PAISE (₹50 = 5000), matching the convention
// already established in orders.service.js.
//
// ── Formula ──────────────────────────────────────────────────────────────
// Item Total            = sum of menu item price × qty (100% to restaurant)
// Restaurant Packaging   = 2.5% of Item Total            (100% to restaurant)
// GST on Item Total      = 2.5% of Item Total            (tax passthrough)
// Delivery Fee            = deliveryBaseFee + deliveryPerKmFee × distanceKm
// GST on Delivery Fee     = 5% of Delivery Fee            (tax passthrough)
// Platform Fee            = flat paise OR % of Item Total, per admin setting
// GST on Platform Fee     = 5% of Platform Fee            (tax passthrough)
// Customer Total = ItemTotal + RestaurantPackaging + GST(ItemTotal)
//                + DeliveryFee + GST(DeliveryFee) + PlatformFee + GST(PlatformFee)
//
// ── 3-way split ──────────────────────────────────────────────────────────
// Applies ONLY to (DeliveryFee + PlatformFee) — excludes all GST
// passthroughs and excludes RestaurantPackaging (always 100% restaurant,
// outside the split). restaurantPayout below is RestaurantPackaging plus
// the restaurant's split share of that fees-only pool — i.e. "everything
// the restaurant actually receives from this order", not just its split
// share in isolation.
const RESTAURANT_PACKAGING_RATE = 0.025;
const GST_ON_ITEM_TOTAL_RATE = 0.025;
const GST_ON_DELIVERY_FEE_RATE = 0.05;
const GST_ON_PLATFORM_FEE_RATE = 0.05;

// All amounts are paise; round to the nearest paisa at each line so the
// stored breakdown always sums exactly (no fractional-paise drift) and so
// a customer's displayed total never differs by ±1 paise from the sum of
// the line items shown above it.
const round = (n) => Math.round(n);

export function computeDeliveryFee({ deliveryBaseFee, deliveryBaseDistanceKm = 0, deliveryPerKmFee, distanceKm, freeDeliveryEnabled = false, freeDeliveryMinOrder = 0, itemTotal = 0 }) {
  // Free delivery takes full priority when enabled and the order qualifies
  if (freeDeliveryEnabled && itemTotal >= freeDeliveryMinOrder) return 0;
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  // Only charge per-km beyond the base distance included in the base fee
  const extraKm = Math.max(0, km - (deliveryBaseDistanceKm ?? 0));
  return round(deliveryBaseFee + deliveryPerKmFee * extraKm);
}

export function computePlatformFee({ platformFeeMode, platformFeeValue, itemTotal }) {
  if (platformFeeMode === "PERCENT") {
    return round(itemTotal * (platformFeeValue / 100));
  }
  return round(platformFeeValue);
}

/**
 * @param {object} params
 * @param {number} params.itemTotal - paise, sum of item price × qty
 * @param {number|null} params.distanceKm - restaurant→delivery-address distance, or null if unknown
 * @param {object} params.settings - a PlatformSettings row (or matching shape)
 * @returns {object} every line item plus the 3-way payout split
 */
export function computeOrderPricing({ itemTotal, distanceKm, settings }) {
  const restaurantPackaging = round(itemTotal * RESTAURANT_PACKAGING_RATE);
  const gstOnItemTotal = round(itemTotal * GST_ON_ITEM_TOTAL_RATE);

  const deliveryFee = computeDeliveryFee({
    deliveryBaseFee: settings.deliveryBaseFee,
    deliveryBaseDistanceKm: settings.deliveryBaseDistanceKm,
    deliveryPerKmFee: settings.deliveryPerKmFee,
    distanceKm,
    freeDeliveryEnabled: settings.freeDeliveryEnabled,
    freeDeliveryMinOrder: settings.freeDeliveryMinOrder,
    itemTotal,
  });
  const gstOnDeliveryFee = round(deliveryFee * GST_ON_DELIVERY_FEE_RATE);

  const platformFee = computePlatformFee({
    platformFeeMode: settings.platformFeeMode,
    platformFeeValue: settings.platformFeeValue,
    itemTotal,
  });
  const gstOnPlatformFee = round(platformFee * GST_ON_PLATFORM_FEE_RATE);

  const customerTotal =
    itemTotal +
    restaurantPackaging +
    gstOnItemTotal +
    deliveryFee +
    gstOnDeliveryFee +
    platformFee +
    gstOnPlatformFee;

  // The split pool — deliveryFee + platformFee only, no GST, no packaging.
  const splitPool = deliveryFee + platformFee;
  const restaurantShare = round(splitPool * (settings.splitRestaurantPct / 100));
  const riderShare = round(splitPool * (settings.splitRiderPct / 100));
  // Admin gets the remainder rather than its own rounded share, so the three
  // payouts always sum to exactly splitPool even after paisa-level rounding
  // (three independent Math.round calls on a 100%-split can otherwise be off
  // by ±1 paise from the pool they're supposed to add up to).
  const adminShare = splitPool - restaurantShare - riderShare;

  // Delivery fee breakdown — for transparent UI display
  const baseDistanceKm = settings.deliveryBaseDistanceKm ?? 0;
  const actualKm = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const extraKm = Math.max(0, actualKm - baseDistanceKm);
  const deliveryFeeBreakdown = {
    baseFee: settings.deliveryBaseFee,
    baseDistanceKm,
    extraKm: round(extraKm * 10) / 10,
    extraFee: round(extraKm * settings.deliveryPerKmFee),
    perKmFee: settings.deliveryPerKmFee,
    isFree: settings.freeDeliveryEnabled && itemTotal >= (settings.freeDeliveryMinOrder ?? 0),
  };

  return {
    itemTotal,
    restaurantPackaging,
    gstOnItemTotal,
    deliveryFee,
    deliveryFeeBreakdown,
    gstOnDeliveryFee,
    platformFee,
    gstOnPlatformFee,
    customerTotal,
    distanceKm: distanceKm ?? null,
    restaurantPayout: restaurantPackaging + restaurantShare,
    riderPayout: riderShare,
    adminRevenue: adminShare,
  };
}
