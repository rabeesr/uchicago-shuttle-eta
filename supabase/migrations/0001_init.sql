-- UChicago Shuttle ETA — initial schema
--
-- Reference tables (routes, stops, route_stops): upsert nightly by worker.
-- Live tables (vehicles, stop_etas, alerts): upsert on each position update,
-- Realtime-published so the frontend can subscribe.
-- User table (user_favorite_stops): RLS-protected, one row per (user, stop).

create table if not exists routes (
  id text primary key,
  name text not null,
  short_name text,
  color text,
  polyline jsonb not null,
  polyline_cumulative_m double precision[] not null,
  updated_at timestamptz not null default now()
);

create table if not exists stops (
  id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  radius_m integer
);

create table if not exists route_stops (
  route_id text not null references routes(id) on delete cascade,
  stop_id text not null references stops(id) on delete cascade,
  stop_order integer not null,
  arc_distance_m double precision not null,
  primary key (route_id, stop_id)
);

create index if not exists route_stops_route_order_idx
  on route_stops (route_id, stop_order);

create table if not exists vehicles (
  id text primary key,
  route_id text references routes(id) on delete set null,
  lat double precision not null,
  lon double precision not null,
  heading double precision,
  speed_mps double precision,
  pax_load integer,
  out_of_service boolean not null default false,
  arc_distance_m double precision,
  rolling_speed_mps double precision,
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_route_idx on vehicles (route_id);

create table if not exists stop_etas (
  route_id text not null,
  stop_id text not null,
  vehicle_id text not null,
  our_eta_seconds integer,
  passio_eta_seconds integer,
  computed_at timestamptz not null default now(),
  primary key (route_id, stop_id, vehicle_id)
);

create index if not exists stop_etas_stop_idx on stop_etas (stop_id, our_eta_seconds);

create table if not exists alerts (
  id text primary key,
  title text,
  body text,
  route_id text,
  starts_at timestamptz,
  ends_at timestamptz
);

create table if not exists user_favorite_stops (
  user_id uuid not null references auth.users(id) on delete cascade,
  stop_id text not null references stops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, stop_id)
);

-- Realtime publication — let the frontend subscribe to these tables.
-- `supabase_realtime` is created automatically by Supabase; we add our tables to it.
do $$
begin
  alter publication supabase_realtime add table vehicles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table stop_etas;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table alerts;
exception when duplicate_object then null;
end $$;

-- RLS: reference + live tables are read-public (anon role), write-only via service role.
alter table routes enable row level security;
alter table stops enable row level security;
alter table route_stops enable row level security;
alter table vehicles enable row level security;
alter table stop_etas enable row level security;
alter table alerts enable row level security;
alter table user_favorite_stops enable row level security;

create policy "public read routes" on routes for select to anon, authenticated using (true);
create policy "public read stops" on stops for select to anon, authenticated using (true);
create policy "public read route_stops" on route_stops for select to anon, authenticated using (true);
create policy "public read vehicles" on vehicles for select to anon, authenticated using (true);
create policy "public read stop_etas" on stop_etas for select to anon, authenticated using (true);
create policy "public read alerts" on alerts for select to anon, authenticated using (true);

-- user_favorite_stops: owner can do anything with their own rows.
create policy "own favorites select" on user_favorite_stops
  for select to authenticated using (auth.uid() = user_id);
create policy "own favorites insert" on user_favorite_stops
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own favorites delete" on user_favorite_stops
  for delete to authenticated using (auth.uid() = user_id);

-- Writes on reference + live tables are implicitly restricted to service_role
-- (no insert/update/delete policies added → anon + authenticated cannot write).
