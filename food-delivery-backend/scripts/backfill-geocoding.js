// One-time manual script — NOT run by the deploy pipeline.
//
// Finds every Restaurant with null lat/lng and geocodes it from its stored
// address.city, the same Nominatim-based helper used for new restaurants
// (see modules/restaurant/restaurant.service.js geocodeAddress). Run after
// deploying the Bug 1 fix to repair existing rows like the one that caused
// a Bahadurgarh restaurant to show up as "nearby" for a customer in
// Vadodara, 900km away.
//
// Usage: node scripts/backfill-geocoding.js

import { prisma } from "../src/config/prisma.js";
import { geocodeAddress } from "../src/modules/restaurant/restaurant.service.js";

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    where: { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, name: true, city: true, address: true },
  });

  console.log(`Found ${restaurants.length} restaurant(s) with no coordinates.`);

  let succeeded = 0;
  let failed = 0;

  for (const r of restaurants) {
    const city = r.city || r.address?.city;
    if (!city) {
      console.warn(`SKIP  ${r.id} (${r.name}) — no city on file, nothing to geocode from`);
      failed++;
      continue;
    }

    // geocodeAddress already self-throttles to Nominatim's >=1 req/sec policy.
    const geocoded = await geocodeAddress(`${city}, India`);
    if (!geocoded) {
      console.warn(`FAIL  ${r.id} (${r.name}) — geocoding "${city}, India" returned no result`);
      failed++;
      continue;
    }

    await prisma.restaurant.update({
      where: { id: r.id },
      data: { lat: geocoded.lat, lng: geocoded.lng },
    });
    console.log(`OK    ${r.id} (${r.name}) — ${city} -> ${geocoded.lat}, ${geocoded.lng}`);
    succeeded++;
  }

  console.log(`\nDone. ${succeeded} geocoded, ${failed} left null (no city on file or geocoding failed).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Backfill script crashed:", error);
  process.exit(1);
});
