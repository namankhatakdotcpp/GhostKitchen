import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({ env: { VAPID_PUBLIC_KEY: "pub-key" } }));

const mockSaveSubscription = vi.fn();
const mockRemoveSubscription = vi.fn();
const mockIsPushConfigured = vi.fn();
vi.mock("../modules/push/push.service.js", () => ({
  saveSubscription: mockSaveSubscription,
  removeSubscription: mockRemoveSubscription,
  isPushConfigured: mockIsPushConfigured,
}));

const { getVapidPublicKey, subscribe, unsubscribe } = await import("../modules/push/push.controller.js");

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("getVapidPublicKey", () => {
  it("503s when push is not configured", () => {
    mockIsPushConfigured.mockReturnValue(false);
    const res = mockRes();
    getVapidPublicKey({}, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("returns the public key when configured", () => {
    mockIsPushConfigured.mockReturnValue(true);
    const res = mockRes();
    getVapidPublicKey({}, res);
    expect(res.json).toHaveBeenCalledWith({ publicKey: "pub-key" });
  });
});

describe("subscribe", () => {
  it("stores a valid subscription for the authenticated user", async () => {
    mockSaveSubscription.mockResolvedValue({});
    const req = { user: { userId: "u-1" }, body: { subscription: { endpoint: "ep", keys: { p256dh: "p", auth: "a" } } } };
    const res = mockRes();

    await subscribe(req, res);

    expect(mockSaveSubscription).toHaveBeenCalledWith("u-1", { endpoint: "ep", keys: { p256dh: "p", auth: "a" } });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("400s on an invalid subscription payload", async () => {
    mockSaveSubscription.mockRejectedValue(new Error("Invalid push subscription payload"));
    const req = { user: { userId: "u-1" }, body: { subscription: {} } };
    const res = mockRes();

    await subscribe(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("unsubscribe", () => {
  it("requires an endpoint", async () => {
    const req = { body: {} };
    const res = mockRes();
    await unsubscribe(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRemoveSubscription).not.toHaveBeenCalled();
  });

  it("removes the subscription by endpoint", async () => {
    mockRemoveSubscription.mockResolvedValue();
    const req = { body: { endpoint: "ep-1" } };
    const res = mockRes();
    await unsubscribe(req, res);
    expect(mockRemoveSubscription).toHaveBeenCalledWith("ep-1");
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
