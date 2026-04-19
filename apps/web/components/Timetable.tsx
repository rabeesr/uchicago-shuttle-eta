"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabaseBrowser, getSupabaseAnon } from "@/lib/supabase-browser";
import { useAuth } from "@clerk/nextjs";
import { formatCountdown, etaDisagreement } from "@/lib/format";
import { crowdingFromPax, crowdingLabel, crowdingColorClass } from "@/lib/crowding";

export interface Arrival {
  key: string;                 // `${route_id}:${stop_id}:${vehicle_id}`
  route_id: string;
  stop_id: string;
  vehicle_id: string;
  route_name: string;
  route_color: string | null;
  stop_name: string;
  our_eta_seconds: number | null;
  passio_eta_seconds: number | null;
  computed_at: string;
  pax_load: number | null;
  bus_speed_mps: number | null;
}

export interface TimetableFilter {
  stopId?: string;
  routeId?: string;
}

function secondsFromNow(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

export default function Timetable({
  initial,
  filter,
  emptyMessage,
  groupBy = "none",
}: {
  initial: Arrival[];
  filter: TimetableFilter;
  emptyMessage: string;
  groupBy?: "none" | "stop";
}) {
  const { isSignedIn } = useAuth();
  const supabase = useSupabaseBrowser();
  const anon = useMemo(() => getSupabaseAnon(), []);
  const realtimeClient = isSignedIn ? supabase : anon;

  const [rows, setRows] = useState<Record<string, Arrival>>(() =>
    Object.fromEntries(initial.map((a) => [a.key, a])),
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Keep the initial metadata lookup so we can enrich incoming Realtime rows
  // (which only carry stop_etas fields, not names/colors/pax).
  const meta = useMemo(() => {
    const m = new Map<string, {
      route_name: string;
      route_color: string | null;
      stop_name: string;
      pax_load: number | null;
      bus_speed_mps: number | null;
    }>();
    for (const a of initial) m.set(a.key, a);
    return m;
  }, [initial]);

  useEffect(() => {
    const filterParts: string[] = [];
    if (filter.stopId) filterParts.push(`stop_id=eq.${filter.stopId}`);
    if (filter.routeId) filterParts.push(`route_id=eq.${filter.routeId}`);
    const channel: RealtimeChannel = realtimeClient
      .channel(`timetable:${filter.stopId ?? ""}:${filter.routeId ?? ""}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stop_etas",
          filter: filterParts.length > 0 ? filterParts.join("&") : undefined,
        },
        (payload) => {
          const n = payload.new as {
            route_id?: string;
            stop_id?: string;
            vehicle_id?: string;
            our_eta_seconds?: number | null;
            passio_eta_seconds?: number | null;
            computed_at?: string;
          };
          if (!n.route_id || !n.stop_id || !n.vehicle_id || !n.computed_at) return;
          const key = `${n.route_id}:${n.stop_id}:${n.vehicle_id}`;
          const seed = meta.get(key);
          setRows((prev) => ({
            ...prev,
            [key]: {
              key,
              route_id: n.route_id!,
              stop_id: n.stop_id!,
              vehicle_id: n.vehicle_id!,
              route_name: seed?.route_name ?? prev[key]?.route_name ?? n.route_id!,
              route_color: seed?.route_color ?? prev[key]?.route_color ?? null,
              stop_name: seed?.stop_name ?? prev[key]?.stop_name ?? n.stop_id!,
              our_eta_seconds: n.our_eta_seconds ?? null,
              passio_eta_seconds: n.passio_eta_seconds ?? null,
              computed_at: n.computed_at!,
              pax_load: seed?.pax_load ?? prev[key]?.pax_load ?? null,
              bus_speed_mps: seed?.bus_speed_mps ?? prev[key]?.bus_speed_mps ?? null,
            },
          }));
        },
      )
      .subscribe();
    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [realtimeClient, filter.stopId, filter.routeId, meta]);

  const withLiveCountdown = useMemo(() => {
    return Object.values(rows).map((a) => {
      const age = secondsFromNow(a.computed_at);
      const countdown = a.our_eta_seconds == null
        ? null
        : Math.max(0, Math.round(a.our_eta_seconds - age));
      const passioLive = a.passio_eta_seconds == null
        ? null
        : Math.max(0, Math.round(a.passio_eta_seconds - age));
      return { ...a, age, countdown, passioLive };
    });
  }, [rows, now]);

  const sorted = [...withLiveCountdown].sort(
    (a, b) => (a.countdown ?? 1e9) - (b.countdown ?? 1e9),
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        {emptyMessage}
      </div>
    );
  }

  if (groupBy === "stop") {
    const byStop = new Map<string, typeof sorted>();
    for (const a of sorted) {
      if (!byStop.has(a.stop_id)) byStop.set(a.stop_id, []);
      byStop.get(a.stop_id)!.push(a);
    }
    return (
      <div className="space-y-4">
        {[...byStop.entries()].map(([stopId, arrivals]) => (
          <div key={stopId} className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold">
              {arrivals[0].stop_name}
            </div>
            <ul className="divide-y divide-gray-100">
              {arrivals.slice(0, 3).map((a) => (
                <ArrivalRow key={a.key} a={a} showStop={false} showRoute={false} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
      {sorted.map((a) => (
        <ArrivalRow key={a.key} a={a} showStop showRoute />
      ))}
    </ul>
  );
}

function ArrivalRow({
  a,
  showStop,
  showRoute,
}: {
  a: Arrival & { age: number; countdown: number | null; passioLive: number | null };
  showStop: boolean;
  showRoute: boolean;
}) {
  const agreement = etaDisagreement(a.countdown, a.passioLive);
  const agreementClass =
    agreement === "agree"
      ? "text-green-600"
      : agreement === "disagree-warn"
        ? "text-amber-600"
        : agreement === "disagree-strong"
          ? "text-red-600"
          : "text-gray-500";
  const crowd = crowdingFromPax(a.pax_load);

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {showRoute && (
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: a.route_color ?? "#666" }}
            >
              {a.route_name}
            </span>
          )}
          {showStop && <span className="truncate text-sm">{a.stop_name}</span>}
          <span className="text-[11px] text-gray-400">· bus {a.vehicle_id}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          {crowd !== "unknown" && (
            <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${crowdingColorClass(crowd)}`}>
              {crowdingLabel(crowd)}
            </span>
          )}
          <span className="text-gray-400">updated {Math.max(0, Math.round(a.age))}s ago</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold tabular-nums">
          {formatCountdown(a.countdown)}
        </div>
        <div className={`mt-0.5 text-[11px] tabular-nums ${agreementClass}`}>
          Passio: {formatCountdown(a.passioLive)}
        </div>
      </div>
    </li>
  );
}
