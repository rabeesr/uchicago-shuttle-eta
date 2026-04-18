// Per-bus rolling state used by the ETA computation.
// Kept in-memory; recreated on worker restart from whatever is in
// Supabase (the worker is the only writer, so this is safe).

export interface BusState {
  routeId: string | null;
  lastArcM: number | null;
  lastTimestampMs: number;
  rollingSpeedMps: number;   // EWMA, meters per second
  stoppedSince: number | null;
}

const EWMA_ALPHA = 0.3;
const SPEED_CLIP_MAX = 20;   // m/s (~45 mph) — anything higher is GPS jitter
const DWELL_FLOOR_MPS = 0.5; // below this we consider the bus dwelling

const state = new Map<string, BusState>();

export function getBusState(busId: string): BusState | undefined {
  return state.get(busId);
}

export function seedBusState(busId: string, s: BusState): void {
  state.set(busId, s);
}

/**
 * Update the rolling speed estimate for a bus. Returns the updated state.
 *
 * Rules:
 * - First observation seeds state, speed is null until we have a second sample.
 * - Instantaneous along-route speed is computed from the change in arc position
 *   over wall-clock time. Clipped to [0, SPEED_CLIP_MAX] m/s.
 * - Dwell samples (< DWELL_FLOOR_MPS) are NOT fed into the EWMA, so stopping
 *   at a stop doesn't poison the moving average. We do record `stoppedSince`
 *   so consumers can know the bus is currently idle.
 * - When a bus jumps backward (e.g. finished a loop, wrapped), we reset the
 *   baseline arc without updating the EWMA.
 */
export function updateSpeed(
  busId: string,
  routeId: string | null,
  arcM: number,
  timestampMs: number,
): BusState {
  const prev = state.get(busId);
  if (!prev || prev.routeId !== routeId) {
    const seeded: BusState = {
      routeId,
      lastArcM: arcM,
      lastTimestampMs: timestampMs,
      rollingSpeedMps: 3, // seed at 3 m/s (~7 mph) — typical shuttle creep speed
      stoppedSince: null,
    };
    state.set(busId, seeded);
    return seeded;
  }

  const dt = (timestampMs - prev.lastTimestampMs) / 1000;
  if (dt <= 0) return prev;

  const da = arcM - (prev.lastArcM ?? arcM);
  // Negative da means we wrapped around a loop. Reset baseline without feeding EWMA.
  if (da < -50) {
    const next: BusState = {
      ...prev,
      lastArcM: arcM,
      lastTimestampMs: timestampMs,
    };
    state.set(busId, next);
    return next;
  }
  const instantaneous = Math.max(0, Math.min(SPEED_CLIP_MAX, da / dt));

  let rolling = prev.rollingSpeedMps;
  let stoppedSince = prev.stoppedSince;

  if (instantaneous < DWELL_FLOOR_MPS) {
    // Don't update EWMA; mark dwell start if not already.
    if (stoppedSince === null) stoppedSince = timestampMs;
  } else {
    rolling = EWMA_ALPHA * instantaneous + (1 - EWMA_ALPHA) * rolling;
    stoppedSince = null;
  }

  const next: BusState = {
    routeId,
    lastArcM: arcM,
    lastTimestampMs: timestampMs,
    rollingSpeedMps: rolling,
    stoppedSince,
  };
  state.set(busId, next);
  return next;
}

export function _resetForTests() {
  state.clear();
}
