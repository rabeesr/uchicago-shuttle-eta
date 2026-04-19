"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCountdown, etaDisagreement } from "@/lib/format";

export interface InitialEta {
  route_id: string;
  stop_id: string;
  vehicle_id: string;
  our_eta_seconds: number | null;
  passio_eta_seconds: number | null;
  computed_at: string;
  // denormalized display fields
  stop_name: string;
  route_name: string;
  route_color: string | null;
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
  const [rows, setRows] = useState<EtaByKey>(() =>
    Object.fromEntries(initial.map((r) => [makeKey(r), r])),
  );
  const [now, setNow] = useState(() => Date.now());
  const initialIndex = useRef<Map<string, InitialEta>>(
    new Map(initial.map((r) => [makeKey(r), r])),
  );

  // Tick every second so countdowns update smoothly.
  useEffect(() => {
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
        const age = secondsFromNow(row?.computed_at ?? r.computed_at);
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

  return (
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
                <div className={`mt-1 text-xs tabular-nums ${agreementClass}`}>
                  Passio: {formatCountdown(passioAdjusted)}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-gray-400">
              updated {Math.max(0, Math.round(c.age))}s ago · tap for timetable
            </div>
          </a>
        );
      })}
    </div>
  );
}
