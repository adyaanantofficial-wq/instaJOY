const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase URL or anon key. Set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_URL / SUPABASE_ANON_KEY in .env.local or .env');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const email = process.env.STORAGE_VERIFY_EMAIL || process.env.STORAGE_TEST_EMAIL || 'test@example.com';
  const password = process.env.STORAGE_VERIFY_PASSWORD || process.env.STORAGE_TEST_PASSWORD || 'test123456';

  console.log('Signing in test user:', email);
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('Unable to sign in temp user:', signInError.message || signInError);
    console.error('If you have a valid service user for verification, set STORAGE_VERIFY_EMAIL and STORAGE_VERIFY_PASSWORD in .env.local or .env.');
    return false;
  }

  const session = signInData?.session;
  if (!session?.access_token || !signInData?.user?.id) {
    console.error('Authentication session missing after sign-in. Storage policy validation cannot continue.');
    return false;
  }

  const authClient = createClient(supabaseUrl, session.access_token);
  const userId = signInData.user.id;
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64'
  );
  const pathName = `${userId}/story-chain-verify-${Date.now()}.png`;

  console.log('Uploading test file to story-chain bucket as authenticated user...');
  const { data: uploadData, error: uploadError } = await authClient.storage
    .from('story-chain')
    .upload(pathName, buffer, { contentType: 'image/png' });

  if (uploadError) {
    console.error('Authenticated storage upload failed:', uploadError.message || uploadError);
    return false;
  }

  console.log('Authenticated upload succeeded:', uploadData?.path);
  console.log('Storage policy allows authenticated upload to story-chain bucket with user folder prefix.');

  console.log('Cleaning up test file...');
  const { error: removeError } = await authClient.storage.from('story-chain').remove([pathName]);
  if (removeError) {
    console.warn('Cleanup failed:', removeError.message || removeError);
  } else {
    console.log('Cleanup succeeded.');
  }

  return true;
}

run()
  .then((success) => {
    if (!success) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
