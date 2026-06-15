-- Ensure demo coupons exist in production.
-- All monetary values are in PAISE (₹1 = 100 paise).
-- Both statements are idempotent — safe to run on any DB state.

INSERT INTO "Coupon" (
  "id", "code", "description",
  "discountType", "discountValue", "minOrder",
  "maxUses", "usedCount", "isActive",
  "expiresAt", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  'IITMANDI300',
  'IIT Mandi special — ₹300 off',
  'FLAT',
  30000,    -- ₹300 discount in paise
  20000,    -- ₹200 minimum order in paise
  500, 0, true,
  '2027-12-31 23:59:59+00',
  now(), now()
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Coupon" (
  "id", "code", "description",
  "discountType", "discountValue", "minOrder",
  "maxUses", "usedCount", "isActive",
  "expiresAt", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  'GHOST20',
  '20% off on all orders',
  'PERCENTAGE',
  20,       -- 20%
  15000,    -- ₹150 minimum order in paise
  1000, 0, true,
  '2027-12-31 23:59:59+00',
  now(), now()
)
ON CONFLICT ("code") DO NOTHING;
