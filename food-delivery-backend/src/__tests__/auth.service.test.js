import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before importing the module under test ──────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../utils/password.js", () => ({
  hashPassword: vi.fn(async (p) => `hashed_${p}`),
  comparePassword: vi.fn(async (plain, hashed) => hashed === `hashed_${plain}`),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock env before jwt utils load
vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here",
    CASHFREE_APP_ID: "test",
    CASHFREE_SECRET_KEY: "test",
    CASHFREE_ENV: "sandbox",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:5000",
    ALLOWED_ORIGINS: "http://localhost:3000",
    PORT: 5000,
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────
const { registerUser, loginUser, logoutUser } = await import("../modules/auth/auth.service.js");
const { prisma } = await import("../config/prisma.js");

// ── Test data ─────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: "user-123",
  name: "Test User",
  email: "test@example.com",
  phone: null,
  roles: ["CUSTOMER"],
  activeRole: "CUSTOMER",
  secondRole: null,
  restaurantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({ id: "rt-1" });
  });

  it("creates a new user and returns tokens", async () => {
    prisma.user.findUnique.mockResolvedValue(null); // no existing user
    prisma.user.create.mockResolvedValue(MOCK_USER);

    const result = await registerUser({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
    expect(result.data.user.email).toBe("test@example.com");
    expect(result.data.tokens.accessToken).toBeTruthy();
    expect(result.data.tokens.refreshToken).toBeTruthy();
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });

  it("rejects duplicate email with 409", async () => {
    prisma.user.findUnique.mockResolvedValue(MOCK_USER);

    await expect(
      registerUser({ name: "Test", email: "test@example.com", password: "pw" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("hashes the password before storing", async () => {
    const { hashPassword } = await import("../utils/password.js");
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(MOCK_USER);

    await registerUser({ name: "User", email: "u@x.com", password: "secret" });
    expect(hashPassword).toHaveBeenCalledWith("secret");
  });
});

describe("loginUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({ id: "rt-1" });
  });

  it("returns tokens on valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...MOCK_USER,
      password: "hashed_correctpassword",
      isBlocked: false,
      isSuspended: false,
    });

    const result = await loginUser("test@example.com", "correctpassword");
    expect(result.success).toBe(true);
    expect(result.data.tokens.accessToken).toBeTruthy();
  });

  it("throws 401 for wrong password", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...MOCK_USER,
      password: "hashed_correct",
      isBlocked: false,
      isSuspended: false,
    });

    await expect(loginUser("test@example.com", "wrong")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("throws 401 for unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(loginUser("nobody@x.com", "pw")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 403 for blocked users", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...MOCK_USER,
      password: "hashed_pw",
      isBlocked: true,
      isSuspended: false,
    });
    await expect(loginUser("test@example.com", "pw")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 403 for suspended users", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...MOCK_USER,
      password: "hashed_pw",
      isBlocked: false,
      isSuspended: true,
    });
    await expect(loginUser("test@example.com", "pw")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("logoutUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the refresh token for the user", async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    const result = await logoutUser("user-123", "raw-refresh-token");
    expect(result.success).toBe(true);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledOnce();
  });

  it("succeeds even when no refresh token is provided", async () => {
    const result = await logoutUser("user-123", undefined);
    expect(result.success).toBe(true);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
