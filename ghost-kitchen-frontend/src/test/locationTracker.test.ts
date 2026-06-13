import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn().mockResolvedValue({ data: {} }) } }));

const { api } = await import("@/lib/api");
const { riderLocationTracker, startTracking, stopTracking } = await import("@/lib/locationTracker");

let successCb: ((pos: any) => void) | null = null;
let errorCb: ((err: any) => void) | null = null;
const watchPosition = vi.fn((s: any, e: any) => {
  successCb = s;
  errorCb = e;
  return 99;
});
const clearWatch = vi.fn();

const fix = (lat: number, lng: number, heading: number | null = null, speed: number | null = null) => ({
  coords: { latitude: lat, longitude: lng, heading, speed },
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });

beforeEach(() => {
  (navigator as any).geolocation = { watchPosition, clearWatch };
  setOnline(true);
  riderLocationTracker.stopTracking();
  vi.mocked(api.post).mockClear().mockResolvedValue({ data: {} });
  watchPosition.mockClear();
  clearWatch.mockClear();
  successCb = null;
  errorCb = null;
});

afterEach(() => {
  riderLocationTracker.stopTracking();
  vi.useRealTimers();
});

describe("locationTracker imperative API", () => {
  it("startTracking() begins a geolocation watch and reports 'tracking'", () => {
    startTracking();
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(riderLocationTracker.getStatus()).toBe("tracking");
  });

  it("startTracking() is idempotent (a single watch)", () => {
    startTracking();
    startTracking();
    expect(watchPosition).toHaveBeenCalledTimes(1);
  });

  it("stopTracking() clears the watch and returns to 'idle'", () => {
    startTracking();
    stopTracking();
    expect(clearWatch).toHaveBeenCalledWith(99);
    expect(riderLocationTracker.getStatus()).toBe("idle");
  });

  it("reports 'unavailable' when geolocation is missing", () => {
    (navigator as any).geolocation = undefined;
    startTracking();
    expect(riderLocationTracker.getStatus()).toBe("unavailable");
  });

  it("notifies subscribers of status changes", () => {
    const seen: string[] = [];
    const unsub = riderLocationTracker.subscribe((s) => seen.push(s));
    startTracking();
    stopTracking();
    unsub();
    expect(seen).toContain("tracking");
    expect(seen).toContain("idle");
  });

  it("posts the first fix with km/h speed and omits absent fields", async () => {
    startTracking();
    successCb!(fix(28.7, 77.1, 90, 10));
    await flush();
    expect(api.post).toHaveBeenCalledWith("/delivery/location", {
      latitude: 28.7,
      longitude: 77.1,
      heading: 90,
      speed: 36,
    });
  });
});

describe("locationTracker offline/online", () => {
  it("pauses uploads when the browser goes offline", async () => {
    startTracking();
    successCb!(fix(28.7, 77.1));
    await flush();
    expect(api.post).toHaveBeenCalledTimes(1);

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(riderLocationTracker.getStatus()).toBe("paused");

    // A fix arriving while offline must not be uploaded.
    successCb!(fix(28.71, 77.11));
    await flush();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("auto-resumes uploads when the browser comes back online", async () => {
    startTracking();
    successCb!(fix(28.7, 77.1));
    await flush();
    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    successCb!(fix(28.72, 77.12)); // buffered latest fix
    await flush();
    expect(api.post).toHaveBeenCalledTimes(1);

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(riderLocationTracker.getStatus()).toBe("tracking");
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
