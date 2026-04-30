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

alter table if exists public.profiles add column if not exists display_name text not null default '';
alter table if exists public.profiles add column if not exists bio text not null default '';
alter table if exists public.profiles add column if not exists fcm_token text;
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles
set display_name = coalesce(display_name, username)
where display_name is null;

update public.profiles
set bio = coalesce(bio, '')
where bio is null;

update public.profiles
set updated_at = now()
where updated_at is null;

do $$
declare
  auth_user record;
  requested_username text;
  candidate_username text;
  display_name_value text;
begin
  for auth_user in
    select id, email, raw_user_meta_data
    from auth.users
    where id not in (select id from public.profiles)
  loop
    requested_username := lower(
      regexp_replace(
        coalesce(auth_user.raw_user_meta_data ->> 'username', split_part(auth_user.email, '@', 1), 'user'),
        '[^a-z0-9._]+',
        '',
        'g'
      )
    );

    if requested_username is null or char_length(requested_username) < 3 then
      requested_username := 'user_' || substring(replace(auth_user.id::text, '-', '') from 1 for 8);
    end if;

    candidate_username := left(requested_username, 30);

    while exists (
      select 1 from public.profiles where username = candidate_username
    ) loop
      candidate_username := left(requested_username, 24) || '_' || substring(replace(auth_user.id::text, '-', '') from 1 for 5);
    end loop;

    display_name_value := coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'display_name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'username', ''),
      candidate_username
    );

    insert into public.profiles (id, username, display_name)
    values (auth_user.id, candidate_username, left(display_name_value, 50))
    on conflict (id) do nothing;
  end loop;
end;
$$;

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

alter table if exists public.posts add column if not exists type text;
alter table if exists public.posts add column if not exists category text;
alter table if exists public.posts add column if not exists content text;
alter table if exists public.posts add column if not exists media_url text;
alter table if exists public.posts add column if not exists updated_at timestamptz;

update public.posts
set type = case
    when media_url is not null then 'reel'
    when image_url is not null then 'image'
    else 'text'
  end
where type is null;

update public.posts
set updated_at = now()
where updated_at is null;

alter table if exists public.posts alter column type set default 'text';
alter table if exists public.posts alter column type set not null;
alter table if exists public.posts alter column updated_at set default now();
alter table if exists public.posts alter column updated_at set not null;
alter table if exists public.posts add column if not exists mood text not null default 'mixed';
alter table if exists public.posts add column if not exists is_capsule boolean not null default false;
alter table if exists public.posts add column if not exists capsule_unlock_at timestamptz;

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_posts_user_id on public.posts (user_id, created_at desc);
create index if not exists idx_posts_type_created_at on public.posts (type, created_at desc);
create index if not exists idx_posts_search_trgm on public.posts using gin ((coalesce(caption, '') || ' ' || coalesce(content, '')) gin_trgm_ops);

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute procedure public.set_updated_at();

create table if not exists public.mood_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null,
  weight numeric not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, mood)
);

create index if not exists idx_mood_preferences_user_mood on public.mood_preferences (user_id, mood);

alter table public.mood_preferences enable row level security;

drop policy if exists "Mood preferences self select" on public.mood_preferences;
create policy "Mood preferences self select" on public.mood_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Mood preferences self insert" on public.mood_preferences;
create policy "Mood preferences self insert" on public.mood_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Mood preferences self update" on public.mood_preferences;
create policy "Mood preferences self update" on public.mood_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Mood preferences self delete" on public.mood_preferences;
create policy "Mood preferences self delete" on public.mood_preferences
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.time_capsules (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  unlock_at timestamptz not null,
  visibility text not null default 'followers',
  secret_code text,
  future_message text,
  status text not null default 'locked',
  created_at timestamptz not null default now(),
  constraint time_capsules_status_check check (status in ('locked', 'unlocked', 'cancelled'))
);

create index if not exists idx_capsule_unlock on public.time_capsules (unlock_at, status);

alter table public.time_capsules enable row level security;

drop policy if exists "Time capsules owner select" on public.time_capsules;
create policy "Time capsules owner select" on public.time_capsules
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Time capsules owner insert" on public.time_capsules;
create policy "Time capsules owner insert" on public.time_capsules
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Time capsules owner update" on public.time_capsules;
create policy "Time capsules owner update" on public.time_capsules
  for update
  to authenticated
  using (auth.uid() = owner_id and status = 'locked')
  with check (auth.uid() = owner_id and status = 'locked');

drop policy if exists "Time capsules owner delete" on public.time_capsules;
create policy "Time capsules owner delete" on public.time_capsules
  for delete
  to authenticated
  using (auth.uid() = owner_id);

create or replace function private.assert_capsule_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_capsules int;
begin
  select count(*) into active_capsules
  from public.time_capsules
  where owner_id = new.owner_id
    and status = 'locked';

  if active_capsules >= 20 then
    raise exception 'A single user may not have more than 20 scheduled time capsules at once.';
  end if;

  return new;
end;
$$;

revoke execute on function private.assert_capsule_quota() from public;
revoke execute on function private.assert_capsule_quota() from anon;
revoke execute on function private.assert_capsule_quota() from authenticated;

drop trigger if exists enforce_capsule_quota on public.time_capsules;
create trigger enforce_capsule_quota
  before insert on public.time_capsules
  for each row execute procedure private.assert_capsule_quota();

create table if not exists public.story_chains (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text,
  privacy text not null default 'friends',
  allow_public boolean not null default false,
  max_segments int not null default 20,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint story_chains_privacy_check check (privacy in ('friends', 'private', 'public')),
  constraint story_chains_status_check check (status in ('active', 'complete', 'expired'))
);

alter table public.story_chains enable row level security;

drop policy if exists "Story chains public read" on public.story_chains;
create policy "Story chains public read" on public.story_chains
  for select
  using (
    privacy = 'public'
    or auth.uid() = creator_id
    or (privacy = 'friends'
      and exists (
        select 1
        from public.follows
        where follower_id = auth.uid()
          and following_id = creator_id
      ))
  );

drop policy if exists "Story chains self insert" on public.story_chains;
create policy "Story chains self insert" on public.story_chains
  for insert
  to authenticated
  with check (auth.uid() = creator_id);

drop policy if exists "Story chains self update" on public.story_chains;
create policy "Story chains self update" on public.story_chains
  for update
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Story chains self delete" on public.story_chains;
create policy "Story chains self delete" on public.story_chains
  for delete
  to authenticated
  using (auth.uid() = creator_id);

create table if not exists public.story_chain_segments (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.story_chains(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text,
  caption text,
  segment_order int,
  created_at timestamptz not null default now()
);

create index if not exists idx_story_chain on public.story_chain_segments (chain_id);

alter table public.story_chain_segments enable row level security;

drop policy if exists "Story chain segments public read" on public.story_chain_segments;
create policy "Story chain segments public read" on public.story_chain_segments
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.story_chains c
      where c.id = chain_id
        and (
          c.privacy = 'public'
          or c.creator_id = auth.uid()
          or (c.privacy = 'friends'
            and exists (
              select 1
              from public.follows f
              where f.follower_id = auth.uid()
                and f.following_id = c.creator_id
            ))
        )
    )
  );

drop policy if exists "Story chain segments insert own" on public.story_chain_segments;
create policy "Story chain segments insert own" on public.story_chain_segments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.story_chains c
      where c.id = chain_id
        and (
          c.privacy = 'public'
          or c.creator_id = auth.uid()
          or (c.privacy = 'friends'
            and exists (
              select 1
              from public.follows f
              where f.follower_id = auth.uid()
                and f.following_id = c.creator_id
            )
          )
        )
    )
  );

drop policy if exists "Story chain segments update own" on public.story_chain_segments;
create policy "Story chain segments update own" on public.story_chain_segments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Story chain segments delete own" on public.story_chain_segments;
create policy "Story chain segments delete own" on public.story_chain_segments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function private.assert_story_chain_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_segment timestamptz;
begin
  select max(created_at) into latest_segment
  from public.story_chain_segments
  where chain_id = new.chain_id
    and user_id = new.user_id;

  if latest_segment is not null and latest_segment > now() - interval '30 seconds' then
    raise exception 'You can only add one story chain segment every 30 seconds.';
  end if;

  if (select count(*) from public.story_chain_segments where chain_id = new.chain_id) >= (select max_segments from public.story_chains where id = new.chain_id) then
    raise exception 'This story chain already has the maximum number of segments.';
  end if;

  return new;
end;
$$;

revoke execute on function private.assert_story_chain_cooldown() from public;
revoke execute on function private.assert_story_chain_cooldown() from anon;
revoke execute on function private.assert_story_chain_cooldown() from authenticated;

drop trigger if exists enforce_story_chain_cooldown on public.story_chain_segments;
create trigger enforce_story_chain_cooldown
  before insert on public.story_chain_segments
  for each row execute procedure private.assert_story_chain_cooldown();

create table if not exists public.post_reactions_v2 (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id),
  constraint post_reactions_v2_type_check check (reaction_type in ('love', 'inspired', 'funny', 'wow', 'useful', 'emotional', 'respect'))
);

create index if not exists idx_reaction_post on public.post_reactions_v2 (post_id);

create table if not exists public.post_reaction_aggregates (
  post_id uuid primary key references public.posts(id) on delete cascade,
  love int not null default 0,
  inspired int not null default 0,
  funny int not null default 0,
  wow int not null default 0,
  useful int not null default 0,
  emotional int not null default 0,
  respect int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_reaction_aggregates_updated on public.post_reaction_aggregates (updated_at desc);

create table if not exists public.feed_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  mood text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_feed_cache_updated on public.feed_cache (updated_at desc);

create or replace function private.invalidate_feed_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.feed_cache
  set updated_at = now()
  where cache_key in ('home', 'explore', 'story');

  return new;
end;
$$;

revoke execute on function private.invalidate_feed_cache() from public;
revoke execute on function private.invalidate_feed_cache() from anon;
revoke execute on function private.invalidate_feed_cache() from authenticated;

drop trigger if exists invalidate_feed_cache_after_post_insert on public.posts;
create trigger invalidate_feed_cache_after_post_insert
  after insert on public.posts
  for each row execute procedure private.invalidate_feed_cache();

drop trigger if exists invalidate_feed_cache_after_post_update on public.posts;
create trigger invalidate_feed_cache_after_post_update
  after update on public.posts
  for each row execute procedure private.invalidate_feed_cache();

drop trigger if exists invalidate_feed_cache_after_post_delete on public.posts;
create trigger invalidate_feed_cache_after_post_delete
  after delete on public.posts
  for each row execute procedure private.invalidate_feed_cache();

alter table public.post_reaction_aggregates enable row level security;

drop policy if exists "Post reaction aggregates public read" on public.post_reaction_aggregates;
create policy "Post reaction aggregates public read" on public.post_reaction_aggregates
  for select
  using (true);

alter table public.feed_cache enable row level security;

drop policy if exists "Feed cache public read" on public.feed_cache;
create policy "Feed cache public read" on public.feed_cache
  for select
  using (true);

alter table public.post_reactions_v2 enable row level security;

drop policy if exists "Post reactions v2 public read" on public.post_reactions_v2;
create policy "Post reactions v2 public read" on public.post_reactions_v2
  for select
  using (true);

drop policy if exists "Post reactions v2 insert own" on public.post_reactions_v2;
create policy "Post reactions v2 insert own" on public.post_reactions_v2
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Post reactions v2 update own" on public.post_reactions_v2;
create policy "Post reactions v2 update own" on public.post_reactions_v2
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Post reactions v2 delete own" on public.post_reactions_v2;
create policy "Post reactions v2 delete own" on public.post_reactions_v2
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function private.refresh_post_reaction_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trigger_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.post_reaction_aggregates
  set
    love = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'love'), 0),
    inspired = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'inspired'), 0),
    funny = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'funny'), 0),
    wow = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'wow'), 0),
    useful = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'useful'), 0),
    emotional = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'emotional'), 0),
    respect = coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'respect'), 0),
    total = (select count(*) from public.post_reactions_v2 where post_id = trigger_post_id),
    updated_at = now()
  where post_id = trigger_post_id;

  if not found then
    insert into public.post_reaction_aggregates (post_id, love, inspired, funny, wow, useful, emotional, respect, total, updated_at)
    values (
      trigger_post_id,
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'love'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'inspired'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'funny'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'wow'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'useful'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'emotional'), 0),
      coalesce((select count(*) from public.post_reactions_v2 where post_id = trigger_post_id and reaction_type = 'respect'), 0),
      (select count(*) from public.post_reactions_v2 where post_id = trigger_post_id),
      now()
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.refresh_post_reaction_aggregate() from public;
revoke execute on function private.refresh_post_reaction_aggregate() from anon;
revoke execute on function private.refresh_post_reaction_aggregate() from authenticated;

drop trigger if exists refresh_post_reaction_aggregate_after_insert on public.post_reactions_v2;
create trigger refresh_post_reaction_aggregate_after_insert
  after insert on public.post_reactions_v2
  for each row execute procedure private.refresh_post_reaction_aggregate();

drop trigger if exists refresh_post_reaction_aggregate_after_delete on public.post_reactions_v2;
create trigger refresh_post_reaction_aggregate_after_delete
  after delete on public.post_reactions_v2
  for each row execute procedure private.refresh_post_reaction_aggregate();

drop trigger if exists refresh_post_reaction_aggregate_after_update on public.post_reactions_v2;
create trigger refresh_post_reaction_aggregate_after_update
  after update on public.post_reactions_v2
  for each row execute procedure private.refresh_post_reaction_aggregate();

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  type text not null default 'image',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  views integer not null default 0,
  constraint stories_type_check check (type in ('image', 'video'))
);

alter table if exists public.stories add column if not exists type text;
alter table if exists public.stories add column if not exists expires_at timestamptz;
alter table if exists public.stories add column if not exists views integer;

update public.stories
set type = 'image'
where type is null;

update public.stories
set expires_at = now() + interval '24 hours'
where expires_at is null;

update public.stories
set views = 0
where views is null;

alter table if exists public.stories alter column type set default 'image';
alter table if exists public.stories alter column type set not null;
alter table if exists public.stories alter column expires_at set not null;
alter table if exists public.stories alter column views set not null;

create index if not exists idx_stories_expires_at on public.stories (expires_at desc);
create index if not exists idx_stories_user_id on public.stories (user_id, created_at desc);

drop trigger if exists set_stories_updated_at on public.stories;
create trigger set_stories_updated_at
  before update on public.stories
  for each row execute procedure public.set_updated_at();

alter table public.stories enable row level security;

drop policy if exists "Stories public read" on public.stories;
create policy "Stories public read" on public.stories
  for select
  using (true);

drop policy if exists "Stories insert own" on public.stories;
create policy "Stories insert own" on public.stories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Stories delete own" on public.stories;
create policy "Stories delete own" on public.stories
  for delete
  to authenticated
  using (auth.uid() = user_id);

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
  if recipient_id is null or recipient_id = actor_user_id then
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

create or replace function private.notify_post_reaction()
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
    'reaction_received',
    'post',
    new.post_id,
    'reacted to your post',
    jsonb_build_object('reaction_type', new.reaction_type)
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
revoke execute on function private.notify_post_reaction() from public;
revoke execute on function private.notify_post_reaction() from anon;
revoke execute on function private.notify_post_reaction() from authenticated;
revoke execute on function private.notify_new_follow() from public;
revoke execute on function private.notify_new_follow() from anon;
revoke execute on function private.notify_new_follow() from authenticated;
revoke execute on function private.notify_new_message() from public;
revoke execute on function private.notify_new_message() from anon;
revoke execute on function private.notify_new_message() from authenticated;

create or replace function private.notify_chain_segment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chain_owner uuid;
begin
  select creator_id into chain_owner from public.story_chains where id = new.chain_id;

  perform private.create_notification(
    chain_owner,
    new.user_id,
    'chain_joined',
    'story_chain',
    new.chain_id,
    'added a segment to your story chain',
    jsonb_build_object('segment_id', new.id)
  );

  return new;
end;
$$;

create or replace function private.notify_chain_segment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chain_owner uuid;
begin
  select creator_id into chain_owner from public.story_chains where id = new.chain_id;

  perform private.create_notification(
    chain_owner,
    new.user_id,
    'chain_joined',
    'story_chain',
    new.chain_id,
    'added a segment to your story chain',
    jsonb_build_object('segment_id', new.id)
  );

  return new;
end;
$$;

revoke execute on function private.notify_chain_segment_added() from public;
revoke execute on function private.notify_chain_segment_added() from anon;
revoke execute on function private.notify_chain_segment_added() from authenticated;

drop trigger if exists on_like_created on public.likes;
create trigger on_like_created
  after insert on public.likes
  for each row execute procedure private.notify_post_like();

drop trigger if exists on_comment_created on public.comments;
create trigger on_comment_created
  after insert on public.comments
  for each row execute procedure private.notify_post_comment();

drop trigger if exists on_reaction_received on public.post_reactions_v2;
create trigger on_reaction_received
  after insert on public.post_reactions_v2
  for each row execute procedure private.notify_post_reaction();

drop trigger if exists on_follow_created on public.follows;
create trigger on_follow_created
  after insert on public.follows
  for each row execute procedure private.notify_new_follow();

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute procedure private.notify_new_message();

drop trigger if exists on_chain_segment_added on public.story_chain_segments;
create trigger on_chain_segment_added
  after insert on public.story_chain_segments
  for each row execute procedure private.notify_chain_segment_added();

create or replace function private.ensure_chain_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  segment_count int;
  chain_owner uuid;
begin
  select count(*) into segment_count
  from public.story_chain_segments
  where chain_id = new.chain_id;

  if segment_count >= (select max_segments from public.story_chains where id = new.chain_id) then
    update public.story_chains
    set status = 'complete'
    where id = new.chain_id and status <> 'complete';

    if found then
      select creator_id into chain_owner from public.story_chains where id = new.chain_id;
      perform private.create_notification(
        chain_owner,
        new.user_id,
        'chain_completed',
        'story_chain',
        new.chain_id,
        'completed the story chain',
        jsonb_build_object('segment_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.ensure_chain_completion() from public;
revoke execute on function private.ensure_chain_completion() from anon;
revoke execute on function private.ensure_chain_completion() from authenticated;

drop trigger if exists on_chain_completed on public.story_chain_segments;
create trigger on_chain_completed
  after insert on public.story_chain_segments
  for each row execute procedure private.ensure_chain_completion();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 200000, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', true, 200000, array['image/jpeg', 'image/png', 'image/webp']),
  ('reel-videos', 'reel-videos', true, 1000000, array['video/mp4', 'video/webm', 'video/ogg']),
  ('post-media', 'post-media', true, 1000000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg']),
  ('story-chain', 'story-chain', true, 1000000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg']),
  ('capsule-media', 'capsule-media', true, 1000000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public media read" on storage.objects;
create policy "Public media read" on storage.objects
  for select
  using (bucket_id in ('avatars', 'post-images', 'reel-videos', 'post-media', 'story-chain', 'capsule-media'));

drop policy if exists "Users upload own media" on storage.objects;
create policy "Users upload own media" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'post-images', 'reel-videos', 'post-media', 'story-chain', 'capsule-media')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own media" on storage.objects;
create policy "Users update own media" on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('avatars', 'post-images', 'reel-videos', 'post-media', 'story-chain', 'capsule-media')
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id in ('avatars', 'post-images', 'reel-videos', 'post-media', 'story-chain', 'capsule-media')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own media" on storage.objects;
create policy "Users delete own media" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'post-images', 'reel-videos', 'post-media', 'story-chain', 'capsule-media')
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
