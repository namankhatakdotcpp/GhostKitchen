/**
 * Review controller tests — rating bounds, duplicate-submission prevention,
 * and the happy path (create + retrieve), the three cases the customer-portal
 * "post-delivery review" feature depends on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    review: {
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    restaurant: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { prisma } = await import("../config/prisma.js");
const reviewController = await import("../modules/review/review.controller.js");

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const baseOrder = {
  id: "order-1",
  customerId: "user-1",
  restaurantId: "rest-1",
  status: "DELIVERED",
};

beforeEach(() => vi.clearAllMocks());

describe("createReview", () => {
  it("rejects a rating below 1", async () => {
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 0 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("between 1 and 5") }),
    );
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects a rating above 5", async () => {
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 6 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects a non-integer rating", async () => {
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 3.5 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects submitting a second review for the same order", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.review.findUnique.mockResolvedValue({ id: "review-1", orderId: "order-1" });
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 5 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("already reviewed") }),
    );
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects reviewing an order that isn't delivered yet", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: "OUT_FOR_DELIVERY" });
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 5 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects a review for an order that doesn't belong to the requesting customer", async () => {
    prisma.order.findUnique.mockResolvedValue({ ...baseOrder, customerId: "someone-else" });
    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 5 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("succeeds with a valid rating and comment, and recalculates the restaurant's rating", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.review.findUnique.mockResolvedValue(null);
    const createdReview = { id: "review-1", orderId: "order-1", rating: 5, comment: "Great!" };
    prisma.review.create.mockResolvedValue(createdReview);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.6 }, _count: { rating: 3 } });
    prisma.restaurant.update.mockResolvedValue({});

    const res = mockRes();
    const req = {
      body: { orderId: "order-1", rating: 5, comment: "Great!" },
      user: { userId: "user-1" },
    };

    await reviewController.createReview(req, res, vi.fn());

    expect(prisma.review.create).toHaveBeenCalledWith({
      data: { orderId: "order-1", customerId: "user-1", restaurantId: "rest-1", rating: 5, comment: "Great!" },
    });
    expect(prisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "rest-1" },
      data: { rating: 4.6, reviewCount: 3 },
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, review: createdReview });
  });

  it("accepts a review with no comment (optional field)", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue({ id: "review-1", orderId: "order-1", rating: 4, comment: null });
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4 }, _count: { rating: 1 } });
    prisma.restaurant.update.mockResolvedValue({});

    const res = mockRes();
    const req = { body: { orderId: "order-1", rating: 4 }, user: { userId: "user-1" } };

    await reviewController.createReview(req, res, vi.fn());

    expect(prisma.review.create).toHaveBeenCalledWith({
      data: { orderId: "order-1", customerId: "user-1", restaurantId: "rest-1", rating: 4, comment: null },
    });
  });
});

describe("getReviewByOrderId", () => {
  it("retrieves a review that was just created", async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      orderId: "order-1",
      rating: 5,
      comment: "Great!",
      createdAt: new Date("2026-01-01"),
      order: { customer: { name: "Alice Smith" } },
    });

    const res = mockRes();
    const req = { params: { orderId: "order-1" } };

    await reviewController.getReviewByOrderId(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: "review-1", rating: 5, comment: "Great!", userName: "Alice" }),
    );
  });

  it("404s when no review exists for the order", async () => {
    prisma.review.findUnique.mockResolvedValue(null);
    const res = mockRes();
    const req = { params: { orderId: "order-404" } };

    await reviewController.getReviewByOrderId(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("canReview", () => {
  it("returns canReview: true for a delivered, unreviewed order owned by the requester", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.review.findUnique.mockResolvedValue(null);
    const res = mockRes();
    const req = { params: { orderId: "order-1" }, user: { userId: "user-1" } };

    await reviewController.canReview(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ canReview: true });
  });

  it("returns canReview: false once a review already exists", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.review.findUnique.mockResolvedValue({ id: "review-1" });
    const res = mockRes();
    const req = { params: { orderId: "order-1" }, user: { userId: "user-1" } };

    await reviewController.canReview(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({ canReview: false, reason: "Already reviewed" });
  });
});
