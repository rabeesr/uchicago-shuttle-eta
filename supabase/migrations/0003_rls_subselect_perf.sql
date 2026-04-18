-- Wrap auth.jwt() in a subselect so the Postgres planner caches the JWT parse
-- across row evaluations. Per Supabase RLS performance guidance —
-- https://supabase.com/docs/guides/database/postgres/row-level-security#wrap-functions-with-select
--
-- The functional behavior is identical to 0002; this only changes the policy
-- plan for large row sets.

drop policy if exists "own favorite stops select" on user_favorite_stops;
drop policy if exists "own favorite stops insert" on user_favorite_stops;
drop policy if exists "own favorite stops delete" on user_favorite_stops;

create policy "own favorite stops select" on user_favorite_stops
  for select to authenticated using ((select auth.jwt() ->> 'sub') = user_id);
create policy "own favorite stops insert" on user_favorite_stops
  for insert to authenticated with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "own favorite stops delete" on user_favorite_stops
  for delete to authenticated using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own favorite routes select" on user_favorite_routes;
drop policy if exists "own favorite routes insert" on user_favorite_routes;
drop policy if exists "own favorite routes delete" on user_favorite_routes;

create policy "own favorite routes select" on user_favorite_routes
  for select to authenticated using ((select auth.jwt() ->> 'sub') = user_id);
create policy "own favorite routes insert" on user_favorite_routes
  for insert to authenticated with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "own favorite routes delete" on user_favorite_routes
  for delete to authenticated using ((select auth.jwt() ->> 'sub') = user_id);
