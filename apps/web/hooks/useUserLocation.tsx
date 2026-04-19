"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

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
    return JSON.parse(raw) as LocationState;
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

interface LocationCtx {
  state: LocationState;
  request: () => void;
}

const Ctx = createContext<LocationCtx | null>(null);

export function UserLocationProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo(() => ({ state, request }), [state, request]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Browser geolocation, session-scoped, shared across all consumers via
 * <UserLocationProvider/>. When one component requests and gets granted,
 * every other component sees the same state instantly.
 */
export function useUserLocation() {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useUserLocation must be used inside <UserLocationProvider>. Add it to your root layout.",
    );
  }
  return v;
}
