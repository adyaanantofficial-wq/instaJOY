#!/usr/bin/env node
/*
  Migration helper: copy data from existing MongoDB collections into Supabase tables.
  Usage: node ./scripts/migrate-mongo-to-supabase.js [--dry-run]
  Requires env vars: MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
*/

const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const fs = require('fs');
dotenv.config();
// Load backend/.env if present and MONGODB_URI not set
if (!process.env.MONGODB_URI) {
  const backendEnv = require('path').join(process.cwd(), 'backend', '.env');
  if (fs.existsSync(backendEnv)) {
    dotenv.config({ path: backendEnv });
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment');
  process.exit(1);
}

if (!DRY_RUN) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (required unless --dry-run)');
    process.exit(1);
  }
}

async function run() {
  const mongo = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongo.connect();
  console.log('Connected to MongoDB');

  const supabase = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
  if (supabase) console.log('Supabase client created');

  const db = mongo.db();

  // Utility: chunk array
  const chunk = (arr, size = 50) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  try {
    // Users -> profiles
    const users = await db.collection('users').find({}).toArray();
    console.log(`Found ${users.length} users in MongoDB`);
    if (!DRY_RUN && users.length) {
      const profiles = users.map((u) => ({
        id: String(u._id),
        username: u.username || (u.email ? u.email.split('@')[0] : `user_${String(u._id).slice(0,8)}`),
        display_name: u.display_name || u.username || '',
        bio: u.bio || '',
        avatar_url: u.avatar_url || null,
        created_at: u.created_at || new Date().toISOString(),
      }));

      for (const batch of chunk(profiles, 100)) {
        const { error } = await supabase.from('profiles').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Profiles insert error:', error.message || error);
          throw error;
        }
      }
      console.log('Profiles migrated');
    }

    // Posts
    const posts = await db.collection('posts').find({}).toArray();
    console.log(`Found ${posts.length} posts in MongoDB`);
    if (!DRY_RUN && posts.length) {
      const mapped = posts.map((p) => ({
        id: String(p._id),
        user_id: String(p.user_id || p.user || p.author_id || ''),
        type: p.type || 'image',
        category: p.category || null,
        caption: p.caption || null,
        content: p.content || null,
        image_url: p.image_url || p.media_url || null,
        media_url: p.media_url || null,
        carousel_urls: p.carousel_urls || null,
        hashtags: p.hashtags || null,
        location: p.location || null,
        privacy: p.privacy || 'public',
        allow_comments: typeof p.allow_comments === 'boolean' ? p.allow_comments : true,
        allow_likes: typeof p.allow_likes === 'boolean' ? p.allow_likes : true,
        created_at: p.created_at || new Date().toISOString(),
      }));

      for (const batch of chunk(mapped, 100)) {
        const { error } = await supabase.from('posts').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Posts insert error:', error.message || error);
          throw error;
        }
      }
      console.log('Posts migrated');
    }

    // Comments
    const comments = await db.collection('comments').find({}).toArray();
    console.log(`Found ${comments.length} comments in MongoDB`);
    if (!DRY_RUN && comments.length) {
      const mapped = comments.map((c) => ({
        id: String(c._id),
        post_id: String(c.post_id),
        user_id: String(c.user_id),
        content: c.content,
        created_at: c.created_at || new Date().toISOString(),
      }));

      for (const batch of chunk(mapped, 200)) {
        const { error } = await supabase.from('comments').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Comments insert error:', error.message || error);
          throw error;
        }
      }
      console.log('Comments migrated');
    }

    // Likes
    const likes = await db.collection('likes').find({}).toArray();
    console.log(`Found ${likes.length} likes in MongoDB`);
    if (!DRY_RUN && likes.length) {
      const mapped = likes.map((l) => ({
        id: String(l._id),
        post_id: String(l.post_id),
        user_id: String(l.user_id),
        created_at: l.created_at || new Date().toISOString(),
      }));

      for (const batch of chunk(mapped, 500)) {
        const { error } = await supabase.from('likes').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Likes insert error:', error.message || error);
          throw error;
        }
      }
      console.log('Likes migrated');
    }

    console.log('Migration complete (dry-run=' + DRY_RUN + ')');
  } finally {
    await mongo.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
