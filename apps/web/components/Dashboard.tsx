"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCountdown, etaDisagreement, computeLeaveBy, formatLeaveBy } from "@/lib/format";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversineM, walkingSecondsM } from "@/lib/geo";
import { crowdingFromPax, crowdingLabel, crowdingColorClass } from "@/lib/crowding";

export interface InitialEta {
  route_id: string;
  stop_id: string;
  vehicle_id: string;
  our_eta_seconds: number | null;
  passio_eta_seconds: number | null;
  computed_at: string;
  // denormalized display fields
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  route_name: string;
  route_color: string | null;
  pax_load: number | null;
  // Which kind of favorite this card represents — governs the tap target.
  source?: "stop" | "route";
}

interface EtaRow {
  our_eta_seconds: number | null;
  passio_eta_seconds: number | null;
  computed_at: string;
}

type EtaByKey = Record<string, EtaRow>; // key = `${route_id}:${stop_id}:${vehicle_id}`

function makeKey(r: { route_id: string; stop_id: string; vehicle_id: string }) {
  return `${r.route_id}:${r.stop_id}:${r.vehicle_id}`;
}

function secondsFromNow(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

export default function Dashboard({ initial }: { initial: InitialEta[] }) {
  const supabase = useSupabaseBrowser();
  const { state: loc, request: requestLoc } = useUserLocation();
  const [rows, setRows] = useState<EtaByKey>(() =>
    Object.fromEntries(initial.map((r) => [makeKey(r), r])),
  );
  // now=null during SSR + first client render so time-based content is
  // identical on both sides. Flipped to a real clock after mount.
  const [now, setNow] = useState<number | null>(null);
  const initialIndex = useRef<Map<string, InitialEta>>(
    new Map(initial.map((r) => [makeKey(r), r])),
  );

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to Realtime changes on stop_etas, filtered to favorited stops.
  const handleChange = useCallback((payload: { new: Record<string, unknown> }) => {
    const n = payload.new as {
      route_id?: string;
      stop_id?: string;
      vehicle_id?: string;
      our_eta_seconds?: number | null;
      passio_eta_seconds?: number | null;
      computed_at?: string;
    };
    const route_id = n.route_id;
    const stop_id = n.stop_id;
    const vehicle_id = n.vehicle_id;
    const computed_at = n.computed_at;
    if (!route_id || !stop_id || !vehicle_id || !computed_at) return;
    const key = `${route_id}:${stop_id}:${vehicle_id}`;
    // Only care about updates for stops the user has favorited.
    const stopPrefix = `${route_id}:${stop_id}`;
    if (
      !initialIndex.current.has(key) &&
      !Array.from(initialIndex.current.keys()).some(
        (k) => k.split(":").slice(0, 2).join(":") === stopPrefix,
      )
    ) {
      return;
    }
    setRows((prev) => ({
      ...prev,
      [key]: {
        our_eta_seconds: n.our_eta_seconds ?? null,
        passio_eta_seconds: n.passio_eta_seconds ?? null,
        computed_at,
      },
    }));
  }, []);

  useEffect(() => {
    const favoriteStopIds = Array.from(
      new Set(initial.map((r) => r.stop_id)),
    );
    if (favoriteStopIds.length === 0) return;
    const filter = `stop_id=in.(${favoriteStopIds.join(",")})`;
    const channel: RealtimeChannel = supabase
      .channel("stop_etas:dash")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stop_etas", filter },
        handleChange,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, initial, handleChange]);

  // Derive the best (soonest) vehicle per (route, stop) and compute live countdown.
  const cards = useMemo(() => {
    const byStop = new Map<string, InitialEta[]>();
    for (const r of initial) {
      const k = `${r.route_id}:${r.stop_id}`;
      if (!byStop.has(k)) byStop.set(k, []);
      byStop.get(k)!.push(r);
    }
    return Array.from(byStop.values()).flatMap((list) => {
      // Pick lowest live ETA per (route, stop).
      const candidates = list.map((r) => {
        const row = rows[makeKey(r)];
        // During SSR + first client render, `now === null` → pretend the data
        // is brand new (age=0) so server and client agree exactly.
        const age = now === null
          ? 0
          : (now - new Date(row?.computed_at ?? r.computed_at).getTime()) / 1000;
        const our = row?.our_eta_seconds ?? r.our_eta_seconds;
        const countdown = our == null ? null : Math.max(0, Math.round(our - age));
        return { ...r, row, countdown, age };
      });
      candidates.sort((a, b) => (a.countdown ?? 1e9) - (b.countdown ?? 1e9));
      return candidates[0] ? [candidates[0]] : [];
    });
  }, [initial, rows, now]);

  cards.sort((a, b) => (a.countdown ?? 1e9) - (b.countdown ?? 1e9));

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        No favorites yet.{" "}
        <a className="font-medium text-accent underline" href="/stops">
          Browse stops
        </a>{" "}
        or{" "}
        <a className="font-medium text-accent underline" href="/routes">
          routes
        </a>{" "}
        to pin what you use.
      </div>
    );
  }

  // Has the user granted location? If yes, extract it once for the card loop.
  const userLatLon = loc.status === "granted"
    ? { lat: loc.lat, lon: loc.lon }
    : null;

  // Only show the "Use my location" nudge if we have any stop-type card with
  // coordinates available (route-only favorites don't benefit from it).
  const anyStopCoord = cards.some(
    (c) => c.source !== "route" && c.stop_lat != null && c.stop_lon != null,
  );
  const showLocPrompt =
    anyStopCoord && (loc.status === "idle" || loc.status === "denied" || loc.status === "unsupported");

  return (
    <>
      {showLocPrompt && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent-subtle bg-accent-subtle/40 p-4">
          <div className="text-sm text-gray-700">
            <span className="font-medium text-accent">Know exactly when to leave.</span>{" "}
            Share your location and we&apos;ll show walking time + leave-by time for each stop.
          </div>
          <button
            type="button"
            onClick={requestLoc}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            📍 Use my location
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((c) => {
        const row = c.row;
        const passio = row?.passio_eta_seconds ?? c.passio_eta_seconds;
        const passioAdjusted =
          passio == null ? null : Math.max(0, Math.round(passio - c.age));
        const agreement = etaDisagreement(c.countdown, passioAdjusted);
        const agreementClass =
          agreement === "agree"
            ? "text-green-600"
            : agreement === "disagree-warn"
              ? "text-amber-600"
              : agreement === "disagree-strong"
                ? "text-red-600"
                : "text-gray-500";
        const href =
          c.source === "route"
            ? `/routes/${c.route_id}`
            : c.stop_id && c.stop_id !== "-"
              ? `/stops/${c.stop_id}`
              : `/routes/${c.route_id}`;

        // Walking time + leave-by, computed per card if we have location + coords.
        let walkMinutes: number | null = null;
        let leaveByText = "";
        if (userLatLon && c.stop_lat != null && c.stop_lon != null && now != null) {
          const distM = haversineM(userLatLon, { lat: c.stop_lat, lon: c.stop_lon });
          const walkSec = walkingSecondsM(distM);
          walkMinutes = Math.max(1, Math.ceil(walkSec / 60));
          const lb = computeLeaveBy(now, c.countdown, walkSec);
          leaveByText = formatLeaveBy(lb);
        }

        // Clock-time the bus is arriving at this stop.
        const busClockDisplay = c.countdown != null && now != null
          ? new Date(now + c.countdown * 1000).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })
          : null;
        // Clock-time the user would arrive at the stop if they left now.
        let arriveAtStopDisplay: string | null = null;
        if (userLatLon && c.stop_lat != null && c.stop_lon != null && now != null) {
          const distM = haversineM(userLatLon, { lat: c.stop_lat, lon: c.stop_lon });
          const walkSec = walkingSecondsM(distM);
          arriveAtStopDisplay = new Date(now + walkSec * 1000).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        }
        const crowd = crowdingFromPax(c.pax_load);

        return (
          <a
            key={makeKey(c)}
            href={href}
            className="block rounded-2xl border border-gray-200 bg-white p-5 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{c.stop_name}</h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.route_color ?? "#666" }}
                    aria-hidden
                  />
                  {c.route_name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold tabular-nums">
                  {formatCountdown(c.countdown)}
                </div>
                {busClockDisplay && (
                  <div className="text-xs text-gray-500 tabular-nums">
                    @ {busClockDisplay}
                  </div>
                )}
                <div className={`mt-0.5 text-[11px] tabular-nums ${agreementClass}`}>
                  Passio: {formatCountdown(passioAdjusted)}
                </div>
              </div>
            </div>

            {(walkMinutes != null || leaveByText || arriveAtStopDisplay) && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                {walkMinutes != null && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">Walk</div>
                    <div className="mt-0.5 font-semibold text-gray-900">~{walkMinutes}m</div>
                  </div>
                )}
                {arriveAtStopDisplay && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">You arrive</div>
                    <div className="mt-0.5 font-semibold text-gray-900 tabular-nums">{arriveAtStopDisplay}</div>
                  </div>
                )}
                {leaveByText && (
                  <div className="rounded-lg border border-accent-subtle bg-accent-subtle/40 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-accent">
                      {leaveByText.startsWith("🏃") ? "Too late" : "Leave"}
                    </div>
                    <div className="mt-0.5 font-semibold text-accent truncate">
                      {leaveByText.replace(/^[^a-zA-Z0-9]+/, "")}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
              <span>
                {crowd !== "unknown" ? (
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${crowdingColorClass(crowd)}`}>
                    👥 {crowdingLabel(crowd)}
                  </span>
                ) : null}
              </span>
              <span className="text-gray-400">
                {now === null
                  ? "tap for timetable →"
                  : `updated ${Math.max(0, Math.round(c.age))}s ago · tap →`}
              </span>
            </div>
          </a>
        );
      })}
      </div>
    </>
  );
}
