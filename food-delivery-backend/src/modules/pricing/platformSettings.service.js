import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { platformSettingsSchema } from "./platformSettings.schema.js";

// Singleton row, same upsert-by-fixed-id pattern as SiteConfig
// (config.service.js). Defaults here match the schema's @default values —
// the upsert's `create` branch only runs once, ever, on the very first read.
export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

// In-process hot-path buffer, short TTL. Order creation reads this on every
// single order, so a bare DB round-trip per order is wasteful, but this is
// a money-affecting read — keep the window an admin's settings change can
// be "stale" for deliberately short (unlike SiteConfig's 5s, which governs
// much lower-stakes toggles).
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 2_000;

export async function getPlatformSettingsCached() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;
  const settings = await getPlatformSettings();
  _cache = settings;
  _cacheAt = now;
  return settings;
}

export function invalidatePlatformSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

export async function updatePlatformSettings(patch) {
  const parsed = platformSettingsSchema.safeParse(patch);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid settings";
    throw new AppError(message, 400);
  }

  const updated = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });
  invalidatePlatformSettingsCache();
  return updated;
}

// The exact fields snapshotted onto every order — keeps Order.pricingSnapshot
// from accidentally picking up `id`/`updatedAt` noise.
export function snapshotSettings(settings) {
  return {
    deliveryBaseFee: settings.deliveryBaseFee,
    deliveryPerKmFee: settings.deliveryPerKmFee,
    platformFeeMode: settings.platformFeeMode,
    platformFeeValue: settings.platformFeeValue,
    splitRestaurantPct: settings.splitRestaurantPct,
    splitRiderPct: settings.splitRiderPct,
    splitAdminPct: settings.splitAdminPct,
  };
}
