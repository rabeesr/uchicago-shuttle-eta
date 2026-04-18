// Geometric utilities for projecting a bus position onto a route polyline.
//
// A polyline is a sequence of [lat, lon] points. We precompute cumulative
// along-path distances once per route, then each bus update projects its
// (lat, lon) onto the nearest segment and interpolates arc distance.

export type LatLon = [number, number];

const EARTH_M = 6_371_008.8; // mean Earth radius in meters (IUGG)

/** Great-circle distance between two points in meters. */
export function haversineM(a: LatLon, b: LatLon): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Cumulative distance along the polyline at each vertex (meters). */
export function cumulativeArcM(polyline: LatLon[]): number[] {
  const out = new Array<number>(polyline.length);
  out[0] = 0;
  for (let i = 1; i < polyline.length; i++) {
    out[i] = out[i - 1] + haversineM(polyline[i - 1], polyline[i]);
  }
  return out;
}

/**
 * Project a point onto a polyline. Returns the closest segment index, the
 * normalized position along that segment (`t` in [0, 1]), the perpendicular
 * distance from the point to the segment in meters, and the arc distance from
 * the start of the polyline to the projected point.
 *
 * Uses equirectangular (flat-earth) approximation for the projection math —
 * valid for campus-scale distances. Arc distance is the Haversine sum, so
 * the final output stays in true meters.
 */
export interface Projection {
  segmentIndex: number;
  t: number;
  perpendicularM: number;
  arcM: number;
}

export function projectOntoPolyline(
  point: LatLon,
  polyline: LatLon[],
  cumulative: number[],
): Projection {
  if (polyline.length < 2) {
    return { segmentIndex: 0, t: 0, perpendicularM: Infinity, arcM: 0 };
  }

  const refLatRad = (point[0] * Math.PI) / 180;
  const mPerDegLat = 111_132.954 - 559.822 * Math.cos(2 * refLatRad);
  const mPerDegLon = (Math.PI / 180) * EARTH_M * Math.cos(refLatRad);

  const px = point[1] * mPerDegLon; // x = lon * scale
  const py = point[0] * mPerDegLat; // y = lat * scale

  let best: Projection = {
    segmentIndex: 0,
    t: 0,
    perpendicularM: Infinity,
    arcM: 0,
  };

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a[1] * mPerDegLon;
    const ay = a[0] * mPerDegLat;
    const bx = b[1] * mPerDegLon;
    const by = b[0] * mPerDegLat;

    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const projx = ax + t * dx;
    const projy = ay + t * dy;
    const perp = Math.hypot(px - projx, py - projy);

    if (perp < best.perpendicularM) {
      const segLen = cumulative[i + 1] - cumulative[i];
      best = {
        segmentIndex: i,
        t,
        perpendicularM: perp,
        arcM: cumulative[i] + t * segLen,
      };
    }
  }

  return best;
}

/**
 * Choose the best polyline segment for a route. Passio returns polylines as
 * arrays-of-arrays (outbound + inbound, or branched variants). For a given
 * bus position, pick the segment whose projection is closest.
 */
export interface ResolvedPolyline {
  polyline: LatLon[];
  cumulative: number[];
}

export function pickBestSegment(
  point: LatLon,
  segments: ResolvedPolyline[],
): { segment: ResolvedPolyline; projection: Projection; index: number } | null {
  let best: { segment: ResolvedPolyline; projection: Projection; index: number } | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const p = projectOntoPolyline(point, seg.polyline, seg.cumulative);
    if (!best || p.perpendicularM < best.projection.perpendicularM) {
      best = { segment: seg, projection: p, index: i };
    }
  }
  return best;
}
