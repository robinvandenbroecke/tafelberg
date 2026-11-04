-- Een Auth-account is een gezin; iedere klimmer heeft een eigen profiel en revisie.
alter table public.tafelberg_progress add column profile_id text;
alter table public.tafelberg_progress add column creation_key text;
alter table public.tafelberg_progress add unique(owner_id,creation_key);
update public.tafelberg_progress set profile_id=profile->>'id';
alter table public.tafelberg_progress alter column profile_id set not null;
alter table public.tafelberg_progress drop constraint tafelberg_progress_pkey;
alter table public.tafelberg_progress add primary key(profile_id);
alter table public.tafelberg_progress add constraint valid_profile_id check(profile_id ~ '^p[a-zA-Z0-9]{1,100}$');
create index tafelberg_progress_owner_idx on public.tafelberg_progress(owner_id);
drop function public.tb_sync(jsonb,bigint);
drop function tafelberg_private.tb_sync(jsonb,bigint);

create function tafelberg_private.tb_list_profiles() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); username text; profiles jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select n.username into username from tafelberg_private.usernames n where n.user_id=uid;
  if username is null then raise exception 'Account unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user',p.profile_id,'profile',p.profile,'revision',p.revision) order by p.profile_id),'[]'::jsonb)
    into profiles from public.tafelberg_progress p where p.owner_id=uid;
  return jsonb_build_object('ok',true,'account',uid,'username',username,'profiles',profiles);
end $$;

create function tafelberg_private.tb_sync(candidate jsonb default null,base_revision bigint default 0,requested_profile text default null,create_new boolean default false,request_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rec public.tafelberg_progress; p jsonb; username text; pid text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select n.username into username from tafelberg_private.usernames n where n.user_id=uid;
  if username is null then raise exception 'Account unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if candidate is not null and not tafelberg_private.valid_profile(candidate) then raise exception 'Invalid profile' using errcode='22023'; end if;
  if create_new then
    if request_key is null or request_key !~ '^c[a-f0-9]{32,128}$' then raise exception 'Invalid creation key' using errcode='22023'; end if;
    select * into rec from public.tafelberg_progress where owner_id=uid and creation_key=request_key;
    if rec.owner_id is not null then
      return jsonb_build_object('ok',true,'account',uid,'username',username,'user',rec.profile_id,'profile',rec.profile,'revision',rec.revision);
    end if;
    if (select count(*) from public.tafelberg_progress where owner_id=uid)>=50 then raise exception 'Maximum 50 climbers'; end if;
    pid='p'||replace(gen_random_uuid()::text,'-','');
    if candidate is null then
      candidate=jsonb_build_object('name','Klimmer','color',0,'created',floor(extract(epoch from now())*1000),'settings',jsonb_build_object('tables',jsonb_build_array(2,5,10),'len',12),'stats','{}'::jsonb,'facts','{}'::jsonb);
    end if;
    p=jsonb_build_object('id',pid,'name',candidate->'name','color',candidate->'color','created',coalesce(candidate->'created','0'::jsonb),'settings',candidate->'settings','stats',candidate->'stats','facts',candidate->'facts');
    insert into public.tafelberg_progress(owner_id,profile_id,profile,creation_key) values(uid,pid,p,request_key) returning * into rec;
  else
    select * into rec from public.tafelberg_progress where owner_id=uid and profile_id=requested_profile for update;
    if rec.owner_id is null then raise exception 'Climber unavailable' using errcode='42501'; end if;
    pid=rec.profile_id;
    if candidate is not null then
      p=jsonb_build_object('id',pid,'name',candidate->'name','color',candidate->'color','created',coalesce(candidate->'created','0'::jsonb),'settings',candidate->'settings','stats',candidate->'stats','facts',candidate->'facts');
      if p<>rec.profile and (tafelberg_private.rank(p)>tafelberg_private.rank(rec.profile) or
        (tafelberg_private.rank(p)=tafelberg_private.rank(rec.profile) and base_revision=rec.revision)) then
        update public.tafelberg_progress set profile=p,revision=revision+1,updated_at=now() where owner_id=uid and profile_id=pid returning * into rec;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok',true,'account',uid,'username',username,'user',pid,'profile',rec.profile,'revision',rec.revision);
end $$;

create function public.tb_list_profiles() returns jsonb language sql security invoker set search_path='' as $$select tafelberg_private.tb_list_profiles()$$;
create function public.tb_sync(candidate jsonb default null,base_revision bigint default 0,requested_profile text default null,create_new boolean default false,request_key text default null)
returns jsonb language sql security invoker set search_path='' as $$select tafelberg_private.tb_sync(candidate,base_revision,requested_profile,create_new,request_key)$$;
revoke all on function public.tb_list_profiles(),public.tb_sync(jsonb,bigint,text,boolean,text),tafelberg_private.tb_list_profiles(),tafelberg_private.tb_sync(jsonb,bigint,text,boolean,text) from public,anon;
grant execute on function public.tb_list_profiles(),public.tb_sync(jsonb,bigint,text,boolean,text),tafelberg_private.tb_list_profiles(),tafelberg_private.tb_sync(jsonb,bigint,text,boolean,text) to authenticated;
