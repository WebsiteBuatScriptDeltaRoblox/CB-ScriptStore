-- CB ScriptStore profile repair. Followers/following/search are intentionally not used.
alter table public.profiles add column if not exists avatar_url text default 'profil1.png';

alter table public.profiles enable row level security;
drop policy if exists "public can read profiles" on public.profiles;
create policy "public can read profiles" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "user can insert own profile" on public.profiles;
create policy "user can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "user can update own profile" on public.profiles;
create policy "user can update own profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

insert into public.profiles (id, username, avatar_url)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'username',''), split_part(u.email,'@',1)), 'profil1.png'
from auth.users u
where not exists (select 1 from public.profiles p where p.id=u.id);

update public.profiles p
set username=coalesce(nullif(u.raw_user_meta_data->>'username',''), p.username, split_part(u.email,'@',1))
from auth.users u
where p.id=u.id and (p.username is null or btrim(p.username)='');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, username, avatar_url)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)), 'profil1.png')
  on conflict (id) do update set username=coalesce(excluded.username, public.profiles.username);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
