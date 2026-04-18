-- Swap Supabase Auth for Clerk (native third-party auth integration) and add
-- the user_favorite_routes table. Existing favorite rows are orphaned by the
-- auth provider change, so we drop them.
--
-- Under the native integration, Clerk issues the session JWT and Supabase
-- verifies it via Clerk's JWKS (configured in dashboard as a third-party
-- auth provider). The Clerk user id lives in the `sub` claim and is a text
-- string like "user_2abc..." — so user_id columns become text rather than
-- referencing auth.users.

delete from user_favorite_stops;

-- Drop existing policies first — can't alter a column that policies reference.
drop policy if exists "own favorites select" on user_favorite_stops;
drop policy if exists "own favorites insert" on user_favorite_stops;
drop policy if exists "own favorites delete" on user_favorite_stops;
drop policy if exists "own favorite stops select" on user_favorite_stops;
drop policy if exists "own favorite stops insert" on user_favorite_stops;
drop policy if exists "own favorite stops delete" on user_favorite_stops;

alter table user_favorite_stops drop constraint if exists user_favorite_stops_user_id_fkey;
alter table user_favorite_stops alter column user_id type text using user_id::text;

create policy "own favorite stops select" on user_favorite_stops
  for select to authenticated using ((auth.jwt() ->> 'sub') = user_id);
create policy "own favorite stops insert" on user_favorite_stops
  for insert to authenticated with check ((auth.jwt() ->> 'sub') = user_id);
create policy "own favorite stops delete" on user_favorite_stops
  for delete to authenticated using ((auth.jwt() ->> 'sub') = user_id);

create table if not exists user_favorite_routes (
  user_id text not null,
  route_id text not null references routes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, route_id)
);

alter table user_favorite_routes enable row level security;

drop policy if exists "own favorite routes select" on user_favorite_routes;
drop policy if exists "own favorite routes insert" on user_favorite_routes;
drop policy if exists "own favorite routes delete" on user_favorite_routes;

create policy "own favorite routes select" on user_favorite_routes
  for select to authenticated using ((auth.jwt() ->> 'sub') = user_id);
create policy "own favorite routes insert" on user_favorite_routes
  for insert to authenticated with check ((auth.jwt() ->> 'sub') = user_id);
create policy "own favorite routes delete" on user_favorite_routes
  for delete to authenticated using ((auth.jwt() ->> 'sub') = user_id);
