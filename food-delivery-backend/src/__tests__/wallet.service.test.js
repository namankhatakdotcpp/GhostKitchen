import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWalletUpsert = vi.fn();
const mockWalletUpdate = vi.fn();
const mockWalletUpdateMany = vi.fn();
const mockTxCreate = vi.fn();
const mockTransactionFindMany = vi.fn();
const mockPrismaTransaction = vi.fn();

vi.mock("../config/prisma.js", () => ({
  prisma: {
    wallet: { upsert: mockWalletUpsert, update: mockWalletUpdate, updateMany: mockWalletUpdateMany },
    walletTransaction: { create: mockTxCreate, findMany: mockTransactionFindMany },
    $transaction: mockPrismaTransaction,
  },
}));

const mockGetPlatformSettingsCached = vi.fn();
vi.mock("../modules/pricing/platformSettings.service.js", () => ({
  getPlatformSettingsCached: mockGetPlatformSettingsCached,
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { awardPointsForOrder, previewRedemption, claimPointsInTx, getWalletWithHistory } = await import(
  "../modules/wallet/wallet.service.js"
);

const DEFAULT_SETTINGS = { loyaltyEarnRate: 0.1, loyaltyPointValuePaise: 100, loyaltyRedemptionCapPct: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPlatformSettingsCached.mockResolvedValue(DEFAULT_SETTINGS);
});

describe("awardPointsForOrder", () => {
  it("awards 1 point per ₹10 of itemTotal (default rate)", async () => {
    mockWalletUpsert.mockResolvedValue({ id: "wallet-1", userId: "cust-1", balance: 0 });
    mockPrismaTransaction.mockImplementation((ops) => Promise.all(ops));
    mockTxCreate.mockResolvedValue({ id: "txn-1", type: "EARNED", points: 50 });

    // itemTotal = ₹500 in paise = 50000 -> 50 points at rate 0.1
    const order = { id: "order-1", customerId: "cust-1", itemTotal: 50000 };
    await awardPointsForOrder(order);

    expect(mockPrismaTransaction).toHaveBeenCalled();
  });

  it("awards nothing for a zero/negative itemTotal", async () => {
    const order = { id: "order-1", customerId: "cust-1", itemTotal: 0 };
    const result = await awardPointsForOrder(order);
    expect(result).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it("awards nothing when the computed points round down to zero", async () => {
    mockGetPlatformSettingsCached.mockResolvedValue({ ...DEFAULT_SETTINGS, loyaltyEarnRate: 0.1 });
    // itemTotal = ₹5 (500 paise) -> 0.5 points -> floors to 0
    const order = { id: "order-1", customerId: "cust-1", itemTotal: 500 };
    const result = await awardPointsForOrder(order);
    expect(result).toBeNull();
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it("falls back to subtotal when itemTotal is missing (pre-pricing-system orders)", async () => {
    mockWalletUpsert.mockResolvedValue({ id: "wallet-1", userId: "cust-1", balance: 0 });
    mockPrismaTransaction.mockImplementation((ops) => Promise.all(ops));
    mockTxCreate.mockResolvedValue({});

    const order = { id: "order-1", customerId: "cust-1", itemTotal: null, subtotal: 100000 };
    await awardPointsForOrder(order);
    expect(mockPrismaTransaction).toHaveBeenCalled();
  });
});

describe("previewRedemption", () => {
  it("returns zero when no points requested", async () => {
    const result = await previewRedemption({ userId: "cust-1", requestedPoints: 0, orderTotalPaise: 100000 });
    expect(result).toEqual({ points: 0, discountPaise: 0 });
  });

  it("caps at the wallet balance when requesting more than is available", async () => {
    mockWalletUpsert.mockResolvedValue({ id: "wallet-1", userId: "cust-1", balance: 50 });
    // orderTotal ₹1000 (100000 paise), 20% cap = ₹200 = 20000 paise = 200 points max by cap
    const result = await previewRedemption({ userId: "cust-1", requestedPoints: 500, orderTotalPaise: 100000 });
    expect(result.points).toBe(50); // balance is the binding constraint
    expect(result.discountPaise).toBe(5000); // 50 points * ₹1
  });

  it("caps at the redemption % cap when the wallet has plenty of points", async () => {
    mockWalletUpsert.mockResolvedValue({ id: "wallet-1", userId: "cust-1", balance: 10000 });
    // orderTotal ₹1000, 20% cap = ₹200 = 200 points max
    const result = await previewRedemption({ userId: "cust-1", requestedPoints: 5000, orderTotalPaise: 100000 });
    expect(result.points).toBe(200);
    expect(result.discountPaise).toBe(20000);
  });
});

describe("claimPointsInTx", () => {
  function fakeTx() {
    return {
      wallet: { upsert: vi.fn().mockResolvedValue({ id: "wallet-1" }), updateMany: vi.fn() },
      walletTransaction: { create: vi.fn() },
    };
  }

  it("does nothing for zero/undefined points", async () => {
    const tx = fakeTx();
    await claimPointsInTx(tx, "cust-1", 0);
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
  });

  it("throws when the guarded decrement matches zero rows (insufficient balance)", async () => {
    const tx = fakeTx();
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(claimPointsInTx(tx, "cust-1", 999)).rejects.toThrow(/Insufficient points balance/);
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("creates a REDEEMED transaction when the decrement succeeds", async () => {
    const tx = fakeTx();
    tx.wallet.updateMany.mockResolvedValue({ count: 1 });
    await claimPointsInTx(tx, "cust-1", 100, { orderId: "order-1", description: "test" });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "REDEEMED", points: 100, orderId: "order-1" }) }),
    );
  });
});

describe("getWalletWithHistory", () => {
  it("returns the balance and recent transactions", async () => {
    mockWalletUpsert.mockResolvedValue({ id: "wallet-1", userId: "cust-1", balance: 42 });
    mockTransactionFindMany.mockResolvedValue([{ id: "txn-1", type: "EARNED", points: 10 }]);

    const result = await getWalletWithHistory("cust-1");
    expect(result.balance).toBe(42);
    expect(result.transactions).toHaveLength(1);
  });
});
