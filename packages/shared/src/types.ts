export type LatLon = [number, number];

export interface Route {
  id: string;
  name: string;
  short_name: string | null;
  color: string | null;
  polyline: LatLon[];
  polyline_cumulative_m: number[];
  updated_at: string;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number | null;
}

export interface RouteStop {
  route_id: string;
  stop_id: string;
  stop_order: number;
  arc_distance_m: number;
}

export interface Vehicle {
  id: string;
  route_id: string | null;
  lat: number;
  lon: number;
  heading: number | null;
  speed_mps: number | null;
  pax_load: number | null;
  out_of_service: boolean;
  arc_distance_m: number | null;
  rolling_speed_mps: number | null;
  updated_at: string;
}

export interface StopEta {
  route_id: string;
  stop_id: string;
  vehicle_id: string;
  our_eta_seconds: number | null;
  passio_eta_seconds: number | null;
  computed_at: string;
}

export interface Alert {
  id: string;
  title: string | null;
  body: string | null;
  route_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface UserFavoriteStop {
  user_id: string;     // Clerk user id (text)
  stop_id: string;
  created_at: string;
}

export interface UserFavoriteRoute {
  user_id: string;     // Clerk user id (text)
  route_id: string;
  created_at: string;
}
