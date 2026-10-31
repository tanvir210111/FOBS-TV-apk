/**
 * FOBS TV — Master Web Admin Hub (v3.2.0)
 * Complete Administrative Control Suite for Catalog, Streaming, Users, Updates & VPS Cloud
 */

// ============================================================
// GLOBAL STATE
// ============================================================
const state = {
  token: localStorage.getItem('fobs_admin_token') || null,
  content: {
    movies: [],
    series: [],
    liveTv: [],
    upcoming: [],
    featured: {},
    appUpdate: {},
    settings: {}
  },
  stats: {},
  usersData: null,
  notifications: [],
  reports: [],
  requests: [],
  activeTab: 'overview',
  
  // Pagination & Filtering
  movies: {
    page: 1,
    perPage: 20,
    search: '',
    genre: '',
    industry: '',
    filtered: []
  },
  series: {
    page: 1,
    perPage: 20,
    search: '',
    industry: '',
    filtered: []
  },
  channels: {
    search: '',
    category: '',
    filtered: []
  },
  upcoming: {
    search: '',
    filtered: []
  },

  // Episode Studio Active State
  studio: {
    seriesId: null,
    series: null,
    seasons: [],
    activeSeasonIndex: 0
  },

  // In-Admin Video Player
  hlsInstance: null
};

// ============================================================
// API HELPERS & AUTHENTICATION
// ============================================================
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': state.token ? `Bearer ${state.token}` : ''
  };
}

async function apiFetch(url, options = {}) {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  // Handle file downloads
  const disposition = res.headers.get('content-disposition');
  if (disposition && disposition.includes('attachment')) {
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}

function showLoginModal() {
  document.getElementById('login-modal').classList.add('active');
  document.getElementById('app').style.display = 'none';
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.remove('active');
  document.getElementById('app').style.display = 'flex';
}

async function verifyAuth() {
  if (!state.token) {
    showLoginModal();
    return;
  }

  try {
    const data = await apiFetch('/api/admin/stats');
    state.stats = data;
    hideLoginModal();
    await initApp();
  } catch (err) {
    console.warn('Auth check failed:', err.message);
    state.token = null;
    localStorage.removeItem('fobs_admin_token');
    showLoginModal();
  }
}

function logout() {
  state.token = null;
  localStorage.removeItem('fobs_admin_token');
  showLoginModal();
  showToast('Logged out successfully', 'info');
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-bolt';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// APP INITIALIZATION
// ============================================================
async function initApp() {
  try {
    // Load Initial Core Catalog & Stats in parallel
    await Promise.allSettled([
      loadStats(),
      loadContent(),
      loadNotifications(),
      loadReportsAndRequests(),
      loadAppSettings()
    ]);
  } catch (err) {
    console.warn('Initial data load warning:', err);
  }

  // Handle Initial Route from URL Hash
  const hash = window.location.hash.replace('#', '') || 'overview';
  switchTab(hash);
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('mobile-open');
    });
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', refreshAll);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  window.location.hash = tabName;

  // Update Nav selection
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  // Switch Tab Panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // Update Topbar Title & Subtitle
  const titles = {
    overview: { title: 'Master Dashboard', sub: 'Real-time statistics and streaming engine status' },
    moviebox: { title: 'MovieBox Importer', sub: 'Universal live search and 1-click catalog import' },
    movies: { title: 'Movies Management', sub: 'Manage, search, preview and edit movie catalog' },
    series: { title: 'Series & TV Studio', sub: 'Deep seasons, episodes, server links & subtitles manager' },
    livetv: { title: 'Live TV Channels', sub: 'Manage Sports, Bangla, News and Entertainment streams' },
    featured: { title: 'Hero Spotlight Banner', sub: 'Configure primary hero banner at top of mobile & web app' },
    upcoming: { title: 'Upcoming Releases', sub: 'Schedule future releases and countdown teasers' },
    notifications: { title: 'In-App Announcements', sub: 'Push notification messages and updates to app bell' },
    feedback: { title: 'Requests & Video Reports', sub: 'User-submitted movie requests and broken stream diagnostics' },
    users: { title: 'App Users & Devices', sub: 'Audience analytics, active versions and device compliance' },
    settings: { title: 'App Settings & Update', sub: 'Remote APK version control, force update and maintenance' },
    system: { title: 'Cloud Deploy & Backups', sub: '1-Click VPS deployment, token repair and database snapshots' }
  };

  const meta = titles[tabName] || { title: 'FOBS TV Admin', sub: 'Control Hub' };
  document.getElementById('page-title').innerText = meta.title;
  document.getElementById('page-subtitle').innerText = meta.sub;

  // Close mobile sidebar if open
  document.querySelector('.sidebar').classList.remove('mobile-open');

  // Load tab-specific dynamic data
  if (tabName === 'overview') renderOverview();
  if (tabName === 'moviebox') {
    const mbResults = document.getElementById('moviebox-results');
    if (!mbResults || !mbResults.children.length || mbResults.querySelector('.empty-state')) {
      loadMovieBoxRecent('all');
    }
  }
  if (tabName === 'movies') renderMoviesTable();
  if (tabName === 'series') renderSeriesTable();
  if (tabName === 'livetv') renderChannelsGrid();
  if (tabName === 'featured') renderHeroEditor();
  if (tabName === 'upcoming') loadUpcoming();
  if (tabName === 'notifications') renderNotificationsList();
  if (tabName === 'feedback') renderReportsAndRequests();
  if (tabName === 'users') {
    loadUsers();
    startUsersLivePolling();
  } else {
    stopUsersLivePolling();
  }
  if (tabName === 'settings') loadAppSettings();
}

function setupEventListeners() {
  // Login Form
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    const errText = document.getElementById('login-error');
    const pwd = document.getElementById('admin-password').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authorizing...';
    errText.innerText = '';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Invalid credentials');
      }

      state.token = data.token;
      localStorage.setItem('fobs_admin_token', data.token);
      hideLoginModal();
      await initApp();
      showToast('Welcome to FOBS TV Master Control', 'success');
    } catch (err) {
      errText.innerText = err.message || 'Access denied';
      showToast(err.message || 'Login failed', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Authorize Master Access</span> <i class="fa-solid fa-arrow-right"></i>';
    }
  });

  // Maintenance Toggle Display
  const maintToggle = document.getElementById('st-maintenance-toggle');
  if (maintToggle) {
    maintToggle.addEventListener('change', () => {
      document.getElementById('maintenance-msg-group').style.display = maintToggle.checked ? 'block' : 'none';
    });
  }

  // Search input enter key bindings
  const mbInput = document.getElementById('mb-search-input');
  if (mbInput) {
    mbInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchMovieBoxFromInput();
    });
  }

  // Keyboard shortcut: Escape closes active modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeImportModal();
      closeMovieModal();
      closeSeriesModal();
      closeEpisodeStudio();
      closeSingleEpisodeModal();
      closeChannelModal();
      closeUpcomingModal();
      closeVideoPlayer();
      closeCatalogPicker();
    }
  });
}

async function refreshAll() {
  showToast('Refreshing system state...', 'info', 1500);
  await Promise.all([
    loadStats(),
    loadContent(),
    loadNotifications(),
    loadReportsAndRequests()
  ]);
  switchTab(state.activeTab);
  showToast('All data refreshed', 'success', 2000);
}

// ============================================================
// DATA LOADERS
// ============================================================
async function loadStats() {
  try {
    const data = await apiFetch('/api/admin/stats');
    state.stats = data;
    renderStats(data);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function renderStats(data) {
  if (!data) return;
  const s = data.stats || data;
  const movies = s.totalMovies ?? s.movies ?? 0;
  const series = s.totalSeries ?? s.series ?? 0;
  const liveTv = s.totalChannels ?? s.liveTv ?? 0;
  const reports = (s.pendingRequests ?? s.reports ?? 0) + (s.totalReports ?? 0);

  document.getElementById('badge-movies-count').innerText = movies;
  document.getElementById('badge-series-count').innerText = series;
  document.getElementById('badge-channels-count').innerText = liveTv;
  document.getElementById('badge-feedback-count').innerText = reports;

  document.getElementById('stat-movies-count').innerText = movies.toLocaleString();
  document.getElementById('stat-series-count').innerText = series.toLocaleString();
  document.getElementById('stat-channels-count').innerText = liveTv.toLocaleString();
  document.getElementById('stat-reports-count').innerText = reports.toLocaleString();

  document.getElementById('node-ver').innerText = s.nodeVersion || s.system?.node || 'v22';
  document.getElementById('ram-usage').innerText = `${s.memoryMb || s.system?.memory?.usedMb || '--'} MB`;
  document.getElementById('status-uptime').innerText = `Uptime: ${s.uptimeSeconds ? Math.floor(s.uptimeSeconds / 60) + 'm' : (s.system?.uptime || '--')}`;
}

async function loadContent() {
  try {
    const res = await apiFetch('/api/admin/content');
    const data = res.data || res;
    state.content = data;

    // Initialize filtered datasets
    state.movies.filtered = [...(data.movies || [])];
    state.series.filtered = [...(data.series || [])];
    state.channels.filtered = [...(data.liveTv || [])];
    state.upcoming.filtered = [...(data.upcoming || [])];

    // Populate Dynamic Genre Filter for Movies
    populateMovieGenreFilter();
  } catch (err) {
    console.error('Failed to load content:', err);
  }
}

function populateMovieGenreFilter() {
  const genres = new Set();
  (state.content.movies || []).forEach(m => {
    if (m.genre) {
      m.genre.split(',').forEach(g => genres.add(g.trim()));
    }
  });

  const select = document.getElementById('movies-genre-filter');
  if (!select) return;
  select.innerHTML = '<option value="">All Genres</option>';
  Array.from(genres).sort().forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.innerText = g;
    select.appendChild(opt);
  });
}

async function loadNotifications() {
  try {
    const data = await apiFetch('/api/admin/notifications');
    state.notifications = Array.isArray(data) ? data : (data.notifications || []);
    document.getElementById('badge-notif-count').innerText = state.notifications.length;
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

async function loadReportsAndRequests() {
  try {
    const [reportsRes, requestsRes] = await Promise.all([
      apiFetch('/api/admin/reports').catch(() => ({ reports: [] })),
      apiFetch('/api/admin/requests').catch(() => ({ requests: [] }))
    ]);
    state.reports = Array.isArray(reportsRes) ? reportsRes : (reportsRes.reports || []);
    state.requests = Array.isArray(requestsRes) ? requestsRes : (requestsRes.requests || []);
    
    document.getElementById('badge-sub-reports').innerText = state.reports.length;
    document.getElementById('badge-sub-requests').innerText = state.requests.length;
    document.getElementById('badge-feedback-count').innerText = state.reports.length + state.requests.length;
  } catch (err) {
    console.error('Failed to load feedback:', err);
  }
}

async function loadAppSettings() {
  try {
    const data = await apiFetch('/api/admin/app-settings');
    const update = data.appUpdate || {};
    const settings = data.settings || {};

    // Fill App Update Fields
    document.getElementById('up-version-name').value = update.latestVersionName || '3.1.1';
    document.getElementById('up-version-code').value = update.latestVersionCode || 9;
    document.getElementById('up-min-code').value = update.minVersionCode || 9;
    document.getElementById('up-file-size').value = update.fileSize || '6.1 MB';
    document.getElementById('up-force-toggle').checked = !!update.forceUpdate;
    document.getElementById('up-enabled-toggle').checked = update.enabled !== false;
    document.getElementById('up-title').value = update.title || '';
    document.getElementById('up-message').value = update.message || '';
    document.getElementById('up-release-notes').value = Array.isArray(update.releaseNotes) ? update.releaseNotes.join('\n') : (update.releaseNotes || '');
    document.getElementById('up-download-url').value = update.downloadUrl || 'https://fobs-apk-download.vercel.app/';
    document.getElementById('up-fallback-url').value = update.fallbackUrl || 'http://187.127.114.52/download/apk';

    // Fill Settings Fields
    document.getElementById('st-app-name').value = settings.appName || 'FOBS TV';
    document.getElementById('st-tagline').value = settings.appTagline || '';
    document.getElementById('st-marquee').value = settings.marqueeNotice || '';
    document.getElementById('st-telegram').value = settings.supportTelegram || '';
    document.getElementById('st-whatsapp').value = settings.supportWhatsApp || '';
    document.getElementById('st-maintenance-toggle').checked = !!settings.maintenanceMode;
    document.getElementById('maintenance-msg-group').style.display = settings.maintenanceMode ? 'block' : 'none';
    document.getElementById('st-maintenance-msg').value = settings.maintenanceMessage || '';
  } catch (err) {
    console.error('Failed to load app settings:', err);
  }
}

// ============================================================
// TAB 1: OVERVIEW DASHBOARD
// ============================================================
function renderOverview() {
  renderStats(state.stats);

  // Active Hero Preview in Overview
  const feat = state.content.featured || {};
  const bg = feat.backdrop || feat.cover || feat.poster || '';
  const ovBg = document.getElementById('ov-hero-bg');
  const ovTitle = document.getElementById('ov-hero-title');
  const ovMeta = document.getElementById('ov-hero-meta');
  const ovBadge = document.getElementById('ov-hero-badge');

  if (feat.title) {
    if (ovBg) ovBg.style.backgroundImage = `url('${bg}')`;
    if (ovTitle) ovTitle.innerText = feat.title;
    if (ovMeta) ovMeta.innerText = `${feat.year || '2026'} • ${feat.category || feat.industry || 'Featured'} • IMDB ${feat.rating || '9.0'}`;
    if (ovBadge) ovBadge.innerText = feat.badgeLeft || 'Spotlight';
  } else {
    if (ovBg) ovBg.style.backgroundImage = 'none';
    if (ovTitle) ovTitle.innerText = 'No Hero Spotlight Set';
    if (ovMeta) ovMeta.innerText = 'Click Manage Banner to configure';
  }
}

// ============================================================
// TAB 2: MOVIEBOX UNIVERSAL IMPORTER
// ============================================================
function searchMovieBoxFromInput() {
  const query = document.getElementById('mb-search-input').value.trim();
  if (!query) {
    showToast('Please enter a search title', 'warning');
    return;
  }
  searchMovieBox(query);
}

async function searchMovieBox(query) {
  const container = document.getElementById('moviebox-results');
  const countDisplay = document.getElementById('mb-results-count');
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Searching MovieBox worldwide catalog for "${query}"...</p>
    </div>
  `;
  countDisplay.innerText = 'Searching...';

  try {
    const data = await apiFetch(`/api/admin/moviebox/search?q=${encodeURIComponent(query)}`);
    const items = data.items || [];
    state.mbSearchItems = items;
    state.mbCurrentQuery = query;

    // Reset filter pills to All
    document.querySelectorAll('#mb-filter-pills .pill').forEach(p => p.classList.remove('active'));
    document.querySelector('#mb-filter-pills .pill[data-filter="all"]')?.classList.add('active');

    countDisplay.innerText = `Found ${items.length} titles`;
    renderMovieBoxGrid(items);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation text-rose"></i>
        <h3>Search failed</h3>
        <p>${err.message}</p>
      </div>
    `;
    countDisplay.innerText = 'Error';
  }
}

async function loadMovieBoxRecent(filter = 'all', pillBtn = null) {
  if (pillBtn) {
    document.querySelectorAll('#mb-filter-pills .pill').forEach(p => p.classList.remove('active'));
    pillBtn.classList.add('active');
  }

  const container = document.getElementById('moviebox-results');
  const countDisplay = document.getElementById('mb-results-count');
  const searchInputVal = document.getElementById('mb-search-input')?.value?.trim();

  // If there are search results active and user clicks a filter pill, filter the search results!
  if (searchInputVal && state.mbSearchItems && state.mbSearchItems.length > 0) {
    let filtered = state.mbSearchItems;
    if (filter === 'movies') {
      filtered = state.mbSearchItems.filter(i => i.type === 'movie');
    } else if (filter === 'series') {
      filtered = state.mbSearchItems.filter(i => i.type === 'series');
    } else if (filter === 'kdrama') {
      filtered = state.mbSearchItems.filter(i => /korean|kdrama|k-drama/i.test(i.title + ' ' + (i.section || '')));
    } else if (filter === 'anime') {
      filtered = state.mbSearchItems.filter(i => /anime/i.test(i.title + ' ' + (i.section || '')));
    } else if (filter === 'bollywood') {
      filtered = state.mbSearchItems.filter(i => /hindi|bollywood|south/i.test(i.title + ' ' + (i.section || '')));
    }
    countDisplay.innerText = `${filtered.length} titles matching "${filter}"`;
    renderMovieBoxGrid(filtered);
    return;
  }

  // Clear search items when loading feed
  state.mbSearchItems = null;
  state.mbCurrentQuery = '';
  if (document.getElementById('mb-search-input')) {
    document.getElementById('mb-search-input').value = '';
  }

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Fetching ${filter} feed from MovieBox...</p>
    </div>
  `;
  countDisplay.innerText = 'Fetching...';

  try {
    const data = await apiFetch(`/api/admin/moviebox/recent?filter=${filter}`);
    const items = data.items || [];
    countDisplay.innerText = `${items.length} titles in feed`;
    renderMovieBoxGrid(items);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation text-rose"></i>
        <h3>Failed to fetch feed</h3>
        <p>${err.message}</p>
      </div>
    `;
    countDisplay.innerText = 'Error';
  }
}

function renderMovieBoxGrid(items) {
  const container = document.getElementById('moviebox-results');
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-film"></i>
        <h3>No titles found</h3>
        <p>Try searching with another keyword or explore the category feeds.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));
    const badgeType = isSeries ? 'Series' : 'Movie';
    const isAlreadyImported = (state.content.movies || []).some(m => m.subjectId === item.subjectId || m.id === `mb-m-${item.subjectId}`) ||
                              (state.content.series || []).some(s => s.subjectId === item.subjectId || s.id === `mb-s-${item.subjectId}`);

    const safeTitle = (item.title || 'Untitled').replace(/"/g, '&quot;');
    const poster = item.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80';

    return `
      <div class="importer-card glass ${isAlreadyImported ? 'imported' : ''}">
        <div class="importer-card-thumb">
          <img src="${poster}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'">
          <span class="importer-badge ${isSeries ? 'bg-cyan' : 'bg-amber'}">${badgeType}</span>
          ${isAlreadyImported ? '<span class="imported-check"><i class="fa-solid fa-check"></i> In App</span>' : ''}
        </div>
        <div class="importer-card-info">
          <h4 title="${safeTitle}">${item.title}</h4>
          <div class="importer-card-meta">
            <span><i class="fa-solid fa-calendar"></i> ${item.year || '2026'}</span>
            <span><i class="fa-solid fa-star text-amber"></i> ${item.rating || '8.5'}</span>
          </div>
          <div class="importer-card-actions">
            <button class="btn-import ${isAlreadyImported ? 'btn-reimport' : 'btn-primary'}" onclick='openImportModal(${JSON.stringify(item).replace(/'/g, "\\'")})' title="Auto-Detect &amp; Import">
              <i class="fa-solid ${isAlreadyImported ? 'fa-arrows-rotate' : 'fa-wand-magic-sparkles'}"></i>
              <span>${isAlreadyImported ? 'Re-Sync' : 'Auto-Detect'}</span>
            </button>
            <button class="btn-table play-btn" onclick="previewVideoStream('${safeTitle}', '/api/moviebox/stream?id=${item.subjectId || item.id}&path=${item.detailPath || ''}&se=${isSeries ? 1 : 0}&ep=${isSeries ? 1 : 0}')" title="Preview Stream">
              <i class="fa-solid fa-play"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// SMART AUTO-DETECT & IMPORT MODAL ENGINE
// ============================================================
async function openImportModal(item) {
  const modal = document.getElementById('import-modal');
  const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));
  const sId = String(item.subjectId || item.id || '');
  const dPath = item.detailPath || '';

  document.getElementById('imp-subjectId').value = sId;
  document.getElementById('imp-detailPath').value = dPath;
  document.getElementById('imp-poster').value = item.poster || '';
  document.getElementById('imp-cover').value = item.backdrop || item.cover || item.poster || '';
  document.getElementById('imp-title').value = item.title || '';
  document.getElementById('imp-year').value = item.year || '2026';
  document.getElementById('imp-type').value = isSeries ? 'series' : 'movie';
  document.getElementById('imp-series-row').style.display = isSeries ? 'flex' : 'none';

  const seasonSel = document.getElementById('imp-season-mode');
  if (seasonSel) {
    seasonSel.innerHTML = '<option value="all">🌟 All Seasons (Auto-Detecting...)</option>';
  }

  const tLower = (item.title || '').toLowerCase();
  const isHindi = tLower.includes('[hindi]') || tLower.includes('hindi dubbed') || tLower.includes('hindi');
  document.getElementById('imp-ishindi').checked = isHindi;
  document.getElementById('imp-featured').checked = false;

  const statusText = document.getElementById('imp-autodetect-status');
  statusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-amber"></i> Querying MovieBox API: Auto-detecting uploaded seasons, episodes, language &amp; category...';

  modal.classList.add('active');

  // Asynchronously query MovieBox for exact uploaded episode count, industry, category, and year
  try {
    const data = await apiFetch(`/api/admin/moviebox/detail?subjectId=${encodeURIComponent(sId)}`);
    if (data && data.success && data.detail) {
      const d = data.detail;

      if (d.type) {
        document.getElementById('imp-type').value = d.type;
        document.getElementById('imp-series-row').style.display = (d.type === 'series') ? 'flex' : 'none';
      }

      if (seasonSel) {
        seasonSel.innerHTML = '';
        if (d.seasons && d.seasons.length > 0) {
          const allOpt = document.createElement('option');
          allOpt.value = 'all';
          allOpt.textContent = `🌟 All Seasons (${d.seasons.length} Seasons • ${d.totalEpisodes} Episodes Total)`;
          seasonSel.appendChild(allOpt);

          d.seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = String(s.se);
            opt.textContent = `Season ${s.se} (${s.maxEp || 0} Episodes)`;
            seasonSel.appendChild(opt);
          });
        } else {
          const opt = document.createElement('option');
          opt.value = 'all';
          opt.textContent = `🌟 Season 1 (${d.totalEpisodes || 10} Episodes)`;
          seasonSel.appendChild(opt);
        }
      }

      if (d.totalEpisodes) document.getElementById('imp-episodes').value = d.totalEpisodes;
      if (d.year) document.getElementById('imp-year').value = d.year;
      if (d.industry) document.getElementById('imp-industry').value = d.industry;
      if (d.category) document.getElementById('imp-category').value = d.category;
      if (typeof d.isHindi === 'boolean') document.getElementById('imp-ishindi').checked = d.isHindi;
      if (d.cover && !document.getElementById('imp-cover').value) document.getElementById('imp-cover').value = d.cover;

      if (d.seasons && d.seasons.length > 1) {
        const breakdown = d.seasons.map(s => `S${s.se}: ${s.maxEp} eps`).join(' • ');
        statusText.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> <strong>Auto-Detected:</strong> ${d.seasons.length} Seasons (${d.totalEpisodes} Episodes Total)<br><small class="text-muted">${breakdown} • ${d.industry} (${d.category})</small>`;
      } else {
        statusText.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> <strong>Auto-Detected:</strong> ${d.totalEpisodes || 1} Episode(s) • ${d.industry} (${d.category})`;
      }
    }
  } catch (err) {
    statusText.innerHTML = '<i class="fa-solid fa-circle-check text-emerald"></i> Auto-detect loaded standard metadata. Ready to import.';
  }
}

function closeImportModal() {
  document.getElementById('import-modal').classList.remove('active');
}

function toggleImportType(type) {
  document.getElementById('imp-series-row').style.display = (type === 'series') ? 'flex' : 'none';
}

async function handleImportSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-confirm-import');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Auto-Resolving &amp; Importing...';

  const type = document.getElementById('imp-type').value;
  const isSeries = type === 'series';

  const payload = {
    subjectId: document.getElementById('imp-subjectId').value,
    detailPath: document.getElementById('imp-detailPath').value,
    title: document.getElementById('imp-title').value.trim(),
    year: document.getElementById('imp-year').value.trim(),
    type,
    category: document.getElementById('imp-category').value.trim(),
    industry: document.getElementById('imp-industry').value,
    poster: document.getElementById('imp-poster').value,
    cover: document.getElementById('imp-cover').value.trim() || document.getElementById('imp-poster').value,
    isHindi: document.getElementById('imp-ishindi').checked,
    isFeatured: document.getElementById('imp-featured').checked,
    seasonMode: document.getElementById('imp-season-mode')?.value || 'all',
    episodesCount: parseInt(document.getElementById('imp-episodes')?.value, 10) || (isSeries ? 16 : 1)
  };

  try {
    const res = await apiFetch('/api/admin/moviebox/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast(`🎉 Imported "${payload.title}" successfully into FOBS TV!`, 'success', 4500);
      closeImportModal();
      await loadContent();
      await loadStats();
      const q = document.getElementById('mb-search-input').value.trim();
      if (q) searchMovieBox(q);
      else loadMovieBoxRecent('all');
    } else {
      throw new Error(res.error || 'Import failed');
    }
  } catch (err) {
    showToast(`Import error: ${err.message}`, 'error', 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-download"></i> <span>Confirm &amp; Import to App</span>';
  }
}

// ============================================================
// ============================================================
// AUTO-DETECT TOOLBAR FOR ADD MOVIE & ADD SERIES
// ============================================================
function updateMoviePosterPreview() {
  const posterUrl = document.getElementById('m-poster')?.value.trim();
  const title = document.getElementById('m-title')?.value.trim() || 'Movie Title';
  const year = document.getElementById('m-year')?.value.trim() || '2026';
  const rating = document.getElementById('m-rating')?.value.trim() || '8.5';
  const box = document.getElementById('m-preview-box');
  const img = document.getElementById('m-poster-preview');
  const titleEl = document.getElementById('m-preview-title');
  const metaEl = document.getElementById('m-preview-meta');

  if (posterUrl && box && img) {
    img.src = posterUrl;
    img.onerror = () => { box.style.display = 'none'; };
    img.onload = () => { box.style.display = 'flex'; };
    if (titleEl) titleEl.innerText = title;
    if (metaEl) metaEl.innerText = `${year} • ★ ${rating}`;
  } else if (box) {
    box.style.display = 'none';
  }
}

function updateSeriesPosterPreview() {
  const posterUrl = document.getElementById('s-poster')?.value.trim();
  const title = document.getElementById('s-title')?.value.trim() || 'Series Title';
  const year = document.getElementById('s-year')?.value.trim() || '2026';
  const rating = document.getElementById('s-rating')?.value.trim() || '8.8';
  const box = document.getElementById('s-preview-box');
  const img = document.getElementById('s-poster-preview');
  const titleEl = document.getElementById('s-preview-title');
  const metaEl = document.getElementById('s-preview-meta');

  if (posterUrl && box && img) {
    img.src = posterUrl;
    img.onerror = () => { box.style.display = 'none'; };
    img.onload = () => { box.style.display = 'flex'; };
    if (titleEl) titleEl.innerText = title;
    if (metaEl) metaEl.innerText = `${year} • ★ ${rating}`;
  } else if (box) {
    box.style.display = 'none';
  }
}

async function autoDetectMovieFromInput() {
  const query = document.getElementById('m-autodetect-input').value.trim();
  if (!query) {
    showToast('Enter a movie title or MovieBox subjectId to auto-detect', 'warning');
    return;
  }

  showToast(`Auto-detecting movie "${query}" from TMDb & MovieBox...`, 'info', 2500);

  try {
    const res = await apiFetch(`/api/admin/auto-detect?q=${encodeURIComponent(query)}&type=movie`);
    if (!res.success || !res.data) throw new Error(res.error || 'No matching metadata found');
    const d = res.data;

    if (d.subjectId) document.getElementById('m-subject-id').value = d.subjectId;
    document.getElementById('m-title').value = d.title || query;
    document.getElementById('m-year').value = d.year || '2026';
    document.getElementById('m-rating').value = d.rating || '8.5';
    document.getElementById('m-duration').value = d.duration || '120 min';
    document.getElementById('m-genre').value = d.genre || 'Drama';
    document.getElementById('m-industry').value = d.industry || 'Korean';
    document.getElementById('m-category').value = d.category || 'Korean Movies';
    document.getElementById('m-language').value = d.isHindi ? 'Hindi Dubbed' : 'Original Audio';
    document.getElementById('m-poster').value = d.poster || '';
    document.getElementById('m-backdrop').value = d.backdrop || d.poster || '';
    document.getElementById('m-description').value = d.description || `${d.title} streaming in HD on FOBS TV.`;
    if (d.streamUrl) {
      document.getElementById('m-stream-url').value = d.streamUrl;
    }

    updateMoviePosterPreview();
    showToast(`✨ Auto-detected: "${d.title}" (${d.year}) with official TMDb poster & metadata!`, 'success', 4500);
  } catch (err) {
    showToast(`Auto-detect error: ${err.message}`, 'error', 4500);
  }
}

async function autoDetectSeriesFromInput() {
  const query = document.getElementById('s-autodetect-input').value.trim();
  if (!query) {
    showToast('Enter a series title or MovieBox subjectId to auto-detect', 'warning');
    return;
  }

  showToast(`Auto-detecting TV Series "${query}" from TMDb & MovieBox...`, 'info', 2500);

  try {
    const res = await apiFetch(`/api/admin/auto-detect?q=${encodeURIComponent(query)}&type=series`);
    if (!res.success || !res.data) throw new Error(res.error || 'No matching series metadata found');
    const d = res.data;

    if (d.subjectId) document.getElementById('s-subject-id').value = d.subjectId;
    document.getElementById('s-title').value = d.title || query;
    document.getElementById('s-year').value = d.year || '2026';
    document.getElementById('s-rating').value = d.rating || '8.8';
    document.getElementById('s-genre').value = d.genre || 'Drama';
    document.getElementById('s-industry').value = d.industry || 'Korean';
    document.getElementById('s-category').value = d.category || 'Korean Series';
    document.getElementById('s-poster').value = d.poster || '';
    document.getElementById('s-backdrop').value = d.backdrop || d.poster || '';
    document.getElementById('s-description').value = d.description || `${d.title} streaming in HD on FOBS TV.`;

    if (d.seasons && d.seasons.length > 0) {
      state.lastDetectedSeriesSeasons = d.seasons;
    }

    updateSeriesPosterPreview();
    const seCount = d.seasonsCount || 1;
    const epCount = d.totalEpisodes || 10;
    showToast(`✨ Auto-detected: "${d.title}" (${d.year}) • ${seCount} Season(s), ${epCount} Episodes!`, 'success', 4500);
  } catch (err) {
    showToast(`Auto-detect error: ${err.message}`, 'error', 4500);
  }
}

async function handleBatchImportRecent() {
  const count = parseInt(document.getElementById('mb-batch-count').value, 10) || 5;
  if (!confirm(`Are you sure you want to batch import the top ${count} trending titles from MovieBox?`)) return;

  showToast(`Running batch import of top ${count} items...`, 'info', 5000);

  try {
    const res = await apiFetch('/api/admin/moviebox/batch-import', {
      method: 'POST',
      body: JSON.stringify({ count, filter: 'trending' })
    });

    showToast(`Batch completed: Imported ${res.importedCount} of ${res.requestedCount} titles!`, 'success', 5000);
    await loadContent();
    await loadStats();
    loadMovieBoxRecent('trending');
  } catch (err) {
    showToast(`Batch import error: ${err.message}`, 'error', 5000);
  }
}

// ============================================================
// TAB 3: MOVIES MANAGEMENT
// ============================================================
function filterMoviesTable(query = null) {
  const searchInput = document.getElementById('movies-search');
  const searchVal = (query !== null && typeof query === 'string' ? query : (searchInput?.value || '')).toLowerCase().trim();
  state.movies.search = searchVal;

  state.movies.genre = document.getElementById('movies-genre-filter')?.value || '';
  state.movies.industry = document.getElementById('movies-industry-filter')?.value || '';

  state.movies.filtered = (state.content.movies || []).filter(m => {
    const title = (m.title || '').toLowerCase();
    const year = String(m.year || '');
    const genre = (m.genre || '').toLowerCase();
    const category = (m.category || '').toLowerCase();
    const industry = (m.industry || '').toLowerCase();

    const matchSearch = !state.movies.search ||
      title.includes(state.movies.search) ||
      year.includes(state.movies.search) ||
      genre.includes(state.movies.search) ||
      category.includes(state.movies.search) ||
      industry.includes(state.movies.search);
    
    const matchGenre = !state.movies.genre || genre.includes(state.movies.genre.toLowerCase());

    let matchIndustry = true;
    if (state.movies.industry) {
      const selInd = state.movies.industry.toLowerCase();
      if (selInd === 'korean') {
        matchIndustry = industry.includes('korean') || industry.includes('kdrama') || category.includes('korean');
      } else if (selInd === 'tollywood' || selInd === 'south indian') {
        matchIndustry = industry.includes('tollywood') || industry.includes('south') || category.includes('south');
      } else if (selInd === 'bollywood') {
        matchIndustry = industry.includes('bollywood') || category.includes('bollywood') || title.includes('hindi');
      } else if (selInd === 'hollywood') {
        matchIndustry = industry.includes('hollywood') || category.includes('hollywood');
      } else if (selInd === 'chinese') {
        matchIndustry = industry.includes('chinese') || category.includes('chinese');
      } else if (selInd === 'anime') {
        matchIndustry = industry.includes('anime') || industry.includes('japanese') || category.includes('anime');
      } else {
        matchIndustry = industry === selInd || category.includes(selInd);
      }
    }

    return matchSearch && matchGenre && matchIndustry;
  });

  state.movies.page = 1;
  renderMoviesTable();
}

function renderMoviesTable() {
  const tbody = document.getElementById('movies-tbody');
  const paginationInfo = document.getElementById('movies-pagination-info');
  const pageDisplay = document.getElementById('movies-page-display');

  const filtered = state.movies.filtered;
  const total = filtered.length;
  const totalPages = Math.ceil(total / state.movies.perPage) || 1;

  if (state.movies.page > totalPages) state.movies.page = totalPages;
  if (state.movies.page < 1) state.movies.page = 1;

  const startIdx = (state.movies.page - 1) * state.movies.perPage;
  const endIdx = Math.min(startIdx + state.movies.perPage, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  paginationInfo.innerText = `Showing ${total === 0 ? 0 : startIdx + 1}-${endIdx} of ${total} movies`;
  pageDisplay.innerText = `Page ${state.movies.page} of ${totalPages}`;

  document.getElementById('movies-prev-page').disabled = state.movies.page <= 1;
  document.getElementById('movies-next-page').disabled = state.movies.page >= totalPages;

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-table-cell">
          <i class="fa-solid fa-film"></i>
          <p>No movies found matching your filter criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageItems.map(m => {
    const poster = m.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80';
    const stream = m.streamUrl || (m.servers && m.servers[0] ? m.servers[0].url : '');
    const addedStr = m.addedAt ? new Date(m.addedAt).toLocaleDateString() : (m.year || '2026');

    return `
      <tr>
        <td>
          <img src="${poster}" alt="${m.title}" class="thumb-img" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'">
        </td>
        <td>
          <strong>${m.title}</strong>
          <small class="d-block text-muted">${m.year || '2026'} • ${m.duration || 'Movie'}</small>
        </td>
        <td><span class="genre-tag">${m.genre || 'Action, Drama'}</span></td>
        <td><span class="badge-pill bg-amber">${m.industry || 'Korean'}</span></td>
        <td><strong class="text-amber">★ ${m.rating || '8.5'}</strong></td>
        <td>
          <span class="badge-views" onclick="editMovieViews('${m.id}', ${m.views || 1250})" title="Click to edit views">
            <i class="fa-solid fa-eye"></i> ${(m.views || 1250).toLocaleString()}
          </span>
        </td>
        <td><small class="text-muted">${addedStr}</small></td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-table play-btn" onclick="previewVideoStream('${m.title}', '${stream}')" title="Test Playback in Admin">
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="btn-table" onclick="editMovieById('${m.id}')" title="Edit Movie">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteMovie('${m.id}', '${m.title}')" title="Delete Movie">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function prevMoviesPage() {
  if (state.movies.page > 1) {
    state.movies.page--;
    renderMoviesTable();
  }
}

function nextMoviesPage() {
  const totalPages = Math.ceil(state.movies.filtered.length / state.movies.perPage) || 1;
  if (state.movies.page < totalPages) {
    state.movies.page++;
    renderMoviesTable();
  }
}

function openMovieModal() {
  document.getElementById('movie-modal-title').innerHTML = '<i class="fa-solid fa-film text-amber"></i> Add New Movie';
  document.getElementById('movie-form').reset();
  document.getElementById('m-id').value = '';
  document.getElementById('m-subject-id').value = '';
  const prevBox = document.getElementById('m-preview-box');
  if (prevBox) prevBox.style.display = 'none';
  document.getElementById('movie-modal').classList.add('active');
}

function editMovieById(id) {
  const m = (state.content.movies || []).find(item => item.id === id);
  if (!m) return;

  document.getElementById('movie-modal-title').innerHTML = '<i class="fa-solid fa-pen text-amber"></i> Edit Movie';
  document.getElementById('m-id').value = m.id || '';
  document.getElementById('m-subject-id').value = m.subjectId || '';
  document.getElementById('m-title').value = m.title || '';
  document.getElementById('m-year').value = m.year || '';
  document.getElementById('m-genre').value = m.genre || '';
  document.getElementById('m-industry').value = m.industry || 'Korean';
  document.getElementById('m-rating').value = m.rating || '';
  document.getElementById('m-duration').value = m.duration || '';
  document.getElementById('m-views').value = m.views || 1250;
  document.getElementById('m-language').value = m.language || '';
  document.getElementById('m-category').value = m.category || 'Korean Movies';
  document.getElementById('m-poster').value = m.poster || '';
  document.getElementById('m-backdrop').value = m.backdrop || m.cover || '';
  document.getElementById('m-stream-url').value = m.streamUrl || (m.servers && m.servers[0] ? m.servers[0].url : '');
  document.getElementById('m-server2-url').value = (m.servers && m.servers[1] ? m.servers[1].url : '');
  document.getElementById('m-subtitle-url').value = (m.subtitles && m.subtitles[0] ? m.subtitles[0].src : '');
  document.getElementById('m-description').value = m.description || '';
  document.getElementById('m-featured').checked = state.content.featured?.id === m.id;

  updateMoviePosterPreview();
  document.getElementById('movie-modal').classList.add('active');
}

function closeMovieModal() {
  document.getElementById('movie-modal').classList.remove('active');
}

async function handleMovieSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('m-id').value;
  const stream1 = document.getElementById('m-stream-url').value.trim();
  const stream2 = document.getElementById('m-server2-url').value.trim();
  const subUrl = document.getElementById('m-subtitle-url').value.trim();

  const servers = [
    { name: 'Server 1 (HD 1080p)', url: stream1, quality: '1080p', isDirect: true }
  ];
  if (stream2) {
    servers.push({ name: 'Server 2 (Direct Fast CDN)', url: stream2, quality: '1080p', isDirect: true });
  }

  const subtitles = subUrl ? [{ label: 'Subtitle Track', src: subUrl, lang: 'en', default: true }] : [];

  const movie = {
    id: id || undefined,
    subjectId: document.getElementById('m-subject-id').value || undefined,
    title: document.getElementById('m-title').value.trim(),
    year: document.getElementById('m-year').value.trim(),
    genre: document.getElementById('m-genre').value.trim(),
    industry: document.getElementById('m-industry').value,
    rating: document.getElementById('m-rating').value.trim(),
    duration: document.getElementById('m-duration').value.trim(),
    views: parseInt(document.getElementById('m-views').value, 10) || 1250,
    language: document.getElementById('m-language').value.trim(),
    category: document.getElementById('m-category').value.trim(),
    poster: document.getElementById('m-poster').value.trim(),
    backdrop: document.getElementById('m-backdrop').value.trim() || document.getElementById('m-poster').value.trim(),
    cover: document.getElementById('m-backdrop').value.trim() || document.getElementById('m-poster').value.trim(),
    streamUrl: stream1,
    servers,
    subtitles,
    description: document.getElementById('m-description').value.trim(),
    isFeatured: document.getElementById('m-featured').checked
  };

  try {
    const res = await apiFetch('/api/admin/movie', {
      method: 'POST',
      body: JSON.stringify(movie)
    });

    if (res.success) {
      showToast(`Movie "${movie.title}" saved successfully!`, 'success');
      closeMovieModal();
      await loadContent();
      await loadStats();
      filterMoviesTable();
    }
  } catch (err) {
    showToast(`Failed to save movie: ${err.message}`, 'error');
  }
}

async function deleteMovie(id, title) {
  if (!confirm(`Are you sure you want to permanently delete the movie "${title}" from the catalog?`)) return;

  try {
    await apiFetch(`/api/admin/movie/${id}`, { method: 'DELETE' });
    showToast(`Deleted movie "${title}"`, 'success');
    await loadContent();
    await loadStats();
    filterMoviesTable();
  } catch (err) {
    showToast(`Failed to delete: ${err.message}`, 'error');
  }
}

async function editMovieViews(id, curViews) {
  const input = prompt(`Enter new view count for movie:`, curViews);
  if (input === null) return;
  const views = parseInt(input, 10);
  if (isNaN(views)) return;

  try {
    await apiFetch(`/api/admin/media/${id}/views`, {
      method: 'POST',
      body: JSON.stringify({ views })
    });
    showToast(`Updated view count to ${views}`, 'success');
    await loadContent();
    filterMoviesTable();
  } catch (err) {
    showToast(`Failed to update views: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 4: SERIES & TV STUDIO
// ============================================================
function filterSeriesTable(query = null) {
  const searchInput = document.getElementById('series-search');
  const searchVal = (query !== null && typeof query === 'string' ? query : (searchInput?.value || '')).toLowerCase().trim();
  state.series.search = searchVal;

  state.series.industry = document.getElementById('series-industry-filter')?.value || '';

  state.series.filtered = (state.content.series || []).filter(s => {
    const title = (s.title || '').toLowerCase();
    const year = String(s.year || '');
    const genre = (s.genre || '').toLowerCase();
    const category = (s.category || '').toLowerCase();
    const industry = (s.industry || '').toLowerCase();

    const matchSearch = !state.series.search ||
      title.includes(state.series.search) ||
      year.includes(state.series.search) ||
      genre.includes(state.series.search) ||
      category.includes(state.series.search) ||
      industry.includes(state.series.search);

    let matchIndustry = true;
    if (state.series.industry) {
      const selInd = state.series.industry.toLowerCase();
      if (selInd === 'korean') {
        matchIndustry = industry.includes('korean') || industry.includes('kdrama') || category.includes('korean');
      } else if (selInd === 'tollywood' || selInd === 'south indian') {
        matchIndustry = industry.includes('tollywood') || industry.includes('south') || category.includes('south');
      } else if (selInd === 'bollywood') {
        matchIndustry = industry.includes('bollywood') || category.includes('bollywood') || title.includes('hindi');
      } else if (selInd === 'hollywood') {
        matchIndustry = industry.includes('hollywood') || category.includes('hollywood');
      } else if (selInd === 'chinese') {
        matchIndustry = industry.includes('chinese') || category.includes('chinese');
      } else if (selInd === 'anime') {
        matchIndustry = industry.includes('anime') || industry.includes('japanese') || category.includes('anime');
      } else if (selInd === 'turkish') {
        matchIndustry = industry.includes('turkish') || category.includes('turkish');
      } else {
        matchIndustry = industry === selInd || category.includes(selInd);
      }
    }

    return matchSearch && matchIndustry;
  });

  state.series.page = 1;
  renderSeriesTable();
}

function renderSeriesTable() {
  const tbody = document.getElementById('series-tbody');
  const paginationInfo = document.getElementById('series-pagination-info');
  const pageDisplay = document.getElementById('series-page-display');

  const filtered = state.series.filtered;
  const total = filtered.length;
  const totalPages = Math.ceil(total / state.series.perPage) || 1;

  if (state.series.page > totalPages) state.series.page = totalPages;
  if (state.series.page < 1) state.series.page = 1;

  const startIdx = (state.series.page - 1) * state.series.perPage;
  const endIdx = Math.min(startIdx + state.series.perPage, total);
  const pageItems = filtered.slice(startIdx, endIdx);

  paginationInfo.innerText = `Showing ${total === 0 ? 0 : startIdx + 1}-${endIdx} of ${total} series`;
  pageDisplay.innerText = `Page ${state.series.page} of ${totalPages}`;

  document.getElementById('series-prev-page').disabled = state.series.page <= 1;
  document.getElementById('series-next-page').disabled = state.series.page >= totalPages;

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table-cell">
          <i class="fa-solid fa-tv"></i>
          <p>No TV series found matching your criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageItems.map(s => {
    const poster = s.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80';
    const totalEps = s.episodesCount || (s.seasons ? s.seasons.reduce((acc, sea) => acc + (sea.episodes ? sea.episodes.length : 0), 0) : 0);
    const totalSeasons = s.seasonsCount || (s.seasons ? s.seasons.length : 1);

    return `
      <tr>
        <td>
          <img src="${poster}" alt="${s.title}" class="thumb-img" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'">
        </td>
        <td>
          <strong>${s.title}</strong>
          <small class="d-block text-muted">${s.year || '2026'} • ${s.genre || 'Drama'}</small>
        </td>
        <td>
          <span class="badge-pill bg-cyan">
            <i class="fa-solid fa-layer-group"></i> ${totalSeasons} Season(s) • ${totalEps} Episodes
          </span>
        </td>
        <td><span class="badge-pill bg-amber">${s.industry || 'Korean'}</span></td>
        <td><strong class="text-amber">★ ${s.rating || '8.8'}</strong></td>
        <td>
          <span class="badge-views" onclick="editSeriesViews('${s.id}', ${s.views || 1250})" title="Click to edit views">
            <i class="fa-solid fa-eye"></i> ${(s.views || 1250).toLocaleString()}
          </span>
        </td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-table play-btn" onclick="openEpisodeStudio('${s.id}')" title="Manage Seasons & Episodes Studio">
              <i class="fa-solid fa-sliders"></i>
            </button>
            <button class="btn-table" onclick="syncSeriesEpisodes('${s.id}', '${s.title}')" title="1-Click Sync from MovieBox">
              <i class="fa-solid fa-arrows-rotate"></i>
            </button>
            <button class="btn-table" onclick="editSeriesById('${s.id}')" title="Edit Metadata">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteSeries('${s.id}', '${s.title}')" title="Delete Series">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function prevSeriesPage() {
  if (state.series.page > 1) {
    state.series.page--;
    renderSeriesTable();
  }
}

function nextSeriesPage() {
  const totalPages = Math.ceil(state.series.filtered.length / state.series.perPage) || 1;
  if (state.series.page < totalPages) {
    state.series.page++;
    renderSeriesTable();
  }
}

function openSeriesModal() {
  document.getElementById('series-modal-title').innerHTML = '<i class="fa-solid fa-tv text-cyan"></i> Add New TV Series';
  document.getElementById('series-form').reset();
  document.getElementById('s-id').value = '';
  document.getElementById('s-subject-id').value = '';
  state.lastDetectedSeriesSeasons = null;
  const prevBox = document.getElementById('s-preview-box');
  if (prevBox) prevBox.style.display = 'none';
  document.getElementById('series-modal').classList.add('active');
}

function editSeriesById(id) {
  const s = (state.content.series || []).find(item => item.id === id);
  if (!s) return;

  document.getElementById('series-modal-title').innerHTML = '<i class="fa-solid fa-pen text-cyan"></i> Edit TV Series Metadata';
  document.getElementById('s-id').value = s.id || '';
  document.getElementById('s-subject-id').value = s.subjectId || '';
  document.getElementById('s-title').value = s.title || '';
  document.getElementById('s-year').value = s.year || '';
  document.getElementById('s-genre').value = s.genre || '';
  document.getElementById('s-industry').value = s.industry || 'Korean';
  document.getElementById('s-rating').value = s.rating || '';
  document.getElementById('s-views').value = s.views || 1250;
  document.getElementById('s-category').value = s.category || 'Korean Series';
  document.getElementById('s-poster').value = s.poster || '';
  document.getElementById('s-backdrop').value = s.backdrop || s.cover || '';
  document.getElementById('s-description').value = s.description || '';
  document.getElementById('s-featured').checked = state.content.featured?.id === s.id;

  updateSeriesPosterPreview();
  document.getElementById('series-modal').classList.add('active');
}

function closeSeriesModal() {
  document.getElementById('series-modal').classList.remove('active');
}

async function handleSeriesSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('s-id').value;

  const series = {
    id: id || undefined,
    subjectId: document.getElementById('s-subject-id').value || undefined,
    title: document.getElementById('s-title').value.trim(),
    year: document.getElementById('s-year').value.trim(),
    genre: document.getElementById('s-genre').value.trim(),
    industry: document.getElementById('s-industry').value,
    rating: document.getElementById('s-rating').value.trim(),
    views: parseInt(document.getElementById('s-views').value, 10) || 1250,
    category: document.getElementById('s-category').value.trim(),
    poster: document.getElementById('s-poster').value.trim(),
    backdrop: document.getElementById('s-backdrop').value.trim() || document.getElementById('s-poster').value.trim(),
    cover: document.getElementById('s-backdrop').value.trim() || document.getElementById('s-poster').value.trim(),
    description: document.getElementById('s-description').value.trim(),
    isFeatured: document.getElementById('s-featured').checked
  };

  // If newly adding a series and episodes were detected during auto-detect, attach them!
  if (!series.id && state.lastDetectedSeriesSeasons && state.lastDetectedSeriesSeasons.length > 0) {
    series.seasons = state.lastDetectedSeriesSeasons;
    series.episodes = series.seasons[0]?.episodes || [];
    series.streamUrl = series.episodes[0]?.streamUrl || '';
    series.seasonsCount = series.seasons.length;
    series.episodesCount = series.seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
  }

  try {
    const res = await apiFetch('/api/admin/series', {
      method: 'POST',
      body: JSON.stringify(series)
    });

    if (res.success) {
      showToast(`Series "${series.title}" updated successfully!`, 'success');
      closeSeriesModal();
      await loadContent();
      await loadStats();
      filterSeriesTable();
    }
  } catch (err) {
    showToast(`Failed to save series: ${err.message}`, 'error');
  }
}

async function deleteSeries(id, title) {
  if (!confirm(`Are you sure you want to permanently delete the TV series "${title}"? All seasons and episodes will be removed.`)) return;

  try {
    await apiFetch(`/api/admin/series/${id}`, { method: 'DELETE' });
    showToast(`Deleted series "${title}"`, 'success');
    await loadContent();
    await loadStats();
    filterSeriesTable();
  } catch (err) {
    showToast(`Failed to delete series: ${err.message}`, 'error');
  }
}

async function syncSeriesEpisodes(id, title) {
  showToast(`Syncing episodes for "${title}" with MovieBox...`, 'info', 4000);
  try {
    const res = await apiFetch('/api/admin/series/sync', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (res.success) {
      showToast(res.message || `Updated episodes for "${title}"`, 'success', 5000);
      await loadContent();
      filterSeriesTable();
    }
  } catch (err) {
    showToast(`Sync error: ${err.message}`, 'error', 5000);
  }
}

async function autoSyncAllSeries() {
  if (!confirm('Scan MovieBox and auto-update all series in FOBS TV catalog?')) return;
  showToast('Starting catalog-wide episode scan...', 'info', 6000);
  try {
    const res = await apiFetch('/api/admin/series/sync-all', { method: 'POST' });
    showToast(res.message || 'Auto-sync complete!', 'success', 6000);
    await loadContent();
    filterSeriesTable();
  } catch (err) {
    showToast(`Auto-sync failed: ${err.message}`, 'error', 5000);
  }
}

async function editSeriesViews(id, curViews) {
  const input = prompt(`Enter new view count for series:`, curViews);
  if (input === null) return;
  const views = parseInt(input, 10);
  if (isNaN(views)) return;

  try {
    await apiFetch(`/api/admin/media/${id}/views`, {
      method: 'POST',
      body: JSON.stringify({ views })
    });
    showToast(`Updated view count to ${views}`, 'success');
    await loadContent();
    filterSeriesTable();
  } catch (err) {
    showToast(`Failed to update views: ${err.message}`, 'error');
  }
}

// ============================================================
// DEEP EPISODES STUDIO (SEASONS & EPISODES MANAGER)
// ============================================================
async function openEpisodeStudio(seriesId) {
  let s = (state.content.series || []).find(item => item.id === seriesId);
  if (!s) {
    try {
      const data = await apiFetch(`/api/admin/series/${seriesId}`);
      s = data.series;
    } catch (e) {
      showToast('Could not load series details', 'error');
      return;
    }
  }

  state.studio.seriesId = seriesId;
  state.studio.series = s;
  state.studio.seasons = JSON.parse(JSON.stringify(s.seasons || []));
  
  if (state.studio.seasons.length === 0) {
    // Generate Season 1 if none exists
    state.studio.seasons.push({
      seasonNumber: 1,
      title: 'Season 1',
      name: 'Season 1',
      episodesCount: (s.episodes || []).length,
      episodes: JSON.parse(JSON.stringify(s.episodes || []))
    });
  }

  state.studio.activeSeasonIndex = 0;

  document.getElementById('studio-series-title').innerHTML = `<i class="fa-solid fa-tv text-cyan"></i> Episode Studio: ${s.title}`;
  document.getElementById('studio-series-meta').innerText = `${s.year || '2026'} • ${s.industry || 'Korean'} • Total: ${s.episodesCount || 0} Episodes`;

  renderStudioSeasons();
  renderStudioEpisodes();
  document.getElementById('episodes-studio-modal').classList.add('active');
}

function closeEpisodeStudio() {
  document.getElementById('episodes-studio-modal').classList.remove('active');
}

function renderStudioSeasons() {
  const list = document.getElementById('studio-seasons-tabs');
  list.innerHTML = state.studio.seasons.map((sea, idx) => {
    const isActive = idx === state.studio.activeSeasonIndex;
    const epsCount = sea.episodes ? sea.episodes.length : 0;
    return `
      <button class="season-tab-btn ${isActive ? 'active' : ''}" onclick="selectStudioSeason(${idx})">
        Season ${sea.seasonNumber || (idx + 1)} (${epsCount} eps)
      </button>
    `;
  }).join('');
}

function selectStudioSeason(idx) {
  state.studio.activeSeasonIndex = idx;
  renderStudioSeasons();
  renderStudioEpisodes();
}

function addNewSeasonToStudio() {
  const nextNum = state.studio.seasons.length + 1;
  state.studio.seasons.push({
    seasonNumber: nextNum,
    title: `Season ${nextNum}`,
    name: `Season ${nextNum}`,
    episodesCount: 0,
    episodes: []
  });
  state.studio.activeSeasonIndex = state.studio.seasons.length - 1;
  renderStudioSeasons();
  renderStudioEpisodes();
  showToast(`Added Season ${nextNum}`, 'info');
}

function renderStudioEpisodes() {
  const tbody = document.getElementById('studio-episodes-tbody');
  const activeSeason = state.studio.seasons[state.studio.activeSeasonIndex];
  if (!activeSeason || !activeSeason.episodes || activeSeason.episodes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table-cell">
          <p>No episodes in this season yet. Click "+ Add Episode" above.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = activeSeason.episodes.map((ep, idx) => {
    const epNum = ep.episode || ep.episodeNumber || (idx + 1);
    const title = ep.title || `Episode ${epNum}`;
    const stream = ep.streamUrl || (ep.servers && ep.servers[0] ? ep.servers[0].url : '');
    const sub = (ep.subtitles && ep.subtitles[0] ? ep.subtitles[0].src : '') || (ep.captions && ep.captions[0] ? ep.captions[0].src : '');

    return `
      <tr>
        <td><strong>#${epNum}</strong></td>
        <td><strong>${title}</strong></td>
        <td><small class="text-muted">${ep.duration || '45 min'}</small></td>
        <td><code class="stream-url-text">${stream || 'No stream url'}</code></td>
        <td>${sub ? '<span class="badge-status success"><i class="fa-solid fa-check"></i> Subtitle</span>' : '<span class="text-muted">None</span>'}</td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-table play-btn" onclick="previewVideoStream('${state.studio.series?.title} - Ep ${epNum}', '${stream}')" title="Test Stream">
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="btn-table" onclick="openEditEpisodeForm(${idx})" title="Edit Episode">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteStudioEpisode(${idx})" title="Delete Episode">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddEpisodeForm() {
  const activeSeason = state.studio.seasons[state.studio.activeSeasonIndex];
  const nextEpNum = (activeSeason.episodes ? activeSeason.episodes.length : 0) + 1;

  document.getElementById('single-ep-modal-title').innerHTML = '<i class="fa-solid fa-plus text-cyan"></i> Add New Episode';
  document.getElementById('single-ep-form').reset();
  document.getElementById('ep-index').value = '-1'; // -1 means add new
  document.getElementById('ep-season-idx').value = state.studio.activeSeasonIndex;
  document.getElementById('ep-number').value = nextEpNum;
  document.getElementById('ep-title').value = `Episode ${nextEpNum}`;
  document.getElementById('ep-duration').value = '45 min';
  document.getElementById('single-episode-modal').classList.add('active');
}

function openEditEpisodeForm(epIdx) {
  const activeSeason = state.studio.seasons[state.studio.activeSeasonIndex];
  const ep = activeSeason.episodes[epIdx];
  if (!ep) return;

  document.getElementById('single-ep-modal-title').innerHTML = `<i class="fa-solid fa-pen text-cyan"></i> Edit Episode ${ep.episode || epIdx + 1}`;
  document.getElementById('ep-index').value = epIdx;
  document.getElementById('ep-season-idx').value = state.studio.activeSeasonIndex;
  document.getElementById('ep-number').value = ep.episode || (epIdx + 1);
  document.getElementById('ep-duration').value = ep.duration || '45 min';
  document.getElementById('ep-title').value = ep.title || `Episode ${ep.episode || (epIdx + 1)}`;
  document.getElementById('ep-stream-url').value = ep.streamUrl || (ep.servers && ep.servers[0] ? ep.servers[0].url : '');
  document.getElementById('ep-server2-url').value = (ep.servers && ep.servers[1] ? ep.servers[1].url : '');
  document.getElementById('ep-sub-url').value = (ep.subtitles && ep.subtitles[0] ? ep.subtitles[0].src : '') || (ep.captions && ep.captions[0] ? ep.captions[0].src : '');
  document.getElementById('single-episode-modal').classList.add('active');
}

function closeSingleEpisodeModal() {
  document.getElementById('single-episode-modal').classList.remove('active');
}

function handleSingleEpSubmit(e) {
  e.preventDefault();
  const epIdx = parseInt(document.getElementById('ep-index').value, 10);
  const seasonIdx = parseInt(document.getElementById('ep-season-idx').value, 10);
  const season = state.studio.seasons[seasonIdx];
  if (!season) return;

  const num = parseInt(document.getElementById('ep-number').value, 10) || 1;
  const title = document.getElementById('ep-title').value.trim();
  const duration = document.getElementById('ep-duration').value.trim();
  const stream1 = document.getElementById('ep-stream-url').value.trim();
  const stream2 = document.getElementById('ep-server2-url').value.trim();
  const subUrl = document.getElementById('ep-sub-url').value.trim();

  const servers = [{ name: 'Server 1 (HD 1080p)', url: stream1, quality: '1080p', isDirect: true }];
  if (stream2) servers.push({ name: 'Server 2 (Direct Fast CDN)', url: stream2, quality: '1080p', isDirect: true });

  const subtitles = subUrl ? [{ label: 'Subtitle Track', src: subUrl, lang: 'en', default: true }] : [];

  const episodeObj = {
    episode: num,
    episodeNumber: num,
    number: String(num).padStart(2, '0'),
    title,
    duration,
    streamUrl: stream1,
    servers,
    subtitles,
    captions: subtitles
  };

  if (!Array.isArray(season.episodes)) season.episodes = [];

  if (epIdx >= 0) {
    season.episodes[epIdx] = { ...season.episodes[epIdx], ...episodeObj };
  } else {
    season.episodes.push(episodeObj);
  }

  season.episodesCount = season.episodes.length;
  closeSingleEpisodeModal();
  renderStudioSeasons();
  renderStudioEpisodes();
  showToast(`Saved Episode ${num} in Season ${season.seasonNumber}`, 'success');
}

function deleteStudioEpisode(epIdx) {
  const activeSeason = state.studio.seasons[state.studio.activeSeasonIndex];
  if (!confirm(`Delete Episode ${activeSeason.episodes[epIdx]?.title || (epIdx + 1)}?`)) return;

  activeSeason.episodes.splice(epIdx, 1);
  activeSeason.episodesCount = activeSeason.episodes.length;
  renderStudioSeasons();
  renderStudioEpisodes();
  showToast('Episode removed', 'info');
}

async function saveAllStudioEpisodes() {
  const seriesId = state.studio.seriesId;
  showToast('Saving all seasons & episodes...', 'info', 2500);

  try {
    const res = await apiFetch(`/api/admin/series/${seriesId}/episodes`, {
      method: 'POST',
      body: JSON.stringify({ seasons: state.studio.seasons })
    });

    if (res.success) {
      showToast(`🎉 Successfully updated seasons and episodes! Total: ${res.totalEpisodes} episodes`, 'success', 4000);
      closeEpisodeStudio();
      await loadContent();
      filterSeriesTable();
    }
  } catch (err) {
    showToast(`Failed to save episodes: ${err.message}`, 'error', 5000);
  }
}

async function syncSeriesWithMovieBoxInStudio() {
  const seriesId = state.studio.seriesId;
  showToast('Connecting to MovieBox to sync latest episodes...', 'info', 4000);

  try {
    const res = await apiFetch('/api/admin/series/sync', {
      method: 'POST',
      body: JSON.stringify({ id: seriesId })
    });

    if (res.success) {
      showToast(res.message || 'Series episodes updated from MovieBox!', 'success', 5000);
      await loadContent();
      // Reload studio with newly synced data
      await openEpisodeStudio(seriesId);
    }
  } catch (err) {
    showToast(`Sync error: ${err.message}`, 'error', 5000);
  }
}

// ============================================================
// TAB 5: LIVE TV CHANNELS
// ============================================================
function filterChannelsGrid(query = null) {
  if (query !== null) state.channels.search = query.toLowerCase();
  state.channels.category = document.getElementById('channels-category-filter').value;

  state.channels.filtered = (state.content.liveTv || []).filter(c => {
    const name = (c.name || c.title || '').toLowerCase();
    const matchSearch = !state.channels.search || name.includes(state.channels.search);
    const matchCategory = !state.channels.category || (c.category && c.category.toLowerCase() === state.channels.category.toLowerCase());
    return matchSearch && matchCategory;
  });

  renderChannelsGrid();
}

function renderChannelsGrid() {
  const container = document.getElementById('channels-container');
  const countDisplay = document.getElementById('channels-count-info');
  const channels = state.channels.filtered;

  countDisplay.innerText = `${channels.length} channels`;

  if (channels.length === 0) {
    container.innerHTML = `
      <div class="empty-state full-width">
        <i class="fa-solid fa-satellite-dish"></i>
        <h3>No live channels found</h3>
        <p>Try searching for a different channel or click "Add Live Channel".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = channels.map(c => {
    const name = c.name || c.title || 'Live Channel';
    const logo = c.logo || c.poster || 'assets/channels/gtv.svg';
    const stream = c.streamUrl || '';

    return `
      <div class="channel-card glass">
        <div class="channel-card-top">
          <div class="channel-logo-wrap">
            <img src="${logo}" alt="${name}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3178/3178283.png'">
          </div>
          <div class="channel-card-info">
            <h4 title="${name}">${name}</h4>
            <span class="badge-pill bg-emerald">${c.category || 'Sports'}</span>
          </div>
        </div>
        <div class="channel-card-actions">
          <button class="btn-sm btn-primary glow-sm" onclick="previewVideoStream('${name}', '${stream}')">
            <i class="fa-solid fa-play"></i> Watch Stream
          </button>
          <div class="action-btn-group">
            <button class="btn-table" onclick="editChannelById('${c.id}')" title="Edit Channel">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteChannel('${c.id}', '${name}')" title="Delete Channel">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openChannelModal() {
  document.getElementById('channel-modal-title').innerHTML = '<i class="fa-solid fa-satellite-dish text-emerald"></i> Add Live Channel';
  document.getElementById('channel-form').reset();
  document.getElementById('ch-id').value = '';
  document.getElementById('channel-modal').classList.add('active');
}

function editChannelById(id) {
  const c = (state.content.liveTv || []).find(item => item.id === id);
  if (!c) return;

  document.getElementById('channel-modal-title').innerHTML = '<i class="fa-solid fa-pen text-emerald"></i> Edit Live Channel';
  document.getElementById('ch-id').value = c.id || '';
  document.getElementById('ch-name').value = c.name || c.title || '';
  document.getElementById('ch-category').value = c.category || 'Sports';
  document.getElementById('ch-badge').value = c.badge || 'LIVE';
  document.getElementById('ch-stream-url').value = c.streamUrl || '';
  document.getElementById('ch-logo').value = c.logo || '';
  document.getElementById('ch-referer').value = c.referer || '';
  document.getElementById('ch-user-agent').value = c.userAgent || '';

  document.getElementById('channel-modal').classList.add('active');
}

function closeChannelModal() {
  document.getElementById('channel-modal').classList.remove('active');
}

async function handleChannelSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('ch-id').value;
  const name = document.getElementById('ch-name').value.trim();

  const channel = {
    id: id || undefined,
    name,
    title: name,
    category: document.getElementById('ch-category').value,
    badge: document.getElementById('ch-badge').value.trim() || 'LIVE',
    streamUrl: document.getElementById('ch-stream-url').value.trim(),
    logo: document.getElementById('ch-logo').value.trim(),
    poster: document.getElementById('ch-logo').value.trim(),
    referer: document.getElementById('ch-referer').value.trim(),
    userAgent: document.getElementById('ch-user-agent').value.trim(),
    streamType: 'hls'
  };

  try {
    const res = await apiFetch('/api/admin/channel', {
      method: 'POST',
      body: JSON.stringify(channel)
    });

    if (res.success) {
      showToast(`Saved channel "${name}"!`, 'success');
      closeChannelModal();
      await loadContent();
      await loadStats();
      filterChannelsGrid();
    }
  } catch (err) {
    showToast(`Failed to save channel: ${err.message}`, 'error');
  }
}

async function deleteChannel(id, name) {
  if (!confirm(`Delete live channel "${name}"?`)) return;

  try {
    await apiFetch(`/api/admin/channel/${id}`, { method: 'DELETE' });
    showToast(`Deleted channel "${name}"`, 'success');
    await loadContent();
    await loadStats();
    filterChannelsGrid();
  } catch (err) {
    showToast(`Failed to delete channel: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 6: HERO SPOTLIGHT BANNER
// ============================================================
function renderHeroEditor() {
  const feat = state.content.featured || {};
  document.getElementById('hero-title').value = feat.title || '';
  document.getElementById('hero-year').value = feat.year || '2026';
  document.getElementById('hero-badge-left').value = feat.badgeLeft || 'Trending';
  document.getElementById('hero-badge-right').value = feat.badgeRight || 'Hindi Dubbed';
  document.getElementById('hero-rating').value = feat.rating || '9.2';
  document.getElementById('hero-category').value = feat.category || 'Korean Drama';
  document.getElementById('hero-cover').value = feat.backdrop || feat.cover || '';
  document.getElementById('hero-poster').value = feat.poster || '';
  document.getElementById('hero-stream-url').value = feat.streamUrl || '';
  document.getElementById('hero-description').value = feat.description || '';

  updateHeroMockup(feat);
}

function updateHeroPreview(coverUrl) {
  const bg = document.getElementById('mockup-hero-bg');
  if (bg) bg.style.backgroundImage = `url('${coverUrl}')`;
}

function updateHeroMockup(data) {
  const bg = document.getElementById('mockup-hero-bg');
  const title = document.getElementById('mockup-title');
  const bLeft = document.getElementById('mockup-badge-left');
  const bRight = document.getElementById('mockup-badge-right');
  const year = document.getElementById('mockup-year');
  const rating = document.getElementById('mockup-rating');
  const cat = document.getElementById('mockup-category');
  const desc = document.getElementById('mockup-desc');

  const cover = data.backdrop || data.cover || data.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=1280&q=80';
  if (bg) bg.style.backgroundImage = `url('${cover}')`;
  if (title) title.innerText = data.title || 'Spotlight Title';
  if (bLeft) bLeft.innerText = data.badgeLeft || 'Trending';
  if (bRight) bRight.innerText = data.badgeRight || 'Korean';
  if (year) year.innerText = data.year || '2026';
  if (rating) rating.innerText = `★ ${data.rating || '9.2'}`;
  if (cat) cat.innerText = data.category || 'Drama';
  if (desc) desc.innerText = data.description || 'Watch now in Ultra HD 1080p.';
}

async function handleHeroSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('hero-title').value.trim();
  const cover = document.getElementById('hero-cover').value.trim();

  const featured = {
    title,
    year: document.getElementById('hero-year').value.trim(),
    badgeLeft: document.getElementById('hero-badge-left').value.trim(),
    badgeRight: document.getElementById('hero-badge-right').value.trim(),
    rating: document.getElementById('hero-rating').value.trim(),
    imdbRating: document.getElementById('hero-rating').value.trim(),
    category: document.getElementById('hero-category').value.trim(),
    cover,
    backdrop: cover,
    poster: document.getElementById('hero-poster').value.trim() || cover,
    streamUrl: document.getElementById('hero-stream-url').value.trim(),
    description: document.getElementById('hero-description').value.trim()
  };

  try {
    const res = await apiFetch('/api/admin/featured', {
      method: 'POST',
      body: JSON.stringify(featured)
    });

    if (res.success) {
      showToast('🎉 Spotlight Hero banner updated on Mobile & Web App!', 'success', 4000);
      await loadContent();
      renderHeroEditor();
    }
  } catch (err) {
    showToast(`Failed to update hero: ${err.message}`, 'error');
  }
}

// Hero Catalog Picker
function pickHeroFromCatalog() {
  document.getElementById('picker-search-input').value = '';
  filterPickerList('');
  document.getElementById('picker-modal').classList.add('active');
}

function closeCatalogPicker() {
  document.getElementById('picker-modal').classList.remove('active');
}

function filterPickerList(q) {
  const query = q.toLowerCase();
  const list = document.getElementById('picker-items-list');

  const all = [
    ...(state.content.series || []).map(s => ({ ...s, itemType: 'Series' })),
    ...(state.content.movies || []).map(m => ({ ...m, itemType: 'Movie' }))
  ];

  const matched = all.filter(item => {
    return !query || (item.title && item.title.toLowerCase().includes(query));
  }).slice(0, 30);

  if (matched.length === 0) {
    list.innerHTML = '<p class="text-muted p-3">No matching titles.</p>';
    return;
  }

  list.innerHTML = matched.map(item => {
    return `
      <div class="picker-item" onclick='selectPickerItem(${JSON.stringify(item).replace(/'/g, "\\'")})'>
        <div class="picker-item-left">
          <img src="${item.poster || ''}" alt="">
          <div>
            <strong>${item.title}</strong>
            <small class="d-block text-muted">${item.year || '2026'} • ${item.itemType} • ★ ${item.rating || '8.5'}</small>
          </div>
        </div>
        <button class="btn-sm btn-primary">Select as Hero</button>
      </div>
    `;
  }).join('');
}

function selectPickerItem(item) {
  document.getElementById('hero-title').value = item.title || '';
  document.getElementById('hero-year').value = item.year || '2026';
  document.getElementById('hero-badge-left').value = item.badgeLeft || 'Trending';
  document.getElementById('hero-badge-right').value = item.badgeRight || item.industry || 'Exclusive';
  document.getElementById('hero-rating').value = item.rating || '9.0';
  document.getElementById('hero-category').value = item.category || 'Featured';
  document.getElementById('hero-cover').value = item.backdrop || item.cover || item.poster || '';
  document.getElementById('hero-poster').value = item.poster || '';
  document.getElementById('hero-stream-url').value = item.streamUrl || '';
  document.getElementById('hero-description').value = item.description || '';

  updateHeroMockup(item);
  closeCatalogPicker();
  showToast(`Selected "${item.title}" for Hero Spotlight. Click "Save Spotlight Banner" to publish!`, 'info', 4000);
}

// ============================================================
// TAB 7: UPCOMING RELEASES
// ============================================================
async function loadUpcoming() {
  try {
    const data = await apiFetch('/api/admin/upcoming');
    state.upcoming.filtered = data.upcoming || [];
    renderUpcomingTable();
  } catch (err) {
    console.error('Failed to load upcoming:', err);
  }
}

function filterUpcomingTable(query) {
  const q = (query || '').toLowerCase();
  state.upcoming.filtered = (state.content.upcoming || []).filter(u => {
    return !q || (u.title && u.title.toLowerCase().includes(q)) || (u.genre && u.genre.toLowerCase().includes(q));
  });
  renderUpcomingTable();
}

function renderUpcomingTable() {
  const tbody = document.getElementById('upcoming-tbody');
  const count = document.getElementById('upcoming-count-info');
  const items = state.upcoming.filtered;

  count.innerText = `${items.length} upcoming releases`;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table-cell">
          <p>No upcoming releases registered. Click "+ Add Upcoming Release".</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(u => {
    const poster = u.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80';
    const release = `${u.releaseMonth || 'TBA'} ${u.releaseDay || ''}`;

    return `
      <tr>
        <td><img src="${poster}" class="thumb-img" alt=""></td>
        <td><strong>${u.title}</strong></td>
        <td><span class="badge-pill bg-cyan">${release}</span></td>
        <td>${u.year || '2026'}</td>
        <td>${u.genre || 'Drama'}</td>
        <td><strong class="text-amber">★ ${u.rating || '8.0'}</strong></td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-table" onclick="editUpcomingById('${u.id}')" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteUpcoming('${u.id}', '${u.title}')" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openUpcomingModal() {
  document.getElementById('upcoming-modal-title').innerHTML = '<i class="fa-solid fa-calendar-days text-cyan"></i> Add Upcoming Release';
  document.getElementById('upcoming-form').reset();
  document.getElementById('upc-id').value = '';
  document.getElementById('upcoming-modal').classList.add('active');
}

function editUpcomingById(id) {
  const u = (state.content.upcoming || []).find(item => item.id === id);
  if (!u) return;

  document.getElementById('upcoming-modal-title').innerHTML = '<i class="fa-solid fa-pen text-cyan"></i> Edit Upcoming Release';
  document.getElementById('upc-id').value = u.id || '';
  document.getElementById('upc-title').value = u.title || '';
  document.getElementById('upc-year').value = u.year || '2026';
  document.getElementById('upc-genre').value = u.genre || '';
  document.getElementById('upc-month').value = u.releaseMonth || '';
  document.getElementById('upc-day').value = u.releaseDay || '';
  document.getElementById('upc-poster').value = u.poster || '';
  document.getElementById('upc-description').value = u.description || '';

  document.getElementById('upcoming-modal').classList.add('active');
}

function closeUpcomingModal() {
  document.getElementById('upcoming-modal').classList.remove('active');
}

async function handleUpcomingSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('upc-id').value;
  const title = document.getElementById('upc-title').value.trim();

  const item = {
    id: id || undefined,
    title,
    year: document.getElementById('upc-year').value.trim(),
    genre: document.getElementById('upc-genre').value.trim(),
    releaseMonth: document.getElementById('upc-month').value.trim(),
    releaseDay: document.getElementById('upc-day').value.trim(),
    poster: document.getElementById('upc-poster').value.trim(),
    description: document.getElementById('upc-description').value.trim()
  };

  try {
    const res = await apiFetch('/api/admin/upcoming', {
      method: 'POST',
      body: JSON.stringify(item)
    });

    if (res.success) {
      showToast(`Saved upcoming "${title}"!`, 'success');
      closeUpcomingModal();
      await loadUpcoming();
      await loadContent();
    }
  } catch (err) {
    showToast(`Failed to save upcoming: ${err.message}`, 'error');
  }
}

async function deleteUpcoming(id, title) {
  if (!confirm(`Delete upcoming release "${title}"?`)) return;

  try {
    await apiFetch(`/api/admin/upcoming/${id}`, { method: 'DELETE' });
    showToast(`Deleted upcoming release`, 'success');
    await loadUpcoming();
    await loadContent();
  } catch (err) {
    showToast(`Failed to delete: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 8: ANNOUNCEMENTS & NOTIFICATIONS
// ============================================================
function renderNotificationsList() {
  const container = document.getElementById('notifications-list');
  const notifs = state.notifications || [];

  if (notifs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-bullhorn"></i>
        <h3>No announcements active</h3>
        <p>Create an announcement on the left to push to all FOBS TV users.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notifs.map(n => {
    return `
      <div class="notif-card glass">
        <div class="notif-main">
          <h4><span class="notif-badge">${n.tag || 'System'}</span> ${n.title}</h4>
          <p>${n.message}</p>
          <small class="text-muted">${n.time || (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : 'Active')}</small>
        </div>
        <button class="btn-table danger-btn" onclick="deleteNotification('${n.id}')" title="Delete Announcement">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  }).join('');
}

async function handleAnnouncementSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();
  const tag = document.getElementById('notif-tag').value;
  const link = document.getElementById('notif-link').value.trim();

  try {
    const res = await apiFetch('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ title, message, tag, link, time: 'Just now' })
    });

    if (res.success) {
      showToast('🎉 Broadcasted announcement to all app users!', 'success');
      document.getElementById('announcement-form').reset();
      await loadNotifications();
      renderNotificationsList();
    }
  } catch (err) {
    showToast(`Failed to broadcast: ${err.message}`, 'error');
  }
}

async function deleteNotification(id) {
  if (!confirm('Delete this announcement?')) return;

  try {
    await apiFetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
    showToast('Deleted announcement', 'success');
    await loadNotifications();
    renderNotificationsList();
  } catch (err) {
    showToast(`Failed to delete: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 9: REQUESTS & REPORTS
// ============================================================
function switchFeedbackSubtab(tab, btn) {
  document.querySelectorAll('.feedback-subtabs .subtab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('subtab-reports-pane').style.display = tab === 'reports' ? 'block' : 'none';
  document.getElementById('subtab-requests-pane').style.display = tab === 'requests' ? 'block' : 'none';
}

function renderReportsAndRequests() {
  renderReportsTable();
  renderRequestsTable();
}

function renderReportsTable() {
  const tbody = document.getElementById('reports-tbody');
  const reports = state.reports || [];

  if (reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table-cell">
          <i class="fa-solid fa-shield-heart text-emerald"></i>
          <p>No broken video reports! Streaming streams are playing smoothly.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reports.map(r => {
    const title = r.contentTitle || r.title || 'Reported Stream';
    const stream = r.streamUrl || r.stream_url || '';
    const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Recently';

    return `
      <tr>
        <td><strong>${title}</strong></td>
        <td><code>${r.contentId || r.mediaId || '--'}</code></td>
        <td><span class="text-rose font-weight-bold">${r.issueType || r.reason || 'Playback issue'}</span><br><small class="text-muted">${r.details || ''}</small></td>
        <td><small class="text-muted">${r.userIp || 'App Viewer'}<br>${dateStr}</small></td>
        <td><span class="badge-status ${r.resolved ? 'success' : 'alert'}">${r.resolved ? 'Resolved' : 'Pending'}</span></td>
        <td class="text-right">
          <div class="action-btn-group">
            ${stream ? `
              <button class="btn-table play-btn" onclick="previewVideoStream('${title}', '${stream}')" title="Test Stream">
                <i class="fa-solid fa-play"></i>
              </button>
            ` : ''}
            <button class="btn-table" onclick="resolveReport('${r.id}')" title="Mark Resolved">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="btn-table danger-btn" onclick="deleteReport('${r.id}')" title="Delete Report">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function resolveReport(id) {
  try {
    await apiFetch(`/api/admin/reports/${id}/resolve`, { method: 'POST' });
    showToast('Report marked as resolved', 'success');
    await loadReportsAndRequests();
    renderReportsTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteReport(id) {
  try {
    await apiFetch(`/api/admin/reports/${id}`, { method: 'DELETE' });
    showToast('Deleted report', 'success');
    await loadReportsAndRequests();
    renderReportsTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function renderRequestsTable() {
  const tbody = document.getElementById('requests-tbody');
  const requests = state.requests || [];

  if (requests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table-cell">
          <p>No user content requests pending.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = requests.map(req => {
    const title = req.title || req.query || 'Untitled';
    const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Recently';

    return `
      <tr>
        <td><strong>${title}</strong></td>
        <td><span class="badge-pill bg-cyan">${req.type || 'Movie/Series'}</span></td>
        <td><small class="text-muted">${req.userIp || '--'}</small></td>
        <td><small class="text-muted">${dateStr}</small></td>
        <td><span class="badge-status ${req.status === 'added' ? 'success' : 'alert'}">${req.status || 'Pending'}</span></td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-sm btn-primary" onclick="searchRequestInMovieBox('${title.replace(/'/g, "\\'")}')" title="Find & Import from MovieBox">
              <i class="fa-solid fa-magnifying-glass"></i> Search
            </button>
            <button class="btn-table" onclick="updateRequestStatus('${req.id}', 'added')" title="Mark Added">
              <i class="fa-solid fa-check"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function searchRequestInMovieBox(query) {
  switchTab('moviebox');
  document.getElementById('mb-search-input').value = query;
  searchMovieBox(query);
}

async function updateRequestStatus(id, status) {
  try {
    await apiFetch(`/api/admin/requests/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    showToast(`Request marked as ${status}`, 'success');
    await loadReportsAndRequests();
    renderRequestsTable();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 10: APP USERS & AUDIENCE
// ============================================================
let usersPollInterval = null;

function startUsersLivePolling() {
  stopUsersLivePolling();
  usersPollInterval = setInterval(() => {
    if (state.activeTab === 'users') {
      loadUsers(true);
    }
  }, 15000);
}

function stopUsersLivePolling() {
  if (usersPollInterval) {
    clearInterval(usersPollInterval);
    usersPollInterval = null;
  }
}

async function loadUsers(silent = false) {
  try {
    const data = await apiFetch('/api/admin/users');
    state.usersData = data;
    const list = data.users || data.devices || [];

    const onlineCount = list.filter(u => {
      if (u.status === 'Online Now') return true;
      if (u.lastActive) {
        return (Date.now() - new Date(u.lastActive).getTime()) < 15 * 60 * 1000;
      }
      return false;
    }).length;

    const regCount = data.totalRegistered !== undefined ? data.totalRegistered : list.filter(u => u.type === 'Registered Member').length;
    const totalCount = data.totalUsers !== undefined ? data.totalUsers : list.length;

    const elTotal = document.getElementById('stat-total-devices');
    const elOnline = document.getElementById('stat-latest-devices');
    const elReg = document.getElementById('stat-outdated-devices');
    const elBadge = document.getElementById('badge-users-count');

    if (elTotal) elTotal.innerText = totalCount.toLocaleString();
    if (elOnline) elOnline.innerText = onlineCount.toLocaleString();
    if (elReg) elReg.innerText = regCount.toLocaleString();
    if (elBadge) elBadge.innerText = totalCount.toLocaleString();

    state.usersList = list;
    filterUsersTable();
  } catch (err) {
    if (!silent) console.error('Failed to load users:', err);
  }
}

function filterUsersTable(query = null) {
  if (!state.usersList) state.usersList = state.usersData?.users || state.usersData?.devices || [];
  const q = (query !== null ? query : (document.getElementById('users-search')?.value || '')).toLowerCase().trim();
  const typeFilter = document.getElementById('users-type-filter')?.value || '';

  const filtered = state.usersList.filter(u => {
    const nameStr = (u.name || '').toLowerCase();
    const idStr = String(u.id || u.deviceId || '').toLowerCase();
    const emailStr = (u.email || '').toLowerCase();
    const ipStr = (u.ip || '').toLowerCase();

    const matchQ = !q || nameStr.includes(q) || idStr.includes(q) || emailStr.includes(q) || ipStr.includes(q);

    let matchType = true;
    if (typeFilter === 'Online') {
      matchType = u.status === 'Online Now' || (u.lastActive && (Date.now() - new Date(u.lastActive).getTime() < 15 * 60 * 1000));
    } else if (typeFilter) {
      matchType = u.type === typeFilter;
    }

    return matchQ && matchType;
  });

  const countDisplay = document.getElementById('users-count-display');
  if (countDisplay) countDisplay.innerText = `${filtered.length} viewers`;

  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table-cell">
          <p><i class="fa-solid fa-users-slash text-muted mb-2" style="font-size: 2rem;"></i><br>No active users or devices found matching criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.slice(0, 100).map(u => {
    const isOnline = u.status === 'Online Now' || (u.lastActive && (Date.now() - new Date(u.lastActive).getTime() < 15 * 60 * 1000));
    const lastActiveStr = u.lastActive ? new Date(u.lastActive).toLocaleString() : 'Recently';
    const isGoogle = u.type === 'Registered Member' || u.platform === 'Google Account';
    const displayEmail = (u.email || u.ip || 'Local/Cloud').replace(/^IP:\s*/, '');
    const cleanId = u.id || u.deviceId || '--';
    const shortId = cleanId.length > 20 ? cleanId.substring(0, 16) + '...' : cleanId;

    return `
      <tr>
        <td>
          <div class="user-row-meta">
            ${u.picture ? `<img src="${u.picture}" class="user-avatar-mini" alt="" onerror="this.onerror=null;this.src='';this.className='hidden';">` : `<div class="user-avatar-mini placeholder"><i class="fa-solid ${isGoogle ? 'fa-user' : 'fa-mobile-screen'}"></i></div>`}
            <div>
              <strong>${u.name || (isGoogle ? 'Member' : 'App Viewer')}</strong>
              <small class="d-block text-muted">ID: <code title="${cleanId}">${shortId}</code></small>
            </div>
          </div>
        </td>
        <td>
          <span class="badge-pill ${isGoogle ? 'bg-amber' : 'bg-cyan'}">
            <i class="fa-solid ${isGoogle ? 'fa-id-badge' : 'fa-mobile-screen'}"></i> ${u.type || 'App Viewer'}
          </span>
        </td>
        <td>
          <span><i class="fa-brands ${isGoogle ? 'fa-google text-amber' : 'fa-android text-emerald'}"></i> ${u.platform || 'Android'}</span>
        </td>
        <td>
          <code class="text-cyan">${displayEmail}</code>
        </td>
        <td>
          <span class="badge-status ${isOnline ? 'success pulse' : 'alert'}">
            <i class="fa-solid ${isOnline ? 'fa-circle-dot' : 'fa-circle'}"></i> ${isOnline ? 'Online Now' : 'Active'}
          </span>
        </td>
        <td>
          <small class="text-muted">${lastActiveStr}</small>
        </td>
      </tr>
    `;
  }).join('');
}

async function purgeOutdatedDevices() {
  if (!confirm('Purge all inactive device records?')) return;

  try {
    const res = await apiFetch('/api/admin/users/purge-old', { method: 'POST' });
    showToast(res.message || 'Inactive devices purged', 'success');
    loadUsers();
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

// ============================================================
// TAB 11: APP SETTINGS & REMOTE UPDATE
// ============================================================
async function handleAppSettingsSubmit(e) {
  e.preventDefault();
  showToast('Saving remote app settings...', 'info', 2000);

  const appUpdate = {
    latestVersionName: document.getElementById('up-version-name').value.trim(),
    latestVersionCode: parseInt(document.getElementById('up-version-code').value, 10) || 9,
    minVersionCode: parseInt(document.getElementById('up-min-code').value, 10) || 9,
    fileSize: document.getElementById('up-file-size').value.trim(),
    forceUpdate: document.getElementById('up-force-toggle').checked,
    enabled: document.getElementById('up-enabled-toggle').checked,
    title: document.getElementById('up-title').value.trim(),
    message: document.getElementById('up-message').value.trim(),
    releaseNotes: document.getElementById('up-release-notes').value.split('\n').map(s => s.trim()).filter(Boolean),
    downloadUrl: document.getElementById('up-download-url').value.trim(),
    fallbackUrl: document.getElementById('up-fallback-url').value.trim()
  };

  const settings = {
    appName: document.getElementById('st-app-name').value.trim(),
    appTagline: document.getElementById('st-tagline').value.trim(),
    marqueeNotice: document.getElementById('st-marquee').value.trim(),
    supportTelegram: document.getElementById('st-telegram').value.trim(),
    supportWhatsApp: document.getElementById('st-whatsapp').value.trim(),
    maintenanceMode: document.getElementById('st-maintenance-toggle').checked,
    maintenanceMessage: document.getElementById('st-maintenance-msg').value.trim()
  };

  try {
    const res = await apiFetch('/api/admin/app-settings', {
      method: 'POST',
      body: JSON.stringify({ appUpdate, settings })
    });

    if (res.success) {
      showToast('🎉 App settings and update rules saved! Active for all mobile viewers.', 'success', 4000);
      await loadAppSettings();
    }
  } catch (err) {
    showToast(`Failed to save settings: ${err.message}`, 'error', 5000);
  }
}

// ============================================================
// TAB 12: DEPLOYMENT & SYSTEM
// ============================================================
async function triggerVpsDeploy() {
  const btn = document.getElementById('btn-run-deploy');
  const term = document.getElementById('deploy-terminal');
  const log = document.getElementById('deploy-log');

  if (!confirm('Trigger automated Git Pull & PM2 reload on live VPS (187.127.114.52)?')) return;

  term.style.display = 'block';
  log.innerText = 'Connecting to VPS deployment webhook (187.127.114.52)...\nExecuting git fetch origin main && git reset --hard origin/main...';
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch('/api/admin/deploy-vps', { method: 'POST' });
    if (res.success) {
      const out = res.data?.stdout || JSON.stringify(res.data, null, 2);
      log.innerText = `✅ DEPLOY SUCCESSFUL!\n\n${out}\n\nPM2 reloaded and latest commit is live!`;
      showToast('🚀 Live VPS deployed and restarted successfully!', 'success', 6000);
    } else {
      throw new Error(res.error || 'Deploy failed');
    }
  } catch (err) {
    log.innerText = `❌ DEPLOY ERROR:\n${err.message}`;
    showToast(`Deploy error: ${err.message}`, 'error', 6000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function triggerRepairStreams() {
  showToast('Starting 1-Click stream repair & token rebuild across entire catalog...', 'info', 5000);
  try {
    const res = await apiFetch('/api/admin/repair-streams', { method: 'POST' });
    showToast(res.message || 'Stream renovation complete! All expired tokens healed.', 'success', 6000);
  } catch (err) {
    showToast(`Repair error: ${err.message}`, 'error', 5000);
  }
}

async function triggerRefreshCdn() {
  showToast('Refreshing AWS CloudFront signed CDN cookies...', 'info', 3000);
  try {
    const res = await apiFetch('/api/admin/refresh-cdn');
    showToast(res.message || '15-Minute CDN tokens refreshed successfully!', 'success', 4000);
  } catch (err) {
    showToast(`Refresh error: ${err.message}`, 'error', 4000);
  }
}

function downloadBackup() {
  showToast('Preparing catalog backup snapshot for download...', 'info', 2000);
  const tokenParam = state.token ? `?admin_token=${encodeURIComponent(state.token)}` : '';
  window.open(`/api/admin/backup/download${tokenParam}`, '_blank');
}

function handleRestoreFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const json = JSON.parse(evt.target.result);
      if (!confirm(`Restore catalog from backup file containing ${json.movies?.length || 0} movies and ${json.series?.length || 0} series?`)) {
        e.target.value = '';
        return;
      }

      showToast('Restoring database catalog from JSON...', 'info', 4000);
      const res = await apiFetch('/api/admin/backup/restore', {
        method: 'POST',
        body: JSON.stringify(json)
      });

      if (res.success) {
        showToast(`🎉 Catalog restored successfully! (${res.stats?.movies} movies, ${res.stats?.series} series)`, 'success', 6000);
        await refreshAll();
      }
    } catch (err) {
      showToast(`Invalid backup file: ${err.message}`, 'error', 6000);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ============================================================
// IN-ADMIN VIDEO PREVIEW PLAYER (HLS & HTML5)
// ============================================================
function previewVideoStream(title, streamUrl) {
  if (!streamUrl) {
    showToast('No stream URL available to preview', 'warning');
    return;
  }

  const modal = document.getElementById('player-modal');
  const playerTitle = document.getElementById('player-title');
  const urlDisplay = document.getElementById('player-stream-url');
  const video = document.getElementById('preview-video');
  const badge = document.getElementById('player-status-badge');

  playerTitle.innerHTML = `<i class="fa-solid fa-circle-play text-emerald"></i> Testing: ${title}`;
  urlDisplay.innerText = streamUrl;
  modal.classList.add('active');

  // Destroy existing Hls instance if any
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

  // Check if HLS stream (.m3u8)
  const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/hls');

  if (isHls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      badge.className = 'badge-status success';
      badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> HLS Stream Loaded';
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        badge.className = 'badge-status alert';
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> HLS Fatal Error';
      }
    });
    state.hlsInstance = hls;
  } else {
    // Native MP4 / Browser HLS playback
    video.src = streamUrl;
    video.play().catch(() => {});
    badge.className = 'badge-status success';
    badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Direct Stream Active';
  }
}

function closeVideoPlayer() {
  const modal = document.getElementById('player-modal');
  const video = document.getElementById('preview-video');
  if (video) {
    video.pause();
    video.src = '';
  }
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  modal.classList.remove('active');
}

// ============================================================
// STARTUP BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupEventListeners();
  verifyAuth();
});
