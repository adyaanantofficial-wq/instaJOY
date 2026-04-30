import { serve } from 'https://deno.land/std@0.200.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required environment variables for unlock-capsules function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function unlockCapsules() {
  const now = new Date().toISOString();

  const { data: capsules, error: fetchError } = await supabase
    .from('time_capsules')
    .select('id, post_id, owner_id, unlock_at')
    .eq('status', 'locked')
    .lte('unlock_at', now)
    .limit(50);

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  if (!capsules || !capsules.length) {
    return { success: true, unlocked: 0 };
  }

  let unlockedCount = 0;
  for (const capsule of capsules) {
    const { error: updateError } = await supabase
      .from('time_capsules')
      .update({ status: 'unlocked' })
      .eq('id', capsule.id)
      .eq('status', 'locked');

    if (updateError) {
      console.warn('Unable to unlock capsule', capsule.id, updateError.message);
      continue;
    }

    unlockedCount += 1;

    const notificationText = `Your time capsule is unlocked and ready to share.`;
    await supabase.from('notifications').insert({
      user_id: capsule.owner_id,
      actor_id: null,
      type: 'capsule_unlocked',
      entity_type: 'time_capsule',
      entity_id: capsule.id,
      message: notificationText,
      meta: { post_id: capsule.post_id, unlock_at: capsule.unlock_at },
    });
  }

  return { success: true, unlocked: unlockedCount };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await unlockCapsules();
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
});
