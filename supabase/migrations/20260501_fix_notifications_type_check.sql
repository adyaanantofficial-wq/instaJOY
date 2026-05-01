-- Fix notifications type constraint so story-chain and newer activity notifications insert cleanly.

alter table if exists public.notifications
  drop constraint if exists notifications_type_check;

alter table if exists public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'like',
      'comment',
      'follow',
      'message',
      'chain_joined',
      'chain_completed',
      'capsule',
      'capsule_unlocked',
      'reaction_received'
    )
  );
