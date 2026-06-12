import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    restaurant: {
      findUnique: vi.fn(),
    },
    menuItem: {
      findMany: vi.fn(),
    },
    coupon: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    siteConfig: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here",
    CASHFREE_APP_ID: "test",
    CASHFREE_SECRET_KEY: "test",
    CASHFREE_ENV: "sandbox",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:5000",
    ALLOWED_ORIGINS: "http://localhost:3000",
    PORT: 5000,
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn().mockResolvedValue({
    defaultDeliveryFee: 3000,
    maintenanceMode: false,
  }),
}));

vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn().mockReturnValue(new Date(Date.now() + 45 * 60 * 1000)),
}));

vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDelete: vi.fn().mockResolvedValue(undefined),
  cacheOrFetch: vi.fn().mockImplementation(async (_k, fn) => fn()),
  CACHE_KEYS: { ANALYTICS: (id, r) => `analytics:${id}:${r}` },
  CACHE_TTL: { ANALYTICS: 300 },
}));

// ── Import after mocks ────────────────────────────────────────────────────────
const { listOrders } = await import("../modules/orders/orders.service.js");
const { prisma } = await import("../config/prisma.js");

// ── Test data ─────────────────────────────────────────────────────────────────

const MOCK_ORDER = {
  id: "order-abc",
  customerId: "customer-1",
  restaurantId: "rest-1",
  status: "PLACED",
  subtotal: 50000,
  deliveryFee: 3000,
  discount: 0,
  total: 53000,
  placedAt: new Date(),
  createdAt: new Date(),
  estimatedDelivery: null,
  restaurant: { id: "rest-1", name: "Pizza Palace", imageUrl: "" },
  agent: null,
  items: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("listOrders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns orders for a specific customer", async () => {
    prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);
    const result = await listOrders("customer-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("order-abc");
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "customer-1" } })
    );
  });

  it("applies default pagination (page 1, limit 20)", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await listOrders("c1");
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, skip: 0 })
    );
  });

  it("caps limit at 100", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await listOrders("c1", { page: 1, limit: 9999 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("calculates correct skip for page 3, limit 10", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await listOrders("c1", { page: 3, limit: 10 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 })
    );
  });

  it("serializes numeric fields from DB", async () => {
    prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);
    const [order] = await listOrders("customer-1");
    expect(typeof order.total).toBe("number");
    expect(typeof order.subtotal).toBe("number");
    expect(typeof order.deliveryFee).toBe("number");
  });
});
