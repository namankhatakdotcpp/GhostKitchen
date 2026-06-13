/**
 * Middleware extended tests
 * Covers: globalErrorHandler, asyncHandler, sanitizeBody, requestTracingMiddleware
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/sentry.js", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(),
}));
vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-here-padded", NODE_ENV: "test" },
}));

const { asyncHandler, globalErrorHandler } = await import("../middlewares/errorHandler.js");
const { sanitizeBody } = await import("../middlewares/sanitize.middleware.js");
const { requestTracingMiddleware } = await import("../middlewares/requestTracing.middleware.js");
const { captureException } = await import("../config/sentry.js");

// ── helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.on = vi.fn();
  return res;
}

function mockReq(overrides = {}) {
  return { id: "req-1", path: "/test", user: { userId: "u-1" }, ip: "127.0.0.1", ...overrides };
}

// ── asyncHandler ──────────────────────────────────────────────────────────────
describe("asyncHandler", () => {
  it("calls the wrapped fn", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(fn);
    const next = vi.fn();
    await wrapped({}, {}, next);
    expect(fn).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with error when fn rejects", async () => {
    const err = new Error("boom");
    const fn = vi.fn().mockRejectedValue(err);
    const wrapped = asyncHandler(fn);
    const next = vi.fn();
    await wrapped({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── globalErrorHandler ────────────────────────────────────────────────────────
describe("globalErrorHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns statusCode and message for operational errors", () => {
    const { AppError } = require("../utils/AppError.js");
    const err = new AppError("Not found", 404, "NOT_FOUND");
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Not found", code: "NOT_FOUND" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("returns 409 for P2002 Prisma errors", () => {
    const err = new Error("Unique constraint");
    err.code = "P2002";
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Already exists", code: "DUPLICATE" });
  });

  it("returns 404 for P2025 Prisma errors", () => {
    const err = new Error("Record not found");
    err.code = "P2025";
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Not found", code: "NOT_FOUND" });
  });

  it("returns 409 for P2003 Prisma foreign key errors", () => {
    const err = new Error("FK constraint");
    err.code = "P2003";
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CONSTRAINT" })
    );
  });

  it("returns 500 for unknown errors", () => {
    const err = new Error("unexpected kaboom");
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(captureException).toHaveBeenCalled();
  });

  it("calls Sentry captureException for non-operational errors", () => {
    const err = new Error("non-operational");
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(captureException).toHaveBeenCalledWith(err, expect.any(Object));
  });

  it("does NOT call Sentry for operational errors", () => {
    const { AppError } = require("../utils/AppError.js");
    const err = new AppError("Bad request", 400);
    const res = mockRes();
    globalErrorHandler(err, mockReq(), res, vi.fn());
    expect(captureException).not.toHaveBeenCalled();
  });

  it("handles missing req.user gracefully", () => {
    const err = new Error("no user");
    const res = mockRes();
    globalErrorHandler(err, { id: "x", path: "/p" }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── sanitizeBody ──────────────────────────────────────────────────────────────
describe("sanitizeBody", () => {
  it("sanitizes XSS in request body strings", () => {
    const req = { body: { name: '<script>alert("xss")</script>' } };
    const next = vi.fn();
    sanitizeBody(req, {}, next);
    expect(req.body.name).not.toContain("<script>");
    expect(next).toHaveBeenCalledOnce();
  });

  it("leaves non-string values intact", () => {
    const req = { body: { count: 42, flag: true } };
    const next = vi.fn();
    sanitizeBody(req, {}, next);
    expect(req.body.count).toBe(42);
    expect(req.body.flag).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next when body is empty", () => {
    const req = { body: {} };
    const next = vi.fn();
    sanitizeBody(req, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("sanitizes nested object values", () => {
    const req = { body: { user: { bio: "<b>bad</b>" } } };
    const next = vi.fn();
    sanitizeBody(req, {}, next);
    expect(req.body.user.bio).toBe("bad");
  });

  it("handles null body gracefully", () => {
    const req = { body: null };
    const next = vi.fn();
    sanitizeBody(req, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── requestTracingMiddleware ───────────────────────────────────────────────────
describe("requestTracingMiddleware", () => {
  it("assigns a UUID to req.id", () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    requestTracingMiddleware(req, res, next);
    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe("string");
  });

  it("calls next()", () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    requestTracingMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("assigns startTime to request", () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();
    requestTracingMiddleware(req, res, next);
    expect(req.startTime).toBeDefined();
    expect(typeof req.startTime).toBe("number");
  });
});
