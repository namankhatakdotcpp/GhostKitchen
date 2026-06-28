// Haversine distance in km between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_PREP_MINS = 20;
const DEFAULT_DELIVERY_MINS = 30;
const AVG_SPEED_KMH = 25;

/**
 * Calculate estimated delivery datetime.
 *
 * @param {object} restaurant - Restaurant row with lat/lng and address JSON
 * @param {object|null} agent - Agent row with currentLat/currentLng (for OUT_FOR_DELIVERY)
 * @param {string} status - The new order status being set
 * @param {object|null} deliveryAddress - Order deliveryAddress JSON (with lat/lng if available)
 * @returns {Date} estimated delivery time
 */
export function computeETA(restaurant, agent, status, deliveryAddress) {
  const now = Date.now();
  const addr = restaurant?.address ?? {};
  // prepTime = kitchen prep window; deliveryTime = rider transit window (from address settings)
  const prepMins = Number(addr.prepTime ?? DEFAULT_PREP_MINS);
  const deliveryMins = Number(addr.deliveryTime ?? DEFAULT_DELIVERY_MINS);

  if (status === "CONFIRMED") {
    return new Date(now + (prepMins + deliveryMins) * 60_000);
  }

  if (status === "OUT_FOR_DELIVERY" && agent) {
    const agentLat = agent.currentLat ?? restaurant.lat ?? 28.6139;
    const agentLng = agent.currentLng ?? restaurant.lng ?? 77.209;
    const dropLat = deliveryAddress?.lat ?? restaurant.lat ?? 28.6139;
    const dropLng = deliveryAddress?.lng ?? restaurant.lng ?? 77.209;

    const distKm = haversine(agentLat, agentLng, dropLat, dropLng);
    const travelMins = Math.ceil((distKm / AVG_SPEED_KMH) * 60) + 5; // 5 min buffer
    return new Date(now + travelMins * 60_000);
  }

  // Default: now + prep + delivery
  return new Date(now + (prepMins + DEFAULT_DELIVERY_MINS) * 60_000);
}
