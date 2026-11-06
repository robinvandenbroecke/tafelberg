-- Beheersingsmijlpalen en verdiende kleding mogen niet verdwijnen wanneer een
-- ander toestel meer sterren heeft. Oudere clients blijven dezelfde RPC gebruiken.
create function tafelberg_private.merge_rewards(p jsonb,q jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare a jsonb:=p->'stats'; b jsonb:=q->'stats'; best numeric; owned jsonb; badges jsonb;
begin
 if coalesce(a->>'rewardsVersion','')<>'1' and coalesce(b->>'rewardsVersion','')<>'1' then return p; end if;
 best=greatest(case when jsonb_typeof(a->'masteredBest')='number' then least(100,greatest(0,floor((a->>'masteredBest')::numeric))) else 0 end,
               case when jsonb_typeof(b->'masteredBest')='number' then least(100,greatest(0,floor((b->>'masteredBest')::numeric))) else 0 end);
 select coalesce(jsonb_object_agg(key,true),'{}'::jsonb) into owned from (
  select key from jsonb_each(case when jsonb_typeof(a->'wardrobe')='object' then a->'wardrobe' else '{}'::jsonb end) where value='true'::jsonb
  union select key from jsonb_each(case when jsonb_typeof(b->'wardrobe')='object' then b->'wardrobe' else '{}'::jsonb end) where value='true'::jsonb
 ) x;
 badges=coalesce(b->'badges','{}'::jsonb)||coalesce(a->'badges','{}'::jsonb);
 return jsonb_set(p,'{stats}',a||jsonb_build_object('masteredBest',best,'wardrobe',owned,'rewardsVersion',1,'badges',badges));
end $$;
revoke all on function tafelberg_private.merge_rewards(jsonb,jsonb) from public,anon,authenticated;

create or replace function tafelberg_private.combine_progress(a jsonb,b jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare p jsonb; f jsonb; k text; v jsonb;
begin
 p=case when tafelberg_private.rank(a)>tafelberg_private.rank(b) then a else b end;
 f=coalesce(p->'facts','{}'::jsonb);
 for k,v in select * from jsonb_each(case when p=a then b->'facts' else a->'facts' end) loop
  if not (f ? k) or coalesce((v->>'last')::numeric,0)>coalesce((f->k->>'last')::numeric,0) then f=jsonb_set(f,array[k],v); end if;
 end loop;
 return tafelberg_private.merge_rewards(jsonb_set(p,'{facts}',f),case when p=a then b else a end);
end $$;

create or replace function tafelberg_private.tb_sync(candidate jsonb default null,base_revision bigint default 0,requested_profile text default null,create_new boolean default false,request_key text default null,base_profile jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rec public.tafelberg_progress; p jsonb; username text; pid text; k text; v jsonb; prefs jsonb; wear jsonb; is_alias boolean:=false;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select n.username into username from tafelberg_private.usernames n where n.user_id=uid;
 if username is null then raise exception 'Account unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if candidate is not null and (not tafelberg_private.valid_profile(candidate) or tafelberg_private.climber_name(candidate)='') then raise exception 'Invalid profile' using errcode='22023'; end if;
 if base_profile is not null and not tafelberg_private.valid_profile(base_profile) then raise exception 'Invalid base profile' using errcode='22023'; end if;
 perform tafelberg_private.merge_climbers();
 if create_new then
  if request_key is null or request_key !~ '^c[a-f0-9]{32,128}$' then raise exception 'Invalid creation key' using errcode='22023'; end if;
  select * into rec from public.tafelberg_progress where owner_id=uid and creation_key=request_key;
  if rec.owner_id is null then
   if candidate is null then candidate=jsonb_build_object('name','Klimmer','color',0,'created',0,'settings',jsonb_build_object('tables',jsonb_build_array(2,5,10),'len',12),'stats','{}'::jsonb,'facts','{}'::jsonb); end if;
   if (select count(*) from public.tafelberg_progress where owner_id=uid and merged_into is null)>=50 and not exists(
    select 1 from public.tafelberg_progress where owner_id=uid and merged_into is null and tafelberg_private.climber_name(profile)=tafelberg_private.climber_name(candidate)) then raise exception 'Maximum 50 climbers'; end if;
   pid='p'||replace(gen_random_uuid()::text,'-','');
   p=candidate||jsonb_build_object('id',pid,'created',coalesce(candidate->'created','0'::jsonb));
   insert into public.tafelberg_progress(owner_id,profile_id,profile,creation_key) values(uid,pid,p,request_key) returning * into rec;
   -- Expliciet toevoegen: de meegebrachte voorkeuren gelden ook als de accountversie verder staat.
   update public.tafelberg_progress set profile=jsonb_set(jsonb_set(profile,'{settings}',(profile->'settings')||(candidate->'settings')),'{stats,mo}',coalesce(profile->'stats'->'mo','{}'::jsonb)||coalesce(candidate->'stats'->'mo','{}'::jsonb)),revision=revision+1,updated_at=now()
    where owner_id=uid and merged_into is null and profile_id<>pid and tafelberg_private.climber_name(profile)=tafelberg_private.climber_name(candidate) and ((profile->'settings') is distinct from (profile->'settings')||(candidate->'settings') or coalesce(profile->'stats'->'mo','{}'::jsonb) is distinct from coalesce(profile->'stats'->'mo','{}'::jsonb)||coalesce(candidate->'stats'->'mo','{}'::jsonb));
  end if;
 else
  select * into rec from public.tafelberg_progress where owner_id=uid and profile_id=requested_profile for update;
  if rec.owner_id is null then raise exception 'Climber unavailable' using errcode='42501'; end if;
  is_alias=rec.merged_into is not null;
  if is_alias then select * into rec from public.tafelberg_progress where owner_id=uid and profile_id=rec.merged_into for update; end if;
  if candidate is not null then
   p=case when tafelberg_private.rank(candidate)>tafelberg_private.rank(rec.profile) or
    (tafelberg_private.rank(candidate)=tafelberg_private.rank(rec.profile) and base_revision=rec.revision and not is_alias)
    then candidate else rec.profile end;
   prefs=rec.profile->'settings';
   for k,v in select * from jsonb_each(candidate->'settings') loop
    if (base_profile is not null and case when k in ('tables','excludedTables') then jsonb_build_array(candidate->'settings'->'tables',candidate->'settings'->'excludedTables') is distinct from jsonb_build_array(base_profile->'settings'->'tables',base_profile->'settings'->'excludedTables') else v is distinct from base_profile->'settings'->k end and
       (base_revision=rec.revision or case when k in ('tables','excludedTables') then jsonb_build_array(rec.profile->'settings'->'tables',rec.profile->'settings'->'excludedTables') is not distinct from jsonb_build_array(base_profile->'settings'->'tables',base_profile->'settings'->'excludedTables') else prefs->k is not distinct from base_profile->'settings'->k end)) or
       (base_profile is null and base_revision=rec.revision and not is_alias) then prefs=jsonb_set(prefs,array[k],v); end if;
   end loop;
   -- Naam en kleur volgen dezelfde wijzigingsregel als instellingen, niet de score.
   for k in select unnest(array['name','color']) loop
    if (base_profile is not null and candidate->k is distinct from base_profile->k and
      (base_revision=rec.revision or rec.profile->k is not distinct from base_profile->k)) or
      (base_profile is null and base_revision=rec.revision and not is_alias and tafelberg_private.rank(candidate)>=tafelberg_private.rank(rec.profile)) then p=jsonb_set(p,array[k],candidate->k);
    else p=jsonb_set(p,array[k],rec.profile->k); end if;
   end loop;
   wear=coalesce(rec.profile->'stats'->'mo','{}'::jsonb);
   for k,v in select * from jsonb_each(coalesce(candidate->'stats'->'mo','{}'::jsonb)) loop
    if (base_profile is not null and v is distinct from base_profile->'stats'->'mo'->k and
       (base_revision=rec.revision or wear->k is not distinct from base_profile->'stats'->'mo'->k)) or
       (base_profile is null and base_revision=rec.revision and not is_alias) then wear=jsonb_set(wear,array[k],v); end if;
   end loop;
   if wear<>'{}'::jsonb or p->'stats' ? 'mo' then p=jsonb_set(p,'{stats,mo}',wear); end if;
   p=p||jsonb_build_object('id',rec.profile_id,'settings',prefs);
   p=tafelberg_private.merge_rewards(tafelberg_private.merge_rewards(p,rec.profile),candidate);
   if p<>rec.profile then update public.tafelberg_progress set profile=p,revision=revision+1,updated_at=now() where owner_id=uid and profile_id=rec.profile_id returning * into rec; end if;
  end if;
 end if;
 pid=coalesce(rec.merged_into,rec.profile_id);
 perform tafelberg_private.merge_climbers();
 select coalesce(merged_into,profile_id) into pid from public.tafelberg_progress where owner_id=uid and profile_id=pid;
 return jsonb_build_object('ok',true,'account',uid,'username',username)||tafelberg_private.profile_result(pid);
end $$;
