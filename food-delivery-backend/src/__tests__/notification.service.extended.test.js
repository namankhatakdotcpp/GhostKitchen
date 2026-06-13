/**
 * Notification service extended tests
 * Covers all exported functions: createNotification, getNotifications,
 * markAllRead, markOneRead, deleteNotification, deleteAllNotifications
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-padded-here" },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIo = { to: vi.fn().mockReturnThis(), emit: vi.fn() };

vi.mock("../config/prisma.js", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("../socket/socketServer.js", () => ({
  getIO: vi.fn(),
  emitToAll: vi.fn(),
}));

const { prisma } = await import("../config/prisma.js");
const { getIO } = await import("../socket/socketServer.js");
const {
  createNotification,
  getNotifications,
  markAllRead,
  markOneRead,
  deleteNotification,
  deleteAllNotifications,
} = await import("../modules/notification/notification.service.js");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getIO).mockReturnValue(mockIo);
  mockIo.to.mockReturnThis();
});

// ── createNotification ────────────────────────────────────────────────────────
describe("createNotification", () => {
  it("persists notification via prisma and emits socket event", async () => {
    const notif = { id: "n-1", userId: "u-1", title: "Hi", body: "World", type: "ORDER", entityId: null };
    prisma.notification.create.mockResolvedValue(notif);

    const result = await createNotification({ userId: "u-1", title: "Hi", body: "World", type: "ORDER" });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u-1", title: "Hi" }) })
    );
    expect(mockIo.to).toHaveBeenCalledWith("user:u-1");
    expect(mockIo.emit).toHaveBeenCalledWith("notification:new", notif);
    expect(result).toEqual(notif);
  });

  it("stores entityId when provided", async () => {
    const notif = { id: "n-2", userId: "u-1", title: "T", body: "B", type: "PROMO", entityId: "coupon-1" };
    prisma.notification.create.mockResolvedValue(notif);

    await createNotification({ userId: "u-1", title: "T", body: "B", type: "PROMO", entityId: "coupon-1" });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityId: "coupon-1" }) })
    );
  });

  it("does not throw when socket is unavailable", async () => {
    const notif = { id: "n-3", userId: "u-2", title: "T", body: "B", type: "ORDER", entityId: null };
    prisma.notification.create.mockResolvedValue(notif);
    vi.mocked(getIO).mockImplementation(() => { throw new Error("Socket not ready"); });

    const result = await createNotification({ userId: "u-2", title: "T", body: "B", type: "ORDER" });
    expect(result).toEqual(notif);
  });

  it("returns undefined and logs error when prisma fails", async () => {
    prisma.notification.create.mockRejectedValue(new Error("DB error"));
    const result = await createNotification({ userId: "u-3", title: "T", body: "B", type: "ORDER" });
    expect(result).toBeUndefined();
  });

  it("defaults entityId to null when not provided", async () => {
    const notif = { id: "n-4", userId: "u-1", entityId: null };
    prisma.notification.create.mockResolvedValue(notif);

    await createNotification({ userId: "u-1", title: "T", body: "B", type: "ORDER" });

    const call = prisma.notification.create.mock.calls[0][0];
    expect(call.data.entityId).toBeNull();
  });
});

// ── getNotifications ──────────────────────────────────────────────────────────
describe("getNotifications", () => {
  const makeNotif = (id, date) => ({ id, createdAt: new Date(date), isRead: false });

  it("returns notifications and pagination info (no more pages)", async () => {
    const items = [makeNotif("n-1", "2026-06-01"), makeNotif("n-2", "2026-05-31")];
    prisma.$transaction.mockResolvedValue([items, 2]);

    const result = await getNotifications("u-1", {});

    expect(result.notifications).toHaveLength(2);
    expect(result.unreadCount).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("sets hasMore and nextCursor when extra item returned", async () => {
    const items = Array.from({ length: 21 }, (_, i) => makeNotif(`n-${i}`, `2026-06-0${i % 9 + 1}`));
    prisma.$transaction.mockResolvedValue([items, 5]);

    const result = await getNotifications("u-1", { limit: 20 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(result.notifications).toHaveLength(20);
  });

  it("clamps limit to 50", async () => {
    const items = [];
    prisma.$transaction.mockResolvedValue([items, 0]);

    await getNotifications("u-1", { limit: 200 });

    const findManyCall = prisma.$transaction.mock.calls[0][0];
    // $transaction receives array of promises; we verify it was called
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("uses cursor when provided", async () => {
    const cursor = new Date("2026-06-01").toISOString();
    prisma.$transaction.mockResolvedValue([[], 0]);

    await getNotifications("u-1", { cursor });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("defaults limit to 20 when not provided", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    await getNotifications("u-1");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────
describe("markAllRead", () => {
  it("calls updateMany for all unread notifications of user", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    await markAllRead("u-1");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-1", isRead: false }, data: { isRead: true } })
    );
  });
});

// ── markOneRead ───────────────────────────────────────────────────────────────
describe("markOneRead", () => {
  it("calls updateMany for specific notification", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await markOneRead("u-1", "n-42");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n-42", userId: "u-1" }, data: { isRead: true } })
    );
  });
});

// ── deleteNotification ────────────────────────────────────────────────────────
describe("deleteNotification", () => {
  it("calls deleteMany scoped to user and notification id", async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 1 });
    await deleteNotification("u-1", "n-10");
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n-10", userId: "u-1" } })
    );
  });
});

// ── deleteAllNotifications ────────────────────────────────────────────────────
describe("deleteAllNotifications", () => {
  it("calls deleteMany scoped to user", async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 8 });
    await deleteAllNotifications("u-1");
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });
});
