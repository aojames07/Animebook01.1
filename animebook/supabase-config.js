// ============================================================================
// SUPABASE CLIENT CONFIGURATION
// ============================================================================

function cleanSupabaseUrl(raw) {
  if (!raw) return 'https://hdhjzjzujkfftdmandvh.supabase.co';
  let u = raw.trim();
  // If user pasted dashboard URL like: https://supabase.com/dashboard/project/hdhjzjzujkfftdmandvh/...
  const match = u.match(/\/project\/([a-z0-9]+)/i);
  if (match && match[1]) {
    return `https://${match[1]}.supabase.co`;
  }
  // Strip trailing slashes and dashboard paths
  u = u.replace(/\/+$/, '');
  u = u.replace(/\/(settings|api-keys|rest|auth|general|infrastructure).*$/i, '');
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u;
}

window.SUPABASE_CONFIG = {
  // 1. Your Supabase Project URL
  url: 'https://hdhjzjzujkfftdmandvh.supabase.co',

  // 2. Your Supabase anon key
  anonKey: '',

  // 3. Your email address to automatically receive Platform Administrator privileges
  adminEmail: 'odunnuga2007@gmail.com'
};

// Auto-hydrate from localStorage if saved through the in-app settings modal
try {
  const savedUrl = localStorage.getItem('animebook_supabase_url');
  const savedKey = localStorage.getItem('animebook_supabase_key');
  const savedAdmin = localStorage.getItem('animebook_supabase_admin');

  if (savedUrl) {
    const cleaned = cleanSupabaseUrl(savedUrl);
    window.SUPABASE_CONFIG.url = cleaned;
    localStorage.setItem('animebook_supabase_url', cleaned);
  }
  if (savedKey) window.SUPABASE_CONFIG.anonKey = savedKey;
  if (savedAdmin) window.SUPABASE_CONFIG.adminEmail = savedAdmin;
} catch (e) {
  console.warn('Could not read saved Supabase config from storage:', e);
}
