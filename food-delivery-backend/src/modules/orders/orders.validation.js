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

  if (payload.items.length > 50) {
    return "Too many distinct items in one order (max 50)";
  }

  // Validate each item has menuItemId and quantity
  const seen = new Set();
  for (const item of payload.items) {
    if (!item.menuItemId || typeof item.menuItemId !== "string") {
      return "Each item must have a valid menuItemId";
    }

    if (seen.has(item.menuItemId)) {
      return "Duplicate menu items in order — combine quantities instead";
    }
    seen.add(item.menuItemId);

    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99) {
      return "Each item must have an integer quantity between 1 and 99";
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

const VALID_STATUSES = ["PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

const STATUS_TRANSITIONS = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  // CONFIRMED -> OUT_FOR_DELIVERY (direct) is included alongside the normal
  // CONFIRMED -> PREPARING step because the shop dashboard's "Preparing"
  // column covers both CONFIRMED and PREPARING as one visual stage (see
  // orderToBoard in shop-orders-page.tsx) and "Mark Ready" always sends
  // OUT_FOR_DELIVERY regardless of which of those two the order is actually
  // in. Without this, an order that only made it to CONFIRMED — e.g. the
  // accept flow's second PATCH (CONFIRMED -> PREPARING) failed or never
  // landed — got permanently stuck: every "Mark Ready" click 400'd with
  // "Cannot transition from CONFIRMED to OUT_FOR_DELIVERY" and there was no
  // way to recover without manual DB surgery.
  CONFIRMED: ["PREPARING", "OUT_FOR_DELIVERY", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const ROLE_PERMISSIONS = {
  // CANCELLED added — the shop dashboard's "Reject" button (PLACED → CANCELLED)
  // had no valid role permission to actually do this until now.
  RESTAURANT: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERY: ["OUT_FOR_DELIVERY", "DELIVERED"],
  CUSTOMER: ["CANCELLED"],
  ADMIN: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
};

// Returns null when valid, or a structured error object — never a bare
// string — so the 400 response body always carries enough detail (from/to/
// allowedNext) to debug an invalid-transition rejection from the network
// tab alone, without needing server logs.
export const validateStatusUpdate = (payload, currentStatus, userRole) => {
  if (!payload?.status) {
    return { error: "Missing status", message: "status is required" };
  }

  if (!VALID_STATUSES.includes(payload.status)) {
    return {
      error: "Invalid status",
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      validStatuses: VALID_STATUSES,
    };
  }

  // Check if transition is valid
  const allowedNext = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowedNext.includes(payload.status)) {
    return {
      error: "Invalid transition",
      message: `Cannot transition from ${currentStatus} to ${payload.status}`,
      from: currentStatus,
      to: payload.status,
      allowedNext,
    };
  }

  // Check role-based permissions
  if (userRole === "CUSTOMER" && payload.status === "CANCELLED" && currentStatus !== "PLACED") {
    return {
      error: "Invalid transition",
      message: "Orders can only be cancelled when in PLACED status",
      from: currentStatus,
      to: payload.status,
      allowedNext,
    };
  }

  if (!ROLE_PERMISSIONS[userRole]?.includes(payload.status)) {
    return {
      error: "Not permitted",
      message: `${userRole} role cannot set status to ${payload.status}`,
      from: currentStatus,
      to: payload.status,
      role: userRole,
      allowedForRole: ROLE_PERMISSIONS[userRole] ?? [],
    };
  }

  return null;
};
