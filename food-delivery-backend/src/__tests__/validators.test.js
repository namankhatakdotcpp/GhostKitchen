/**
 * Validators test suite
 * Covers: auth.validation, restaurant.validation, orders.validation
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-at-least-32-chars-here", JWT_REFRESH_SECRET: "test-refresh-32-chars-here" },
}));

const { validateRegister, validateLogin } = await import("../modules/auth/auth.validation.js");
const { validateRestaurant, validateMenuItem, validateUpdateRestaurant } = await import("../modules/restaurant/restaurant.validation.js");
const { validateCreateOrder, validateStatusUpdate } = await import("../modules/orders/orders.validation.js");

// ── Auth Validation ───────────────────────────────────────────────────────────
describe("validateRegister", () => {
  it("passes for valid data", () => {
    const err = validateRegister({ name: "Alice", email: "alice@example.com", password: "password123", role: "CUSTOMER" });
    expect(err).toBeNull();
  });

  it("rejects missing name", () => {
    const err = validateRegister({ name: "", email: "alice@example.com", password: "password123", role: "CUSTOMER" });
    expect(err).toBeTruthy();
  });

  it("rejects invalid email", () => {
    const err = validateRegister({ name: "Alice", email: "not-an-email", password: "password123", role: "CUSTOMER" });
    expect(err).toBeTruthy();
  });

  it("rejects short password (< 6 chars)", () => {
    const err = validateRegister({ name: "Alice", email: "alice@example.com", password: "123", role: "CUSTOMER" });
    expect(err).toBeTruthy();
  });

  it("rejects missing email", () => {
    const err = validateRegister({ name: "Alice", email: "", password: "password123", role: "CUSTOMER" });
    expect(err).toBeTruthy();
  });

  it("rejects missing role", () => {
    const err = validateRegister({ name: "Alice", email: "alice@example.com", password: "password123" });
    expect(err).toBeTruthy();
  });
});

describe("validateLogin", () => {
  it("passes for valid credentials", () => {
    const err = validateLogin({ email: "alice@example.com", password: "password123" });
    expect(err).toBeNull();
  });

  it("rejects empty email", () => {
    const err = validateLogin({ email: "", password: "password123" });
    expect(err).toBeTruthy();
  });

  it("rejects missing password", () => {
    const err = validateLogin({ email: "alice@example.com", password: "" });
    expect(err).toBeTruthy();
  });

  it("rejects invalid email format", () => {
    const err = validateLogin({ email: "notanemail", password: "pass" });
    expect(err).toBeTruthy();
  });
});

// ── Restaurant Validation ─────────────────────────────────────────────────────
describe("validateRestaurant", () => {
  const valid = {
    name: "Spice Garden",
    cuisines: ["Indian"],
    city: "Delhi",
    deliveryFee: 3000,
    deliveryTime: 30,
    minOrder: 9900,
  };

  it("passes with valid data", () => {
    const err = validateRestaurant(valid);
    expect(err).toBeNull();
  });

  it("rejects missing name", () => {
    const err = validateRestaurant({ ...valid, name: "" });
    expect(err).toBeTruthy();
  });

  it("rejects missing cuisines", () => {
    const err = validateRestaurant({ ...valid, cuisines: [] });
    expect(err).toBeTruthy();
  });

  it("rejects missing city", () => {
    const err = validateRestaurant({ ...valid, city: "" });
    expect(err).toBeTruthy();
  });

  it("rejects negative deliveryFee", () => {
    const err = validateRestaurant({ ...valid, deliveryFee: -1 });
    expect(err).toBeTruthy();
  });

  it("rejects zero deliveryTime", () => {
    const err = validateRestaurant({ ...valid, deliveryTime: 0 });
    expect(err).toBeTruthy();
  });

  it("rejects negative minOrder", () => {
    const err = validateRestaurant({ ...valid, minOrder: -1 });
    expect(err).toBeTruthy();
  });
});

describe("validateMenuItem", () => {
  const valid = { name: "Paneer Tikka", description: "Grilled paneer", price: 29900, category: "Starters" };

  it("passes with valid data", () => {
    const err = validateMenuItem(valid);
    expect(err).toBeNull();
  });

  it("rejects missing name", () => {
    const err = validateMenuItem({ ...valid, name: "" });
    expect(err).toBeTruthy();
  });

  it("rejects non-positive price", () => {
    const err = validateMenuItem({ ...valid, price: -100 });
    expect(err).toBeTruthy();
  });

  it("rejects zero price", () => {
    const err = validateMenuItem({ ...valid, price: 0 });
    expect(err).toBeTruthy();
  });

  it("rejects missing category", () => {
    const err = validateMenuItem({ ...valid, category: "" });
    expect(err).toBeTruthy();
  });

  it("accepts optional dietary tags", () => {
    const err = validateMenuItem({ ...valid, dietaryTags: ["VEGAN", "GLUTEN_FREE"] });
    expect(err).toBeNull();
  });
});

describe("validateUpdateRestaurant", () => {
  it("passes when no fields provided (all optional)", () => {
    const err = validateUpdateRestaurant({});
    expect(err).toBeNull();
  });

  it("passes with a valid partial update", () => {
    const err = validateUpdateRestaurant({ name: "New Name" });
    expect(err).toBeNull();
  });

  it("rejects empty name if provided", () => {
    const err = validateUpdateRestaurant({ name: "" });
    expect(err).toBeTruthy();
  });

  it("rejects empty cuisines array if provided", () => {
    const err = validateUpdateRestaurant({ cuisines: [] });
    expect(err).toBeTruthy();
  });
});

// ── Orders Validation ─────────────────────────────────────────────────────────
describe("validateCreateOrder", () => {
  const valid = {
    restaurantId: "rest-1",
    items: [{ menuItemId: "item-1", quantity: 2 }],
    deliveryAddress: { street: "1 Road", city: "Delhi", state: "DL", postalCode: "110001" },
  };

  it("passes with valid payload", () => {
    const err = validateCreateOrder(valid);
    expect(err).toBeNull();
  });

  it("rejects missing restaurantId", () => {
    const err = validateCreateOrder({ ...valid, restaurantId: "" });
    expect(err).toBeTruthy();
  });

  it("rejects empty items array", () => {
    const err = validateCreateOrder({ ...valid, items: [] });
    expect(err).toBeTruthy();
  });

  it("rejects item with zero quantity", () => {
    const err = validateCreateOrder({ ...valid, items: [{ menuItemId: "x", quantity: 0 }] });
    expect(err).toBeTruthy();
  });

  it("rejects item missing menuItemId", () => {
    const err = validateCreateOrder({ ...valid, items: [{ quantity: 1 }] });
    expect(err).toBeTruthy();
  });

  it("rejects missing deliveryAddress", () => {
    const err = validateCreateOrder({ ...valid, deliveryAddress: null });
    expect(err).toBeTruthy();
  });

  it("accepts optional coupon code", () => {
    const err = validateCreateOrder({ ...valid, couponCode: "SAVE10" });
    expect(err).toBeNull();
  });
});

describe("validateStatusUpdate", () => {
  it("passes RESTAURANT changing to CONFIRMED", () => {
    const err = validateStatusUpdate({ status: "CONFIRMED" }, "PLACED", "RESTAURANT");
    expect(err).toBeNull();
  });

  it("passes DELIVERY changing to DELIVERED", () => {
    const err = validateStatusUpdate({ status: "DELIVERED" }, "OUT_FOR_DELIVERY", "DELIVERY");
    expect(err).toBeNull();
  });

  it("passes CUSTOMER cancelling PLACED order", () => {
    const err = validateStatusUpdate({ status: "CANCELLED" }, "PLACED", "CUSTOMER");
    expect(err).toBeNull();
  });

  it("rejects CUSTOMER trying to CONFIRM", () => {
    const err = validateStatusUpdate({ status: "CONFIRMED" }, "PLACED", "CUSTOMER");
    expect(err).toBeTruthy();
  });

  it("rejects DELIVERY setting status to CONFIRMED", () => {
    const err = validateStatusUpdate({ status: "CONFIRMED" }, "PLACED", "DELIVERY");
    expect(err).toBeTruthy();
  });

  it("rejects RESTAURANT trying to DELIVER", () => {
    const err = validateStatusUpdate({ status: "DELIVERED" }, "OUT_FOR_DELIVERY", "RESTAURANT");
    expect(err).toBeTruthy();
  });

  it("rejects missing status field", () => {
    const err = validateStatusUpdate({}, "PLACED", "RESTAURANT");
    expect(err).toBeTruthy();
  });

  it("passes ADMIN setting any allowed status", () => {
    const err = validateStatusUpdate({ status: "CANCELLED" }, "PLACED", "ADMIN");
    expect(err).toBeNull();
  });
});
