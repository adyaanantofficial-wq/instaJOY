import { serve } from 'https://deno.land/std@0.200.0/http/server.ts';
import { MongoClient } from 'https://deno.land/x/mongo@0.32.0/mod.ts';

const MONGODB_URI = Deno.env.get('MONGODB_URI');
const MONGODB_DB = Deno.env.get('MONGODB_DB') || 'instajoy';

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI for logAnalytics function');
}

const client = new MongoClient();
await client.connect(MONGODB_URI);
const db = client.database(MONGODB_DB);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || !payload.event_type) {
    return new Response(JSON.stringify({ success: false, message: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const logEntry = {
    event_type: payload.event_type,
    user_id: payload.user_id || null,
    source: payload.source || 'frontend',
    details: payload.details || {},
    created_at: new Date(),
  };

  const collection = db.collection('analyticsEvents');
  await collection.insertOne(logEntry);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
