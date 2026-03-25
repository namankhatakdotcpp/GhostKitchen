export const validateCreateOrder = (payload) => {
  if (!payload?.restaurantId) {
    return "restaurantId is required";
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return "At least one order item is required";
  }

  if (typeof payload.total !== "number" && typeof payload.subtotal !== "number") {
    return "subtotal or total is required";
  }

  if (!payload.deliveryAddress) {
    return "deliveryAddress is required";
  }

  return null;
};
