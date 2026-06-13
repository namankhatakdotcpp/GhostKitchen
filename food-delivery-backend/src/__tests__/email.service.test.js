/**
 * Email service tests
 * Covers: sendOrderPlacedEmail, sendOrderStatusEmail, sendMaintenanceEmail,
 *         sendRestaurantApprovedEmail
 *
 * RESEND_API_KEY must be set BEFORE the module import so the module-level
 * const captures it (it reads process.env at load time, not at call time).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-here-padding" },
}));

// Set the key BEFORE the module is imported so the module-level const captures it.
process.env.RESEND_API_KEY = "test-api-key";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { sendOrderPlacedEmail, sendOrderStatusEmail, sendMaintenanceEmail, sendRestaurantApprovedEmail } = await import("../services/email.service.js");

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── sendOrderPlacedEmail ──────────────────────────────────────────────────────
describe("sendOrderPlacedEmail", () => {
  it("calls fetch with Authorization header and item list", async () => {
    await sendOrderPlacedEmail({
      to: "a@a.com",
      name: "Alice",
      orderId: "ord-12345678",
      restaurantName: "Spice Garden",
      items: [{ name: "Biryani", quantity: 2, price: 25000 }],
      total: 53000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
        body: expect.stringContaining("Biryani"),
      })
    );
  });

  it("includes total in paise converted to rupees in body", async () => {
    await sendOrderPlacedEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-12345678",
      restaurantName: "Rest", items: [], total: 43000,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.html).toContain("430.00");
  });

  it("handles empty items list gracefully", async () => {
    await sendOrderPlacedEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-1",
      restaurantName: "Rest", items: [], total: 0,
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("logs warning when Resend API returns non-ok status", async () => {
    const { logger } = await import("../utils/logger.js");
    mockFetch.mockResolvedValue({ ok: false, status: 429, text: vi.fn().mockResolvedValue("rate limited") });

    await sendOrderPlacedEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-1",
      restaurantName: "Rest", items: [], total: 0,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs warning when fetch throws", async () => {
    const { logger } = await import("../utils/logger.js");
    mockFetch.mockRejectedValue(new Error("Network error"));

    await sendOrderPlacedEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-1",
      restaurantName: "Rest", items: [], total: 0,
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ── sendOrderStatusEmail ──────────────────────────────────────────────────────
describe("sendOrderStatusEmail", () => {
  it("calls fetch for CONFIRMED status", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-12345678",
      status: "CONFIRMED", restaurantName: "Spice Garden",
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("calls fetch for DELIVERED status", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-12345678",
      status: "DELIVERED", restaurantName: "Spice Garden",
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("calls fetch for CANCELLED status", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-12345678",
      status: "CANCELLED", restaurantName: "Spice Garden",
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("calls fetch for OUT_FOR_DELIVERY status", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-12345678",
      status: "OUT_FOR_DELIVERY", restaurantName: "Spice Garden",
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns early without calling fetch for unknown status", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "ord-1",
      status: "UNKNOWN_STATUS", restaurantName: "Rest",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("includes order ID in subject", async () => {
    await sendOrderStatusEmail({
      to: "a@a.com", name: "Alice", orderId: "abcdefgh-xxxx",
      status: "CONFIRMED", restaurantName: "Rest",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain("ABCDEFGH");
  });
});

// ── sendMaintenanceEmail ──────────────────────────────────────────────────────
describe("sendMaintenanceEmail", () => {
  it("calls fetch with scheduledAt and endsAt", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();
    await sendMaintenanceEmail({
      to: "a@a.com", name: "Alice",
      reason: "DB upgrade",
      scheduledAt: future,
      endsAt: end,
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain("Maintenance");
  });

  it("works without optional scheduledAt and endsAt", async () => {
    await sendMaintenanceEmail({ to: "a@a.com", name: "Alice" });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("works without optional reason", async () => {
    await sendMaintenanceEmail({
      to: "a@a.com", name: "Alice",
      scheduledAt: new Date().toISOString(),
    });
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

// ── sendRestaurantApprovedEmail ───────────────────────────────────────────────
describe("sendRestaurantApprovedEmail", () => {
  it("calls fetch with correct subject", async () => {
    await sendRestaurantApprovedEmail({
      to: "owner@example.com", name: "Bob", restaurantName: "Bob's Burgers",
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain("live");
  });

  it("includes restaurant name in email body", async () => {
    await sendRestaurantApprovedEmail({
      to: "owner@example.com", name: "Bob", restaurantName: "Bob's Burgers",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.html).toContain("Bob's Burgers");
  });
});
