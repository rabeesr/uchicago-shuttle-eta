"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversineM, walkingSecondsM } from "@/lib/geo";
import { computeLeaveBy, formatLeaveBy } from "@/lib/format";

/**
 * Commuter summary for a single stop.
 *
 * Shows: walking minutes + arrival-at-stop clock time (always when location
 * granted). If `nextArrivalSeconds` is provided, also shows "Leave by HH:MM"
 * (or "Leave now" / "Too late") based on the soonest arrival's live countdown.
 */
export default function LeaveByChip({
  stopLat,
  stopLon,
  nextArrivalSeconds = null,
  nextArrivalComputedAt = null,
  className = "",
}: {
  stopLat: number;
  stopLon: number;
  nextArrivalSeconds?: number | null;
  nextArrivalComputedAt?: string | null;
  className?: string;
}) {
  const { state, request } = useUserLocation();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const derived = useMemo(() => {
    if (state.status !== "granted") return null;
    const meters = haversineM(
      { lat: state.lat, lon: state.lon },
      { lat: stopLat, lon: stopLon },
    );
    return { meters, seconds: walkingSecondsM(meters) };
  }, [state, stopLat, stopLon]);

  if (state.status === "idle" || state.status === "denied" || state.status === "unsupported") {
    return (
      <div className={`rounded-2xl border border-accent-subtle bg-accent-subtle/40 p-4 ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700">
            <span className="font-medium text-accent">Know when to leave.</span>{" "}
            Share your location to see walking time, arrival time, and leave-by for this stop.
          </div>
          <button
            type="button"
            onClick={request}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            📍 Use my location
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "pending") {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-500 ${className}`}>
        Locating…
      </div>
    );
  }

  if (!derived || now === null) return null;
  const minutes = Math.max(1, Math.ceil(derived.seconds / 60));
  const arriveAtStop = new Date(now + derived.seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  let leaveByText = "";
  if (nextArrivalSeconds != null && nextArrivalComputedAt) {
    const age = (now - new Date(nextArrivalComputedAt).getTime()) / 1000;
    const countdownLive = Math.max(0, Math.round(nextArrivalSeconds - age));
    const lb = computeLeaveBy(now, countdownLive, derived.seconds);
    leaveByText = formatLeaveBy(lb);
  }

  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${className}`}>
      <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">Walk</div>
        <div className="mt-0.5 text-lg font-semibold">~{minutes} min</div>
        <div className="text-[11px] text-gray-400">{Math.round(derived.meters)}m</div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">You arrive at stop</div>
        <div className="mt-0.5 text-lg font-semibold tabular-nums">{arriveAtStop}</div>
        <div className="text-[11px] text-gray-400">if you left now</div>
      </div>
      <div className={`rounded-2xl p-3 text-center ${
        leaveByText
          ? "border border-accent-subtle bg-accent-subtle/40"
          : "border border-gray-200 bg-gray-50"
      }`}>
        <div className={`text-[10px] uppercase tracking-wide ${
          leaveByText ? "text-accent" : "text-gray-400"
        }`}>
          Leave
        </div>
        <div className={`mt-0.5 text-lg font-semibold ${
          leaveByText ? "text-accent" : "text-gray-400"
        }`}>
          {leaveByText ? leaveByText.replace(/^[^a-zA-Z0-9]+/, "") : "no live bus"}
        </div>
      </div>
    </div>
  );
}
