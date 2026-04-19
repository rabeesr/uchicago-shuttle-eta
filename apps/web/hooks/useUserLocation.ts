"use client";

import { useCallback, useEffect, useState } from "react";

export type LocationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "granted"; lat: number; lon: number; accuracyM: number; at: number }
  | { status: "denied"; message: string }
  | { status: "unsupported" };

const SESSION_KEY = "uchicago-shuttle-eta:location";

function readCache(): LocationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocationState;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(s: LocationState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/**
 * Browser geolocation, session-scoped. Not persisted to Supabase; re-prompted
 * each tab session unless the browser caches the permission.
 *
 * Usage:
 *   const { state, request } = useUserLocation();
 *   if (state.status === 'granted') { ... state.lat ... }
 */
export function useUserLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });

  useEffect(() => {
    const cached = readCache();
    if (cached && cached.status === "granted") {
      setState(cached);
    } else if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported" });
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported" });
      return;
    }
    setState({ status: "pending" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: LocationState = {
          status: "granted",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          at: Date.now(),
        };
        setState(next);
        writeCache(next);
      },
      (err) => {
        setState({ status: "denied", message: err.message });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { state, request };
}
