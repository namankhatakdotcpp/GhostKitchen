/**
 * auth.middleware tests — cookie vs. Authorization-header precedence.
 *
 * Regression: a stale/invalid access_token cookie used to permanently
 * shadow a valid Authorization header — the middleware took `token =
 * cookieToken` whenever a cookie was present at all, and never even looked
 * at the header once that cookie failed verification. That meant a request
 * carrying a perfectly valid, freshly-issued Bearer token still 401'd with
 * "Invalid token" if the browser also held any old/garbage access_token
 * cookie — indistinguishable from a real auth failure, even right after a
 * fresh login.
 */
import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-at-least-32-chars-here", JWT_REFRESH_SECRET: "test-refresh-32-chars-here-padded" },
}));

const { authenticate, optionalAuthenticate } = await import("../middlewares/auth.middleware.js");

const SECRET = "test-secret-at-least-32-chars-here";

function signValid(payload = {}) {
  return jwt.sign({ userId: "u-1", roles: ["CUSTOMER"], activeRole: "CUSTOMER", ...payload }, SECRET, {
    expiresIn: "15m",
    algorithm: "HS256",
  });
}

function signExpired(payload = {}) {
  return jwt.sign({ userId: "u-1", roles: ["CUSTOMER"], activeRole: "CUSTOMER", ...payload }, SECRET, {
    expiresIn: "-1s",
    algorithm: "HS256",
  });
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authenticate", () => {
  it("authenticates via a valid Authorization header when no cookie is present", () => {
    const token = signValid();
    const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: "u-1", activeRole: "CUSTOMER" });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("authenticates via a valid cookie when no header is present", () => {
    const token = signValid();
    const req = { cookies: { access_token: token }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: "u-1" });
  });

  it("regression: a garbage/invalid cookie no longer shadows a valid Authorization header", () => {
    const validHeaderToken = signValid();
    const req = {
      cookies: { access_token: "garbage.invalid.token" },
      headers: { authorization: `Bearer ${validHeaderToken}` },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: "u-1" });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("regression: an expired cookie no longer shadows a valid Authorization header", () => {
    const expiredCookieToken = signExpired();
    const validHeaderToken = signValid();
    const req = {
      cookies: { access_token: expiredCookieToken },
      headers: { authorization: `Bearer ${validHeaderToken}` },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: "u-1" });
  });

  it("401s with no code when both cookie and header are invalid", () => {
    const req = {
      cookies: { access_token: "garbage" },
      headers: { authorization: "Bearer also-garbage" },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
  });

  it("401s with TOKEN_EXPIRED when both candidates are expired (no valid fallback)", () => {
    const req = {
      cookies: { access_token: signExpired() },
      headers: { authorization: `Bearer ${signExpired()}` },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Token expired", code: "TOKEN_EXPIRED" });
  });

  it("401s with 'No token provided' when neither cookie nor header is present", () => {
    const req = { cookies: {}, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "No token provided" });
  });
});

describe("optionalAuthenticate", () => {
  it("sets req.user from a valid header even when the cookie is garbage", () => {
    const validHeaderToken = signValid();
    const req = {
      cookies: { access_token: "garbage" },
      headers: { authorization: `Bearer ${validHeaderToken}` },
    };
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: "u-1" });
  });

  it("continues without req.user when neither candidate is valid", () => {
    const req = { cookies: { access_token: "garbage" }, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });

  it("continues without req.user when no token is present at all", () => {
    const req = { cookies: {}, headers: {} };
    const res = mockRes();
    const next = vi.fn();

    optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });
});
