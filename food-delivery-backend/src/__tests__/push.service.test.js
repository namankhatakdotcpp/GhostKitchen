/**
 * push.service.js — subscription storage and send-trigger logic.
 * Actual push delivery (the browser receiving and rendering a notification)
 * can't be meaningfully unit tested here — it depends on a real push service
 * (FCM/Mozilla/etc.) and a real browser; that's a manual/E2E concern, not
 * something this suite claims to cover.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
vi.mock("../config/prisma.js", () => ({
  prisma: {
    pushSubscription: { upsert: mockUpsert, deleteMany: mockDeleteMany, findMany: mockFindMany },
  },
}));

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails: mockSetVapidDetails, sendNotification: mockSendNotification },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("push.service — without VAPID configured", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sendPushToUser no-ops (and never queries subscriptions) when VAPID keys are missing", async () => {
    vi.doMock("../config/env.js", () => ({ env: { VAPID_PUBLIC_KEY: null, VAPID_PRIVATE_KEY: null, VAPID_SUBJECT: "mailto:a@b.com" } }));
    const { sendPushToUser, isPushConfigured } = await import("../modules/push/push.service.js");

    expect(isPushConfigured()).toBe(false);
    await sendPushToUser("user-1", { title: "t", body: "b" });

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

describe("push.service — with VAPID configured", () => {
  let saveSubscription, removeSubscription, sendPushToUser, isPushConfigured;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../config/env.js", () => ({
      env: { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.com" },
    }));
    ({ saveSubscription, removeSubscription, sendPushToUser, isPushConfigured } = await import(
      "../modules/push/push.service.js"
    ));
  });

  it("reports configured and sets VAPID details once at module load", () => {
    expect(isPushConfigured()).toBe(true);
    expect(mockSetVapidDetails).toHaveBeenCalledWith("mailto:a@b.com", "pub", "priv");
  });

  it("rejects a subscription payload missing endpoint or keys", async () => {
    await expect(saveSubscription("user-1", { endpoint: "", keys: {} })).rejects.toThrow(/Invalid push subscription/);
  });

  it("upserts a valid subscription keyed by endpoint", async () => {
    mockUpsert.mockResolvedValue({ id: "sub-1" });
    await saveSubscription("user-1", { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: "https://push.example/abc" },
        create: expect.objectContaining({ userId: "user-1", p256dh: "p", auth: "a" }),
      }),
    );
  });

  it("does nothing when the user has no subscriptions", async () => {
    mockFindMany.mockResolvedValue([]);
    await sendPushToUser("user-1", { title: "t", body: "b" });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends to every device a user has subscribed on", async () => {
    mockFindMany.mockResolvedValue([
      { endpoint: "ep-1", p256dh: "p1", auth: "a1" },
      { endpoint: "ep-2", p256dh: "p2", auth: "a2" },
    ]);
    mockSendNotification.mockResolvedValue({});

    await sendPushToUser("user-1", { title: "Order delivered!", body: "Enjoy!" });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("prunes a subscription the push service reports as gone (410)", async () => {
    mockFindMany.mockResolvedValue([{ endpoint: "ep-dead", p256dh: "p", auth: "a" }]);
    mockSendNotification.mockRejectedValue({ statusCode: 410, message: "gone" });

    await sendPushToUser("user-1", { title: "t", body: "b" });

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { endpoint: "ep-dead" } });
  });

  it("does not prune on a transient/non-410/404 failure", async () => {
    mockFindMany.mockResolvedValue([{ endpoint: "ep-1", p256dh: "p", auth: "a" }]);
    mockSendNotification.mockRejectedValue({ statusCode: 500, message: "gateway error" });

    await sendPushToUser("user-1", { title: "t", body: "b" });

    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("a push failure never throws out of sendPushToUser", async () => {
    mockFindMany.mockResolvedValue([{ endpoint: "ep-1", p256dh: "p", auth: "a" }]);
    mockSendNotification.mockRejectedValue(new Error("network down"));

    await expect(sendPushToUser("user-1", { title: "t", body: "b" })).resolves.not.toThrow();
  });
});
