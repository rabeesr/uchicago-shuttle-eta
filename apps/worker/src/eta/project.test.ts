import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineM,
  cumulativeArcM,
  projectOntoPolyline,
  pickBestSegment,
  type LatLon,
} from "./project.js";

// UChicago quad roughly 41.789 N, -87.600 W. One degree of latitude ≈ 111,132 m.

test("haversine: same point is zero", () => {
  const p: LatLon = [41.789, -87.6];
  assert.equal(haversineM(p, p), 0);
});

test("haversine: 0.01 deg lat ~ 1112 m at UChicago latitude", () => {
  const a: LatLon = [41.789, -87.6];
  const b: LatLon = [41.799, -87.6];
  const d = haversineM(a, b);
  assert.ok(d > 1100 && d < 1115, `expected ~1112 m, got ${d}`);
});

test("cumulativeArcM: monotonic and ends at total path length", () => {
  const poly: LatLon[] = [
    [41.789, -87.6],
    [41.79, -87.6],
    [41.79, -87.599],
  ];
  const cum = cumulativeArcM(poly);
  assert.equal(cum[0], 0);
  assert.ok(cum[1] > 0);
  assert.ok(cum[2] > cum[1]);
});

test("projectOntoPolyline: point on the line projects with t=0.5", () => {
  const poly: LatLon[] = [
    [41.789, -87.6],
    [41.79, -87.6],
  ];
  const cum = cumulativeArcM(poly);
  const mid: LatLon = [41.7895, -87.6];
  const p = projectOntoPolyline(mid, poly, cum);
  assert.equal(p.segmentIndex, 0);
  assert.ok(Math.abs(p.t - 0.5) < 0.02, `t=${p.t}`);
  assert.ok(p.perpendicularM < 1, `perp=${p.perpendicularM}`);
  // Arc should be ~half of the total segment length.
  assert.ok(Math.abs(p.arcM - cum[1] / 2) < 10);
});

test("projectOntoPolyline: point off the line has nonzero perpendicular", () => {
  const poly: LatLon[] = [
    [41.789, -87.6],
    [41.79, -87.6],
  ];
  const cum = cumulativeArcM(poly);
  // Offset ~0.0001 deg east ≈ 8m at this latitude.
  const off: LatLon = [41.7895, -87.5999];
  const p = projectOntoPolyline(off, poly, cum);
  assert.ok(p.perpendicularM > 5 && p.perpendicularM < 15);
});

test("projectOntoPolyline: beyond endpoint clamps to t=1", () => {
  const poly: LatLon[] = [
    [41.789, -87.6],
    [41.79, -87.6],
  ];
  const cum = cumulativeArcM(poly);
  const beyond: LatLon = [41.791, -87.6];
  const p = projectOntoPolyline(beyond, poly, cum);
  assert.equal(p.t, 1);
  assert.equal(p.arcM, cum[1]);
});

test("pickBestSegment: picks the segment closest to the point", () => {
  const segments = [
    {
      polyline: [
        [41.789, -87.6],
        [41.79, -87.6],
      ] as LatLon[],
      cumulative: [0, 0],
    },
    {
      polyline: [
        [41.78, -87.61],
        [41.78, -87.6],
      ] as LatLon[],
      cumulative: [0, 0],
    },
  ];
  segments[0].cumulative = cumulativeArcM(segments[0].polyline);
  segments[1].cumulative = cumulativeArcM(segments[1].polyline);

  const nearFirst: LatLon = [41.7895, -87.6];
  const res = pickBestSegment(nearFirst, segments);
  assert.ok(res);
  assert.equal(res!.index, 0);
});
