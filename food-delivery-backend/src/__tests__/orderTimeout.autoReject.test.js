/**
 * The auto-reject housekeeping job (jobs/orderTimeout.job.js#startAutoRejectJob)
 * is the real server-side enforcement for the shop board's 5-minute
 * countdown — previously that countdown only removed the card from the
 * restaurant's local cache and never touched the backend, leaving the order
 * stuck PLACED forever. This test runs the cron callback directly (node-cron
 * is mocked to invoke it immediately) and asserts it finds stale PLACED
 * orders and cancels them through the same cancelOrderById path the manual
 * Cancel/Reject button uses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let scheduledCallback;
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn((_pattern, cb) => { scheduledCallback = cb; }) },
}));

vi.mock("../utils/redisLock.js", () => ({
  acquireRedisLock: vi.fn(() => Promise.resolve(true)),
  releaseRedisLock: vi.fn(() => Promise.resolve()),
}));

vi.mock("../config/sentry.js", () => ({ captureException: vi.fn() }));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFindMany = vi.fn();
vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findMany: mockFindMany },
    payment: { updateMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
}));

const mockCancelOrderById = vi.fn();
vi.mock("../modules/orders/orders.service.js", () => ({
  cancelOrderById: mockCancelOrderById,
}));

const { startAutoRejectJob, autoRejectJobStatus } = await import("../jobs/orderTimeout.job.js");

beforeEach(() => {
  vi.clearAllMocks();
  scheduledCallback = undefined;
});

describe("startAutoRejectJob", () => {
  it("cancels every PLACED order past the 5-minute window via cancelOrderById", async () => {
    mockFindMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    mockCancelOrderById.mockResolvedValue({ id: "order-1", status: "CANCELLED" });

    startAutoRejectJob();
    expect(scheduledCallback).toBeTypeOf("function");
    await scheduledCallback();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PLACED" }) }),
    );
    expect(mockCancelOrderById).toHaveBeenCalledTimes(2);
    expect(mockCancelOrderById).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ reason: expect.stringContaining("Auto-rejected") }),
    );
    expect(mockCancelOrderById).toHaveBeenCalledWith("order-2", expect.anything());
    expect(autoRejectJobStatus.lastError).toBeNull();
  });

  it("does nothing when no orders are stale", async () => {
    mockFindMany.mockResolvedValue([]);

    startAutoRejectJob();
    await scheduledCallback();

    expect(mockCancelOrderById).not.toHaveBeenCalled();
  });

  it("a failure cancelling one order doesn't stop the others", async () => {
    mockFindMany.mockResolvedValue([{ id: "order-1" }, { id: "order-2" }]);
    mockCancelOrderById
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ id: "order-2", status: "CANCELLED" });

    startAutoRejectJob();
    await scheduledCallback();

    expect(mockCancelOrderById).toHaveBeenCalledTimes(2);
    expect(autoRejectJobStatus.lastError).toBeNull(); // per-order failures are caught, not surfaced as a job-level error
  });
});
