/**
 * Admin service tests — covers all 38 exported functions.
 * Prisma and side-effect utilities are mocked so tests are pure unit tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    restaurant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    coupon: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    menuItem: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    riderLocation: {
      findMany: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((args) => Promise.all(args)),
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../socket/socket.server.js", () => ({
  emitOrderStatusUpdated: vi.fn(),
}));

vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn().mockReturnValue(new Date("2099-01-01T12:30:00Z")),
}));

vi.mock("../utils/riderStatus.js", () => ({
  getRiderStatus: vi.fn().mockReturnValue("ONLINE"),
}));

const mockAwardPointsForOrder = vi.fn().mockResolvedValue(null);
vi.mock("../modules/wallet/wallet.service.js", () => ({
  awardPointsForOrder: mockAwardPointsForOrder,
}));

const mockProcessReferralReward = vi.fn().mockResolvedValue(undefined);
vi.mock("../modules/referral/referral.service.js", () => ({
  processReferralReward: mockProcessReferralReward,
}));

// ── Import subjects under test ─────────────────────────────────────────────────

const { prisma } = await import("../config/prisma.js");
const { emitOrderStatusUpdated } = await import("../socket/socket.server.js");
const { computeETA } = await import("../utils/eta.js");
const svc = await import("../modules/admin/admin.service.js");

beforeEach(() => vi.clearAllMocks());

// ── Helpers ────────────────────────────────────────────────────────────────────

const order = (overrides = {}) => ({
  id: "ord-1",
  status: "PLACED",
  total: 34900,
  placedAt: new Date(),
  createdAt: new Date(),
  deliveredAt: null,
  estimatedDelivery: null,
  deliveryAddress: null,
  agentId: null,
  restaurant: { id: "r-1", name: "Spice Hut", lat: 12.9, lng: 77.5, address: "MG Road" },
  agent: null,
  customer: { id: "u-1", name: "Alice" },
  ...overrides,
});

const user = (overrides = {}) => ({
  id: "u-1",
  name: "Alice",
  email: "alice@example.com",
  phone: null,
  roles: ["CUSTOMER"],
  activeRole: "CUSTOMER",
  isBlocked: false,
  isSuspended: false,
  ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════════
// Orders
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAllOrders", () => {
  it("returns orders with no filters", async () => {
    prisma.order.findMany.mockResolvedValue([order()]);
    const result = await svc.getAllOrders();
    expect(result).toHaveLength(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("applies status, restaurantId, userId filters", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await svc.getAllOrders({ status: "placed", restaurantId: "r-1", userId: "u-1" });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PLACED", restaurantId: "r-1", customerId: "u-1" }),
      }),
    );
  });

  it("applies date range filter", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await svc.getAllOrders({ startDate: "2026-01-01", endDate: "2026-12-31" });
    const { where } = prisma.order.findMany.mock.calls[0][0];
    expect(where.createdAt).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) });
  });

  it("throws AppError when prisma fails", async () => {
    prisma.order.findMany.mockRejectedValue(new Error("DB down"));
    await expect(svc.getAllOrders()).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("getOrderById", () => {
  it("returns an order when found", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    await expect(svc.getOrderById("ord-1")).resolves.toMatchObject({ id: "ord-1" });
  });

  it("throws 404 when not found", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.getOrderById("missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("updateOrderStatus", () => {
  it("rejects an invalid status", async () => {
    await expect(svc.updateOrderStatus("ord-1", "FLOATING")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when order not found", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.updateOrderStatus("ord-1", "CONFIRMED")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updates to DELIVERED and sets deliveredAt", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    prisma.order.update.mockResolvedValue(order({ status: "DELIVERED" }));
    await svc.updateOrderStatus("ord-1", "DELIVERED");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) }),
    );
    expect(emitOrderStatusUpdated).toHaveBeenCalled();
  });

  it("computes ETA for CONFIRMED status", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    prisma.order.update.mockResolvedValue(order({ status: "CONFIRMED" }));
    await svc.updateOrderStatus("ord-1", "CONFIRMED");
    expect(computeETA).toHaveBeenCalled();
  });

  it("returns the order as-is when it is already in a terminal state (terminal-state guard)", async () => {
    // Terminal-state guard: no update, no ETA computation, no side effects.
    // awardPointsForOrder has no internal idempotency, so this guard is the
    // only thing preventing double-credit on a repeated admin DELIVERED call.
    prisma.order.findUnique.mockResolvedValue(order({ status: "DELIVERED" }));
    const result = await svc.updateOrderStatus("ord-1", "CONFIRMED");
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(computeETA).not.toHaveBeenCalled();
    expect(mockAwardPointsForOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "DELIVERED" });
  });

  it("passes { id, status: order.status } in the WHERE clause to guard against concurrent writers", async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: "OUT_FOR_DELIVERY" }));
    prisma.order.update.mockResolvedValue(order({ status: "DELIVERED" }));
    await svc.updateOrderStatus("ord-1", "DELIVERED");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ord-1", status: "OUT_FOR_DELIVERY" } }),
    );
  });

  it("re-fetches and returns the current order when a concurrent writer wins (P2025)", async () => {
    const p2025 = new Error("Record not found");
    p2025.code = "P2025";
    prisma.order.findUnique
      .mockResolvedValueOnce(order({ status: "OUT_FOR_DELIVERY" }))  // initial read
      .mockResolvedValueOnce(order({ status: "DELIVERED" }));         // re-fetch after P2025
    prisma.order.update.mockRejectedValue(p2025);

    const result = await svc.updateOrderStatus("ord-1", "DELIVERED");

    expect(result).toMatchObject({ id: "ord-1", status: "DELIVERED" });
    // Socket event should NOT be emitted — the concurrent winner already emitted it
    expect(emitOrderStatusUpdated).not.toHaveBeenCalled();
  });

  it("fires awardPointsForOrder and processReferralReward when transitioning to DELIVERED", async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: "OUT_FOR_DELIVERY" }));
    prisma.order.update.mockResolvedValue(order({ status: "DELIVERED", customerId: "cust-1" }));

    await svc.updateOrderStatus("ord-1", "DELIVERED");

    expect(mockAwardPointsForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ord-1", status: "DELIVERED" }),
    );
    expect(mockProcessReferralReward).toHaveBeenCalledWith("cust-1");
  });

  it("does NOT fire awardPointsForOrder or processReferralReward for non-DELIVERED transitions", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    prisma.order.update.mockResolvedValue(order({ status: "CONFIRMED" }));

    await svc.updateOrderStatus("ord-1", "CONFIRMED");

    expect(mockAwardPointsForOrder).not.toHaveBeenCalled();
    expect(mockProcessReferralReward).not.toHaveBeenCalled();
  });

  it("does NOT fire awardPointsForOrder or processReferralReward when a concurrent writer won (P2025 branch)", async () => {
    const p2025 = new Error("Record not found");
    p2025.code = "P2025";
    prisma.order.findUnique
      .mockResolvedValueOnce(order({ status: "OUT_FOR_DELIVERY" }))
      .mockResolvedValueOnce(order({ status: "DELIVERED" }));
    prisma.order.update.mockRejectedValue(p2025);

    await svc.updateOrderStatus("ord-1", "DELIVERED");

    expect(mockAwardPointsForOrder).not.toHaveBeenCalled();
    expect(mockProcessReferralReward).not.toHaveBeenCalled();
  });
});

describe("cancelOrder", () => {
  it("cancels a non-delivered order", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    prisma.order.update.mockResolvedValue(order({ status: "CANCELLED" }));
    await svc.cancelOrder("ord-1", "test");
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
    expect(emitOrderStatusUpdated).toHaveBeenCalled();
  });

  it("throws 404 when order not found", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.cancelOrder("x")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 when order is already DELIVERED", async () => {
    prisma.order.findUnique.mockResolvedValue(order({ status: "DELIVERED" }));
    await expect(svc.cancelOrder("ord-1")).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAnalytics", () => {
  it("returns trend, statusBreakdown, topRestaurants, summary", async () => {
    const now = new Date();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", status: "DELIVERED", total: 10000, createdAt: now, restaurantId: "r-1", restaurant: { name: "R" } },
    ]);
    prisma.order.groupBy.mockResolvedValue([
      { restaurantId: "r-1", _sum: { total: 10000 }, _count: { id: 1 } },
    ]);
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r-1", name: "R" }]);

    const result = await svc.getAnalytics({ days: 1 });
    expect(result).toHaveProperty("trend");
    expect(result.summary.totalOrders).toBe(1);
    expect(result.summary.deliveredOrders).toBe(1);
    expect(result.topRestaurants[0].name).toBe("R");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Delivery Agents
// ═══════════════════════════════════════════════════════════════════════════════

describe("getDeliveryAgents", () => {
  it("returns paginated agents with delivered counts", async () => {
    const agent = { id: "d-1", name: "Ravi", _count: { agentOrders: 5 }, isAvailable: true };
    prisma.$transaction.mockResolvedValue([[agent], 1]);
    prisma.order.groupBy.mockResolvedValue([{ agentId: "d-1", _count: { id: 3 } }]);

    const result = await svc.getDeliveryAgents({ page: 1, limit: 10 });
    expect(result.agents[0]).toMatchObject({ id: "d-1", totalOrders: 5, deliveredOrders: 3 });
    expect(result.total).toBe(1);
  });

  it("applies search and onlineOnly filters", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    prisma.order.groupBy.mockResolvedValue([]);
    await svc.getDeliveryAgents({ search: "ravi", onlineOnly: true });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isAvailable: true, OR: expect.any(Array) }) }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Stats
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAdminStats", () => {
  it("returns aggregated dashboard stats", async () => {
    prisma.$transaction.mockResolvedValue([
      10,
      { _sum: { total: 50000 } },
      5,
      3,
      2,
      [
        { id: "o1", customer: { name: "Alice" }, restaurant: { name: "R" }, total: 34900, status: "PLACED" },
      ],
    ]);
    const result = await svc.getAdminStats();
    expect(result.ordersToday).toBe(10);
    expect(result.revenueToday).toBe(500);
    expect(result.recentOrders[0].customerName).toBe("Alice");
  });

  it("throws AppError when prisma fails", async () => {
    prisma.$transaction.mockRejectedValue(new Error("DB error"));
    await expect(svc.getAdminStats()).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Users
// ═══════════════════════════════════════════════════════════════════════════════

describe("getUsers", () => {
  it("returns paginated users", async () => {
    prisma.$transaction.mockResolvedValue([[user()], 1]);
    const result = await svc.getUsers({ page: 1, limit: 20 });
    expect(result.users).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("applies role and search filters", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await svc.getUsers({ role: "ADMIN", search: "alice" });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roles: { has: "ADMIN" }, OR: expect.any(Array) }) }),
    );
  });
});

describe("updateUser", () => {
  it("updates name and phone", async () => {
    prisma.user.update.mockResolvedValue(user({ name: "Bob" }));
    await svc.updateUser("u-1", { name: "Bob", phone: "9999999999" });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Bob", phone: "9999999999" } }),
    );
  });

  it("omits undefined fields", async () => {
    prisma.user.update.mockResolvedValue(user());
    await svc.updateUser("u-1", {});
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("blockUser", () => {
  it("blocks a user and revokes sessions", async () => {
    prisma.user.update.mockResolvedValue(user({ isBlocked: true }));
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    await svc.blockUser("u-1", { block: true });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isBlocked: true } }));
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });

  it("unblocks without revoking sessions", async () => {
    prisma.user.update.mockResolvedValue(user({ isBlocked: false }));
    await svc.blockUser("u-1", { block: false });
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("treats block='true' string as truthy", async () => {
    prisma.user.update.mockResolvedValue(user({ isBlocked: true }));
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    await svc.blockUser("u-1", { block: "true" });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isBlocked: true } }));
  });
});

describe("changeUserRole", () => {
  it("throws 400 for invalid role", async () => {
    await expect(svc.changeUserRole("u-1", { role: "SUPERHERO" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.changeUserRole("u-1", { role: "ADMIN" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("adds role and sets activeRole", async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.user.update.mockResolvedValue(user({ roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" }));
    await svc.changeUserRole("u-1", { role: "ADMIN" });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" } }),
    );
  });
});

describe("grantRole", () => {
  it("throws 400 for invalid role", async () => {
    await expect(svc.grantRole("u-1", { role: "GHOST" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.grantRole("u-1", { role: "DELIVERY" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deduplicates roles on grant", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ roles: ["CUSTOMER", "DELIVERY"] }));
    prisma.user.update.mockResolvedValue(user({ roles: ["CUSTOMER", "DELIVERY"] }));
    await svc.grantRole("u-1", { role: "DELIVERY" });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["CUSTOMER", "DELIVERY"] } }),
    );
  });
});

describe("revokeRole", () => {
  it("throws 400 when revoking CUSTOMER role", async () => {
    await expect(svc.revokeRole("u-1", { role: "CUSTOMER" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.revokeRole("u-1", { role: "ADMIN" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("falls back to first role when activeRole is revoked", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" }));
    prisma.user.update.mockResolvedValue(user({ roles: ["CUSTOMER"], activeRole: "CUSTOMER" }));
    await svc.revokeRole("u-1", { role: "ADMIN" });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["CUSTOMER"], activeRole: "CUSTOMER" } }),
    );
  });

  it("keeps activeRole when it is not the revoked role", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ roles: ["CUSTOMER", "DELIVERY", "ADMIN"], activeRole: "CUSTOMER" }));
    prisma.user.update.mockResolvedValue(user({ roles: ["CUSTOMER", "ADMIN"], activeRole: "CUSTOMER" }));
    await svc.revokeRole("u-1", { role: "DELIVERY" });
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.activeRole).toBe("CUSTOMER");
  });
});

describe("deleteUserById", () => {
  it("calls prisma.user.delete", async () => {
    prisma.user.delete.mockResolvedValue({});
    await svc.deleteUserById("u-1");
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u-1" } });
  });
});

describe("suspendUser", () => {
  it("suspends user and revokes sessions", async () => {
    prisma.user.update.mockResolvedValue(user({ isSuspended: true }));
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await svc.suspendUser("u-1", { suspend: true });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
  });

  it("unsuspends without revoking sessions", async () => {
    prisma.user.update.mockResolvedValue(user({ isSuspended: false }));
    await svc.suspendUser("u-1", { suspend: false });
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("updateUserRole", () => {
  it("updates roles and activeRole", async () => {
    prisma.user.update.mockResolvedValue(user({ roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" }));
    await svc.updateUserRole("u-1", { roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ["CUSTOMER", "ADMIN"], activeRole: "ADMIN" } }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Restaurants
// ═══════════════════════════════════════════════════════════════════════════════

describe("getRestaurants", () => {
  it("returns paginated restaurants", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "r-1", name: "R" }], 1]);
    const result = await svc.getRestaurants();
    expect(result.restaurants).toHaveLength(1);
  });

  it("applies search filter", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await svc.getRestaurants({ search: "pizza" });
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { contains: "pizza", mode: "insensitive" } } }),
    );
  });
});

describe("getRestaurantDetail", () => {
  it("returns restaurant when found", async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ id: "r-1", name: "R" });
    const result = await svc.getRestaurantDetail("r-1");
    expect(result.name).toBe("R");
  });

  it("throws 404 when not found", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    await expect(svc.getRestaurantDetail("missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("updateRestaurant", () => {
  it("applies partial updates", async () => {
    prisma.restaurant.update.mockResolvedValue({ id: "r-1", isOpen: false });
    await svc.updateRestaurant("r-1", { isOpen: false });
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isOpen: false } }),
    );
  });
});

describe("suspendRestaurant", () => {
  it("suspends an active restaurant", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ suspended: false });
    prisma.restaurant.update.mockResolvedValue({ suspended: true, isOpen: false });
    await svc.suspendRestaurant("r-1");
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { suspended: true, isOpen: false } }),
    );
  });

  it("unsuspends a suspended restaurant", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ suspended: true });
    prisma.restaurant.update.mockResolvedValue({ suspended: false, isOpen: true });
    await svc.suspendRestaurant("r-1");
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { suspended: false, isOpen: true } }),
    );
  });

  it("throws 404 when not found", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    await expect(svc.suspendRestaurant("x")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("setRestaurantApproval", () => {
  it("approves a restaurant", async () => {
    prisma.restaurant.update.mockResolvedValue({ isApproved: true });
    await svc.setRestaurantApproval("r-1", true);
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isApproved: true } }),
    );
  });
});

describe("deleteRestaurantById", () => {
  it("deletes the restaurant", async () => {
    prisma.restaurant.delete.mockResolvedValue({});
    await svc.deleteRestaurantById("r-1");
    expect(prisma.restaurant.delete).toHaveBeenCalledWith({ where: { id: "r-1" } });
  });
});

describe("assignDeliveryPartner", () => {
  it("assigns agent and emits socket event", async () => {
    prisma.order.findUnique.mockResolvedValue(order());
    prisma.user.findUnique.mockResolvedValue({ currentLat: 12.9, currentLng: 77.5 });
    prisma.order.update.mockResolvedValue(order({ agentId: "d-1", status: "OUT_FOR_DELIVERY" }));

    await svc.assignDeliveryPartner("ord-1", "d-1");

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentId: "d-1", status: "OUT_FOR_DELIVERY" }) }),
    );
    expect(emitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OUT_FOR_DELIVERY" }),
    );
  });

  it("throws 404 when order not found", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.assignDeliveryPartner("x", "d-1")).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Menu Items
// ═══════════════════════════════════════════════════════════════════════════════

describe("getMenuItems", () => {
  it("returns paginated items", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "m-1", name: "Burger" }], 1]);
    const result = await svc.getMenuItems({ restaurantId: "r-1" });
    expect(result.items).toHaveLength(1);
  });
});

describe("createMenuItem", () => {
  it("creates a menu item", async () => {
    prisma.menuItem.create.mockResolvedValue({ id: "m-1" });
    await svc.createMenuItem({ restaurantId: "r-1", name: "Burger", price: "349", category: "MAIN", imageUrl: "", description: "" });
    expect(prisma.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Burger", price: 349 }) }),
    );
  });
});

describe("updateMenuItem", () => {
  it("applies partial updates", async () => {
    prisma.menuItem.update.mockResolvedValue({ id: "m-1", isAvailable: false });
    await svc.updateMenuItem("m-1", { isAvailable: false });
    expect(prisma.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isAvailable: false } }),
    );
  });
});

describe("deleteMenuItem", () => {
  it("deletes the item", async () => {
    prisma.menuItem.delete.mockResolvedValue({});
    await svc.deleteMenuItem("m-1");
    expect(prisma.menuItem.delete).toHaveBeenCalledWith({ where: { id: "m-1" } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Reviews
// ═══════════════════════════════════════════════════════════════════════════════

describe("getReviews", () => {
  it("returns paginated reviews", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "rev-1" }], 1]);
    const result = await svc.getReviews();
    expect(result.reviews).toHaveLength(1);
  });
});

describe("deleteReview", () => {
  it("deletes the review", async () => {
    prisma.review.delete.mockResolvedValue({});
    await svc.deleteReview("rev-1");
    expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: "rev-1" } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Audit Log
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAuditLog", () => {
  it("returns paginated audit log entries", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "al-1", action: "LOGIN" }], 1]);
    const result = await svc.getAuditLog({ page: 1, limit: 50 });
    expect(result.entries).toHaveLength(1);
  });

  it("applies userId and action filters", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await svc.getAuditLog({ userId: "u-1", action: "delete" });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u-1", action: { contains: "delete", mode: "insensitive" } }),
      }),
    );
  });
});

describe("getAuditLogAll", () => {
  it("returns all entries (no pagination) up to 10k cap", async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: "al-1" }]);
    const result = await svc.getAuditLogAll({ userId: "u-1" });
    expect(result).toHaveLength(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10000 }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Coupons
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAdminCoupons", () => {
  it("returns paginated coupons", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "c-1", code: "SAVE10" }], 1]);
    const result = await svc.getAdminCoupons();
    expect(result.coupons).toHaveLength(1);
  });
});

describe("createAdminCoupon", () => {
  it("upcases code and creates coupon", async () => {
    prisma.coupon.create.mockResolvedValue({ id: "c-1", code: "SAVE10" });
    await svc.createAdminCoupon({
      code: "save10", discountType: "PERCENTAGE", discountValue: "10",
      minOrder: "0", maxUses: "100", expiresAt: "2099-12-31",
    });
    expect(prisma.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "SAVE10" }) }),
    );
  });
});

describe("updateAdminCoupon", () => {
  it("upcases code on update", async () => {
    prisma.coupon.update.mockResolvedValue({ id: "c-1", code: "NEW10" });
    await svc.updateAdminCoupon("c-1", { code: "new10", isActive: false });
    expect(prisma.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "NEW10", isActive: false }) }),
    );
  });
});

describe("deleteAdminCoupon", () => {
  it("deactivates rather than hard-deletes", async () => {
    prisma.coupon.update.mockResolvedValue({ id: "c-1", isActive: false });
    await svc.deleteAdminCoupon("c-1");
    expect(prisma.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Payments
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAdminPayments", () => {
  it("returns enriched payments", async () => {
    const payment = { id: "p-1", customerId: "u-1", restaurantId: "r-1", cfOrderId: "cf-1", status: "SUCCESS" };
    prisma.$transaction.mockResolvedValue([[payment], 1]);
    prisma.user.findMany.mockResolvedValue([{ id: "u-1", name: "Alice" }]);
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r-1", name: "R" }]);
    prisma.order.findMany.mockResolvedValue([{ id: "ord-1", cfOrderId: "cf-1" }]);

    const result = await svc.getAdminPayments({ page: 1, limit: 20 });
    expect(result.payments[0]).toMatchObject({ customerName: "Alice", restaurantName: "R", orderId: "ord-1" });
  });

  it("applies status filter", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    await svc.getAdminPayments({ status: "FAILED" });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "FAILED" } }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// auditLogToCsv (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

describe("auditLogToCsv", () => {
  const ts = new Date("2026-06-14T10:00:00.000Z");

  it("produces a header row and one data row", () => {
    const csv = svc.auditLogToCsv([{ id: "al-1", userId: "u-1", action: "LOGIN", entityType: null, entityId: null, ipAddress: "1.2.3.4", createdAt: ts }]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("id,userId,action,entityType,entityId,ipAddress,createdAt");
    expect(row).toContain("LOGIN");
    expect(row).toContain("2026-06-14T10:00:00.000Z");
  });

  it("escapes commas and double-quotes", () => {
    const csv = svc.auditLogToCsv([{
      id: "al-1", userId: "u-1", action: 'say "hello", world', entityType: null, entityId: null, ipAddress: null, createdAt: ts,
    }]);
    expect(csv).toContain('"say ""hello"", world"');
  });

  it("handles null values as empty strings", () => {
    const csv = svc.auditLogToCsv([{ id: "al-1", userId: "u-1", action: "X", entityType: null, entityId: null, ipAddress: null, createdAt: ts }]);
    expect(csv.split("\n")[1].split(",")[3]).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getLiveMapData
// ═══════════════════════════════════════════════════════════════════════════════

describe("getLiveMapData", () => {
  it("returns restaurants, riders, and activeOrders with customer drop coords", async () => {
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r-1", name: "R", lat: 12.9, lng: 77.5, rating: 4.2, isOpen: true, suspended: false }]);
    prisma.riderLocation.findMany.mockResolvedValue([{
      riderId: "d-1", latitude: 12.91, longitude: 77.51, heading: null, speed: null, lastSeenAt: new Date(),
      rider: { id: "d-1", name: "Ravi" },
    }]);
    prisma.order.findMany.mockResolvedValue([{
      id: "o-1", status: "OUT_FOR_DELIVERY", total: 34900, createdAt: new Date(), estimatedDelivery: null,
      deliveryAddress: { lat: 12.95, lng: 77.55 },
      restaurant: { id: "r-1", name: "R", lat: 12.9, lng: 77.5 },
      customer: { id: "u-1", name: "Alice", phone: null },
      agent: { id: "d-1", name: "Ravi", phone: null },
    }]);
    prisma.order.groupBy.mockResolvedValue([]);

    const result = await svc.getLiveMapData();

    expect(result.restaurants[0]).toMatchObject({ status: "OPEN", id: "r-1" });
    expect(result.riders[0]).toMatchObject({ id: "d-1", status: "ONLINE" });
    expect(result.activeOrders[0].customer).toMatchObject({ latitude: 12.95, longitude: 77.55 });
  });

  it("marks suspended restaurant as SUSPENDED", async () => {
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r-1", name: "R", lat: 12.9, lng: 77.5, rating: 4.0, isOpen: false, suspended: true }]);
    prisma.riderLocation.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);

    const { restaurants } = await svc.getLiveMapData();
    expect(restaurants[0].status).toBe("SUSPENDED");
  });

  it("handles null deliveryAddress — customer drop coords are null", async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.riderLocation.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([{
      id: "o-1", status: "OUT_FOR_DELIVERY", total: 100, createdAt: new Date(), estimatedDelivery: null,
      deliveryAddress: null,
      restaurant: { id: "r-1", name: "R", lat: 12.9, lng: 77.5 },
      customer: { id: "u-1", name: "Alice", phone: null },
      agent: { id: "d-1", name: "Ravi", phone: null },
    }]);
    prisma.order.groupBy.mockResolvedValue([]);

    const { activeOrders } = await svc.getLiveMapData();
    expect(activeOrders[0].customer.latitude).toBeNull();
    expect(activeOrders[0].customer.longitude).toBeNull();
  });
});
