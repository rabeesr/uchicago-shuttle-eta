"use client";

import { useMemo } from "react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversineM, walkingSecondsM } from "@/lib/geo";

export default function LeaveByChip({
  stopLat,
  stopLon,
  className = "",
}: {
  stopLat: number;
  stopLon: number;
  className?: string;
}) {
  const { state, request } = useUserLocation();

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
      <button
        type="button"
        onClick={request}
        className={`inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-accent hover:text-accent ${className}`}
      >
        📍 Use my location for walking time
      </button>
    );
  }

  if (state.status === "pending") {
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 ${className}`}>
        Locating…
      </span>
    );
  }

  if (!derived) return null;
  const minutes = Math.ceil(derived.seconds / 60);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-800 ${className}`}>
      🚶 {minutes === 1 ? "~1 min" : `~${minutes} min`} walk ({Math.round(derived.meters)}m)
    </span>
  );
}
