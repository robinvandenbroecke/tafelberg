-- Gebruikersnamen staan privé; Supabase Auth beheert e-mail en wachtwoorden.
create schema if not exists tafelberg_private;
revoke all on schema tafelberg_private from public, anon, authenticated;
create table tafelberg_private.usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$' and username not in ('constructor','prototype'))
);
create table tafelberg_private.limits (
  bucket text primary key,
  started timestamptz not null default now(),
  attempts integer not null default 1
);
create table public.tafelberg_progress (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.tafelberg_progress enable row level security;
alter table tafelberg_private.usernames enable row level security;
alter table tafelberg_private.limits enable row level security;
create index on tafelberg_private.limits(started);
revoke all on public.tafelberg_progress from public, anon, authenticated;
grant select on public.tafelberg_progress to authenticated;
create policy own_progress on public.tafelberg_progress for select to authenticated using (owner_id = (select auth.uid()));

create function tafelberg_private.register_username() returns trigger language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if u is null or u !~ '^[a-z0-9][a-z0-9_-]{2,29}$' then raise exception 'Invalid username'; end if;
  insert into tafelberg_private.usernames(user_id,username) values(new.id,u);
  return new;
end $$;
create trigger tafelberg_username after insert on auth.users for each row execute function tafelberg_private.register_username();

create function public.tb_lookup_username(wanted text) returns text language sql security definer set search_path = '' as $$
  select u.email::text from auth.users u join tafelberg_private.usernames n on n.user_id=u.id where n.username=lower(trim(wanted));
$$;
revoke all on function public.tb_lookup_username(text) from public, anon, authenticated;
grant execute on function public.tb_lookup_username(text) to service_role;

create function public.tb_rate_limit(wanted text, max_attempts integer, seconds integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if length(wanted)>128 or max_attempts<1 or seconds<1 then return false; end if;
  insert into tafelberg_private.limits(bucket) values(wanted)
  on conflict(bucket) do update set
    attempts=case when tafelberg_private.limits.started < now()-make_interval(secs=>seconds) then 1 else tafelberg_private.limits.attempts+1 end,
    started=case when tafelberg_private.limits.started < now()-make_interval(secs=>seconds) then now() else tafelberg_private.limits.started end
  returning attempts into n;
  -- Alleen gehashte sleutels, geen e-mail of IP-adres. Beperk ook de bewaartermijn.
  delete from tafelberg_private.limits where started < now()-interval '2 days';
  return n<=max_attempts;
end $$;
revoke all on function public.tb_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.tb_rate_limit(text,integer,integer) to service_role;

create function tafelberg_private.valid_profile(p jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; x jsonb;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then return false; end if;
  if jsonb_typeof(p->'name') is distinct from 'string' or length(p->>'name') not between 1 and 20
    or jsonb_typeof(p->'color') is distinct from 'number' or (p->>'color')::numeric not between 0 and 7 or (p->>'color')::numeric%1<>0
    or jsonb_typeof(p->'settings') is distinct from 'object' or jsonb_typeof(p->'stats') is distinct from 'object'
    or jsonb_typeof(p->'facts') is distinct from 'object' then return false; end if;
  if jsonb_typeof(p->'settings'->'tables') is distinct from 'array' or jsonb_array_length(p->'settings'->'tables') not between 1 and 10
    or jsonb_typeof(p->'settings'->'len') is distinct from 'number'
    or p->'settings'->>'len' not in ('8','12','16','20') then return false; end if;
  for x in select value from jsonb_array_elements(p->'settings'->'tables') loop
    if jsonb_typeof(x)<>'number' or x::text::numeric not between 1 and 10 or x::text::numeric%1<>0 then return false; end if;
  end loop;
  if p->'settings' ? 'excludedTables' then
    if jsonb_typeof(p->'settings'->'excludedTables')<>'array' or jsonb_array_length(p->'settings'->'excludedTables')>10 then return false; end if;
    for x in select value from jsonb_array_elements(p->'settings'->'excludedTables') loop
      if jsonb_typeof(x)<>'number' or x::text::numeric not between 1 and 10 or x::text::numeric%1<>0 then return false; end if;
    end loop;
  end if;
  for k,v in select * from jsonb_each(p->'settings') loop
    if k in ('div','sound','vibrate','auto','tempo','voice') and jsonb_typeof(v)<>'boolean' then return false; end if;
    if k='pace' and v#>>'{}' not in ('auto','rustig','gewoon','snel') then return false; end if;
    if k='goal' and v#>>'{}' not in ('klein','gewoon','groot') then return false; end if;
  end loop;
  for k,v in select * from jsonb_each(p->'stats') loop
    if k in ('ladderUp','ladderDown','badges','lm','race','gold','mo') and jsonb_typeof(v)<>'object' then return false; end if;
    if k in ('hist','hutDays','played') and jsonb_typeof(v)<>'array' then return false; end if;
    if k='lastDay' and jsonb_typeof(v)<>'string' then return false; end if;
    if k='today' and jsonb_typeof(v) not in ('null','object') then return false; end if;
    if k in ('stars','rounds','days','streak','bestStreak','bestCombo','bestBolts','perfect','helpOk','divOk','sprints','sprintBest','huts','goals','chests','records','bestBoltRun','races') then
      if jsonb_typeof(v)<>'number' or v::text::numeric<0 or v::text::numeric>9007199254740991 then return false; end if;
    end if;
  end loop;
  for k,v in select * from jsonb_each(p->'facts') loop
    if k !~ '^(10|[1-9])x(10|[1-9])$' or jsonb_typeof(v)<>'object' then return false; end if;
    for x in select value from jsonb_each(v) loop
      if jsonb_typeof(x)<>'number' or x::text::numeric<0 or x::text::numeric>9007199254740991 then return false; end if;
    end loop;
    if jsonb_typeof(v->'b') is distinct from 'number' or (v->>'b')::numeric not between 0 and 5 or (v->>'b')::numeric%1<>0 then return false; end if;
  end loop;
  -- Sleutels die de ES5-client niet veilig kan verwerken nooit opslaan.
  if p::text ~ '"(__proto__|constructor|prototype|hasOwnProperty)"[[:space:]]*:' then return false; end if;
  return true;
exception when others then return false;
end $$;

create function tafelberg_private.rank(p jsonb) returns numeric[] language sql immutable set search_path = '' as $$
 select array[coalesce((p->'stats'->>'stars')::numeric,0),
   coalesce((p->'stats'->>'rounds')::numeric,0)+coalesce((p->'stats'->>'races')::numeric,0)+coalesce((p->'stats'->>'sprints')::numeric,0),
   coalesce((select sum(least(5,(value->>'b')::numeric)) from jsonb_each(p->'facts')),0)];
$$;

-- Alleen deze transactie kan schrijven. De eigenaar komt uitsluitend uit de geverifieerde JWT.
create function public.tb_sync(candidate jsonb default null, base_revision bigint default 0) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); row public.tafelberg_progress; p jsonb; username text; localrank numeric[]; remoterank numeric[];
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select n.username into username from tafelberg_private.usernames n where n.user_id=uid;
  if username is null then raise exception 'Account unavailable'; end if;
  -- Serializeert ook de eerste twee gelijktijdige uploads voor hetzelfde account.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into row from public.tafelberg_progress where owner_id=uid for update;
  if candidate is not null then
    if not tafelberg_private.valid_profile(candidate) then raise exception 'Invalid profile' using errcode='22023'; end if;
    p=jsonb_build_object('id','p'||replace(uid::text,'-',''),'name',candidate->'name','color',candidate->'color',
      'created',coalesce(candidate->'created','0'::jsonb),'settings',candidate->'settings','stats',candidate->'stats','facts',candidate->'facts');
  end if;
  if row.owner_id is null then
    if p is null then
      p=jsonb_build_object('id','p'||replace(uid::text,'-',''),'name',left(username,20),'color',0,'created',floor(extract(epoch from now())*1000),'settings',jsonb_build_object('tables',jsonb_build_array(2,5,10),'len',12),'stats','{}'::jsonb,'facts','{}'::jsonb);
    end if;
    insert into public.tafelberg_progress(owner_id,profile) values(uid,p) returning * into row;
  elsif p is not null and p<>row.profile then
    localrank=tafelberg_private.rank(p); remoterank=tafelberg_private.rank(row.profile);
    if localrank>remoterank or (localrank=remoterank and base_revision=row.revision) then
      update public.tafelberg_progress set profile=p,revision=revision+1,updated_at=now() where owner_id=uid returning * into row;
    end if;
  end if;
  return jsonb_build_object('ok',true,'user','p'||replace(uid::text,'-',''),'username',username,'profile',row.profile,'revision',row.revision);
end $$;
revoke all on function public.tb_sync(jsonb,bigint) from public, anon;
grant execute on function public.tb_sync(jsonb,bigint) to authenticated;
revoke all on all tables in schema tafelberg_private from public, anon, authenticated;
revoke all on all functions in schema tafelberg_private from public, anon, authenticated;
