import { serve } from 'https://deno.land/std@0.200.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FIREBASE_SERVER_KEY = Deno.env.get('FIREBASE_SERVER_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FIREBASE_SERVER_KEY) {
  throw new Error('Missing required environment variables for notification function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendFcmNotification(token: string, title: string, body: string, data: Record<string, string>) {
  const payload = {
    to: token,
    priority: 'high',
    notification: {
      title,
      body,
      click_action: 'https://your-github-username.github.io/instaJOY',
    },
    data,
  };

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${FIREBASE_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn('FCM delivery failed', response.status, errorBody);
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.user_id || !body.type || !body.message) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const recipientId = body.user_id;
  const actorId = body.actor_id || null;
  const type = String(body.type);
  const entityType = String(body.entity_type || 'post');
  const entityId = body.entity_id || null;
  const message = String(body.message);
  const meta = body.meta || {};

  const { error: insertError } = await supabase.from('notifications').insert({
    user_id: recipientId,
    actor_id: actorId,
    type,
    entity_type: entityType,
    entity_id: entityId,
    message,
    meta,
  });

  if (insertError) {
    return new Response(JSON.stringify({ success: false, message: insertError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('id', recipientId)
    .single();

  if (userError) {
    console.warn('Unable to load recipient token', userError.message);
  }

  if (userRecord?.fcm_token) {
    await sendFcmNotification(userRecord.fcm_token, 'instaJOY', message, {
      type,
      entity_type: entityType,
      entity_id: entityId || '',
    });
  }

  return new Response(JSON.stringify({ success: true, message: 'Notification queued' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
