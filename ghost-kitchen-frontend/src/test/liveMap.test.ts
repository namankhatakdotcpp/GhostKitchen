import { describe, it, expect } from "vitest";
import { computeRiderStatus, riderColor, MAP_COLORS } from "@/lib/liveMap";

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
