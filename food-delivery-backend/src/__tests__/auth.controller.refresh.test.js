/**
 * auth.controller's refresh handler — cookie vs. body-token precedence.
 *
 * Regression: refresh tokens rotate on every use (auth.service.js deletes
 * the old DB row and issues a new one), so the refresh_token cookie and the
 * client's localStorage-tracked token can fall out of sync after a single
 * hiccup (a Set-Cookie that didn't get applied, a request that raced an
 * earlier rotation, etc). The old `cookies?.refresh_token || body?.refreshToken`
 * short-circuit treated the cookie as the only candidate — once it went
 * stale, it permanently shadowed a perfectly valid, freshly-rotated token
 * sitting in the request body, and every future refresh failed with
 * "revoked or expired" even though the client had a live token. Reproduced
 * with curl against a real server: stale cookie + fresh body token -> 401
 * before the fix, 200 after.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/audit.js", () => ({ auditLog: vi.fn() }));

const mockRefreshAccessToken = vi.fn();
vi.mock("../modules/auth/auth.service.js", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  getCurrentUser: vi.fn(),
  refreshAccessToken: mockRefreshAccessToken,
  logoutUser: vi.fn(),
  logoutAllDevices: vi.fn(),
}));

const { refresh } = await import("../modules/auth/auth.controller.js");

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

const successResult = {
  data: {
    user: { id: "u-1" },
    tokens: { accessToken: "new-access", refreshToken: "new-refresh" },
  },
};

beforeEach(() => {
  mockRefreshAccessToken.mockReset();
});

describe("refresh controller", () => {
  it("uses the cookie token when it's valid (no body token needed)", async () => {
    mockRefreshAccessToken.mockResolvedValueOnce(successResult);
    const req = { cookies: { refresh_token: "cookie-tok" }, body: {} };
    const res = mockRes();
    const next = vi.fn();

    await refresh(req, res, next);

    expect(mockRefreshAccessToken).toHaveBeenCalledWith("cookie-tok");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("regression: falls through to the body token when the cookie is stale/rotated-out", async () => {
    mockRefreshAccessToken
      .mockRejectedValueOnce(Object.assign(new Error("Refresh token revoked or expired"), { statusCode: 401 }))
      .mockResolvedValueOnce(successResult);

    const req = { cookies: { refresh_token: "stale-cookie-tok" }, body: { refreshToken: "fresh-body-tok" } };
    const res = mockRes();
    const next = vi.fn();

    await refresh(req, res, next);

    expect(mockRefreshAccessToken).toHaveBeenNthCalledWith(1, "stale-cookie-tok");
    expect(mockRefreshAccessToken).toHaveBeenNthCalledWith(2, "fresh-body-tok");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ accessToken: "new-access" }) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("401s when both the cookie and body tokens are invalid/revoked", async () => {
    const revokedError = Object.assign(new Error("Refresh token revoked or expired"), { statusCode: 401 });
    mockRefreshAccessToken.mockRejectedValue(revokedError);

    const req = { cookies: { refresh_token: "stale-cookie-tok" }, body: { refreshToken: "also-stale-tok" } };
    const res = mockRes();
    const next = vi.fn();

    await refresh(req, res, next);

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(revokedError);
  });

  it("401s immediately when neither cookie nor body has a token", async () => {
    const req = { cookies: {}, body: {} };
    const res = mockRes();
    const next = vi.fn();

    await refresh(req, res, next);

    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
