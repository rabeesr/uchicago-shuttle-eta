import { test } from "node:test";
import assert from "node:assert/strict";
import { _resetForTests, updateSpeed, getBusState } from "./state.js";

test("first sample seeds baseline, no real speed yet", () => {
  _resetForTests();
  const s = updateSpeed("b1", "r1", 100, 0);
  assert.equal(s.lastArcM, 100);
  assert.equal(s.rollingSpeedMps, 3); // seeded
  assert.equal(s.stoppedSince, null);
});

test("moving at 10 m/s pulls EWMA up from the 3 m/s seed", () => {
  _resetForTests();
  updateSpeed("b1", "r1", 0, 0);
  const s = updateSpeed("b1", "r1", 100, 10_000); // 10 m/s
  // α=0.3 → 0.3*10 + 0.7*3 = 5.1
  assert.ok(Math.abs(s.rollingSpeedMps - 5.1) < 0.01);
});

test("dwelling does not lower EWMA and marks stoppedSince", () => {
  _resetForTests();
  updateSpeed("b1", "r1", 0, 0);
  updateSpeed("b1", "r1", 100, 10_000);      // 10 m/s → EWMA 5.1
  const s = updateSpeed("b1", "r1", 100.1, 20_000); // dwelling
  assert.ok(Math.abs(s.rollingSpeedMps - 5.1) < 0.01);
  assert.ok(s.stoppedSince !== null);
});

test("GPS outliers are clipped to 20 m/s", () => {
  _resetForTests();
  updateSpeed("b1", "r1", 0, 0);
  const s = updateSpeed("b1", "r1", 1_000, 1_000); // would be 1000 m/s
  // Clipped to 20 → EWMA = 0.3*20 + 0.7*3 = 8.1
  assert.ok(Math.abs(s.rollingSpeedMps - 8.1) < 0.01);
});

test("loop wrap (large negative arc delta) resets baseline without updating EWMA", () => {
  _resetForTests();
  updateSpeed("b1", "r1", 0, 0);
  updateSpeed("b1", "r1", 500, 100_000);
  const before = getBusState("b1")!.rollingSpeedMps;
  const s = updateSpeed("b1", "r1", 10, 110_000); // wrap to start
  assert.equal(s.rollingSpeedMps, before);
  assert.equal(s.lastArcM, 10);
});

test("route change reseeds baseline", () => {
  _resetForTests();
  updateSpeed("b1", "r1", 0, 0);
  const s = updateSpeed("b1", "r2", 500, 10_000);
  // New route → reseed, not 0.3*50 + 0.7*prev.
  assert.equal(s.routeId, "r2");
  assert.equal(s.lastArcM, 500);
  assert.equal(s.rollingSpeedMps, 3);
});
