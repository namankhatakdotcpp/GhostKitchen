import { prisma } from "../../config/prisma.js";

// In-process cache — avoids a DB round-trip on every request for maintenance check
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30_000; // 30 seconds

export async function getSiteConfig() {
  return prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

export async function getSiteConfigCached() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;
  _cache = await getSiteConfig();
  _cacheAt = now;
  return _cache;
}

export function invalidateConfigCache() {
  _cache = null;
  _cacheAt = 0;
}

export async function updateSiteConfig(data) {
  const allowed = [
    "maintenanceMode", "newRestaurantReg", "riderRegistrations",
    "cashOnDelivery", "codMinOrder", "maxDeliveryRadius", "defaultDeliveryFee",
    "requireApproval", "allowBranches", "maxMenuItems", "requireEmailVerify",
    "autoConfirmOrders",
  ];
  const safe = {};
  for (const key of allowed) {
    if (key in data) safe[key] = data[key];
  }
  const result = await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...safe },
    update: safe,
  });
  invalidateConfigCache();
  return result;
}
