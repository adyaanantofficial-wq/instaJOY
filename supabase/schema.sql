-- Supabase PostgreSQL schema for instaJOY
-- Main tables: profiles, posts, likes, comments, follows, notifications
-- Guest mode is read-only. Authenticated users can modify only their own data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  fcm_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles (username);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  candidate_username text;
  display_name_value text;
begin
  requested_username :=
    lower(regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'),
      '[^a-z0-9._]+',
      '',
      'g'
    ));

  if requested_username is null or length(requested_username) < 3 then
    requested_username := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 8);
  end if;

  candidate_username := left(requested_username, 24);

  while exists (select 1 from public.profiles where username = candidate_username) loop
    candidate_username := left(requested_username, 20) || '_' || substring(replace(new.id::text, '-', '') from 1 for 4);
  end loop;

  display_name_value := coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username', candidate_username);

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate_username, display_name_value)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Profiles public read" on public.profiles;
create policy "Profiles public read" on public.profiles
  for select
  using (true);

drop policy if exists "Profiles self insert" on public.profiles;
create policy "Profiles self insert" on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles self update" on public.profiles;
create policy "Profiles self update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Profiles self delete" on public.profiles;
create policy "Profiles self delete" on public.profiles
  for delete
  using (auth.uid() = id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('text', 'image', 'reel')),
  category text,
  caption text,
  content text,
  image_url text,
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_posts_user_id on public.posts (user_id);

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute procedure public.set_updated_at();

alter table public.posts enable row level security;

drop policy if exists "Posts public read" on public.posts;
create policy "Posts public read" on public.posts
  for select
  using (true);

drop policy if exists "Posts insert own" on public.posts;
create policy "Posts insert own" on public.posts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Posts update own" on public.posts;
create policy "Posts update own" on public.posts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Posts delete own" on public.posts;
create policy "Posts delete own" on public.posts
  for delete
  using (auth.uid() = user_id);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists idx_likes_post_id on public.likes (post_id);
create index if not exists idx_likes_user_id on public.likes (user_id);

alter table public.likes enable row level security;

drop policy if exists "Likes public read" on public.likes;
create policy "Likes public read" on public.likes
  for select
  using (true);

drop policy if exists "Likes insert own" on public.likes;
create policy "Likes insert own" on public.likes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Likes delete own" on public.likes;
create policy "Likes delete own" on public.likes
  for delete
  using (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_post_id on public.comments (post_id);
create index if not exists idx_comments_user_id on public.comments (user_id);

alter table public.comments enable row level security;

drop policy if exists "Comments public read" on public.comments;
create policy "Comments public read" on public.comments
  for select
  using (true);

drop policy if exists "Comments insert own" on public.comments;
create policy "Comments insert own" on public.comments
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Comments delete own" on public.comments;
create policy "Comments delete own" on public.comments
  for delete
  using (auth.uid() = user_id);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id)
);

create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "Follows public read" on public.follows;
create policy "Follows public read" on public.follows
  for select
  using (true);

drop policy if exists "Follows insert own" on public.follows;
create policy "Follows insert own" on public.follows
  for insert
  with check (auth.uid() = follower_id);

drop policy if exists "Follows delete own" on public.follows;
create policy "Follows delete own" on public.follows
  for delete
  using (auth.uid() = follower_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null,
  entity_type text not null,
  entity_id uuid,
  message text not null,
  read boolean not null default false,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_notifications_read on public.notifications (user_id, read);

alter table public.notifications enable row level security;

drop policy if exists "Notifications owner read" on public.notifications;
create policy "Notifications owner read" on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "Notifications owner update" on public.notifications;
create policy "Notifications owner update" on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Notifications insert service" on public.notifications;
create policy "Notifications insert service" on public.notifications
  for insert
  with check (auth.role() = 'service_role');

drop policy if exists "Notifications delete own" on public.notifications;
create policy "Notifications delete own" on public.notifications
  for delete
  using (auth.uid() = user_id);

create or replace view public.post_feed as
select
  posts.id,
  posts.user_id,
  posts.type,
  posts.category,
  posts.caption,
  posts.content,
  posts.image_url,
  posts.media_url,
  posts.created_at,
  profiles.username,
  profiles.avatar_url
from public.posts
join public.profiles on posts.user_id = profiles.id;

grant select on public.post_feed to anon;
grant select on public.profiles, public.posts, public.likes, public.comments, public.follows to anon;
