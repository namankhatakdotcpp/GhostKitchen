/**
 * Auth service extended tests
 * Covers: registerUser, loginUser, refreshAccessToken, getCurrentUser,
 *         logoutUser, logoutAllDevices
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars",
  },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockHashToken = vi.fn((t) => `hash:${t}`);
const mockVerifyRefresh = vi.fn();
const mockGenPair = vi.fn(() => ({ accessToken: "acc.tok.en", refreshToken: "ref.tok.en" }));
const mockBuildPayload = vi.fn((u) => ({ userId: u.id, roles: u.roles }));

vi.mock("../utils/jwt.js", () => ({
  generateTokenPair: mockGenPair,
  generateAccessToken: vi.fn(() => "new.access.tok"),
  verifyRefreshToken: mockVerifyRefresh,
  buildTokenPayload: mockBuildPayload,
  hashToken: mockHashToken,
}));
vi.mock("../utils/password.js", () => ({
  hashPassword: vi.fn(async (p) => `hashed:${p}`),
  comparePassword: vi.fn(async () => true),
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    restaurant: { findFirst: vi.fn() },
  },
}));

const { prisma } = await import("../config/prisma.js");
const { comparePassword } = await import("../utils/password.js");
const { registerUser, loginUser, refreshAccessToken, getCurrentUser, logoutUser, logoutAllDevices } = await import("../modules/auth/auth.service.js");

const baseUser = {
  id: "u-1",
  name: "Alice",
  email: "alice@example.com",
  roles: ["CUSTOMER"],
  activeRole: "CUSTOMER",
  secondRole: null,
  restaurantId: null,
  isBlocked: false,
  isSuspended: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenPair.mockReturnValue({ accessToken: "acc.tok.en", refreshToken: "ref.tok.en" });
});

// ── registerUser ──────────────────────────────────────────────────────────────
describe("registerUser", () => {
  it("creates user and returns tokens on success", async () => {
    prisma.user.findUnique.mockResolvedValue(null); // no existing user
    prisma.user.create.mockResolvedValue(baseUser);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await registerUser({ name: "Alice", email: "alice@example.com", password: "pass123" });

    expect(result.success).toBe(true);
    expect(result.data.tokens.accessToken).toBe("acc.tok.en");
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });

  it("throws 409 when email already exists", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(
      registerUser({ name: "Alice", email: "alice@example.com", password: "pass123" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── loginUser ─────────────────────────────────────────────────────────────────
describe("loginUser", () => {
  it("returns tokens on valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, password: "hashed:pass" });
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await loginUser("alice@example.com", "pass123");

    expect(result.success).toBe(true);
    expect(result.data.tokens).toHaveProperty("accessToken");
  });

  it("throws 401 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(loginUser("ghost@example.com", "pass")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 401 when password is wrong", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, password: "hashed:wrong" });
    vi.mocked(comparePassword).mockResolvedValueOnce(false);

    await expect(loginUser("alice@example.com", "wrongpass")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 403 when user is blocked", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, password: "hashed:pass", isBlocked: true });

    await expect(loginUser("alice@example.com", "pass123")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 403 when user is suspended", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, password: "hashed:pass", isSuspended: true });

    await expect(loginUser("alice@example.com", "pass123")).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── refreshAccessToken ────────────────────────────────────────────────────────
describe("refreshAccessToken", () => {
  const rawToken = "raw.refresh.token";
  const tokenHash = `hash:${rawToken}`;

  it("returns new tokens on valid refresh token", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-1" });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await refreshAccessToken(rawToken);

    expect(result.success).toBe(true);
    expect(result.data.tokens.accessToken).toBe("acc.tok.en");
  });

  it("throws 401 when JWT verification fails", async () => {
    mockVerifyRefresh.mockImplementation(() => { throw new Error("invalid"); });

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 401 when token not found in DB", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-1" });
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 401 when stored token is expired", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-1" });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 404 when user no longer exists", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-gone" });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 and revokes all tokens when user is blocked", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-1" });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, isBlocked: true });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });

  it("throws 401 when token was already rotated (count=0)", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: "u-1" });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      expiresAt: new Date(Date.now() + 1_000_000),
    });
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── getCurrentUser ────────────────────────────────────────────────────────────
describe("getCurrentUser", () => {
  it("returns user when no heal needed", async () => {
    const user = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-1" };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await getCurrentUser("u-1");
    expect(result).toEqual(user);
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(getCurrentUser("nobody")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("heals orphaned restaurant registration", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser); // no RESTAURANT role
    prisma.restaurant.findFirst.mockResolvedValue({ id: "r-1" });
    const healed = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-1" };
    prisma.user.update.mockResolvedValue(healed);

    const result = await getCurrentUser("u-1");
    expect(result.restaurantId).toBe("r-1");
    expect(prisma.user.update).toHaveBeenCalledOnce();
  });

  it("returns unhealed user when heal fails", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.restaurant.findFirst.mockRejectedValue(new Error("DB error"));

    const result = await getCurrentUser("u-1");
    expect(result).toEqual(baseUser); // fallback — no crash
  });

  it("skips heal when user already has RESTAURANT role", async () => {
    const user = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-1" };
    prisma.user.findUnique.mockResolvedValue(user);

    await getCurrentUser("u-1");
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
});

// ── logoutUser ────────────────────────────────────────────────────────────────
describe("logoutUser", () => {
  it("deletes the specific refresh token", async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const result = await logoutUser("u-1", "raw.token");
    expect(result.success).toBe(true);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u-1" }) })
    );
  });

  it("skips DB call when no refresh token provided", async () => {
    const result = await logoutUser("u-1", null);
    expect(result.success).toBe(true);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

// ── logoutAllDevices ──────────────────────────────────────────────────────────
describe("logoutAllDevices", () => {
  it("deletes all refresh tokens for user", async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    const result = await logoutAllDevices("u-1");
    expect(result.success).toBe(true);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });
});
