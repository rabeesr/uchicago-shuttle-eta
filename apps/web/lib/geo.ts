// Shared geo helpers for web (walking time + nearest stop).

const EARTH_M = 6_371_008.8;

export interface LatLonPoint {
  lat: number;
  lon: number;
}

export function haversineM(a: LatLonPoint, b: LatLonPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Typical walking pace — 1.4 m/s ≈ 3 mph. Honest estimate, not door-to-door. */
export const WALKING_SPEED_MPS = 1.4;

export function walkingSecondsM(distanceM: number): number {
  return Math.round(distanceM / WALKING_SPEED_MPS);
}

export function nearestStop<T extends LatLonPoint>(
  from: LatLonPoint,
  stops: T[],
): { stop: T; distanceM: number } | null {
  if (stops.length === 0) return null;
  let best = stops[0];
  let bestD = haversineM(from, best);
  for (let i = 1; i < stops.length; i++) {
    const d = haversineM(from, stops[i]);
    if (d < bestD) {
      best = stops[i];
      bestD = d;
    }
  }
  return { stop: best, distanceM: bestD };
}
