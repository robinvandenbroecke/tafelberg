-- Alleen een invoker-wrapper in de publieke API; bevoegd schrijven blijft privé.
alter function public.tb_sync(jsonb,bigint) set schema tafelberg_private;
grant usage on schema tafelberg_private to authenticated;
grant execute on function tafelberg_private.tb_sync(jsonb,bigint) to authenticated;
create function public.tb_sync(candidate jsonb default null, base_revision bigint default 0) returns jsonb
language sql security invoker set search_path = '' as $$
  select tafelberg_private.tb_sync(candidate,base_revision);
$$;
revoke all on function public.tb_sync(jsonb,bigint) from public, anon;
grant execute on function public.tb_sync(jsonb,bigint) to authenticated;
-- Geen rechtstreekse rijen voor gewone gebruikers; service/owner blijven bevoegd.
create policy internal_only on tafelberg_private.usernames for all to anon,authenticated using(false) with check(false);
create policy internal_only on tafelberg_private.limits for all to anon,authenticated using(false) with check(false);
