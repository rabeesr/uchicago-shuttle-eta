"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversineM, nearestStop, walkingSecondsM } from "@/lib/geo";

interface StopLite {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export default function NearestStopOnRoute({
  stops,
  className = "",
}: {
  stops: StopLite[];
  className?: string;
}) {
  const { state, request } = useUserLocation();

  const nearest = useMemo(() => {
    if (state.status !== "granted" || stops.length === 0) return null;
    const r = nearestStop({ lat: state.lat, lon: state.lon }, stops);
    if (!r) return null;
    return {
      stop: r.stop,
      distanceM: r.distanceM,
      seconds: walkingSecondsM(r.distanceM),
    };
  }, [state, stops]);

  if (state.status === "idle" || state.status === "denied" || state.status === "unsupported") {
    return (
      <button
        type="button"
        onClick={request}
        className={`inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-accent hover:text-accent ${className}`}
      >
        📍 Find my nearest stop on this route
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

  if (!nearest) return null;
  const minutes = Math.max(1, Math.ceil(nearest.seconds / 60));
  return (
    <div className={`rounded-2xl border border-accent-subtle bg-accent-subtle/40 p-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-accent">
        Nearest stop on this route
      </div>
      <Link
        href={`/stops/${nearest.stop.id}`}
        className="mt-1 block text-lg font-semibold hover:text-accent"
      >
        {nearest.stop.name}
      </Link>
      <div className="mt-1 text-sm text-gray-700">
        🚶 ~{minutes} min walk · {Math.round(nearest.distanceM)}m away
      </div>
    </div>
  );
}
