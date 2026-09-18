// Anime Logbook Web App - Core Logic with Supabase Cloud Sync & Admin Tools
const STORAGE_KEY = 'animebook_entries_v1';

// Default starter data if empty
const DEFAULT_ENTRIES = [
  {
    id: 'entry_sample_1',
    title: 'Frieren: Beyond Journey\'s End',
    format: 'TV',
    studio: 'Madhouse',
    genre: 'Fantasy, Adventure, Drama',
    status: 'Completed',
    progressCurrent: 28,
    progressTotal: 28,
    score: '9.8',
    favoriteCharacter: 'Frieren & Fern',
    notesEp1_5: 'Melancholic, breathtaking tone. The way passage of time is shown through landscapes and memories is exquisite.',
    notesMidSeason: 'The First-Class Mage Exam arc brought fantastic tactical magical combat without losing the core emotional weight.',
    notesFinalThoughts: 'A modern masterpiece. The direction, Evan Call\'s soundtrack, and character dynamics make this unforgettable.',
    favoriteQuote: 'It\'s what Himmel the Hero would have done.',
    createdAt: Date.now() - 100000
  },
  {
    id: 'entry_sample_2',
    title: 'Chainsaw Man',
    format: 'TV',
    studio: 'MAPPA',
    genre: 'Action, Supernatural, Dark Fantasy',
    status: 'Watching',
    progressCurrent: 8,
    progressTotal: 12,
    score: '8.5',
    favoriteCharacter: 'Power & Aki',
    notesEp1_5: 'Cinematic visual direction and unique ED for each episode. Denji is a very refreshing protagonist.',
    notesMidSeason: 'Katana Man encounter hit like a truck. Pacing picked up massively.',
    notesFinalThoughts: '',
    favoriteQuote: 'If there\'s a devil I can be friends with, then yeah, I\'d hang out with it.',
    createdAt: Date.now()
  }
];

// App State
let entries = [];
let activeFilter = 'All';
let searchQuery = '';
let currentSort = 'newest';
let saveTimeout = null;
let expandedCardIds = new Set();
let allExpanded = false;

// Supabase State
let supabaseClient = null;
let currentUser = null;
let authMode = 'signin'; // 'signin' or 'signup'
let isUserAdmin = false;

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
  initSupabase();
  setupEventListeners();
  loadLocalEntries();
  render();
  updateStats();

  if (supabaseClient) {
    await checkAuthSession();
  } else {
    updateSyncStatusBadge('local');
  }
}

// Initialize Supabase Client
function initSupabase() {
  const config = window.SUPABASE_CONFIG || {};
  if (config.url) {
    config.url = cleanSupabaseUrl(config.url);
  }
  if (window.supabase && config.url && config.anonKey) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey);
      console.log('Supabase client initialized successfully with:', config.url);
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
  }
}

// Check Active Authentication Session
async function checkAuthSession() {
  if (!supabaseClient) return;

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (session && session.user) {
      handleUserSignedIn(session.user);
    } else {
      handleUserSignedOut();
    }

    // Subscribe to auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        handleUserSignedIn(session.user);
      } else {
        handleUserSignedOut();
      }
    });
  } catch (err) {
    console.warn('Auth session check failed:', err);
    handleUserSignedOut();
  }
}

// When User Signs In
async function handleUserSignedIn(user) {
  currentUser = user;
  const config = window.SUPABASE_CONFIG || {};

  // Check Admin Status
  isUserAdmin = (user.email && config.adminEmail && user.email.toLowerCase() === config.adminEmail.toLowerCase());

  // Update UI Elements
  document.getElementById('loginModalBtn').style.display = 'none';
  document.getElementById('userBadge').style.display = 'inline-flex';
  document.getElementById('userEmailSpan').textContent = user.email;
  document.getElementById('logoutBtn').style.display = 'inline-flex';

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.style.display = isUserAdmin ? 'inline-flex' : 'none';
  }

  updateSyncStatusBadge('cloud');
  await loadCloudEntries();
}

// When User Signs Out
function handleUserSignedOut() {
  currentUser = null;
  isUserAdmin = false;

  document.getElementById('loginModalBtn').style.display = 'inline-flex';
  document.getElementById('userBadge').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) adminBtn.style.display = 'none';

  updateSyncStatusBadge('local');
  loadLocalEntries();
  render();
  updateStats();
}

// Sync Status Badge Indicator
function updateSyncStatusBadge(status) {
  const badge = document.getElementById('syncStatus');
  const text = document.getElementById('syncStatusText');
  if (!badge || !text) return;

  if (status === 'cloud') {
    badge.className = 'sync-status cloud-synced';
    text.textContent = 'Cloud Synced ☁️';
    badge.title = 'All cards are securely backed up to your Supabase Cloud Database.';
  } else {
    badge.className = 'sync-status';
    text.textContent = 'Local Guest';
    badge.title = 'Currently running in local browser storage. Log in to sync across devices!';
  }
}

// ============================================================================
// DATA STORAGE & CLOUD SYNCHRONIZATION
// ============================================================================

// Load from LocalStorage (Fallback / Guest)
function loadLocalEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      entries = JSON.parse(raw);
    } else {
      entries = [...DEFAULT_ENTRIES];
      saveToStorage(false);
    }
  } catch (e) {
    entries = [...DEFAULT_ENTRIES];
  }
}

// Load from Supabase Cloud Database
async function loadCloudEntries() {
  if (!supabaseClient || !currentUser) return;

  try {
    triggerSaveIndicator('Fetching...');
    const { data, error } = await supabaseClient
      .from('anime_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      // Map Supabase DB columns to App model
      entries = data.map(row => ({
        id: row.id,
        title: row.title || '',
        format: row.format || 'TV',
        studio: row.studio || '',
        genre: row.genre || '',
        status: row.status || 'Plan to Watch',
        progressCurrent: row.progress_current ?? 0,
        progressTotal: row.progress_total || '12',
        score: row.score || '',
        favoriteCharacter: row.favorite_character || '',
        notesEp1_5: row.notes_ep1_5 || '',
        notesMidSeason: row.notes_mid_season || '',
        notesFinalThoughts: row.notes_final_thoughts || '',
        favoriteQuote: row.favorite_quote || '',
        createdAt: new Date(row.created_at).getTime()
      }));
    } else {
      // If cloud library is empty, check if user has local cards to migrate
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const localList = JSON.parse(localRaw);
        if (localList.length > 0 && confirm('Would you like to upload your existing local anime cards to your cloud account?')) {
          entries = localList;
          for (const item of entries) {
            await saveEntryToCloud(item);
          }
        } else {
          entries = [];
        }
      } else {
        entries = [];
      }
    }

    render();
    updateStats();
    showToast('☁️ Synced cards with Supabase!');
  } catch (err) {
    console.error('Error fetching cloud cards:', err);
    showToast('⚠️ Cloud fetch error - check database permissions');
    loadLocalEntries();
    render();
  }
}

// Save entry to Supabase
async function saveEntryToCloud(entry) {
  if (!supabaseClient || !currentUser) return;

  try {
    const row = {
      id: entry.id,
      user_id: currentUser.id,
      title: entry.title || '',
      format: entry.format || 'TV',
      studio: entry.studio || '',
      genre: entry.genre || '',
      status: entry.status || 'Plan to Watch',
      progress_current: parseInt(entry.progressCurrent, 10) || 0,
      progress_total: String(entry.progressTotal || '12'),
      score: String(entry.score || ''),
      favorite_character: entry.favoriteCharacter || '',
      notes_ep1_5: entry.notesEp1_5 || '',
      notes_mid_season: entry.notesMidSeason || '',
      notes_final_thoughts: entry.notesFinalThoughts || '',
      favorite_quote: entry.favoriteQuote || '',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from('anime_cards')
      .upsert(row);

    if (error) console.error('Cloud save failed:', error);
  } catch (e) {
    console.error('Exception during cloud upsert:', e);
  }
}

// Delete entry from Supabase
async function deleteEntryFromCloud(id) {
  if (!supabaseClient || !currentUser) return;

  try {
    const { error } = await supabaseClient
      .from('anime_cards')
      .delete()
      .eq('id', id);

    if (error) console.error('Cloud delete failed:', error);
  } catch (e) {
    console.error('Exception during cloud delete:', e);
  }
}

// Save to localStorage & trigger cloud sync
function saveToStorage(syncCloud = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    triggerSaveIndicator();
    updateStats();
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function debouncedSave(targetId) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saveToStorage(true);
    if (targetId && currentUser && supabaseClient) {
      const entry = entries.find(e => e.id === targetId);
      if (entry) await saveEntryToCloud(entry);
    }
  }, 350);
}

function triggerSaveIndicator(msg = 'Auto-saved') {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.textContent = `✓ ${msg}`;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 1600);
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================
function setupEventListeners() {
  // Add Anime
  document.getElementById('addBtn').addEventListener('click', addNewEntry);

  // Expand / Collapse All
  const expandAllBtn = document.getElementById('expandAllBtn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', toggleExpandAll);
  }

  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    render();
  });

  // Filter Pills
  const filterPills = document.querySelectorAll('.pill-btn');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-filter');
      render();
    });
  });

  // Sort Select
  const sortSelect = document.getElementById('sortSelect');
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    render();
  });

  // Copy Blank Template Button
  document.getElementById('copyTemplateBtn').addEventListener('click', () => {
    const blank = getBlankTemplateString();
    copyTextToClipboard(blank, 'Copied Blank Template to clipboard!');
  });

  // Export JSON
  document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);

  // Import JSON Modal
  document.getElementById('importBtn').addEventListener('click', openImportModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeImportModal);
  document.getElementById('confirmImportBtn').addEventListener('click', executeImport);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeImportModal();
  });

  // Export Markdown
  document.getElementById('exportMdBtn').addEventListener('click', exportMarkdown);

  // Authentication Buttons
  document.getElementById('loginModalBtn').addEventListener('click', openAuthModal);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Cloud Config Button
  document.getElementById('cloudConfigBtn').addEventListener('click', openConfigModal);

  // Admin Dashboard Button
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.addEventListener('click', openAdminModal);
  }
}

// ============================================================================
// AUTHENTICATION LOGIC (Supabase)
// ============================================================================
function openAuthModal() {
  if (!supabaseClient) {
    alert('Please click "⚙️ Cloud Setup" first to enter your Supabase Project URL and Anon Key.');
    openConfigModal();
    return;
  }
  document.getElementById('authModal').classList.add('active');
  document.getElementById('authAlert').style.display = 'none';
  document.getElementById('authEmail').focus();
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
  // Reset password visibility when closing
  const passInput = document.getElementById('authPassword');
  const btn = document.getElementById('togglePasswordBtn');
  if (passInput) passInput.type = 'password';
  if (btn) btn.textContent = '👁️';
}

function toggleAuthPassword() {
  const passInput = document.getElementById('authPassword');
  const btn = document.getElementById('togglePasswordBtn');
  if (!passInput || !btn) return;

  if (passInput.type === 'password') {
    passInput.type = 'text';
    btn.textContent = '🙈';
    btn.title = 'Hide password';
  } else {
    passInput.type = 'password';
    btn.textContent = '👁️';
    btn.title = 'Show password';
  }
}

function switchAuthMode(mode) {
  authMode = mode;
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  const submitText = document.getElementById('authSubmitText');
  const title = document.getElementById('authModalTitle');

  if (mode === 'signup') {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    submitText.textContent = 'Create Account';
    title.textContent = 'Create Your Animebook Account';
  } else {
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
    submitText.textContent = 'Sign In';
    title.textContent = 'Welcome Back to Animebook';
  }

  document.getElementById('authAlert').style.display = 'none';
}

async function submitAuth() {
  if (!supabaseClient) return;

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const alertEl = document.getElementById('authAlert');

  if (!email || !password) {
    alertEl.className = 'auth-alert error';
    alertEl.textContent = 'Please enter both your email and password.';
    alertEl.style.display = 'block';
    return;
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.6';

  try {
    if (authMode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });
      if (error) throw error;

      if (data.session) {
        showToast('🎉 Account created and signed in!');
        closeAuthModal();
      } else {
        alertEl.className = 'auth-alert success';
        alertEl.textContent = 'Account created! Please check your email inbox to verify your account (or disable email verification in your Supabase Auth settings).';
        alertEl.style.display = 'block';
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;

      showToast('👋 Welcome back!');
      closeAuthModal();
    }
  } catch (err) {
    alertEl.className = 'auth-alert error';
    alertEl.textContent = err.message || 'Authentication failed. Please check credentials.';
    alertEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
  }
}

async function handleLogout() {
  if (!supabaseClient) return;
  if (!confirm('Are you sure you want to log out?')) return;

  try {
    await supabaseClient.auth.signOut();
    showToast('🚪 Logged out successfully.');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

// ============================================================================
// ADMINISTRATOR DASHBOARD LOGIC
// ============================================================================
function openAdminModal() {
  document.getElementById('adminModal').classList.add('active');
  loadAdminData();
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('active');
}

async function loadAdminData() {
  if (!supabaseClient) return;

  const tableBody = document.getElementById('adminUsersTableBody');
  const totalUsersEl = document.getElementById('adminTotalUsers');
  const totalAnimeEl = document.getElementById('adminTotalAnime');
  const activeUsersEl = document.getElementById('adminActiveUsers');

  tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 2rem;">Loading registered users...</td></tr>`;

  try {
    // 1. Fetch registered user profiles
    const { data: profiles, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    // 2. Fetch total anime cards count
    const { count: animeCount, error: animeErr } = await supabaseClient
      .from('anime_cards')
      .select('*', { count: 'exact', head: true });

    const totalUsers = profiles ? profiles.length : 0;
    totalUsersEl.textContent = totalUsers;
    totalAnimeEl.textContent = animeCount ?? 0;

    // Active in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeCount = profiles ? profiles.filter(p => new Date(p.last_sign_in_at) >= sevenDaysAgo).length : 0;
    activeUsersEl.textContent = activeCount;

    if (!profiles || profiles.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">No registered profiles found in the database. Ensure the supabase_setup.sql trigger was executed.</td></tr>`;
      return;
    }

    tableBody.innerHTML = profiles.map(p => {
      const regDate = new Date(p.created_at).toLocaleDateString();
      const lastActive = p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString() : 'Never';
      const roleBadge = p.role === 'admin' 
        ? `<span class="badge-pill" style="background:#ef4444; color:#fff;">Admin</span>`
        : `<span class="badge-pill" style="background:#252d3d; color:#94a3b8;">User</span>`;

      return `
        <tr>
          <td><strong>${escapeHTML(p.email)}</strong></td>
          <td>${roleBadge}</td>
          <td>${regDate}</td>
          <td><span style="font-size:0.8rem; color:var(--text-muted);">${lastActive}</span></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading admin data:', err);
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #f87171; padding: 1.5rem;">Failed to fetch admin telemetry. Make sure supabase_setup.sql has been run in your Supabase SQL editor.</td></tr>`;
  }
}

// ============================================================================
// CLOUD CONFIGURATION MODAL (Setup Wizard)
// ============================================================================
function openConfigModal() {
  const config = window.SUPABASE_CONFIG || {};
  document.getElementById('configUrl').value = config.url || '';
  document.getElementById('configAnonKey').value = config.anonKey || '';
  document.getElementById('configAdminEmail').value = config.adminEmail || '';
  document.getElementById('configModal').classList.add('active');
}

function closeConfigModal() {
  document.getElementById('configModal').classList.remove('active');
}

function saveCloudConfig() {
  const rawUrl = document.getElementById('configUrl').value.trim();
  const anonKey = document.getElementById('configAnonKey').value.trim();
  const adminEmail = document.getElementById('configAdminEmail').value.trim();

  if (!rawUrl || !anonKey) {
    alert('Please enter both your Supabase Project URL and Anon Key.');
    return;
  }

  const url = cleanSupabaseUrl(rawUrl);

  // Persist to localStorage
  localStorage.setItem('animebook_supabase_url', url);
  localStorage.setItem('animebook_supabase_key', anonKey);
  localStorage.setItem('animebook_supabase_admin', adminEmail);

  window.SUPABASE_CONFIG.url = url;
  window.SUPABASE_CONFIG.anonKey = anonKey;
  window.SUPABASE_CONFIG.adminEmail = adminEmail;

  closeConfigModal();
  initSupabase();

  if (supabaseClient) {
    checkAuthSession();
    showToast('✅ Supabase connected successfully!');
  } else {
    alert('Could not initialize Supabase with those credentials. Please verify your Project URL and Anon Key.');
  }
}

// ============================================================================
// ANIME CARD TEMPLATE FORMATTERS
// ============================================================================
function getBlankTemplateString() {
  return `Blank Card Template (Copy & Paste for New Entries)

Title: [Insert Anime Name]

Format: [TV / Movie / OVA] | Studio: [Studio Name] | Genre: [Genres]

Status: [Plan to Watch / Watching / Completed] |

Progress: 0/ [Total] | Score: /10 | Favorite Character: [Name]

Watch Notes & Live Thoughts:

O

Ep 1-5:

Ο

Mid-Season Arc:

O

Final Thoughts:

Favorite Quote /Highlight:

"Insert memorable line or moment here..."`;
}

function entryToTemplateString(entry) {
  return `Title: ${entry.title || '[Untitled Anime]'}

Format: ${entry.format || 'TV'} | Studio: ${entry.studio || 'Unknown'} | Genre: ${entry.genre || 'None'}

Status: ${entry.status || 'Plan to Watch'} |

Progress: ${entry.progressCurrent || 0}/ ${entry.progressTotal || '?'} | Score: ${entry.score ? entry.score + '/10' : '/10'} | Favorite Character: ${entry.favoriteCharacter || '[None]'}

Watch Notes & Live Thoughts:

O

Ep 1-5:
${entry.notesEp1_5 || ''}

Ο

Mid-Season Arc:
${entry.notesMidSeason || ''}

O

Final Thoughts:
${entry.notesFinalThoughts || ''}

Favorite Quote /Highlight:

"${entry.favoriteQuote || 'Insert memorable line or moment here...'}"`;
}

// ============================================================================
// CARD CRUD ACTIONS
// ============================================================================
function addNewEntry() {
  const newEntry = {
    id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: '',
    format: 'TV',
    studio: '',
    genre: '',
    status: 'Plan to Watch',
    progressCurrent: 0,
    progressTotal: 12,
    score: '',
    favoriteCharacter: '',
    notesEp1_5: '',
    notesMidSeason: '',
    notesFinalThoughts: '',
    favoriteQuote: '',
    createdAt: Date.now()
  };

  entries.unshift(newEntry);
  expandedCardIds.add(newEntry.id);
  saveToStorage(true);
  if (currentUser && supabaseClient) {
    saveEntryToCloud(newEntry);
  }

  render();

  setTimeout(() => {
    const firstInput = document.querySelector(`.anime-card[data-id="${newEntry.id}"] .title-input`);
    if (firstInput) {
      firstInput.focus();
      firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);

  showToast('✨ New anime card created!');
}

function toggleCardExpansion(id, event) {
  if (event && event.target && event.target.closest('.no-toggle')) {
    return;
  }

  const card = document.querySelector(`.anime-card[data-id="${id}"]`);
  if (!card) return;

  if (expandedCardIds.has(id)) {
    expandedCardIds.delete(id);
    card.classList.remove('expanded');
  } else {
    expandedCardIds.add(id);
    card.classList.add('expanded');
  }
}

function toggleExpandAll() {
  allExpanded = !allExpanded;
  const cards = document.querySelectorAll('.anime-card');

  if (allExpanded) {
    entries.forEach(e => expandedCardIds.add(e.id));
    cards.forEach(card => card.classList.add('expanded'));
  } else {
    expandedCardIds.clear();
    cards.forEach(card => card.classList.remove('expanded'));
  }

  const btn = document.getElementById('expandAllBtn');
  if (btn) {
    btn.innerHTML = allExpanded ? '<span>▲</span> Collapse All' : '<span>▼</span> Expand All';
  }
}

function duplicateEntry(id) {
  const original = entries.find(e => e.id === id);
  if (!original) return;

  const clone = {
    ...JSON.parse(JSON.stringify(original)),
    id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: original.title ? `${original.title} (Copy)` : 'Copy',
    createdAt: Date.now()
  };

  const idx = entries.findIndex(e => e.id === id);
  entries.splice(idx + 1, 0, clone);
  expandedCardIds.add(clone.id);
  saveToStorage(true);
  if (currentUser && supabaseClient) {
    saveEntryToCloud(clone);
  }

  render();
  showToast('📄 Card duplicated!');
}

async function deleteEntry(id) {
  const entry = entries.find(e => e.id === id);
  const name = entry?.title ? `"${entry.title}"` : 'this card';
  if (!confirm(`Are you sure you want to delete ${name}?`)) return;

  entries = entries.filter(e => e.id !== id);
  expandedCardIds.delete(id);
  saveToStorage(true);
  if (currentUser && supabaseClient) {
    await deleteEntryFromCloud(id);
  }

  render();
  showToast('🗑️ Card deleted');
}

function updateField(id, field, value) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  entry[field] = value;

  // Auto-status logic when updating progress
  if (field === 'progressCurrent' || field === 'progressTotal') {
    const cur = parseInt(entry.progressCurrent, 10) || 0;
    const tot = parseInt(entry.progressTotal, 10) || 0;
    if (tot > 0 && cur >= tot && entry.status === 'Watching') {
      entry.status = 'Completed';
      const statusSelect = document.querySelector(`.anime-card[data-id="${id}"] .status-select`);
      if (statusSelect) statusSelect.value = 'Completed';
    }
  }

  updateCardSummary(id);
  debouncedSave(id);
}

function updateCardSummary(id) {
  const entry = entries.find(e => e.id === id);
  const card = document.querySelector(`.anime-card[data-id="${id}"]`);
  if (!entry || !card) return;

  const titleEl = card.querySelector('.summary-title');
  if (titleEl) titleEl.textContent = entry.title || '[Untitled Anime]';

  const metaEl = card.querySelector('.summary-meta-row');
  if (metaEl) {
    const parts = [];
    if (entry.studio) parts.push(entry.studio);
    if (entry.genre) parts.push(entry.genre);
    if (entry.favoriteCharacter) parts.push(`★ Fav: ${entry.favoriteCharacter}`);
    metaEl.textContent = parts.join(' • ') || 'Click to view details & notes';
  }

  const formatEl = card.querySelector('.badge-format');
  if (formatEl) formatEl.textContent = entry.format || 'TV';

  const statusEl = card.querySelector('.summary-badge-status');
  if (statusEl) {
    statusEl.className = `badge-pill summary-badge-status status-${(entry.status || '').toLowerCase().replace(/\s+/g, '')}`;
    statusEl.textContent = entry.status || 'Plan to Watch';
  }

  const progEl = card.querySelector('.badge-progress');
  if (progEl) progEl.textContent = `${entry.progressCurrent || 0}/${entry.progressTotal || '?'}`;

  const scoreEl = card.querySelector('.badge-score');
  if (scoreEl) scoreEl.textContent = `★ ${entry.score ? entry.score : '-'}`;

  const fillEl = card.querySelector('.progress-bar-fill');
  if (fillEl) {
    const pct = getProgressPercent(entry.progressCurrent, entry.progressTotal);
    fillEl.style.width = `${pct}%`;
  }
}

function incrementProgress(id, delta) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  let cur = parseInt(entry.progressCurrent, 10) || 0;
  const tot = parseInt(entry.progressTotal, 10) || 0;

  cur = Math.max(0, cur + delta);
  if (tot > 0 && cur > tot) cur = tot;

  entry.progressCurrent = cur;

  if (tot > 0 && cur === tot && entry.status === 'Watching') {
    entry.status = 'Completed';
    showToast(`🎉 Finished ${entry.title || 'Anime'}! Marked Completed.`);
  }

  saveToStorage(true);
  if (currentUser && supabaseClient) {
    saveEntryToCloud(entry);
  }
  render();
}

function getProgressPercent(current, total) {
  const cur = parseInt(current, 10) || 0;
  const tot = parseInt(total, 10) || 0;
  if (!tot || tot <= 0) return 0;
  return Math.min(100, Math.round((cur / tot) * 100));
}

// ============================================================================
// RENDERING & CARD TEMPLATES
// ============================================================================
function render() {
  const container = document.getElementById('animeContainer');
  if (!container) return;

  let filtered = entries.filter(entry => {
    if (activeFilter !== 'All' && entry.status !== activeFilter) {
      return false;
    }
    if (searchQuery) {
      const matchText = [
        entry.title,
        entry.studio,
        entry.genre,
        entry.favoriteCharacter,
        entry.notesEp1_5,
        entry.notesMidSeason,
        entry.notesFinalThoughts,
        entry.favoriteQuote
      ].filter(Boolean).join(' ').toLowerCase();

      return matchText.includes(searchQuery);
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (currentSort === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
    if (currentSort === 'title') return (a.title || '').localeCompare(b.title || '');
    if (currentSort === 'score') return (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0);
    if (currentSort === 'progress') {
      return getProgressPercent(b.progressCurrent, b.progressTotal) - getProgressPercent(a.progressCurrent, a.progressTotal);
    }
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📺</div>
        <h3>No Anime Found</h3>
        <p>${searchQuery || activeFilter !== 'All' ? 'Try adjusting your search query or filter.' : 'Your anime book is empty! Click below to add your first entry.'}</p>
        <button class="btn btn-primary" onclick="addNewEntry()">+ Add First Anime</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(createCardHTML).join('');
}

function createCardHTML(entry) {
  const pct = getProgressPercent(entry.progressCurrent, entry.progressTotal);
  const statusSlug = (entry.status || '').toLowerCase().replace(/\s+/g, '');
  const statusClass = `status-${statusSlug}`;
  const isExpanded = expandedCardIds.has(entry.id);

  const metaParts = [];
  if (entry.studio) metaParts.push(entry.studio);
  if (entry.genre) metaParts.push(entry.genre);
  if (entry.favoriteCharacter) metaParts.push(`★ Fav: ${entry.favoriteCharacter}`);
  const summaryMetaText = metaParts.join(' • ') || 'Click to view details & notes';

  return `
    <div class="anime-card ${isExpanded ? 'expanded' : ''}" data-id="${entry.id}">
      
      <!-- Collapsed Tab Header -->
      <div class="card-summary-bar" onclick="toggleCardExpansion('${entry.id}', event)">
        <div class="summary-left">
          <span class="chevron-indicator" title="Click to expand/collapse">▼</span>
          <div class="summary-title-block">
            <div class="summary-title">${escapeHTML(entry.title || '[Untitled Anime]')}</div>
            <div class="summary-meta-row">${escapeHTML(summaryMetaText)}</div>
          </div>
        </div>

        <div class="summary-right">
          <span class="badge-pill badge-format">${escapeHTML(entry.format || 'TV')}</span>
          <span class="badge-pill summary-badge-status ${statusClass}">${escapeHTML(entry.status || 'Plan to Watch')}</span>
          <span class="badge-pill badge-progress" title="Progress">${entry.progressCurrent || 0}/${entry.progressTotal || '?'}</span>
          <span class="badge-pill badge-score" title="Score">★ ${entry.score ? escapeHTML(String(entry.score)) : '-'}</span>
        </div>
      </div>

      <!-- Expandable Details Content -->
      <div class="card-details-wrapper">
        <div class="card-details-content">
          
          <!-- Top Title & Action Bar -->
          <div class="card-top">
            <div class="title-container">
              <input 
                type="text" 
                class="title-input no-toggle" 
                placeholder="[Insert Anime Name]" 
                value="${escapeHTML(entry.title || '')}"
                oninput="updateField('${entry.id}', 'title', this.value)"
              />
            </div>
            <div class="card-actions no-toggle">
              <button class="action-btn" title="Copy Card Template" onclick="copyCardAsTemplate('${entry.id}')">📋</button>
              <button class="action-btn" title="Duplicate Card" onclick="duplicateEntry('${entry.id}')">📄</button>
              <button class="action-btn btn-danger" title="Delete Card" onclick="deleteEntry('${entry.id}')">🗑️</button>
            </div>
          </div>

          <!-- Format, Studio, Genre Row -->
          <div class="metadata-grid no-toggle">
            <div class="meta-field">
              <label class="meta-field-label">Format</label>
              <select 
                class="inline-select"
                onchange="updateField('${entry.id}', 'format', this.value)"
              >
                <option value="TV" ${entry.format === 'TV' ? 'selected' : ''}>TV</option>
                <option value="Movie" ${entry.format === 'Movie' ? 'selected' : ''}>Movie</option>
                <option value="OVA" ${entry.format === 'OVA' ? 'selected' : ''}>OVA</option>
                <option value="ONA" ${entry.format === 'ONA' ? 'selected' : ''}>ONA</option>
                <option value="Special" ${entry.format === 'Special' ? 'selected' : ''}>Special</option>
              </select>
            </div>

            <div class="meta-field">
              <label class="meta-field-label">Studio</label>
              <input 
                type="text" 
                class="inline-input" 
                placeholder="Studio Name" 
                value="${escapeHTML(entry.studio || '')}"
                oninput="updateField('${entry.id}', 'studio', this.value)"
              />
            </div>

            <div class="meta-field">
              <label class="meta-field-label">Genre</label>
              <input 
                type="text" 
                class="inline-input" 
                placeholder="Action, Sci-Fi..." 
                value="${escapeHTML(entry.genre || '')}"
                oninput="updateField('${entry.id}', 'genre', this.value)"
              />
            </div>
          </div>

          <!-- Status, Progress, Score, Favorite Character -->
          <div class="status-progress-grid no-toggle">
            <div class="meta-field">
              <label class="meta-field-label">Status</label>
              <select 
                class="inline-select status-select ${statusClass}"
                onchange="updateField('${entry.id}', 'status', this.value)"
              >
                <option value="Plan to Watch" ${entry.status === 'Plan to Watch' ? 'selected' : ''}>Plan to Watch</option>
                <option value="Watching" ${entry.status === 'Watching' ? 'selected' : ''}>Watching</option>
                <option value="Completed" ${entry.status === 'Completed' ? 'selected' : ''}>Completed</option>
                <option value="On Hold" ${entry.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                <option value="Dropped" ${entry.status === 'Dropped' ? 'selected' : ''}>Dropped</option>
              </select>
            </div>

            <div class="meta-field">
              <label class="meta-field-label">Progress</label>
              <div class="progress-control">
                <button class="progress-btn" onclick="incrementProgress('${entry.id}', -1)" title="-1 Episode">-</button>
                <input 
                  type="number" 
                  min="0"
                  class="progress-num" 
                  value="${entry.progressCurrent ?? 0}"
                  oninput="updateField('${entry.id}', 'progressCurrent', parseInt(this.value, 10) || 0)"
                />
                <span class="progress-slash">/</span>
                <input 
                  type="text" 
                  class="progress-num" 
                  placeholder="Total" 
                  value="${entry.progressTotal ?? 12}"
                  oninput="updateField('${entry.id}', 'progressTotal', this.value)"
                />
                <button class="progress-btn" onclick="incrementProgress('${entry.id}', 1)" title="+1 Episode">+</button>
              </div>
            </div>

            <div class="meta-field">
              <label class="meta-field-label">Score (/10)</label>
              <div class="score-box">
                <span class="score-star">★</span>
                <input 
                  type="text" 
                  class="score-input" 
                  placeholder="-" 
                  maxlength="4"
                  value="${escapeHTML(entry.score ? String(entry.score) : '')}"
                  oninput="updateField('${entry.id}', 'score', this.value)"
                />
              </div>
            </div>

            <div class="meta-field">
              <label class="meta-field-label">Fav Character</label>
              <input 
                type="text" 
                class="inline-input" 
                placeholder="Character Name" 
                value="${escapeHTML(entry.favoriteCharacter || '')}"
                oninput="updateField('${entry.id}', 'favoriteCharacter', this.value)"
              />
            </div>
          </div>

          <!-- Progress Bar Fill -->
          <div class="progress-bar-container" title="${pct}% Completed">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>

          <!-- Watch Notes & Live Thoughts Section -->
          <div class="notes-section no-toggle">
            <div class="notes-header-row">
              <span class="section-label">
                <span>📝</span> Watch Notes & Live Thoughts
              </span>
            </div>

            <div class="notes-grid">
              <div class="note-block">
                <div class="note-tag">
                  <span class="circle-icon"></span>
                  <span>Ep 1-5:</span>
                </div>
                <textarea 
                  class="note-textarea" 
                  placeholder="Initial impressions, animation, hook..."
                  oninput="updateField('${entry.id}', 'notesEp1_5', this.value)"
                >${escapeHTML(entry.notesEp1_5 || '')}</textarea>
              </div>

              <div class="note-block">
                <div class="note-tag">
                  <span class="circle-icon" style="background:#a855f7;"></span>
                  <span style="color:#a855f7;">Mid-Season Arc:</span>
                </div>
                <textarea 
                  class="note-textarea" 
                  placeholder="Plot progression, character development, climaxes..."
                  oninput="updateField('${entry.id}', 'notesMidSeason', this.value)"
                >${escapeHTML(entry.notesMidSeason || '')}</textarea>
              </div>

              <div class="note-block">
                <div class="note-tag">
                  <span class="circle-icon" style="background:#10b981;"></span>
                  <span style="color:#10b981;">Final Thoughts:</span>
                </div>
                <textarea 
                  class="note-textarea" 
                  placeholder="Ending satisfaction, themes, overall verdict..."
                  oninput="updateField('${entry.id}', 'notesFinalThoughts', this.value)"
                >${escapeHTML(entry.notesFinalThoughts || '')}</textarea>
              </div>
            </div>
          </div>

          <!-- Favorite Quote / Highlight -->
          <div class="quote-block no-toggle">
            <span class="quote-label">Favorite Quote / Highlight</span>
            <textarea 
              class="quote-textarea" 
              placeholder="&ldquo;Insert memorable line or moment here...&rdquo;"
              oninput="updateField('${entry.id}', 'favoriteQuote', this.value)"
            >${escapeHTML(entry.favoriteQuote || '')}</textarea>
          </div>

        </div>
      </div>

    </div>
  `;
}

// Update Top Statistics Bar
function updateStats() {
  const total = entries.length;
  const watching = entries.filter(e => e.status === 'Watching').length;
  const completed = entries.filter(e => e.status === 'Completed').length;
  const plan = entries.filter(e => e.status === 'Plan to Watch').length;

  const scoredEntries = entries.filter(e => parseFloat(e.score) > 0);
  const avgScore = scoredEntries.length > 0 
    ? (scoredEntries.reduce((acc, cur) => acc + parseFloat(cur.score), 0) / scoredEntries.length).toFixed(1)
    : '-';

  const elTotal = document.getElementById('statTotal');
  const elWatching = document.getElementById('statWatching');
  const elCompleted = document.getElementById('statCompleted');
  const elPlan = document.getElementById('statPlan');
  const elAvg = document.getElementById('statAvg');

  if (elTotal) elTotal.textContent = total;
  if (elWatching) elWatching.textContent = watching;
  if (elCompleted) elCompleted.textContent = completed;
  if (elPlan) elPlan.textContent = plan;
  if (elAvg) elAvg.textContent = avgScore !== '-' ? `★ ${avgScore}` : '-';
}

function copyCardAsTemplate(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  const text = entryToTemplateString(entry);
  copyTextToClipboard(text, `Copied "${entry.title || 'Anime'}" template to clipboard!`);
}

function copyTextToClipboard(text, successMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage);
    }).catch(() => {
      fallbackCopy(text, successMessage);
    });
  } else {
    fallbackCopy(text, successMessage);
  }
}

function fallbackCopy(text, successMessage) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(successMessage);
  } catch (err) {
    alert('Clipboard copy failed. Please copy manually.');
  }
  document.body.removeChild(textarea);
}

// Toast Notifications
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('active');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 2800);
}

// Export JSON
function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `animebook_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('💾 Exported JSON Backup');
}

// Export Markdown
function exportMarkdown() {
  let md = `# 🎌 My Anime Logbook\n\nExported on: ${new Date().toLocaleDateString()}\n\n---\n\n`;
  entries.forEach((entry, i) => {
    md += `## ${i + 1}. ${entry.title || 'Untitled'}\n\n`;
    md += `**Format:** ${entry.format} | **Studio:** ${entry.studio || 'N/A'} | **Genre:** ${entry.genre || 'N/A'}\n\n`;
    md += `**Status:** ${entry.status} | **Progress:** ${entry.progressCurrent}/${entry.progressTotal} | **Score:** ${entry.score ? entry.score + '/10' : 'Unrated'} | **Favorite Character:** ${entry.favoriteCharacter || 'None'}\n\n`;
    md += `### Watch Notes & Live Thoughts\n\n`;
    if (entry.notesEp1_5) md += `* **Ep 1-5:** ${entry.notesEp1_5}\n\n`;
    if (entry.notesMidSeason) md += `* **Mid-Season Arc:** ${entry.notesMidSeason}\n\n`;
    if (entry.notesFinalThoughts) md += `* **Final Thoughts:** ${entry.notesFinalThoughts}\n\n`;
    if (entry.favoriteQuote) md += `> "${entry.favoriteQuote}"\n\n`;
    md += `---\n\n`;
  });

  const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Anime_Logbook_${new Date().toISOString().slice(0, 10)}.md`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('📄 Exported Markdown Logbook');
}

// Modal management
function openImportModal() {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('importTextarea').value = '';
}

function closeImportModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function executeImport() {
  const text = document.getElementById('importTextarea').value.trim();
  if (!text) {
    alert('Please paste JSON data to import.');
    return;
  }

  try {
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) {
      throw new Error('Import data must be a JSON array of anime cards.');
    }

    const replace = confirm('Do you want to REPLACE existing entries? Click OK to replace all, or Cancel to MERGE.');
    if (replace) {
      entries = imported;
    } else {
      imported.forEach(item => {
        item.id = 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        entries.unshift(item);
      });
    }

    saveToStorage(true);
    if (currentUser && supabaseClient) {
      entries.forEach(item => saveEntryToCloud(item));
    }

    render();
    closeImportModal();
    showToast(`✅ Successfully loaded ${imported.length} anime entries!`);
  } catch (err) {
    alert('Invalid JSON format: ' + err.message);
  }
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start application
window.addEventListener('DOMContentLoaded', init);
