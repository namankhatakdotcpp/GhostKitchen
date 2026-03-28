export const validateCreateOrder = (payload) => {
  // ============================================
  // SECURITY: Only accept items, not prices
  // Reject any client-provided price values
  // ============================================

  if (!payload?.restaurantId) {
    return "restaurantId is required";
  }

  if (typeof payload.restaurantId !== "string") {
    return "restaurantId must be a string";
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return "At least one order item is required";
  }

  // Validate each item has menuItemId and quantity
  for (const item of payload.items) {
    if (!item.menuItemId || typeof item.menuItemId !== "string") {
      return "Each item must have a valid menuItemId";
    }

    if (typeof item.quantity !== "number" || item.quantity <= 0) {
      return "Each item must have a valid quantity greater than 0";
    }
  }

  // SECURITY: Reject client-provided price values
  if (payload.subtotal !== undefined) {
    return "subtotal should not be provided by client";
  }

  if (payload.total !== undefined) {
    return "total should not be provided by client";
  }

  if (payload.deliveryFee !== undefined) {
    return "deliveryFee should not be provided by client";
  }

  if (payload.discount !== undefined) {
    return "discount should not be provided by client";
  }

  if (!payload.deliveryAddress) {
    return "deliveryAddress is required";
  }

  if (typeof payload.deliveryAddress !== "object") {
    return "deliveryAddress must be an object";
  }

  // Optional: couponCode validation
  if (payload.couponCode && typeof payload.couponCode !== "string") {
    return "couponCode must be a string";
  }

  return null;
};
