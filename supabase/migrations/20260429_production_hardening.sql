-- Supabase PostgreSQL schema for instaJOY
-- This schema is designed for the shipped static frontend in index.html / frontend/js/supabase-app.js.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

grant usage on schema public to anon;
grant usage on schema public to authenticated;

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
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  fcm_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format_check check (
    username = lower(username)
    and username ~ '^[a-z0-9._]{3,30}$'
  ),
  constraint profiles_display_name_length_check check (char_length(display_name) between 1 and 50),
  constraint profiles_bio_length_check check (char_length(bio) <= 160)
);

create index if not exists idx_profiles_username on public.profiles (username);
create index if not exists idx_profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  candidate_username text;
  display_name_value text;
begin
  requested_username := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'),
      '[^a-z0-9._]+',
      '',
      'g'
    )
  );

  if requested_username is null or char_length(requested_username) < 3 then
    requested_username := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 8);
  end if;

  candidate_username := left(requested_username, 30);

  while exists (
    select 1
    from public.profiles
    where username = candidate_username
  ) loop
    candidate_username := left(requested_username, 24) || '_' || substring(replace(new.id::text, '-', '') from 1 for 5);
  end loop;

  display_name_value := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    candidate_username
  );

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate_username, left(display_name_value, 50))
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;
revoke execute on function private.handle_new_user() from anon;
revoke execute on function private.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

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
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Profiles self update" on public.profiles;
create policy "Profiles self update" on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Profiles self delete" on public.profiles;
create policy "Profiles self delete" on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  category text,
  caption text,
  content text,
  image_url text,
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_type_check check (type in ('text', 'image', 'reel')),
  constraint posts_category_check check (
    category is null
    or category in ('jokes', 'ideas', 'fun-knowledge')
  ),
  constraint posts_caption_length_check check (caption is null or char_length(caption) <= 500),
  constraint posts_content_length_check check (content is null or char_length(content) <= 500),
  constraint posts_text_requires_content_check check (
    type <> 'text'
    or char_length(trim(coalesce(content, caption, ''))) > 0
  ),
  constraint posts_image_requires_media_check check (
    type <> 'image'
    or image_url is not null
  ),
  constraint posts_reel_requires_media_check check (
    type <> 'reel'
    or media_url is not null
  )
);

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_posts_user_id on public.posts (user_id, created_at desc);
create index if not exists idx_posts_type_created_at on public.posts (type, created_at desc);
create index if not exists idx_posts_search_trgm on public.posts using gin ((coalesce(caption, '') || ' ' || coalesce(content, '')) gin_trgm_ops);

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
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Posts update own" on public.posts;
create policy "Posts update own" on public.posts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Posts delete own" on public.posts;
create policy "Posts delete own" on public.posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists idx_likes_post_id on public.likes (post_id, created_at desc);
create index if not exists idx_likes_user_id on public.likes (user_id, created_at desc);

alter table public.likes enable row level security;

drop policy if exists "Likes public read" on public.likes;
create policy "Likes public read" on public.likes
  for select
  using (true);

drop policy if exists "Likes insert own" on public.likes;
create policy "Likes insert own" on public.likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Likes delete own" on public.likes;
create policy "Likes delete own" on public.likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_length_check check (char_length(trim(body)) between 1 and 280)
);

create index if not exists idx_comments_post_id on public.comments (post_id, created_at asc);
create index if not exists idx_comments_user_id on public.comments (user_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "Comments public read" on public.comments;
create policy "Comments public read" on public.comments
  for select
  using (true);

drop policy if exists "Comments insert own" on public.comments;
create policy "Comments insert own" on public.comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Comments delete own" on public.comments;
create policy "Comments delete own" on public.comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  constraint follows_no_self_follow_check check (follower_id <> following_id)
);

create index if not exists idx_follows_follower on public.follows (follower_id, created_at desc);
create index if not exists idx_follows_following on public.follows (following_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "Follows public read" on public.follows;
create policy "Follows public read" on public.follows
  for select
  using (true);

drop policy if exists "Follows insert own" on public.follows;
create policy "Follows insert own" on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "Follows delete own" on public.follows;
create policy "Follows delete own" on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_body_length_check check (char_length(trim(body)) between 1 and 1000),
  constraint messages_no_self_send_check check (sender_id <> receiver_id)
);

create index if not exists idx_messages_sender_created_at on public.messages (sender_id, created_at desc);
create index if not exists idx_messages_receiver_created_at on public.messages (receiver_id, created_at desc);
create index if not exists idx_messages_pair_created_at on public.messages (sender_id, receiver_id, created_at asc);

alter table public.messages enable row level security;

drop policy if exists "Messages participants read" on public.messages;
create policy "Messages participants read" on public.messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Messages sender insert" on public.messages;
create policy "Messages sender insert" on public.messages
  for insert
  to authenticated
  with check (auth.uid() = sender_id and sender_id <> receiver_id);

drop policy if exists "Messages receiver mark read" on public.messages;
create policy "Messages receiver mark read" on public.messages
  for update
  to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  entity_type text not null,
  entity_id uuid,
  message text not null,
  read boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('like', 'comment', 'follow', 'message', 'chain_joined', 'chain_completed', 'capsule', 'capsule_unlocked', 'reaction_received'))
);

create index if not exists idx_notifications_user_created_at on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_read on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Notifications owner read" on public.notifications;
create policy "Notifications owner read" on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Notifications owner update" on public.notifications;
create policy "Notifications owner update" on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Notifications owner delete" on public.notifications;
create policy "Notifications owner delete" on public.notifications
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function private.create_notification(
  recipient_id uuid,
  actor_user_id uuid,
  notification_type text,
  notification_entity_type text,
  notification_entity_id uuid,
  notification_message text,
  notification_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient_id is null or actor_user_id is null or recipient_id = actor_user_id then
    return;
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message,
    meta
  )
  values (
    recipient_id,
    actor_user_id,
    notification_type,
    notification_entity_type,
    notification_entity_id,
    notification_message,
    coalesce(notification_meta, '{}'::jsonb)
  );
end;
$$;

revoke execute on function private.create_notification(uuid, uuid, text, text, uuid, text, jsonb) from public;
revoke execute on function private.create_notification(uuid, uuid, text, text, uuid, text, jsonb) from anon;
revoke execute on function private.create_notification(uuid, uuid, text, text, uuid, text, jsonb) from authenticated;

create or replace function private.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner_id uuid;
begin
  select user_id
  into post_owner_id
  from public.posts
  where id = new.post_id;

  perform private.create_notification(
    post_owner_id,
    new.user_id,
    'like',
    'post',
    new.post_id,
    'liked your post'
  );

  return new;
end;
$$;

create or replace function private.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner_id uuid;
begin
  select user_id
  into post_owner_id
  from public.posts
  where id = new.post_id;

  perform private.create_notification(
    post_owner_id,
    new.user_id,
    'comment',
    'post',
    new.post_id,
    'commented on your post'
  );

  return new;
end;
$$;

create or replace function private.notify_new_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_notification(
    new.following_id,
    new.follower_id,
    'follow',
    'profile',
    new.following_id,
    'started following you'
  );

  return new;
end;
$$;

create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_notification(
    new.receiver_id,
    new.sender_id,
    'message',
    'message',
    new.id,
    'sent you a message'
  );

  return new;
end;
$$;

revoke execute on function private.notify_post_like() from public;
revoke execute on function private.notify_post_like() from anon;
revoke execute on function private.notify_post_like() from authenticated;
revoke execute on function private.notify_post_comment() from public;
revoke execute on function private.notify_post_comment() from anon;
revoke execute on function private.notify_post_comment() from authenticated;
revoke execute on function private.notify_new_follow() from public;
revoke execute on function private.notify_new_follow() from anon;
revoke execute on function private.notify_new_follow() from authenticated;
revoke execute on function private.notify_new_message() from public;
revoke execute on function private.notify_new_message() from anon;
revoke execute on function private.notify_new_message() from authenticated;

drop trigger if exists on_like_created on public.likes;
create trigger on_like_created
  after insert on public.likes
  for each row execute procedure private.notify_post_like();

drop trigger if exists on_comment_created on public.comments;
create trigger on_comment_created
  after insert on public.comments
  for each row execute procedure private.notify_post_comment();

drop trigger if exists on_follow_created on public.follows;
create trigger on_follow_created
  after insert on public.follows
  for each row execute procedure private.notify_new_follow();

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute procedure private.notify_new_message();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 200000, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', true, 200000, array['image/jpeg', 'image/png', 'image/webp']),
  ('reel-videos', 'reel-videos', true, 1000000, array['video/mp4', 'video/webm', 'video/ogg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public media read" on storage.objects;
create policy "Public media read" on storage.objects
  for select
  using (bucket_id in ('avatars', 'post-images', 'reel-videos'));

drop policy if exists "Users upload own media" on storage.objects;
create policy "Users upload own media" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'post-images', 'reel-videos')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own media" on storage.objects;
create policy "Users update own media" on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('avatars', 'post-images', 'reel-videos')
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id in ('avatars', 'post-images', 'reel-videos')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own media" on storage.objects;
create policy "Users delete own media" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'post-images', 'reel-videos')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace view public.post_feed
with (security_invoker = true)
as
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
grant select on public.post_feed to authenticated;

grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;

grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;

grant select on public.likes to anon;
grant select, insert, delete on public.likes to authenticated;

grant select on public.comments to anon;
grant select, insert, delete on public.comments to authenticated;

grant select on public.follows to anon;
grant select, insert, delete on public.follows to authenticated;

grant select, insert, update on public.messages to authenticated;
grant select, update, delete on public.notifications to authenticated;
