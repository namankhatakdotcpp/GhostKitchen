/**
 * PlatformSettings — admin-configurable pricing settings. Covers:
 *   - validation (split percentages must sum to 100, fees non-negative)
 *   - singleton get/update (upsert-by-fixed-id pattern, same as SiteConfig)
 *   - settings snapshotting for order-pricing immutability
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
vi.mock("../config/prisma.js", () => ({
  prisma: {
    platformSettings: { upsert: mockUpsert },
  },
}));

const {
  getPlatformSettings,
  getPlatformSettingsCached,
  invalidatePlatformSettingsCache,
  updatePlatformSettings,
  snapshotSettings,
} = await import("../modules/pricing/platformSettings.service.js");

const ROW = {
  id: "singleton",
  deliveryBaseFee: 1000,
  deliveryPerKmFee: 200,
  platformFeeMode: "FLAT",
  platformFeeValue: 500,
  splitRestaurantPct: 20,
  splitRiderPct: 50,
  splitAdminPct: 30,
  updatedAt: new Date(),
};

beforeEach(() => {
  mockUpsert.mockReset();
  invalidatePlatformSettingsCache();
});

describe("getPlatformSettings", () => {
  it("upserts the singleton row", async () => {
    mockUpsert.mockResolvedValue(ROW);
    const result = await getPlatformSettings();
    expect(result).toBe(ROW);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
  });
});

describe("getPlatformSettingsCached", () => {
  it("hits the DB once and serves subsequent calls from the in-process cache", async () => {
    mockUpsert.mockResolvedValue(ROW);
    await getPlatformSettingsCached();
    await getPlatformSettingsCached();
    await getPlatformSettingsCached();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("re-hits the DB after invalidation", async () => {
    mockUpsert.mockResolvedValue(ROW);
    await getPlatformSettingsCached();
    invalidatePlatformSettingsCache();
    await getPlatformSettingsCached();
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});

describe("updatePlatformSettings — validation", () => {
  it("rejects a split that doesn't sum to 100", async () => {
    await expect(
      updatePlatformSettings({ splitRestaurantPct: 20, splitRiderPct: 50, splitAdminPct: 40 }) // sums to 110
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("accepts a split that sums to exactly 100", async () => {
    mockUpsert.mockResolvedValue({ ...ROW, splitRestaurantPct: 25, splitRiderPct: 45, splitAdminPct: 30 });
    await expect(
      updatePlatformSettings({ splitRestaurantPct: 25, splitRiderPct: 45, splitAdminPct: 30 })
    ).resolves.toBeDefined();
  });

  it("tolerates floating-point splits that sum to ~100 (e.g. 33.33/33.33/33.34)", async () => {
    mockUpsert.mockResolvedValue(ROW);
    await expect(
      updatePlatformSettings({ splitRestaurantPct: 33.33, splitRiderPct: 33.33, splitAdminPct: 33.34 })
    ).resolves.toBeDefined();
  });

  it("rejects a partial split update (only one of the three fields)", async () => {
    await expect(updatePlatformSettings({ splitRestaurantPct: 50 })).rejects.toMatchObject({ statusCode: 400 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a negative delivery base fee", async () => {
    await expect(updatePlatformSettings({ deliveryBaseFee: -100 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a negative per-km rate", async () => {
    await expect(updatePlatformSettings({ deliveryPerKmFee: -1 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an invalid platformFeeMode", async () => {
    await expect(updatePlatformSettings({ platformFeeMode: "WEIRD" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows updating unrelated fields (e.g. deliveryBaseFee alone) without touching the split", async () => {
    mockUpsert.mockResolvedValue({ ...ROW, deliveryBaseFee: 1500 });
    const result = await updatePlatformSettings({ deliveryBaseFee: 1500 });
    expect(result.deliveryBaseFee).toBe(1500);
  });

  it("invalidates the cache after a successful update", async () => {
    mockUpsert.mockResolvedValue(ROW);
    await getPlatformSettingsCached(); // warm the cache
    await updatePlatformSettings({ deliveryBaseFee: 2000 });
    await getPlatformSettingsCached();
    // 1 (warm) + 1 (inside updatePlatformSettings's upsert) + 1 (re-warm after invalidation)
    expect(mockUpsert).toHaveBeenCalledTimes(3);
  });
});

describe("snapshotSettings", () => {
  it("picks only the pricing-relevant fields, dropping id/updatedAt", () => {
    const snap = snapshotSettings(ROW);
    expect(snap).toEqual({
      deliveryBaseFee: 1000,
      deliveryPerKmFee: 200,
      platformFeeMode: "FLAT",
      platformFeeValue: 500,
      splitRestaurantPct: 20,
      splitRiderPct: 50,
      splitAdminPct: 30,
    });
    expect(snap.id).toBeUndefined();
    expect(snap.updatedAt).toBeUndefined();
  });
});
