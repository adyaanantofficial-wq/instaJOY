(function bootstrapClients() {
  if (!window.supabase?.createClient || !window.INSTAJOY_CONFIG) {
    return;
  }

  const client = window.supabase.createClient(
    window.INSTAJOY_CONFIG.SUPABASE_URL,
    window.INSTAJOY_CONFIG.SUPABASE_ANON_KEY
  );

  window.supabaseClient = client;
  window.supabase = client;
})();
