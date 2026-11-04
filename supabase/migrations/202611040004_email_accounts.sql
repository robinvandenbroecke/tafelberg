-- Nieuwe accounts vragen geen gebruikersnaam. Bestaande APK's en profielen blijven werken.
-- De interne naam is uitsluitend een technische sleutel en wordt nooit als login gevraagd.
create or replace function tafelberg_private.register_username() returns trigger
language plpgsql security definer set search_path='' as $$
declare u text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if u is null or u = '' then u := 'u' || substr(replace(new.id::text,'-',''),1,28); end if;
  if u !~ '^[a-z0-9][a-z0-9_-]{2,29}$' or u in ('constructor','prototype') then raise exception 'Invalid username'; end if;
  insert into tafelberg_private.usernames(user_id,username) values(new.id,u);
  return new;
end $$;
