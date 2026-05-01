-- Restore the public.posts/public.stories -> public.profiles relationships
-- so PostgREST can embed author profiles reliably again.

alter table if exists public.posts
  drop constraint if exists posts_user_id_fkey;

alter table if exists public.posts
  add constraint posts_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade
  not valid;

alter table if exists public.posts
  validate constraint posts_user_id_fkey;

alter table if exists public.stories
  drop constraint if exists stories_user_id_fkey;

alter table if exists public.stories
  add constraint stories_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade
  not valid;

alter table if exists public.stories
  validate constraint stories_user_id_fkey;

create index if not exists idx_posts_user_id on public.posts (user_id, created_at desc);
create index if not exists idx_stories_user_id on public.stories (user_id, created_at desc);

drop view if exists public.post_feed;

create view public.post_feed
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

notify pgrst, 'reload schema';
