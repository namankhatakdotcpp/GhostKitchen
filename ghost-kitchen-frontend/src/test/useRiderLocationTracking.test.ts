import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn().mockResolvedValue({ data: {} }) } }));

const { api } = await import("@/lib/api");
const { useRiderLocationTracking } = await import("@/hooks/useRiderLocationTracking");

// Captured geolocation callbacks so tests can drive position updates.
let successCb: ((pos: any) => void) | null = null;
let errorCb: ((err: any) => void) | null = null;
const watchPosition = vi.fn((s: any, e: any) => {
  successCb = s;
  errorCb = e;
  return 7;
});
const clearWatch = vi.fn();

const fix = (lat: number, lng: number, heading: number | null = null, speed: number | null = null) => ({
  coords: { latitude: lat, longitude: lng, heading, speed },
});

beforeEach(() => {
  vi.mocked(api.post).mockClear().mockResolvedValue({ data: {} });
  watchPosition.mockClear();
  clearWatch.mockClear();
  successCb = null;
  errorCb = null;
  (navigator as any).geolocation = { watchPosition, clearWatch };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRiderLocationTracking", () => {
  it("does nothing and stays idle when disabled", () => {
    const { result } = renderHook(() => useRiderLocationTracking(false));
    expect(result.current).toBe("idle");
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("reports 'unavailable' when geolocation is missing", () => {
    (navigator as any).geolocation = undefined;
    const { result } = renderHook(() => useRiderLocationTracking(true));
    expect(result.current).toBe("unavailable");
  });

  it("starts watching and posts the first fix when enabled", async () => {
    renderHook(() => useRiderLocationTracking(true));
    expect(watchPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      successCb!(fix(28.7, 77.1, 90, 10));
    });

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith("/delivery/location", {
      latitude: 28.7,
      longitude: 77.1,
      heading: 90,
      speed: 36, // 10 m/s -> 36 km/h
    });
  });

  it("omits heading/speed when the device does not provide them", async () => {
    renderHook(() => useRiderLocationTracking(true));
    await act(async () => successCb!(fix(28.7, 77.1, null, null)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith("/delivery/location", { latitude: 28.7, longitude: 77.1 });
  });

  it("does not re-send when the rider barely moved within 10s (anti-spam)", async () => {
    renderHook(() => useRiderLocationTracking(true));
    await act(async () => successCb!(fix(28.7, 77.1)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    // ~11m away, well under the 20m threshold and within 10s.
    await act(async () => successCb!(fix(28.7001, 77.1)));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("re-sends immediately when the rider moves at least 20m", async () => {
    renderHook(() => useRiderLocationTracking(true));
    await act(async () => successCb!(fix(28.7, 77.1)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    // ~33m away — above the 20m threshold.
    await act(async () => successCb!(fix(28.7003, 77.1)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  });

  it("sends a heartbeat after the 10s interval even when stationary", async () => {
    vi.useFakeTimers();
    renderHook(() => useRiderLocationTracking(true));
    await act(async () => {
      successCb!(fix(28.7, 77.1));
    });
    expect(api.post).toHaveBeenCalledTimes(1);

    // Advance past the 10s visible heartbeat — same position, but time gate passes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("reports 'denied' on permission denial and sends nothing", async () => {
    const { result } = renderHook(() => useRiderLocationTracking(true));
    await act(async () => errorCb!({ code: 1, PERMISSION_DENIED: 1 }));
    expect(result.current).toBe("denied");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("reports 'error' on GPS position-unavailable", async () => {
    const { result } = renderHook(() => useRiderLocationTracking(true));
    await act(async () => errorCb!({ code: 2, PERMISSION_DENIED: 1 }));
    expect(result.current).toBe("error");
  });

  it("survives a network failure and retries on the next qualifying fix", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("network down"));
    renderHook(() => useRiderLocationTracking(true));

    await act(async () => successCb!(fix(28.7, 77.1)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1)); // failed attempt

    // Next big move retries (lastSent was not advanced after the failure).
    await act(async () => successCb!(fix(28.7005, 77.1)));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  });

  it("clears the watch and timer on unmount", async () => {
    const { unmount } = renderHook(() => useRiderLocationTracking(true));
    expect(watchPosition).toHaveBeenCalledTimes(1);
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("stops tracking when toggled from enabled to disabled", async () => {
    const { rerender } = renderHook(({ on }) => useRiderLocationTracking(on), {
      initialProps: { on: true },
    });
    expect(watchPosition).toHaveBeenCalledTimes(1);
    rerender({ on: false });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
});
