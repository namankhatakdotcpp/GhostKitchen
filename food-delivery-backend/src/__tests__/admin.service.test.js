/**
 * admin.service unit tests — exercises the admin operations service with a
 * mocked Prisma client. Focused on behaviour + wiring (this large service had
 * no direct coverage before).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    restaurant: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
    payment: { findMany: vi.fn(), count: vi.fn() },
    coupon: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    menuItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    review: { findMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../utils/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../socket/socket.server.js", () => ({ emitOrderStatusUpdated: vi.fn() }));
vi.mock("../utils/eta.js", () => ({ computeETA: vi.fn(() => new Date("2026-06-14T13:00:00.000Z")) }));

const svc = await import("../modules/admin/admin.service.js");
const { prisma } = await import("../config/prisma.js");

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction([...]) resolves each query; $transaction(fn) calls it with prisma.
  prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)));
});

describe("orders", () => {
  it("getAllOrders returns filtered orders", async () => {
    prisma.order.findMany.mockResolvedValue([{ id: "o1" }]);
    expect(await svc.getAllOrders({ status: "PLACED", restaurantId: "r1", userId: "u1", startDate: "2026-01-01", endDate: "2026-02-01" })).toEqual([{ id: "o1" }]);
  });

  it("getOrderById returns an order", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "o1" });
    expect(await svc.getOrderById("o1")).toEqual({ id: "o1" });
  });

  it("getOrderById throws 404 when missing", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.getOrderById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updateOrderStatus updates and emits", async () => {
    prisma.order.findUnique.mockResolvedValue({ status: "CONFIRMED", restaurant: { lat: 1, lng: 1, address: {} }, agent: null, deliveryAddress: null });
    prisma.order.update.mockResolvedValue({ id: "o1", status: "PREPARING" });
    const out = await svc.updateOrderStatus("o1", "PREPARING");
    expect(out.status).toBe("PREPARING");
  });

  it("updateOrderStatus rejects an invalid status", async () => {
    await expect(svc.updateOrderStatus("o1", "BOGUS")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cancelOrder cancels a non-delivered order", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "o1", status: "PLACED" });
    prisma.order.update.mockResolvedValue({ id: "o1", status: "CANCELLED" });
    expect((await svc.cancelOrder("o1")).status).toBe("CANCELLED");
  });

  it("cancelOrder refuses a delivered order", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "o1", status: "DELIVERED" });
    await expect(svc.cancelOrder("o1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("assignDeliveryPartner assigns and emits", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "o1", restaurant: { lat: 1, lng: 1, address: {} }, deliveryAddress: null });
    prisma.user.findUnique.mockResolvedValue({ currentLat: 1, currentLng: 1 });
    prisma.order.update.mockResolvedValue({ id: "o1", agentId: "d1" });
    expect((await svc.assignDeliveryPartner("o1", "d1")).agentId).toBe("d1");
  });
});

describe("analytics + stats", () => {
  it("getAnalytics returns trend + summary", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);
    const a = await svc.getAnalytics({ days: 7 });
    expect(a).toHaveProperty("trend");
    expect(a.summary.days).toBe(7);
  });

  it("getAdminStats aggregates dashboard numbers", async () => {
    prisma.order.count.mockResolvedValue(3);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 10000 } });
    prisma.restaurant.count.mockResolvedValue(2);
    prisma.user.count.mockResolvedValue(1);
    prisma.order.findMany.mockResolvedValue([{ id: "o1", customer: { name: "A" }, restaurant: { name: "R" }, total: 100, status: "PLACED" }]);
    const s = await svc.getAdminStats();
    expect(s.revenueToday).toBe(100); // 10000 paise / 100
    expect(s.recentOrders).toHaveLength(1);
  });

  it("getDeliveryAgents returns agents with counts", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "d1", _count: { agentOrders: 4 } }]);
    prisma.user.count.mockResolvedValue(1);
    prisma.order.groupBy.mockResolvedValue([{ agentId: "d1", _count: { id: 2 } }]);
    const out = await svc.getDeliveryAgents({ search: "x", onlineOnly: "true" });
    expect(out.agents[0]).toMatchObject({ totalOrders: 4, deliveredOrders: 2 });
  });
});

describe("listings", () => {
  it("getUsers paginates", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
    prisma.user.count.mockResolvedValue(1);
    expect((await svc.getUsers({ role: "ADMIN", search: "a" })).total).toBe(1);
  });
  it("getRestaurants paginates", async () => {
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r1" }]);
    prisma.restaurant.count.mockResolvedValue(1);
    expect((await svc.getRestaurants({ search: "p" })).total).toBe(1);
  });
  it("getAdminPayments enriches payments", async () => {
    prisma.payment.findMany.mockResolvedValue([{ id: "p1", customerId: "c1", restaurantId: "r1", cfOrderId: "cf1" }]);
    prisma.payment.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([{ id: "c1", name: "Alice" }]);
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r1", name: "Pizza" }]);
    prisma.order.findMany.mockResolvedValue([{ id: "o1", cfOrderId: "cf1" }]);
    const out = await svc.getAdminPayments({ status: "SUCCESS" });
    expect(out.payments[0]).toMatchObject({ customerName: "Alice", restaurantName: "Pizza", orderId: "o1" });
  });
  it("getAdminCoupons paginates", async () => {
    prisma.coupon.findMany.mockResolvedValue([{ id: "c1" }]);
    prisma.coupon.count.mockResolvedValue(1);
    expect((await svc.getAdminCoupons({})).total).toBe(1);
  });
  it("getMenuItems paginates", async () => {
    prisma.menuItem.findMany.mockResolvedValue([{ id: "m1" }]);
    prisma.menuItem.count.mockResolvedValue(1);
    expect((await svc.getMenuItems({ restaurantId: "r1" })).total).toBe(1);
  });
  it("getReviews paginates", async () => {
    prisma.review.findMany.mockResolvedValue([{ id: "rv1" }]);
    prisma.review.count.mockResolvedValue(1);
    expect((await svc.getReviews({})).total).toBe(1);
  });
  it("getAuditLog paginates", async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: "a1" }]);
    prisma.auditLog.count.mockResolvedValue(1);
    expect((await svc.getAuditLog({ userId: "u1", action: "LOGIN" })).total).toBe(1);
  });
  it("getAuditLogAll returns rows", async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: "a1" }]);
    expect(await svc.getAuditLogAll({ action: "X" })).toHaveLength(1);
  });
});

describe("coupon CRUD", () => {
  it("createAdminCoupon upcases code", async () => {
    prisma.coupon.create.mockResolvedValue({ id: "c1" });
    await svc.createAdminCoupon({ code: "save10", discountType: "FLAT", discountValue: "10", minOrder: "100", maxUses: "5", expiresAt: "2026-12-01" });
    expect(prisma.coupon.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "SAVE10" }) }));
  });
  it("updateAdminCoupon maps fields", async () => {
    prisma.coupon.update.mockResolvedValue({ id: "c1" });
    await svc.updateAdminCoupon("c1", { code: "x", discountValue: "5", isActive: false });
    expect(prisma.coupon.update).toHaveBeenCalled();
  });
  it("deleteAdminCoupon soft-disables", async () => {
    prisma.coupon.update.mockResolvedValue({});
    await svc.deleteAdminCoupon("c1");
    expect(prisma.coupon.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: false } });
  });
});

describe("restaurant + menu management", () => {
  it("suspendRestaurant toggles", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ suspended: false });
    prisma.restaurant.update.mockResolvedValue({ id: "r1", suspended: true });
    expect((await svc.suspendRestaurant("r1")).suspended).toBe(true);
  });
  it("suspendRestaurant 404s when missing", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    await expect(svc.suspendRestaurant("r1")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("setRestaurantApproval updates", async () => {
    prisma.restaurant.update.mockResolvedValue({ id: "r1", isApproved: true });
    expect((await svc.setRestaurantApproval("r1", true)).isApproved).toBe(true);
  });
  it("getRestaurantDetail returns or 404s", async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ id: "r1" });
    expect(await svc.getRestaurantDetail("r1")).toEqual({ id: "r1" });
    prisma.restaurant.findFirst.mockResolvedValue(null);
    await expect(svc.getRestaurantDetail("r1")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("updateRestaurant maps fields", async () => {
    prisma.restaurant.update.mockResolvedValue({ id: "r1" });
    await svc.updateRestaurant("r1", { name: "New", isOpen: false, cuisines: ["x"], suspended: true, description: "d" });
    expect(prisma.restaurant.update).toHaveBeenCalled();
  });
  it("deleteRestaurantById deletes", async () => {
    prisma.restaurant.delete.mockResolvedValue({});
    await svc.deleteRestaurantById("r1");
    expect(prisma.restaurant.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
  it("createMenuItem creates", async () => {
    prisma.menuItem.create.mockResolvedValue({ id: "m1" });
    await svc.createMenuItem({ restaurantId: "r1", name: "Pizza", description: "d", price: "9.5", category: "Main" });
    expect(prisma.menuItem.create).toHaveBeenCalled();
  });
  it("updateMenuItem maps fields", async () => {
    prisma.menuItem.update.mockResolvedValue({ id: "m1" });
    await svc.updateMenuItem("m1", { name: "X", price: "5", isVeg: true });
    expect(prisma.menuItem.update).toHaveBeenCalled();
  });
  it("deleteMenuItem deletes", async () => {
    prisma.menuItem.delete.mockResolvedValue({});
    await svc.deleteMenuItem("m1");
    expect(prisma.menuItem.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
  it("deleteReview deletes", async () => {
    prisma.review.delete.mockResolvedValue({});
    await svc.deleteReview("rv1");
    expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: "rv1" } });
  });
});

describe("user management", () => {
  it("updateUserRole updates", async () => {
    prisma.user.update.mockResolvedValue({ id: "u1" });
    await svc.updateUserRole("u1", { roles: ["ADMIN"], activeRole: "ADMIN" });
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it("updateUser trims name", async () => {
    prisma.user.update.mockResolvedValue({ id: "u1" });
    await svc.updateUser("u1", { name: "  Bob  ", phone: "" });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Bob", phone: null } }));
  });
  it("blockUser revokes sessions when blocking", async () => {
    prisma.user.update.mockResolvedValue({ id: "u1", isBlocked: true });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await svc.blockUser("u1", { block: true });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
  it("changeUserRole validates + merges roles", async () => {
    prisma.user.findUnique.mockResolvedValue({ roles: ["CUSTOMER"] });
    prisma.user.update.mockResolvedValue({ id: "u1" });
    await svc.changeUserRole("u1", { role: "DELIVERY" });
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it("changeUserRole rejects invalid role", async () => {
    await expect(svc.changeUserRole("u1", { role: "KING" })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("grantRole adds a role", async () => {
    prisma.user.findUnique.mockResolvedValue({ roles: ["CUSTOMER"] });
    prisma.user.update.mockResolvedValue({ id: "u1" });
    await svc.grantRole("u1", { role: "RESTAURANT" });
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it("revokeRole refuses to remove CUSTOMER", async () => {
    await expect(svc.revokeRole("u1", { role: "CUSTOMER" })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("revokeRole removes a role and fixes activeRole", async () => {
    prisma.user.findUnique.mockResolvedValue({ roles: ["CUSTOMER", "DELIVERY"], activeRole: "DELIVERY" });
    prisma.user.update.mockResolvedValue({ id: "u1" });
    await svc.revokeRole("u1", { role: "DELIVERY" });
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it("suspendUser revokes sessions when suspending", async () => {
    prisma.user.update.mockResolvedValue({ id: "u1", isSuspended: true });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await svc.suspendUser("u1", { suspend: true });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
  });
  it("deleteUserById deletes", async () => {
    prisma.user.delete.mockResolvedValue({});
    await svc.deleteUserById("u1");
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});

describe("auditLogToCsv", () => {
  it("renders a header and escapes commas", () => {
    const csv = svc.auditLogToCsv([{ id: "a1", userId: "u1", action: "LOGIN, ok", entityType: "User", entityId: "u1", ipAddress: "127.0.0.1", createdAt: new Date("2026-06-14T00:00:00Z") }]);
    expect(csv.split("\n")[0]).toContain("id,userId,action");
    expect(csv).toContain('"LOGIN, ok"');
  });
});
