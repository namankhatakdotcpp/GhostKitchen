import { describe, it, expect } from "vitest";
import { computeRiderStatus, riderColor, MAP_COLORS, metersBetween } from "@/lib/liveMap";

describe("computeRiderStatus", () => {
  const now = new Date("2026-06-13T12:00:00.000Z").getTime();

  it("returns OFFLINE when never seen", () => {
    expect(computeRiderStatus(null, now)).toBe("OFFLINE");
    expect(computeRiderStatus(undefined, now)).toBe("OFFLINE");
  });

  it("returns ONLINE within 60 seconds", () => {
    expect(computeRiderStatus(new Date(now - 30_000).toISOString(), now)).toBe("ONLINE");
  });

  it("returns IDLE between 60s and 5 min", () => {
    expect(computeRiderStatus(new Date(now - 90_000).toISOString(), now)).toBe("IDLE");
  });

  it("returns OFFLINE after 5 min", () => {
    expect(computeRiderStatus(new Date(now - 6 * 60_000).toISOString(), now)).toBe("OFFLINE");
  });

  it("treats future timestamps as ONLINE", () => {
    expect(computeRiderStatus(new Date(now + 5_000).toISOString(), now)).toBe("ONLINE");
  });

  it("returns OFFLINE for an unparseable value", () => {
    expect(computeRiderStatus("nonsense", now)).toBe("OFFLINE");
  });
});

describe("riderColor", () => {
  it("maps each status to its marker color", () => {
    expect(riderColor("ONLINE")).toBe(MAP_COLORS.riderOnline);
    expect(riderColor("IDLE")).toBe(MAP_COLORS.riderIdle);
    expect(riderColor("OFFLINE")).toBe(MAP_COLORS.riderOffline);
  });
});

describe("metersBetween", () => {
  it("returns 0 for identical points", () => {
    expect(metersBetween(28.6, 77.2, 28.6, 77.2)).toBe(0);
  });

  it("computes ~111m for 0.001° of latitude", () => {
    const d = metersBetween(28.6, 77.2, 28.601, 77.2);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(116);
  });

  it("treats a small move (<20m) as below the send threshold", () => {
    // ~0.0001° latitude ≈ 11m
    expect(metersBetween(28.6, 77.2, 28.6001, 77.2)).toBeLessThan(20);
  });

  it("treats a larger move (>20m) as above the send threshold", () => {
    // ~0.0003° latitude ≈ 33m
    expect(metersBetween(28.6, 77.2, 28.6003, 77.2)).toBeGreaterThan(20);
  });
});
