/**
 * Two-step delivery assignment: offer -> accept/reject.
 * Covers: assignDeliveryAgent writes pendingAgentId (not agentId) and emits
 * order:offer; acceptOrderOffer atomically claims and emits order:assigned;
 * rejectOrderOffer frees the rider and re-offers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-here-padding" },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    restaurant: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), update: vi.fn() },
    riderLocation: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  },
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn(),
}));
vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn(() => new Date("2026-01-01T12:30:00Z")),
}));

const { prisma } = await import("../config/prisma.js");
const { assignDeliveryAgent, acceptOrderOffer, rejectOrderOffer } = await import(
  "../modules/orders/orders.service.js"
);

function makeIo() {
  const emit = vi.fn();
  return { to: vi.fn(() => ({ emit })), _emit: emit };
}

const baseRestaurant = { id: "rest-1", name: "Test Kitchen", city: "delhi", address: {}, lat: 28.6, lng: 77.2 };
const baseOrder = {
  id: "ord-1",
  restaurantId: "rest-1",
  restaurant: baseRestaurant,
  deliveryAddress: {},
  items: [],
};
const baseAgent = {
  id: "agent-1",
  name: "Rider One",
  phone: "9999999999",
  city: "delhi",
  currentLat: 28.6,
  currentLng: 77.2,
  maxRadiusKm: 20,
  isAvailable: true,
};

describe("assignDeliveryAgent — offer step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((ops) => Promise.all(ops));
  });

  it("writes pendingAgentId/agentOfferedAt, not agentId, and emits order:offer", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.user.findMany.mockResolvedValue([baseAgent]);
    prisma.order.update.mockResolvedValue({ ...baseOrder, pendingAgentId: baseAgent.id });
    prisma.user.update.mockResolvedValue(baseAgent);

    const io = makeIo();
    const selected = await assignDeliveryAgent("ord-1", io);

    expect(selected.id).toBe("agent-1");
    const updateCall = prisma.order.update.mock.calls[0][0];
    expect(updateCall.data).toMatchObject({ pendingAgentId: "agent-1" });
    expect(updateCall.data).not.toHaveProperty("agentId");
    expect(updateCall.data.agentOfferedAt).toBeInstanceOf(Date);

    // Rider marked unavailable so they can't be double-offered.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "agent-1" },
      data: { isAvailable: false },
    });

    // Offer goes to the rider's own room, not to the customer/shop.
    expect(io.to).toHaveBeenCalledWith("agent-agent-1");
    expect(io._emit).toHaveBeenCalledWith(
      "order:offer",
      expect.objectContaining({ orderId: "ord-1", expiresInSeconds: 30 }),
    );
    expect(io._emit).not.toHaveBeenCalledWith("order:assigned", expect.anything());
  });

  // Regression for Bug B: a restaurant with no lat/lng used to skip the
  // radius filter entirely (`!restaurantHasCoords || distance <= radius`
  // short-circuited true for any distance), so a rider many km away got
  // blind-assigned via the no-city-match full-pool fallback. It must now
  // refuse to fall back to the full pool at all when ungeocoded — only a
  // real city match is trusted — and stay unassigned otherwise.
  it("never assigns an agent when the restaurant has no coordinates and no city match exists (no blind full-pool fallback)", async () => {
    const ungeocoded = { ...baseRestaurant, city: null, lat: null, lng: null, address: {} };
    const farAgent = { ...baseAgent, id: "agent-far", city: "mumbai", currentLat: 19.07, currentLng: 72.87 };
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, restaurant: ungeocoded });
    prisma.user.findMany.mockResolvedValue([farAgent]);

    const io = makeIo();
    const selected = await assignDeliveryAgent("ord-1", io);

    expect(selected).toBeNull();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith(
      "order:no-agent",
      expect.objectContaining({ orderId: "ord-1", reason: "no_agents_in_radius" }),
    );
  });

  it("still assigns within the full pool when the restaurant HAS coordinates but no city match", async () => {
    const noCity = { ...baseRestaurant, city: null, address: {} }; // keeps real lat/lng (28.6, 77.2)
    const closeAgent = { ...baseAgent, id: "agent-close", city: "mumbai", currentLat: 28.61, currentLng: 77.21 };
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, restaurant: noCity });
    prisma.user.findMany.mockResolvedValue([closeAgent]);
    prisma.order.update.mockResolvedValue({ ...baseOrder, pendingAgentId: closeAgent.id });
    prisma.user.update.mockResolvedValue(closeAgent);

    const io = makeIo();
    const selected = await assignDeliveryAgent("ord-1", io);

    expect(selected?.id).toBe("agent-close");
  });

  // Regression for Bug D: the Bug B fix above restricted ungeocoded
  // restaurants to city-matched candidates only, but the radius filter
  // still ran haversine(null, null, agentLat, agentLng) for that exact
  // case — JS coerces null to 0 in arithmetic, so it computed a bogus
  // ~8700km distance from (0, 0) (the Gulf of Guinea) instead of skipping
  // the distance check. A city-matched agent must be assignable for an
  // ungeocoded restaurant, with no fabricated distance anywhere in the
  // offer payload.
  it("assigns a city-matched agent for an ungeocoded restaurant without computing a fake distance", async () => {
    const ungeocodedSameCity = { ...baseRestaurant, lat: null, lng: null, city: "bahadurgarh", address: {} };
    const cityAgent = { ...baseAgent, id: "agent-city", city: "bahadurgarh", currentLat: 28.69, currentLng: 76.93 };
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, restaurant: ungeocodedSameCity });
    prisma.user.findMany.mockResolvedValue([cityAgent]);
    prisma.order.update.mockResolvedValue({ ...baseOrder, pendingAgentId: cityAgent.id });
    prisma.user.update.mockResolvedValue(cityAgent);

    const io = makeIo();
    const selected = await assignDeliveryAgent("ord-1", io);

    expect(selected?.id).toBe("agent-city");
    const offerPayload = io._emit.mock.calls.find(([event]) => event === "order:offer")?.[1];
    expect(offerPayload.distanceKm).toBeNull();
  });

  // (0, 0) must be treated identically to null — never trusted as a real
  // restaurant location, and never fed into haversine as a real point.
  it("treats (0, 0) coordinates the same as null — never computes distance from them", async () => {
    const zeroCoordSameCity = { ...baseRestaurant, lat: 0, lng: 0, city: "bahadurgarh", address: {} };
    const cityAgent = { ...baseAgent, id: "agent-city", city: "bahadurgarh", currentLat: 28.69, currentLng: 76.93 };
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, restaurant: zeroCoordSameCity });
    prisma.user.findMany.mockResolvedValue([cityAgent]);
    prisma.order.update.mockResolvedValue({ ...baseOrder, pendingAgentId: cityAgent.id });
    prisma.user.update.mockResolvedValue(cityAgent);

    const io = makeIo();
    const selected = await assignDeliveryAgent("ord-1", io);

    expect(selected?.id).toBe("agent-city");
  });
});

describe("acceptOrderOffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the order atomically and emits order:assigned only on success", async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      agentId: "agent-1",
      agent: baseAgent,
    });
    prisma.order.update.mockResolvedValue({});

    const io = makeIo();
    const result = await acceptOrderOffer("ord-1", "agent-1", io);

    expect(result.ok).toBe(true);
    // The WHERE guard is what makes this atomic under a race.
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "ord-1", pendingAgentId: "agent-1" },
      data: { agentId: "agent-1", pendingAgentId: null, agentOfferedAt: null },
    });
    expect(io.to).toHaveBeenCalledWith("order-ord-1");
    expect(io.to).toHaveBeenCalledWith("shop-rest-1");
    expect(io._emit).toHaveBeenCalledWith("agent:assigned", expect.anything());
  });

  it("fails when the offer is no longer this rider's (already expired/claimed)", async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const io = makeIo();
    const result = await acceptOrderOffer("ord-1", "agent-1", io);

    expect(result.ok).toBe(false);
    expect(io._emit).not.toHaveBeenCalled();
  });
});

describe("rejectOrderOffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("frees the rider and re-offers to the next agent", async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue(baseAgent);
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.user.findMany.mockResolvedValue([]); // nobody else available
    prisma.$transaction.mockImplementation((ops) => Promise.all(ops));

    const io = makeIo();
    const result = await rejectOrderOffer("ord-1", "agent-1", io);

    expect(result.ok).toBe(true);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "ord-1", pendingAgentId: "agent-1" },
      data: { pendingAgentId: null, agentOfferedAt: null },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "agent-1" },
      data: { isAvailable: true },
    });
    // No other agents available -> re-offer attempt finds nobody.
    expect(result.reassigned).toBe(false);
  });

  it("fails when this rider no longer holds the offer", async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const io = makeIo();
    const result = await rejectOrderOffer("ord-1", "agent-1", io);

    expect(result.ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
