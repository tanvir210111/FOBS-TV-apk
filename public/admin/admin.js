let currentImportSeasons = [];
/**
 * FOBS TV — Web Admin Panel Client Engine (with Recent Importer)
 */

let authToken = localStorage.getItem('fobs_admin_token') || '';
let currentContent = { movies: [], series: [], liveTv: [], categories: [], industries: [] };
let currentFeedFilter = 'all';
let hlsInstance = null;

// ==========================================================================
// INITIALIZATION & AUTHENTICATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  if (authToken) {
    verifyAuth();
  } else {
    showLoginModal();
  }
});

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
}

async function apiFetch(url, options = {}) {
  options.headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Authentication expired. Please log in again.');
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
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
  try {
    const data = await apiFetch('/api/admin/stats');
    if (data.success) {
      hideLoginModal();
      renderStats(data.stats);
      loadContent();
      loadRequests();
      loadNotifications();
      // Pre-load recent MovieBox feed in background
      loadMovieBoxRecent('all');
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

function logout() {
  authToken = '';
  localStorage.removeItem('fobs_admin_token');
  showLoginModal();
  showToast('Logged out of admin panel', 'info');
}

// ==========================================================================
// EVENT LISTENERS & NAVIGATION
// ==========================================================================

function initEventListeners() {
  // Login Form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password').value.trim();
    const btn = document.getElementById('btn-login');
    const errText = document.getElementById('login-error');
    errText.innerText = '';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        authToken = data.token;
        localStorage.setItem('fobs_admin_token', authToken);
        hideLoginModal();
        showToast('Access Granted! Welcome to FOBS TV Hub', 'success');
        verifyAuth();
      } else {
        errText.innerText = data.error || 'Invalid admin credentials.';
      }
    } catch (err) {
      errText.innerText = 'Server error. Please verify server connection.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Authorize Access</span> <i class="fa-solid fa-arrow-right"></i>';
    }
  });

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Refresh Button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    verifyAuth();
    showToast('Dashboard reloaded', 'info');
  });

  // Nav Tabs Click
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Quick Importer Input in Overview
  document.getElementById('btn-quick-search').addEventListener('click', () => {
    const q = document.getElementById('quick-import-input').value.trim();
    if (q) {
      switchTab('moviebox');
      document.getElementById('mb-search-input').value = q;
      searchMovieBox(q);
    }
  });

  document.getElementById('quick-import-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-quick-search').click();
    }
  });

  // MovieBox Importer Search
  document.getElementById('btn-mb-search').addEventListener('click', () => {
    const q = document.getElementById('mb-search-input').value.trim();
    if (q) searchMovieBox(q);
  });

  document.getElementById('mb-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) searchMovieBox(q);
    }
  });

  // MovieBox Feed Filter Buttons (Recent, Trending, Cinema, Bollywood, Hollywood, etc.)
  document.querySelectorAll('.feed-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feed-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      currentFeedFilter = filter;
      document.getElementById('mb-search-input').value = '';
      loadMovieBoxRecent(filter);
    });
  });

  // Refresh Recent Feed Button
  document.getElementById('btn-refresh-recent-feed').addEventListener('click', () => {
    loadMovieBoxRecent(currentFeedFilter);
    showToast('Refreshing live MovieBox catalog...', 'info');
  });

  // Batch Auto-Import Top 5 Recent Button
  document.getElementById('btn-batch-import-5').addEventListener('click', handleBatchImportRecent);

  const toggleHide = document.getElementById('toggle-hide-imported');
  if (toggleHide) {
    toggleHide.addEventListener('change', () => {
      loadMovieBoxRecent(currentFeedFilter);
    });
  }

  // Movies Table Search Filter
  document.getElementById('movies-search').addEventListener('input', (e) => {
    filterMoviesTable(e.target.value.trim().toLowerCase());
  });

  document.getElementById('movies-category-filter').addEventListener('change', (e) => {
    filterMoviesTable(document.getElementById('movies-search').value.trim().toLowerCase());
  });

  // Series Table Search Filter
  document.getElementById('series-search').addEventListener('input', (e) => {
    filterSeriesTable(e.target.value.trim().toLowerCase());
  });

  // Channels Table Search Filter
  document.getElementById('channels-search').addEventListener('input', (e) => {
    filterChannelsGrid(e.target.value.trim().toLowerCase());
  });

  // User Requests Search Filter
  document.getElementById('requests-search').addEventListener('input', (e) => {
    filterRequestsTable(e.target.value.trim().toLowerCase());
  });

  // Modal Form Submissions
  document.getElementById('import-form').addEventListener('submit', handleImportSubmit);
  document.getElementById('movie-form').addEventListener('submit', handleMovieSubmit);
  const featForm = document.getElementById('featured-form');
  if (featForm) featForm.addEventListener('submit', handleFeaturedSubmit);
  document.getElementById('channel-form').addEventListener('submit', handleChannelSubmit);
  document.getElementById('notif-form').addEventListener('submit', handleNotifSubmit);

  // Type change in import modal to toggle episodes row
  document.getElementById('imp-type').addEventListener('change', (e) => {
    const isSeries = e.target.value === 'series';
    document.getElementById('series-episodes-row').style.display = isSeries ? 'flex' : 'none';
    const hintRow = document.getElementById('series-episodes-hint-row');
    if (hintRow) hintRow.style.display = isSeries ? 'block' : 'none';
  });

  const seasonModeSel = document.getElementById('imp-season-mode');
  if (seasonModeSel) {
    seasonModeSel.addEventListener('change', (e) => {
      const mode = e.target.value;
      const epInput = document.getElementById('imp-episodes');
      const epLabel = document.getElementById('imp-episodes-label');
      if (!epInput) return;
      if (mode === 'all') {
        const total = currentImportSeasons.reduce((acc, s) => acc + (s.maxEp || 0), 0) || 10;
        epInput.value = total;
        if (epLabel) epLabel.innerHTML = '<i class="fa-solid fa-film text-cyan"></i> Total Episodes';
      } else {
        const seNum = parseInt(mode, 10);
        const found = currentImportSeasons.find(s => s.se === seNum);
        epInput.value = found ? (found.maxEp || 10) : 10;
        if (epLabel) epLabel.innerHTML = `<i class="fa-solid fa-film text-cyan"></i> S${seNum} Episodes`;
      }
    });
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
  const activeNav = document.querySelector(`.sidebar-nav .nav-item[data-tab="${tabName}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.add('active');

  const titles = {
    overview: ['System Overview', 'Real-time statistics and streaming engine status'],
    moviebox: ['Recent & Trending Importer', 'Real-time feed of newly released MovieBox titles with 1-click import'],
    movies: ['Movies Catalog Manager', 'Manage and edit Full HD movies available on FOBS TV'],
    series: ['TV Series & Episodes', 'Manage multi-season TV shows and episode stream links'],
    livetv: ['Live TV Channels', 'Manage sports and 24/7 entertainment HLS streams'],
    requests: ['User Media Requests', 'Review titles requested by users directly in the app'],
    notifications: ['Broadcast Announcements', 'Instant notification alerts pushed to all mobile devices']
  };

  if (titles[tabName]) {
    document.getElementById('page-title').innerText = titles[tabName][0];
    document.getElementById('page-subtitle').innerText = titles[tabName][1];
  }

  if (tabName === 'moviebox' && document.getElementById('mb-results').children.length === 0) {
    loadMovieBoxRecent('all');
  }
}

// ==========================================================================
// DASHBOARD STATS
// ==========================================================================

function renderStats(stats) {
  if (!stats) return;
  document.getElementById('stat-movies').innerText = stats.totalMovies || 0;
  document.getElementById('stat-series').innerText = stats.totalSeries || 0;
  document.getElementById('stat-channels').innerText = stats.totalChannels || 0;
  document.getElementById('stat-views').innerText = Number(stats.totalViews || 0).toLocaleString();
  document.getElementById('stat-requests').innerText = stats.pendingRequests || 0;
  document.getElementById('stat-notifs').innerText = stats.totalNotifications || 0;

  document.getElementById('badge-movies-count').innerText = stats.totalMovies || 0;
  document.getElementById('badge-series-count').innerText = stats.totalSeries || 0;
  document.getElementById('badge-channels-count').innerText = stats.totalChannels || 0;
  document.getElementById('badge-requests-count').innerText = stats.pendingRequests || 0;

  document.getElementById('ram-usage').innerText = `${stats.memoryMb || 0} MB`;
  document.getElementById('node-ver').innerText = stats.nodeVersion || 'v22';

  const sec = stats.uptimeSeconds || 0;
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  document.getElementById('status-uptime').innerText = `Uptime: ${hours}h ${mins}m`;
}

// ==========================================================================
// RECENT & TRENDING IMPORTER ENGINE
// ==========================================================================

async function loadMovieBoxRecent(filter = 'all') {
  const loading = document.getElementById('mb-loading');
  const resultsContainer = document.getElementById('mb-results');
  const emptyState = document.getElementById('mb-empty');
  const metaBar = document.getElementById('mb-feed-meta');

  loading.style.display = 'block';
  document.getElementById('mb-loading-text').innerText = `Loading ${filter === 'all' ? 'recent' : filter} releases from MovieBox...`;
  emptyState.style.display = 'none';

  try {
    const hideImported = document.getElementById('toggle-hide-imported') ? document.getElementById('toggle-hide-imported').checked : true;
    const data = await apiFetch(`/api/admin/moviebox/recent?filter=${encodeURIComponent(filter)}&hide_imported=${hideImported}`);
    loading.style.display = 'none';

    if (data.success && data.items && data.items.length > 0) {
      metaBar.style.display = 'flex';
      document.getElementById('feed-meta-title').innerHTML = `Showing: <strong>${escapeHtml(filter.toUpperCase())} RELEASES</strong> (${data.items.length} titles)`;
      document.getElementById('feed-meta-unimported').innerText = `${data.unimportedCount || 0} Ready to Import`;

      if (document.getElementById('count-all')) {
        document.getElementById('count-all').innerText = data.unimportedCount !== undefined ? data.unimportedCount : data.items.length;
      }
      if (document.getElementById('feed-meta-unimported')) {
        document.getElementById('feed-meta-unimported').innerHTML = `<i class="fa-solid fa-sparkles text-amber"></i> ${data.unimportedCount || data.items.length} New Releases to Import`;
      }

      renderMovieBoxResults(data.items);
    } else {
      resultsContainer.innerHTML = '';
      metaBar.style.display = 'none';
      emptyState.style.display = 'block';
    }
  } catch (err) {
    loading.style.display = 'none';
    showToast(`Failed to load recent releases: ${err.message}`, 'error');
  }
}

async function handleBatchImportRecent() {
  const btn = document.getElementById('btn-batch-import-5');
  if (!confirm('Do you want to automatically import the top 5 newest releases into FOBS TV?')) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Auto-Importing 5 Items...';

  try {
    const data = await apiFetch('/api/admin/moviebox/batch-import', {
      method: 'POST',
      body: JSON.stringify({ count: 5, filter: currentFeedFilter })
    });

    if (data.success) {
      showToast(`🎉 Successfully imported ${data.importedCount} new titles into FOBS TV!`, 'success');
      loadContent();
      apiFetch('/api/admin/stats').then(res => renderStats(res.stats));
      loadMovieBoxRecent(currentFeedFilter);
    } else {
      showToast(data.error || 'Batch import failed', 'error');
    }
  } catch (err) {
    showToast(`Batch import error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> <span>Auto-Import Top 5 Recent</span>';
  }
}

// ==========================================================================
// SEARCH MOVIEBOX CATALOG
// ==========================================================================

async function searchMovieBox(query) {
  const loading = document.getElementById('mb-loading');
  const resultsContainer = document.getElementById('mb-results');
  const emptyState = document.getElementById('mb-empty');
  const metaBar = document.getElementById('mb-feed-meta');

  loading.style.display = 'block';
  document.getElementById('mb-loading-text').innerText = `Searching MovieBox for "${query}"...`;
  emptyState.style.display = 'none';
  metaBar.style.display = 'none';
  resultsContainer.innerHTML = '';

  try {
    const data = await apiFetch(`/api/admin/moviebox/search?q=${encodeURIComponent(query)}`);
    loading.style.display = 'none';

    if (data.success && data.items && data.items.length > 0) {
      renderMovieBoxResults(data.items);
    } else {
      emptyState.style.display = 'block';
      emptyState.querySelector('h3').innerText = 'No titles found on MovieBox';
      emptyState.querySelector('p').innerText = `We couldn't find any media matching "${query}". Try another keyword.`;
    }
  } catch (err) {
    loading.style.display = 'none';
    showToast(`MovieBox query failed: ${err.message}`, 'error');
  }
}

function renderMovieBoxResults(items) {
  const container = document.getElementById('mb-results');
  container.innerHTML = '';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'mb-card glass';

    const posterUrl = item.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80';
    const isSeries = item.type === 'series' || item.hasSeason || (item.title && item.title.toLowerCase().includes('season'));
    const isImported = !!item.alreadyImported;

    card.innerHTML = `
      <div class="mb-card-poster">
        <span class="mb-badge-type ${isImported ? 'badge-imported' : ''}">${isImported ? '✓ In App' : (isSeries ? 'Series' : 'Movie')}</span>
        ${item.section ? `<span class="badge-section">${escapeHtml(item.section)}</span>` : ''}
        <img src="${posterUrl}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'">
      </div>
      <div class="mb-card-content">
        <h4>${escapeHtml(item.title)}</h4>
        <div class="mb-meta">
          <span><i class="fa-solid fa-calendar"></i> ${item.year || '2026'}</span>
          <span><i class="fa-solid fa-star text-warning"></i> ${item.rating || '7.5'}</span>
        </div>
        <div class="mb-actions">
          ${isImported ? `
            <button class="btn-import-card btn-imported" title="Already added to FOBS TV catalog">
              <i class="fa-solid fa-check"></i>
              <span>Already Added</span>
            </button>
          ` : `
            <button class="btn-import-card" onclick="openImportModal(${escapeJson(item)})">
              <i class="fa-solid fa-download"></i>
              <span>1-Click Import</span>
            </button>
          `}
          <button class="btn-preview-card" title="Preview Video Stream" onclick="previewMovieBoxStream('${item.subjectId || item.id}', '${item.detailPath || ''}', ${isSeries ? 1 : 0})">
            <i class="fa-solid fa-play"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function previewMovieBoxStream(subjectId, detailPath, isSeries) {
  showToast('Resolving live MovieBox stream URL...', 'info');
  try {
    const data = await apiFetch(`/api/admin/moviebox/resolve?id=${subjectId}&path=${encodeURIComponent(detailPath || '')}&se=${isSeries ? 1 : 0}&ep=${isSeries ? 1 : 0}`);
    if (data.success && data.data && data.data.streamUrl) {
      openPlayerModal('MovieBox CDN Preview', data.data.streamUrl);
    } else {
      showToast('Could not resolve stream URL for preview', 'error');
    }
  } catch (err) {
    showToast(`Preview error: ${err.message}`, 'error');
  }
}

function setSelectValueOrAdd(selectId, val) {
  const sel = document.getElementById(selectId);
  if (!sel || !val) return;
  const lower = String(val).trim().toLowerCase();
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value.toLowerCase() === lower || sel.options[i].text.toLowerCase() === lower) {
      sel.selectedIndex = i;
      return;
    }
  }
  const opt = document.createElement('option');
  opt.value = val;
  opt.textContent = val;
  sel.appendChild(opt);
  sel.value = val;
}

async function openImportModal(item) {
  if (document.getElementById('imp-featured')) document.getElementById('imp-featured').checked = false;
  const isSeries = item.type === 'series' || item.hasSeason || (item.title && item.title.toLowerCase().includes('season'));
  const sId = String(item.subjectId || item.id || '');
  const dPath = item.detailPath || '';

  currentImportSeasons = [];
  document.getElementById('imp-subjectId').value = sId;
  document.getElementById('imp-detailPath').value = dPath;
  document.getElementById('imp-poster').value = item.poster || '';
  if (document.getElementById('imp-cover')) document.getElementById('imp-cover').value = item.backdrop || item.cover || '';
  document.getElementById('imp-title').value = item.title || '';
  document.getElementById('imp-year').value = item.year || '2026';
  document.getElementById('imp-type').value = isSeries ? 'series' : 'movie';
  document.getElementById('series-episodes-row').style.display = isSeries ? 'flex' : 'none';
  const hintRow = document.getElementById('series-episodes-hint-row');
  if (hintRow) hintRow.style.display = isSeries ? 'block' : 'none';

  const seasonSel = document.getElementById('imp-season-mode');
  if (seasonSel) {
    seasonSel.innerHTML = '<option value="all">🌟 All Seasons (Auto-Detecting...)</option>';
  }

  const isHindi = (item.title && item.title.toLowerCase().includes('hindi')) || (item.section && item.section.toLowerCase().includes('hindi'));
  document.getElementById('imp-ishindi').checked = isHindi;

  const epHint = document.getElementById('imp-episodes-hint');
  if (epHint) {
    epHint.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting uploaded seasons & episodes from MovieBox...';
    epHint.style.color = '#3b82f6';
  }

  document.getElementById('import-modal').classList.add('active');

  // Asynchronously query MovieBox for exact uploaded episode count, industry, category, and year
  try {
    const data = await apiFetch(`/api/admin/moviebox/detail?subjectId=${encodeURIComponent(sId)}`);
    if (data && data.success && data.detail) {
      const d = data.detail;
      currentImportSeasons = d.seasons || [];

      if (d.type) {
        document.getElementById('imp-type').value = d.type;
        const isNowSeries = d.type === 'series';
        document.getElementById('series-episodes-row').style.display = isNowSeries ? 'flex' : 'none';
        if (hintRow) hintRow.style.display = isNowSeries ? 'block' : 'none';
      }

      if (seasonSel) {
        seasonSel.innerHTML = '';
        if (d.seasons && d.seasons.length > 0) {
          const allOpt = document.createElement('option');
          allOpt.value = 'all';
          allOpt.textContent = `🌟 All Seasons (${d.seasons.length} Seasons • ${d.totalEpisodes} Eps Total)`;
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

      if (d.totalEpisodes && document.getElementById('imp-episodes')) {
        document.getElementById('imp-episodes').value = d.totalEpisodes;
      }
      if (d.year && document.getElementById('imp-year')) {
        document.getElementById('imp-year').value = d.year;
      }
      if (d.industry) {
        setSelectValueOrAdd('imp-industry', d.industry);
      }
      if (d.category) {
        setSelectValueOrAdd('imp-category', d.category);
      }
      if (typeof d.isHindi === 'boolean' && document.getElementById('imp-ishindi')) {
        document.getElementById('imp-ishindi').checked = d.isHindi;
      }
      if (d.cover && document.getElementById('imp-cover') && !document.getElementById('imp-cover').value) {
        document.getElementById('imp-cover').value = d.cover;
      }
      if (epHint) {
        if (d.seasons && d.seasons.length > 1) {
          const breakdown = d.seasons.map(s => `S${s.se}: ${s.maxEp} eps`).join(' • ');
          epHint.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Auto-detected: <strong>${d.seasons.length} Seasons (${d.totalEpisodes} Episodes Total)</strong><br><span style="font-size:11.5px; opacity:0.9;">${breakdown} • ${d.industry} (${d.category})</span>`;
        } else {
          epHint.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Auto-detected: <strong>${d.totalEpisodes} Episodes</strong> uploaded • ${d.industry} (${d.category})`;
        }
        epHint.style.color = '#10b981';
      }
    }
  } catch (err) {
    if (epHint) {
      epHint.innerHTML = '<i class="fa-solid fa-info-circle"></i> Default settings loaded. You can adjust episodes count.';
      epHint.style.color = 'var(--text-muted)';
    }
  }
}

function closeImportModal() {
  document.getElementById('import-modal').classList.remove('active');
}

async function handleImportSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-confirm-import');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing & Resolving Cues...';

  const payload = {
    subjectId: document.getElementById('imp-subjectId').value,
    detailPath: document.getElementById('imp-detailPath').value,
    poster: document.getElementById('imp-poster').value,
    cover: document.getElementById('imp-cover')?.value.trim() || undefined,
    title: document.getElementById('imp-title').value.trim(),
    year: document.getElementById('imp-year').value.trim(),
    type: document.getElementById('imp-type').value,
    category: document.getElementById('imp-category').value,
    industry: document.getElementById('imp-industry').value,
    isHindi: document.getElementById('imp-ishindi').checked,
    isFeatured: !!document.getElementById('imp-featured')?.checked,
    seasonMode: document.getElementById('imp-season-mode')?.value || 'all',
    episodesCount: parseInt(document.getElementById('imp-episodes').value, 10) || 1
  };

  try {
    const data = await apiFetch('/api/admin/moviebox/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      closeImportModal();
      showToast(`🎉 "${payload.title}" successfully added to FOBS TV!`, 'success');
      loadContent();
      apiFetch('/api/admin/stats').then(res => renderStats(res.stats));
      loadMovieBoxRecent(currentFeedFilter);
    } else {
      showToast(data.error || 'Failed to import title', 'error');
    }
  } catch (err) {
    showToast(`Import error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-download"></i> <span>Import Now to FOBS TV</span>';
  }
}

// ==========================================================================
// CONTENT & CATALOG MANAGEMENT (MOVIES, SERIES, LIVE TV)
// ==========================================================================

async function loadContent() {
  try {
    const data = await apiFetch('/api/admin/content');
    if (data.success && data.data) {
      currentContent = data.data;
      renderMoviesTable(currentContent.movies);
      renderSeriesTable(currentContent.series);
      renderChannelsGrid(currentContent.liveTv);
      populateCategoryFilters(currentContent.categories);
    }
  } catch (err) {
    showToast('Failed to load content list', 'error');
  }
}

function populateCategoryFilters(categories) {
  const select = document.getElementById('movies-category-filter');
  select.innerHTML = '<option value="">All Categories</option>';
  (categories || []).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = typeof cat === 'string' ? cat : (cat.name || '');
    opt.innerText = opt.value;
    select.appendChild(opt);
  });
}

function renderMoviesTable(movies) {
  const tbody = document.getElementById('movies-table-body');
  tbody.innerHTML = '';

  if (!movies || movies.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">No movies in database.</td></tr>';
    return;
  }

  movies.forEach(movie => {
    const tr = document.createElement('tr');
    const serversCount = (movie.servers || []).length || (movie.streamUrl ? 1 : 0);
    const audioTrack = movie.selectedAudio || movie.dubLanguage || movie.language || 'Original';

    tr.innerHTML = `
      <td><img src="${movie.poster || ''}" class="table-poster" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'"></td>
      <td class="title-cell">
        <strong>${escapeHtml(movie.title)}</strong>
        <small>${movie.year || '2026'} • ${movie.duration || '2h 00m'}</small>
      </td>
      <td><span class="badge-pill">${movie.category || 'Movies'}</span></td>
      <td>${movie.industry || 'Hollywood'}</td>
      <td><span class="text-warning">${audioTrack}</span></td>
      <td>⭐ ${movie.rating || movie.imdbRating || '8.0'}</td>
      <td>
        <span class="badge-views" title="Click to set/boost views" onclick="editMediaViews('${movie.id}', ${movie.views || 0}, '${escapeHtml(movie.title)}')">
          <i class="fa-solid fa-eye"></i> ${formatViews(movie.views || 0)}
        </span>
      </td>
      <td><span class="metric-pill">${serversCount} Servers</span></td>
      <td class="text-right">
        <div class="action-buttons">
          <button class="btn-action-sm" title="Test Stream" onclick="openPlayerModal('${escapeHtml(movie.title)}', '${movie.streamUrl}')"><i class="fa-solid fa-play"></i></button>
          <button class="btn-action-sm warning" title="Set as Hero Spotlight" onclick="makeFeatured(${escapeJson(movie)})"><i class="fa-solid fa-star text-amber"></i></button>
          <button class="btn-action-sm" title="Edit Movie" onclick="editMovie(${escapeJson(movie)})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-action-sm danger" title="Delete Movie" onclick="deleteMovie('${movie.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterMoviesTable(query) {
  const cat = document.getElementById('movies-category-filter').value;
  const filtered = (currentContent.movies || []).filter(m => {
    const matchesQuery = !query || (m.title && m.title.toLowerCase().includes(query)) || (m.year && m.year.includes(query));
    const matchesCat = !cat || m.category === cat;
    return matchesQuery && matchesCat;
  });
  renderMoviesTable(filtered);
}

function renderSeriesTable(seriesList) {
  const tbody = document.getElementById('series-table-body');
  tbody.innerHTML = '';

  if (!seriesList || seriesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">No series found.</td></tr>';
    return;
  }

  seriesList.forEach(series => {
    const tr = document.createElement('tr');
    const seasonsCount = (series.seasons || []).length || 1;
    let epsCount = series.episodesCount || 0;
    if (!epsCount && series.seasons) {
      epsCount = series.seasons.reduce((acc, s) => acc + (s.episodes ? s.episodes.length : 0), 0);
    }

    tr.innerHTML = `
      <td><img src="${series.poster || ''}" class="table-poster" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80'"></td>
      <td class="title-cell">
        <strong>${escapeHtml(series.title)}</strong>
        <small>${series.year || '2026'} • ${series.language || 'English'}</small>
      </td>
      <td><span class="badge-pill">${series.category || 'Series'}</span></td>
      <td>${series.duration || `${epsCount} Episodes`}</td>
      <td>${seasonsCount} Season</td>
      <td><strong class="text-amber">${epsCount} Episodes</strong></td>
      <td>
        <span class="badge-views" title="Click to set/boost views" onclick="editMediaViews('${series.id}', ${series.views || 0}, '${escapeHtml(series.title)}')">
          <i class="fa-solid fa-eye"></i> ${formatViews(series.views || 0)}
        </span>
      </td>
      <td class="text-right">
        <div class="action-buttons">
          <button class="btn-action-sm warning" title="Set as Hero Spotlight" onclick="makeFeatured(${escapeJson(series)})"><i class="fa-solid fa-star text-amber"></i></button>
          <button class="btn-action-sm danger" title="Delete Series" onclick="deleteSeries('${series.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterSeriesTable(query) {
  const filtered = (currentContent.series || []).filter(s => {
    return !query || (s.title && s.title.toLowerCase().includes(query));
  });
  renderSeriesTable(filtered);
}

function renderChannelsGrid(channels) {
  const container = document.getElementById('channels-grid');
  container.innerHTML = '';

  if (!channels || channels.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No Live TV channels available.</p></div>';
    return;
  }

  channels.forEach(ch => {
    const card = document.createElement('div');
    card.className = 'channel-card glass';

    card.innerHTML = `
      <div class="channel-header">
        <img src="${ch.logo || 'https://movieboxapp.in/favicon.ico'}" class="channel-logo" alt="${escapeHtml(ch.name)}" onerror="this.src='https://movieboxapp.in/favicon.ico'">
        <div class="channel-info">
          <h4>${escapeHtml(ch.name)}</h4>
          <span>${ch.category || 'Live TV'}</span>
        </div>
      </div>
      <div class="action-buttons">
        <button class="btn-action-sm" onclick="openPlayerModal('${escapeHtml(ch.name)}', '${ch.streamUrl}')">
          <i class="fa-solid fa-play"></i> Test HLS Stream
        </button>
        <button class="btn-action-sm danger" onclick="deleteChannel('${ch.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterChannelsGrid(query) {
  const filtered = (currentContent.liveTv || []).filter(c => {
    return !query || (c.name && c.name.toLowerCase().includes(query)) || (c.category && c.category.toLowerCase().includes(query));
  });
  renderChannelsGrid(filtered);
}

// ==========================================================================
// CRUD MODAL HANDLERS
// ==========================================================================


// ==========================================================================
// FEATURED HERO SPOTLIGHT MANAGEMENT
// ==========================================================================

function updateFeatCoverPreview(url) {
  const img = document.getElementById('feat-cover-preview');
  const ph = document.getElementById('feat-cover-placeholder');
  if (!img || !ph) return;
  if (url && url.startsWith('http')) {
    img.src = url;
    img.style.display = 'block';
    ph.style.display = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      ph.style.display = 'block';
    };
  } else {
    img.style.display = 'none';
    ph.style.display = 'block';
  }
}

function openFeaturedModal(item = null) {
  const modal = document.getElementById('featured-modal');
  if (!modal) return;

  const target = item || (currentContent && currentContent.featured) || {};
  document.getElementById('feat-id').value = target.id || '';
  document.getElementById('feat-title').value = target.title || '';
  document.getElementById('feat-type').value = target.type || (target.seasons ? 'series' : 'movie');
  
  const coverUrl = target.cover || target.backdrop || target.poster || '';
  document.getElementById('feat-cover').value = coverUrl;
  document.getElementById('feat-poster').value = target.poster || '';
  document.getElementById('feat-year').value = target.year || '2026';
  document.getElementById('feat-stream').value = target.streamUrl || '';
  document.getElementById('feat-desc').value = target.description || target.overview || '';

  updateFeatCoverPreview(coverUrl);
  modal.classList.add('active');
}

function closeFeaturedModal() {
  const modal = document.getElementById('featured-modal');
  if (modal) modal.classList.remove('active');
}

function makeFeatured(item) {
  openFeaturedModal(item);
}

async function handleFeaturedSubmit(e) {
  e.preventDefault();
  const payload = {
    id: document.getElementById('feat-id').value,
    title: document.getElementById('feat-title').value.trim(),
    type: document.getElementById('feat-type').value,
    cover: document.getElementById('feat-cover').value.trim(),
    backdrop: document.getElementById('feat-cover').value.trim(),
    poster: document.getElementById('feat-poster').value.trim(),
    year: document.getElementById('feat-year').value.trim(),
    streamUrl: document.getElementById('feat-stream').value.trim(),
    description: document.getElementById('feat-desc').value.trim(),
    badgeLeft: 'Featured',
    badgeRight: '4K Ultra HD'
  };

  try {
    const data = await apiFetch('/api/admin/featured', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.success) {
      closeFeaturedModal();
      showToast('Hero Spotlight banner updated successfully!', 'success');
      loadContent();
    }
  } catch (err) {
    showToast(`Error saving featured: ${err.message}`, 'error');
  }
}

function openMovieModal() {
  document.getElementById('movie-id').value = '';
  document.getElementById('movie-form').reset();
  if (document.getElementById('movie-cover')) document.getElementById('movie-cover').value = '';
  if (document.getElementById('movie-featured')) document.getElementById('movie-featured').checked = false;
  document.getElementById('movie-modal-title').innerText = 'Add Custom Movie';
  document.getElementById('movie-modal').classList.add('active');
}

function editMovie(movie) {
  document.getElementById('movie-id').value = movie.id || '';
  document.getElementById('movie-title').value = movie.title || '';
  document.getElementById('movie-year').value = movie.year || '2026';
  document.getElementById('movie-rating').value = movie.rating || '8.5';
  document.getElementById('movie-category').value = movie.category || 'Hollywood Movies';
  document.getElementById('movie-industry').value = movie.industry || 'Hollywood';
  document.getElementById('movie-audio').value = movie.selectedAudio || 'Hindi dub';
  document.getElementById('movie-poster').value = movie.poster || '';
  if (document.getElementById('movie-cover')) document.getElementById('movie-cover').value = movie.cover || movie.backdrop || '';
  document.getElementById('movie-stream').value = movie.streamUrl || '';
  if (document.getElementById('movie-views')) document.getElementById('movie-views').value = movie.views || 0;
  if (document.getElementById('movie-featured')) document.getElementById('movie-featured').checked = !!(appContent.featured && appContent.featured.id === movie.id);

  document.getElementById('movie-modal-title').innerText = 'Edit Movie';
  document.getElementById('movie-modal').classList.add('active');
}

function closeMovieModal() {
  document.getElementById('movie-modal').classList.remove('active');
}

async function handleMovieSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('movie-id').value;
  const payload = {
    id: id || `movie_${Date.now()}`,
    title: document.getElementById('movie-title').value.trim(),
    year: document.getElementById('movie-year').value.trim(),
    rating: document.getElementById('movie-rating').value.trim(),
    category: document.getElementById('movie-category').value.trim(),
    industry: document.getElementById('movie-industry').value.trim(),
    language: document.getElementById('movie-audio').value.trim(),
    selectedAudio: document.getElementById('movie-audio').value.trim(),
    poster: document.getElementById('movie-poster').value.trim(),
    cover: document.getElementById('movie-cover')?.value.trim() || document.getElementById('movie-poster').value.trim(),
    backdrop: document.getElementById('movie-cover')?.value.trim() || document.getElementById('movie-poster').value.trim(),
    streamUrl: document.getElementById('movie-stream').value.trim(),
    views: parseInt(document.getElementById('movie-views')?.value, 10) || 1250,
    isFeatured: !!document.getElementById('movie-featured')?.checked,
    servers: [
      { name: 'Server 1 (Fast HD)', url: document.getElementById('movie-stream').value.trim(), isDirect: true }
    ]
  };

  try {
    const data = await apiFetch('/api/admin/movie', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.success) {
      closeMovieModal();
      showToast('Movie saved successfully!', 'success');
      loadContent();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteMovie(id) {
  if (!confirm('Are you sure you want to delete this movie from FOBS TV?')) return;
  try {
    const data = await apiFetch(`/api/admin/movie/${id}`, { method: 'DELETE' });
    if (data.success) {
      showToast('Movie deleted', 'info');
      loadContent();
    }
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

async function deleteSeries(id) {
  if (!confirm('Are you sure you want to delete this TV series from FOBS TV?')) return;
  try {
    const data = await apiFetch(`/api/admin/series/${id}`, { method: 'DELETE' });
    if (data.success) {
      showToast('Series deleted', 'info');
      loadContent();
    }
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

function openChannelModal() {
  document.getElementById('channel-id').value = '';
  document.getElementById('channel-form').reset();
  document.getElementById('channel-modal-title').innerText = 'Add Live Channel';
  document.getElementById('channel-modal').classList.add('active');
}

function closeChannelModal() {
  document.getElementById('channel-modal').classList.remove('active');
}

async function handleChannelSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('channel-id').value;
  const payload = {
    id: id || `ch_${Date.now()}`,
    name: document.getElementById('channel-name').value.trim(),
    category: document.getElementById('channel-category').value.trim(),
    logo: document.getElementById('channel-logo').value.trim() || 'https://movieboxapp.in/favicon.ico',
    streamUrl: document.getElementById('channel-stream').value.trim()
  };

  try {
    const data = await apiFetch('/api/admin/channel', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.success) {
      closeChannelModal();
      showToast('Channel saved successfully!', 'success');
      loadContent();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteChannel(id) {
  if (!confirm('Are you sure you want to delete this live TV channel?')) return;
  try {
    const data = await apiFetch(`/api/admin/channel/${id}`, { method: 'DELETE' });
    if (data.success) {
      showToast('Channel removed', 'info');
      loadContent();
    }
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ==========================================================================
// USER REQUESTS MANAGEMENT
// ==========================================================================

let userRequests = [];

async function loadRequests() {
  try {
    const data = await apiFetch('/api/admin/requests');
    if (data.success && data.requests) {
      userRequests = data.requests;
      renderRequestsTable(userRequests);
    }
  } catch (err) {
    console.error('Failed to load user requests:', err);
  }
}

function renderRequestsTable(requests) {
  const tbody = document.getElementById('requests-table-body');
  tbody.innerHTML = '';

  if (!requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">No user requests pending.</td></tr>';
    return;
  }

  requests.forEach(req => {
    const tr = document.createElement('tr');
    const reqId = req.id || req._id;
    const status = req.status || 'Pending';
    const statusClass = status.toLowerCase() === 'approved' ? 'text-cyan' : (status.toLowerCase() === 'fulfilled' ? 'text-success' : 'text-warning');

    tr.innerHTML = `
      <td><strong>${escapeHtml(req.title)}</strong></td>
      <td><span class="badge-pill">${req.type || 'Movie'}</span></td>
      <td>${req.year || '2026'}</td>
      <td>${req.language || 'Hindi Dubbed'}</td>
      <td><small class="text-muted">${req.notes || 'User Request'}</small></td>
      <td><strong class="${statusClass}">${status}</strong></td>
      <td class="text-right">
        <select class="select-glass" onchange="updateRequestStatus('${reqId}', this.value)">
          <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Approved" ${status === 'Approved' ? 'selected' : ''}>Approved</option>
          <option value="Fulfilled" ${status === 'Fulfilled' ? 'selected' : ''}>Fulfilled</option>
          <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterRequestsTable(query) {
  const filtered = userRequests.filter(r => {
    return !query || (r.title && r.title.toLowerCase().includes(query)) || (r.notes && r.notes.toLowerCase().includes(query));
  });
  renderRequestsTable(filtered);
}

async function updateRequestStatus(id, newStatus) {
  try {
    const data = await apiFetch(`/api/admin/requests/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus })
    });
    if (data.success) {
      showToast(`Request updated to "${newStatus}"`, 'success');
      loadRequests();
    }
  } catch (err) {
    showToast(`Status update failed: ${err.message}`, 'error');
  }
}

// ==========================================================================
// BROADCAST ANNOUNCEMENTS
// ==========================================================================

async function loadNotifications() {
  try {
    const data = await apiFetch('/api/admin/notifications');
    if (data.success && data.notifications) {
      renderNotificationsList(data.notifications);
    }
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function renderNotificationsList(notifs) {
  const container = document.getElementById('notifs-list');
  container.innerHTML = '';

  if (!notifs || notifs.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No broadcast announcements currently active.</p></div>';
    return;
  }

  notifs.forEach(n => {
    const card = document.createElement('div');
    card.className = 'notif-card glass';

    card.innerHTML = `
      <div class="notif-main">
        <h4><span class="notif-badge">${n.tag || 'System'}</span> ${escapeHtml(n.title)}</h4>
        <p>${escapeHtml(n.message)}</p>
      </div>
      <button class="btn-action-sm danger" onclick="deleteNotification('${n.id}')">
        <i class="fa-solid fa-trash"></i> Delete
      </button>
    `;
    container.appendChild(card);
  });
}

function openNotifModal() {
  document.getElementById('notif-form').reset();
  document.getElementById('notif-modal').classList.add('active');
}

function closeNotifModal() {
  document.getElementById('notif-modal').classList.remove('active');
}

async function handleNotifSubmit(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('notif-title').value.trim(),
    tag: document.getElementById('notif-tag').value.trim() || 'System',
    message: document.getElementById('notif-message').value.trim()
  };

  try {
    const data = await apiFetch('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.success) {
      closeNotifModal();
      showToast('Announcement broadcasted to all mobile apps!', 'success');
      loadNotifications();
    }
  } catch (err) {
    showToast(`Broadcast failed: ${err.message}`, 'error');
  }
}

async function deleteNotification(id) {
  if (!confirm('Delete this broadcast announcement?')) return;
  try {
    const data = await apiFetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
    if (data.success) {
      showToast('Notice deleted', 'info');
      loadNotifications();
    }
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ==========================================================================
// VIDEO STREAM TESTER PLAYER (HLS + MP4)
// ==========================================================================

function openPlayerModal(title, streamUrl) {
  document.getElementById('player-title').innerHTML = `<i class="fa-solid fa-play-circle text-amber"></i> Playing: ${escapeHtml(title)}`;
  document.getElementById('player-url').innerText = streamUrl;

  const video = document.getElementById('test-video');
  const modal = document.getElementById('player-modal');
  modal.classList.add('active');

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (streamUrl.includes('.m3u8') && Hls.isSupported()) {
    hlsInstance = new Hls({ enableWorker: true });
    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else {
    video.src = streamUrl;
    video.play().catch(() => {});
  }
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  modal.classList.remove('active');
  const video = document.getElementById('test-video');
  video.pause();
  video.src = '';
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? 'fa-circle-check text-success' : (type === 'error' ? 'fa-circle-xmark text-danger' : 'fa-info-circle text-amber');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}


function formatViews(num) {
  num = Number(num) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

async function editMediaViews(id, currentViews, title) {
  const newViewsStr = prompt(`Set total views for "${title}":`, currentViews);
  if (newViewsStr === null) return;
  const newViews = parseInt(newViewsStr, 10);
  if (isNaN(newViews) || newViews < 0) {
    alert('Please enter a valid non-negative number.');
    return;
  }

  try {
    const data = await apiFetch(`/api/admin/media/${encodeURIComponent(id)}/views`, {
      method: 'POST',
      body: JSON.stringify({ views: newViews })
    });
    if (data.success) {
      showToast(`Updated views for "${title}" to ${formatViews(newViews)}!`, 'success');
      loadContent();
      apiFetch('/api/admin/stats').then(res => renderStats(res.stats));
    }
  } catch (err) {
    showToast(`Failed to update views: ${err.message}`, 'error');
  }
}

// ==========================================================================
// HELPER UTILITIES
// ==========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJson(obj) {
  return JSON.stringify(obj).replace(/"/g, '&quot;');
}

// 1-Click Stream & Playback Repair
async function triggerRepairStreams() {
  const btns = document.querySelectorAll('#btn-repair-streams, .repair-banner button');
  btns.forEach(b => {
    b.disabled = true;
    b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Repairing Streams...';
  });
  showToast('Scanning all series, episodes and movies to renew streams...', 'info');

  try {
    const data = await apiFetch('/api/admin/repair-streams', {
      method: 'POST'
    });

    if (data && data.success) {
      showToast(`Playback Fixed! Renewed ${data.repairedEpisodes} season episodes across ${data.repairedSeries} series & ${data.repairedMovies} movies.`, 'success');
      if (typeof loadStats === 'function') loadStats();
      if (typeof loadContent === 'function') loadContent();
    } else {
      showToast(`Repair finished: ${data.error || 'All streams were already up to date.'}`, 'warning');
    }
  } catch (err) {
    showToast(`Repair failed: ${err.message}`, 'error');
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      b.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> <span>Fix Playback</span>';
    });
  }
}
