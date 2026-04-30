-- Migration: Add mood preferences, time capsules, story chains, and reactions v2

alter table if exists public.posts add column if not exists mood text not null default 'mixed';
alter table if exists public.posts add column if not exists is_capsule boolean not null default false;
alter table if exists public.posts add column if not exists capsule_unlock_at timestamptz;

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
drop policy if exists "Mood preferences self select" on public.mood_preferences
;
create policy "Mood preferences self select" on public.mood_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Mood preferences self insert" on public.mood_preferences
;
create policy "Mood preferences self insert" on public.mood_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Mood preferences self update" on public.mood_preferences
;
create policy "Mood preferences self update" on public.mood_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "Mood preferences self delete" on public.mood_preferences
;
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
drop policy if exists "Time capsules owner select" on public.time_capsules
;
create policy "Time capsules owner select" on public.time_capsules
  for select
  to authenticated
  using (auth.uid() = owner_id);
drop policy if exists "Time capsules owner insert" on public.time_capsules
;
create policy "Time capsules owner insert" on public.time_capsules
  for insert
  to authenticated
  with check (auth.uid() = owner_id);
drop policy if exists "Time capsules owner update" on public.time_capsules
;
create policy "Time capsules owner update" on public.time_capsules
  for update
  to authenticated
  using (auth.uid() = owner_id and status = 'locked')
  with check (auth.uid() = owner_id and status = 'locked');
drop policy if exists "Time capsules owner delete" on public.time_capsules
;
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
drop policy if exists "Story chains public read" on public.story_chains
;
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
drop policy if exists "Story chains self insert" on public.story_chains
;
create policy "Story chains self insert" on public.story_chains
  for insert
  to authenticated
  with check (auth.uid() = creator_id);
drop policy if exists "Story chains self update" on public.story_chains
;
create policy "Story chains self update" on public.story_chains
  for update
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);
drop policy if exists "Story chains self delete" on public.story_chains
;
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
drop policy if exists "Story chain segments public read" on public.story_chain_segments
;
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
drop policy if exists "Story chain segments insert own" on public.story_chain_segments
;
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
drop policy if exists "Story chain segments update own" on public.story_chain_segments
;
create policy "Story chain segments update own" on public.story_chain_segments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "Story chain segments delete own" on public.story_chain_segments
;
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

alter table public.post_reactions_v2 enable row level security;
drop policy if exists "Post reactions v2 public read" on public.post_reactions_v2
;
create policy "Post reactions v2 public read" on public.post_reactions_v2
  for select
  using (true);
drop policy if exists "Post reactions v2 insert own" on public.post_reactions_v2
;
create policy "Post reactions v2 insert own" on public.post_reactions_v2
  for insert
  to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Post reactions v2 update own" on public.post_reactions_v2
;
create policy "Post reactions v2 update own" on public.post_reactions_v2
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "Post reactions v2 delete own" on public.post_reactions_v2
;
create policy "Post reactions v2 delete own" on public.post_reactions_v2
  for delete
  to authenticated
  using (auth.uid() = user_id);
