// One-time manual script — NOT run by the deploy pipeline.
//
// Defensive cleanup for Bug D: lat=0/lng=0 is never a legitimate restaurant
// location in this app (India-only), and the contract for "not geocoded" is
// lat/lng === null, not 0. Nulls out any row that somehow has exactly (0, 0)
// — from a bad manual edit, a future regression, or any other source —
// so it's treated as "not geocoded" (city-match-only, see assignDeliveryAgent
// in orders.service.js) instead of producing a bogus ~8700km haversine
// distance against real coordinates.
//
// Usage: node scripts/null-out-zero-coords.js

import { prisma } from "../src/config/prisma.js";

async function main() {
  const zeroCoordRestaurants = await prisma.restaurant.findMany({
    where: { lat: 0, lng: 0 },
    select: { id: true, name: true, city: true },
  });

  console.log(`Found ${zeroCoordRestaurants.length} restaurant(s) with (0, 0) coordinates.`);

  for (const r of zeroCoordRestaurants) {
    await prisma.restaurant.update({
      where: { id: r.id },
      data: { lat: null, lng: null },
    });
    console.log(`OK    ${r.id} (${r.name}, city=${r.city ?? "unknown"}) — nulled out (0, 0)`);
  }

  console.log(`\nDone. ${zeroCoordRestaurants.length} row(s) cleaned. Re-run scripts/backfill-geocoding.js afterward to geocode them properly.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Cleanup script crashed:", error);
  process.exit(1);
});
