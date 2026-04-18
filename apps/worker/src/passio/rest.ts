import { config } from "../config.js";

const { restBase, systemId, userAgent } = config;

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${restBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Passio ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${restBase}${path}`, {
    headers: { "user-agent": userAgent },
  });
  if (!res.ok) {
    throw new Error(`Passio ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// --- Vehicles ---
// Passio returns { buses: { [deviceId]: [{ busId, latitude(string), longitude(string), ... }] } }
export interface RawBus {
  busId: number;
  routeId: string;
  route: string;
  latitude: string;
  longitude: string;
  calculatedCourse: string;
  paxLoad: number;
  outOfService: 0 | 1;
  outdated: 0 | 1;
  busName: string;
  color: string;
}

export interface GetBusesResponse {
  buses: Record<string, RawBus[]>;
}

export function getVehicles() {
  return post<GetBusesResponse>(`/mapGetData.php?getBuses=2`, {
    s0: String(systemId),
    sA: 1,
  });
}

// --- Routes (metadata only; polylines come from getStops) ---
export interface RawRoute {
  myid: number;        // route id used elsewhere (e.g. "38729")
  id: number;          // different internal id; ignore
  name: string;
  shortName: string | null;
  color: string | null;
  fullname: string;
  timezone: string;
  outdated: 0 | 1;
}

export interface GetRoutesResponse {
  all: RawRoute[];
}

export function getRoutes() {
  return post<GetRoutesResponse>(`/mapGetData.php?getRoutes=2`, {
    systemSelected0: String(systemId),
    amount: 1,
  });
}

// --- Stops + polylines bundle ---
// This endpoint returns stops keyed by ID (with per-route duplicates when a stop
// is on multiple routes), plus routePoints keyed by routeId — the polyline data.
export interface RawStop {
  routeId: string;
  stopId: string;
  id: string;
  name: string;
  position: string;       // stop order on the route, as string
  latitude: number;
  longitude: number;
  radius: number;
  routeName: string;
  routeShortname: string;
}

export interface RawLatLng {
  lat: string;
  lng: string;
}

// routes[routeId] = [name, color, [position, stopId, flag], ...ordered stops]
export type RawRouteEntry = [string, string, ...Array<[string, string, number]>];

export interface GetStopsResponse {
  stops: Record<string, RawStop | RawStop[]>;
  // routes[routeId] is a tuple: [name, color, ...stopEntries].
  routes: Record<string, RawRouteEntry>;
  routeShortNames: Record<string, string>;
  // routePoints[routeId] is an array of segments; each segment is an array of {lat,lng}.
  routePoints: Record<string, RawLatLng[][] | RawLatLng[]>;
}

export function getStops() {
  return post<GetStopsResponse>(`/mapGetData.php?getStops=2`, {
    s0: String(systemId),
    sA: 1,
  });
}

// --- Alerts ---
export interface RawAlert {
  id: string | number;
  name?: string;
  html?: string;
  routeId?: string | null;
  dateTimeFrom?: string | null;
  dateTimeTo?: string | null;
}

export interface GetAlertsResponse {
  [key: string]: unknown;
  alerts?: RawAlert[];
}

export function getAlerts() {
  return post<GetAlertsResponse>(`/goServices.php?getAlertMessages=1`, {
    systemSelected0: String(systemId),
    amount: 1,
    routesAmount: 0,
  });
}

// --- Native ETA (Passio's own prediction) ---
// Verified shape (eta=3):
//   {
//     "ETAs": {
//       "<stopId>": [
//         {
//           "secondsSpent": <seconds-until-arrival> | 86400 (no bus),
//           "eta": "<display string>",
//           "routeId": "<id>",
//           "busName": "<bus id>",
//           "outOfService": boolean,
//           "eta_note": "solid" | "got from schedule" | ...
//         },
//         ...one entry per approaching bus
//       ]
//     }
//   }
export interface NativeEtaEntry {
  secondsSpent: number;
  eta: string;
  routeId: string;
  busName: string;
  outOfService: boolean;
  eta_note?: string;
}

export interface NativeEtaResponse {
  ETAs: Record<string, NativeEtaEntry[]>;
}

export function getNativeEta(routeId: string, stopIds: string[]) {
  const csv = stopIds.join(",");
  return get<NativeEtaResponse>(
    `/mapGetData.php?eta=3&deviceId=0&routeId=${encodeURIComponent(routeId)}&routeIds=${encodeURIComponent(routeId)}&stopIds=${encodeURIComponent(csv)}`,
  );
}
