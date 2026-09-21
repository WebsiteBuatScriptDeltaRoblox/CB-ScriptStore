-- CB ScriptStore: Followers / Following
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows(following_id);
create index if not exists follows_follower_idx on public.follows(follower_id);

alter table public.follows enable row level security;

drop policy if exists "authenticated can read follows" on public.follows;
create policy "authenticated can read follows"
on public.follows for select to authenticated using (true);

drop policy if exists "users can follow" on public.follows;
create policy "users can follow"
on public.follows for insert to authenticated
with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "users can unfollow" on public.follows;
create policy "users can unfollow"
on public.follows for delete to authenticated
using (auth.uid() = follower_id);

-- Helper for profile lookup if the profiles row is missing its username.
create or replace function public.get_public_profile(p_user_id uuid)
returns table(id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    coalesce(nullif(p.username,''), u.raw_user_meta_data->>'username', split_part(u.email,'@',1)) as username,
    coalesce(nullif(p.avatar_url,''), 'profil1.png') as avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id
  limit 1;
$$;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- Repair existing profile usernames from auth metadata where they are missing.
update public.profiles p
set username = u.raw_user_meta_data->>'username'
from auth.users u
where p.id = u.id
  and (p.username is null or btrim(p.username) = '')
  and nullif(u.raw_user_meta_data->>'username','') is not null;


-- Public user search. Keeps auth.users private while exposing only safe profile fields.
drop function if exists public.search_public_users(text, integer);
create or replace function public.search_public_users(p_query text, p_limit integer default 30)
returns table(id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    coalesce(nullif(p.username,''), u.raw_user_meta_data->>'username', split_part(u.email,'@',1)) as username,
    coalesce(nullif(p.avatar_url,''), 'profil1.png') as avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(coalesce(nullif(p.username,''), u.raw_user_meta_data->>'username', split_part(u.email,'@',1))) like '%' || lower(trim(p_query)) || '%'
  order by lower(coalesce(nullif(p.username,''), u.raw_user_meta_data->>'username', split_part(u.email,'@',1)))
  limit greatest(1, least(coalesce(p_limit,30), 50));
$$;
grant execute on function public.search_public_users(text, integer) to authenticated;
