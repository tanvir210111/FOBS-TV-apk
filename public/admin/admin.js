/**
 * FOBS TV — v3.1.8 Master Control Center Client
 * Handles full administration: permanent catalog, v3.1.8 audience, video reports, popups, and community.
 */

const API_BASE = '';
let authToken = sessionStorage.getItem('fobs_admin_jwt') || localStorage.getItem('fobs_admin_jwt') || '';

// App State
const state = {
  activeTab: 'overview',
  stats: {},
  movies: [],
  series: [],
  channels: [],
  reports: [],
  announcements: [],
  comments: [],
  users: [],
  requests: [],
  currentEpisodesStudio: null,
  activeSeasonIndex: 0
};

// ============================================================
// INITIALIZATION & AUTHENTICATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  setupNavigation();
});

function initAuth() {
  const loginForm = document.getElementById('login-form');
  const togglePwdBtn = document.getElementById('btn-toggle-pwd');
  const pwdInput = document.getElementById('admin-password');

  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      togglePwdBtn.innerHTML = isPwd ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = pwdInput.value.trim();
      const errEl = document.getElementById('login-error');
      errEl.innerText = '';

      try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (data.success && data.token) {
          authToken = data.token;
          sessionStorage.setItem('fobs_admin_jwt', authToken);
          localStorage.setItem('fobs_admin_jwt', authToken);
          showApp();
        } else {
          errEl.innerText = data.error || 'Invalid password. Access denied.';
        }
      } catch (err) {
        errEl.innerText = 'Server error or network failure.';
      }
    });
  }

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      authToken = '';
      sessionStorage.removeItem('fobs_admin_jwt');
      localStorage.removeItem('fobs_admin_jwt');
      location.reload();
    });
  }

  // Auto-login if token exists
  if (authToken) {
    verifySession();
  }
}

async function verifySession() {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/stats`);
    if (res.ok) {
      showApp();
    } else {
      document.getElementById('login-modal').classList.add('active');
    }
  } catch (e) {
    document.getElementById('login-modal').classList.add('active');
  }
}

function showApp() {
  document.getElementById('login-modal').classList.remove('active');
  document.getElementById('app').style.display = 'flex';
  const initialHash = (window.location.hash || '').replace('#', '').trim();
  if (initialHash && ['movies', 'series', 'livetv', 'reports', 'announcements', 'comments', 'users', 'requests', 'importer', 'appcontrol'].includes(initialHash)) {
    switchAdminTab(initialHash);
  } else {
    loadDashboardData();
  }
}

function authHeaders(headers = {}) {
  return {
    ...headers,
    'Authorization': `Bearer ${authToken}`
  };
}

async function authFetch(url, options = {}) {
  options.headers = authHeaders(options.headers || {});
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    authToken = '';
    sessionStorage.removeItem('fobs_admin_jwt');
    localStorage.removeItem('fobs_admin_jwt');
    document.getElementById('login-modal').classList.add('active');
    document.getElementById('app').style.display = 'none';
    throw new Error('Unauthorized');
  }
  return res;
}

// ============================================================
// NAVIGATION & TAB SWITCHING
// ============================================================

function setupNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      if (tab) {
        if (window.location.hash !== `#${tab}`) {
          window.location.hash = tab;
        }
        switchAdminTab(tab);
      }
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '').replace('#', '').trim();
    if (hash && hash !== state.activeTab) {
      switchAdminTab(hash);
    }
  });

  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarClose = document.getElementById('sidebar-close');
  const sidebar = document.getElementById('sidebar');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => sidebar.classList.add('open'));
  }
  if (sidebarClose && sidebar) {
    sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
  }
}

function switchAdminTab(tabName) {
  state.activeTab = tabName;
  if (window.location.hash !== `#${tabName}`) {
    history.replaceState(null, '', `#${tabName}`);
  }

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Update nav highlight
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });

  // Update tabs display
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabName}`);
  });

  // Update topbar title
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  const titles = {
    overview: { title: 'Dashboard Overview', sub: 'Real-time FOBS TV v3.1.8 System Status & Streaming Network' },
    movies: { title: 'Movies Management', sub: 'Manage permanent catalog, fast CDN streams, and audio dubbing' },
    series: { title: 'Series & TV Studio', sub: 'Manage seasons, episode streams, and subtitles' },
    livetv: { title: 'Live TV Channels', sub: 'Manage regional, sports, and international streaming channels' },
    reports: { title: 'Video Issue Reports & Diagnostics', sub: 'Live player stream issue reports submitted by viewers' },
    announcements: { title: 'Popup Notices & Announcements', sub: 'Manage in-app popups, view real-time likes, dislikes, and viewer comments' },
    comments: { title: 'User Comments & Community', sub: 'Moderate viewer comments across movies and series' },
    users: { title: 'v3.1.8 Verified Audience', sub: 'Active devices and registered members running FOBS TV v3.1.8' },
    requests: { title: 'User Requests & Pre-Bookings', sub: 'Viewer submitted requests for movies and series' },
    importer: { title: 'MovieBox 1-Click Importer', sub: 'Import trending titles with auto-renewing streams' },
    appcontrol: { title: 'v3.1.8 App Control & Remote Config', sub: 'Configure target version, mandatory updates, and server maintenance' }
  };

  if (titles[tabName]) {
    titleEl.innerText = titles[tabName].title;
    subEl.innerText = titles[tabName].sub;
  }

  // Load tab-specific data
  switch (tabName) {
    case 'overview':
      loadDashboardData();
      break;
    case 'movies':
      loadMovies();
      break;
    case 'series':
      loadSeries();
      break;
    case 'livetv':
      loadChannels();
      break;
    case 'reports':
      loadReports();
      break;
    case 'announcements':
      loadAnnouncements();
      break;
    case 'comments':
      loadAllComments();
      break;
    case 'users':
      loadUsers();
      break;
    case 'requests':
      loadRequests();
      break;
    case 'importer':
      loadMovieBoxRecent('all');
      break;
    case 'appcontrol':
      loadAppSettings();
      break;
  }
}

// ============================================================
// DASHBOARD OVERVIEW & STATS
// ============================================================

async function loadDashboardData() {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/stats`);
    const data = await res.json();
    if (data.success && data.stats) {
      state.stats = data.stats;
      document.getElementById('stat-movies').innerText = data.stats.totalMovies || 0;
      document.getElementById('stat-series').innerText = data.stats.totalSeries || 0;
      document.getElementById('stat-users').innerText = data.stats.totalUsers || 0;
      document.getElementById('stat-views').innerText = (data.stats.totalViews || 0).toLocaleString();

      document.getElementById('badge-movies-count').innerText = data.stats.totalMovies || 0;
      document.getElementById('badge-series-count').innerText = data.stats.totalSeries || 0;
      document.getElementById('badge-channels-count').innerText = data.stats.totalChannels || 0;
      document.getElementById('badge-requests-count').innerText = data.stats.pendingRequests || 0;
      document.getElementById('badge-users-count').innerText = data.stats.totalUsers || 0;
      if (document.getElementById('stat-reports')) document.getElementById('stat-reports').innerText = data.stats.pendingReports || 0;
      if (document.getElementById('badge-reports-count')) document.getElementById('badge-reports-count').innerText = data.stats.pendingReports || 0;

      document.getElementById('ram-usage').innerText = `${data.stats.memoryMb || 0} MB`;
      const uptimeHours = Math.floor((data.stats.uptimeSeconds || 0) / 3600);
      const uptimeMins = Math.floor(((data.stats.uptimeSeconds || 0) % 3600) / 60);
      document.getElementById('status-uptime').innerText = `Uptime: ${uptimeHours}h ${uptimeMins}m`;
    }

    loadOverviewPopupPreview();
    loadOverviewRecentComments();
    loadOverviewRequests();
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

async function loadOverviewPopupPreview() {
  const container = document.getElementById('overview-popup-card');
  const badge = document.getElementById('overview-popup-badge');
  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications`);
    const data = await res.json();
    const list = data.notifications || [];
    const activePopup = list.find(n => n.isPopup && n.active !== false);

    if (activePopup) {
      badge.style.display = 'inline-block';
      const likes = activePopup.likes || 0;
      const dislikes = activePopup.dislikes || 0;
      const commentsCount = Array.isArray(activePopup.comments) ? activePopup.comments.length : 0;

      container.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          ${activePopup.image ? `<img src="${activePopup.image}" style="width: 110px; height: 75px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">` : ''}
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="tag-pill">${escapeHtml(activePopup.tag || 'NOTICE')}</span>
              <strong style="font-size: 15px; color: #fff;">${escapeHtml(activePopup.title)}</strong>
            </div>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.4; margin-bottom: 12px;">${escapeHtml(activePopup.message)}</p>
            <div style="display: flex; gap: 12px; align-items: center; font-size: 12px;">
              <span style="color: #38bdf8;"><i class="fa-solid fa-thumbs-up"></i> ${likes} Likes</span>
              <span style="color: #f43f5e;"><i class="fa-solid fa-thumbs-down"></i> ${dislikes} Dislikes</span>
              <span style="color: #a855f7; cursor: pointer;" onclick="openNoticeCommentsModal('${activePopup.id}')"><i class="fa-solid fa-comments"></i> ${commentsCount} Comments</span>
            </div>
          </div>
        </div>
      `;
    } else {
      badge.style.display = 'none';
      container.innerHTML = `
        <div class="empty-state-mini">
          <p>No popup notice is currently active for v3.1.8 launch.</p>
          <button class="btn-sm-primary" style="margin-top: 10px;" onclick="switchAdminTab('announcements')">
            <i class="fa-solid fa-plus"></i> Set Active Popup Notice
          </button>
        </div>
      `;
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state-mini">Unable to load popup preview.</div>';
  }
}

async function loadOverviewRecentComments() {
  const container = document.getElementById('overview-recent-comments');
  try {
    const res = await authFetch(`${API_BASE}/api/admin/comments?limit=3`);
    const data = await res.json();
    const list = data.comments || [];

    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state-mini">No user comments posted yet.</div>';
      return;
    }

    container.innerHTML = list.map(c => `
      <div class="comment-item" style="padding: 10px 12px; margin-bottom: 8px;">
        <img class="comment-avatar" src="${c.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(c.userName || 'User')}" alt="">
        <div class="comment-content">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span class="comment-user-name">${escapeHtml(c.userName || 'Viewer')}</span>
            <span class="comment-time">${formatTimeAgo(c.createdAt)}</span>
          </div>
          <div style="font-size: 11px; color: var(--primary); margin: 2px 0;">On: ${escapeHtml(c.mediaTitle || 'Media')}</div>
          <div class="comment-text" style="font-size: 12.5px;">${escapeHtml(c.text)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state-mini">Unable to load comments feed.</div>';
  }
}

async function loadOverviewRequests() {
  const tbody = document.getElementById('overview-requests-tbody');
  try {
    const res = await authFetch(`${API_BASE}/api/admin/requests`);
    const data = await res.json();
    const list = (data.requests || []).filter(r => (r.status || '').toLowerCase() === 'pending').slice(0, 5);

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 24px; color: #64748b;">No pending user requests. All caught up!</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(r => `
      <tr>
        <td class="table-title-bold">${escapeHtml(r.title || 'Untitled')}</td>
        <td><span class="badge-tag">${escapeHtml(r.type || 'Media')}</span></td>
        <td>${escapeHtml(r.userName || r.userEmail || 'Anonymous')}</td>
        <td>${formatDate(r.createdAt)}</td>
        <td><span class="badge-tag" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">Pending</span></td>
        <td class="row-actions">
          <button class="btn-action-icon" style="color: #34d399;" onclick="updateRequestStatus('${r.id}', 'added')" title="Mark as Added"><i class="fa-solid fa-check"></i></button>
          <button class="btn-action-icon danger" onclick="updateRequestStatus('${r.id}', 'rejected')" title="Reject"><i class="fa-solid fa-xmark"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Error loading requests.</td></tr>';
  }
}

// ============================================================
// MOVIES MANAGEMENT
// ============================================================

async function loadMovies() {
  const tbody = document.getElementById('movies-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading movies catalog...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/content`);
    const data = await res.json();
    state.movies = data.movies || (data.data && data.data.movies) || [];
    renderMoviesTable(state.movies);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center error-text">Failed to load movies.</td></tr>';
  }
}

function renderMoviesTable(moviesList) {
  const tbody = document.getElementById('movies-tbody');
  if (!moviesList || moviesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 30px; color: #64748b;">No movies found. Click "Add New Movie" above.</td></tr>';
    return;
  }

  tbody.innerHTML = moviesList.map(m => `
    <tr>
      <td>
        <img class="table-poster" src="${m.poster || 'assets/fobs_logo.png'}" onerror="this.src='assets/fobs_logo.png'" alt="">
      </td>
      <td>
        <div class="table-title-bold">${escapeHtml(m.title)}</div>
        <div class="table-meta-sub">${m.year || '2025'} • ⭐ ${m.rating || m.imdbRating || '8.2'}</div>
      </td>
      <td>
        <span class="badge-tag quality">${escapeHtml(m.quality || '1080p')}</span>
        <span class="badge-tag" style="margin-left: 4px;">${escapeHtml(m.dubLanguage || m.audio || 'Hindi')}</span>
      </td>
      <td>${escapeHtml(m.genre || 'Action')}</td>
      <td><i class="fa-solid fa-eye" style="color: #64748b;"></i> ${(m.views || 0).toLocaleString()}</td>
      <td>
        <span class="badge-tag permanent"><i class="fa-solid fa-shield-check"></i> Permanent</span>
      </td>
      <td class="row-actions">
        <button class="btn-action-icon edit" onclick="openEditMovieModal('${m.id}')" title="Edit Movie"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-action-icon danger" onclick="confirmDeleteMovie('${m.id}', '${escapeHtml(m.title)}')"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

function filterMoviesTable() {
  const query = document.getElementById('movies-search-input').value.trim().toLowerCase();
  const industry = document.getElementById('movies-industry-filter').value;

  const filtered = state.movies.filter(m => {
    const matchQ = !query || (m.title && m.title.toLowerCase().includes(query)) || (m.genre && m.genre.toLowerCase().includes(query)) || (m.year && String(m.year).includes(query));
    const matchInd = industry === 'all' || (m.industry && m.industry.toLowerCase() === industry.toLowerCase()) || (m.genre && m.genre.toLowerCase().includes(industry));
    return matchQ && matchInd;
  });

  renderMoviesTable(filtered);
}

function openAddMovieModal() {
  document.getElementById('movie-form').reset();
  document.getElementById('movie-id').value = '';
  document.getElementById('movie-modal-title').innerHTML = '<i class="fa-solid fa-film"></i> Add New Movie';
  openModal('movie-modal');
}

function openEditMovieModal(id) {
  const movie = state.movies.find(m => m.id === id);
  if (!movie) return;

  document.getElementById('movie-id').value = movie.id || '';
  document.getElementById('movie-title').value = movie.title || '';
  document.getElementById('movie-year').value = movie.year || '';
  document.getElementById('movie-rating').value = movie.rating || movie.imdbRating || '';
  document.getElementById('movie-poster').value = movie.poster || '';
  document.getElementById('movie-backdrop').value = movie.cover || movie.backdrop || '';
  document.getElementById('movie-quality').value = movie.quality || '1080p Full HD';
  document.getElementById('movie-dub').value = movie.dubLanguage || movie.audio || 'Hindi Dubbed';
  document.getElementById('movie-genre').value = movie.genre || '';
  document.getElementById('movie-overview').value = movie.overview || movie.description || '';
  document.getElementById('movie-stream').value = movie.directStreamUrl || movie.streamUrl || '';
  document.getElementById('movie-stream-backup').value = (movie.servers && movie.servers[1] ? movie.servers[1].url : '');
  document.getElementById('movie-featured').checked = !!movie.isFeatured;

  document.getElementById('movie-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Movie';
  openModal('movie-modal');
}

async function triggerAutoDetectMovie() {
  const query = (document.getElementById('m-autodetect-input')?.value || document.getElementById('movie-title')?.value || '').trim();
  if (!query) {
    showToast('Enter a movie title or MovieBox subjectId to auto-detect', 'warning');
    return;
  }

  showToast(`Auto-detecting movie "${query}" from TMDb & MovieBox...`, 'info', 2500);

  try {
    const res = await authFetch(`${API_BASE}/api/admin/auto-detect?q=${encodeURIComponent(query)}&type=movie`);
    const data = await res.json();
    if (!data.success || !data.data) throw new Error(data.error || 'No matching metadata found');
    const d = data.data;

    if (d.subjectId) document.getElementById('movie-subject-id').value = d.subjectId;
    if (d.detailPath) document.getElementById('movie-detail-path').value = d.detailPath;
    document.getElementById('movie-title').value = d.title || query;
    document.getElementById('movie-year').value = d.year || '2026';
    document.getElementById('movie-rating').value = d.rating || '8.5';
    document.getElementById('movie-poster').value = d.poster || '';
    document.getElementById('movie-backdrop').value = d.backdrop || d.poster || '';
    document.getElementById('movie-genre').value = d.genre || 'Action, Thriller';
    document.getElementById('movie-dub').value = d.isHindi ? 'Hindi Dubbed' : (d.dubLanguage || 'Original Audio');
    document.getElementById('movie-overview').value = d.overview || '';
    if (d.streamUrl) document.getElementById('movie-stream-url').value = d.streamUrl;

    previewImage('movie-poster-preview', d.poster || '');
    previewImage('movie-backdrop-preview', d.backdrop || d.poster || '');

    showToast(`✨ Auto-detected: "${d.title}" (${d.year}) • ${d.industry} • ${d.isHindi ? 'Hindi Dubbed' : 'Original'}!`, 'success', 4000);
  } catch (err) {
    showToast(`Auto-detect error: ${err.message}`, 'error', 4000);
  }
}

async function handleMovieSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('movie-id').value.trim();
  const streamUrl = document.getElementById('movie-stream').value.trim();
  const backupStream = document.getElementById('movie-stream-backup').value.trim();
  const dub = document.getElementById('movie-dub').value.trim() || 'Hindi Dubbed';

  const servers = [
    { name: 'Server 1 (Direct Fast CDN)', url: streamUrl, quality: '1080p', audio: dub, isDirect: true }
  ];
  if (backupStream) {
    servers.push({ name: 'Server 2 (Backup Stream)', url: backupStream, quality: '1080p', audio: dub, isDirect: true });
  }

  const payload = {
    id: id || `movie_${Date.now()}`,
    title: document.getElementById('movie-title').value.trim(),
    year: document.getElementById('movie-year').value.trim() || '2025',
    rating: document.getElementById('movie-rating').value.trim() || '8.2',
    poster: document.getElementById('movie-poster').value.trim(),
    backdrop: document.getElementById('movie-backdrop').value.trim(),
    cover: document.getElementById('movie-backdrop').value.trim() || document.getElementById('movie-poster').value.trim(),
    quality: document.getElementById('movie-quality').value.trim() || '1080p Full HD',
    dubLanguage: dub,
    audio: dub,
    genre: document.getElementById('movie-genre').value.trim() || 'Action',
    overview: document.getElementById('movie-overview').value.trim(),
    description: document.getElementById('movie-overview').value.trim(),
    streamUrl,
    directStreamUrl: streamUrl,
    servers,
    isFeatured: document.getElementById('movie-featured').checked,
    isCustom: true
  };

  try {
    const res = await authFetch(`${API_BASE}/api/admin/movie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('movie-modal');
      showToast('Movie saved and permanently stored in catalog!');
      loadMovies();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to save movie', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteMovie(id, title) {
  if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/movie/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Movie deleted permanently.');
      loadMovies();
      loadDashboardData();
    } else {
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// SERIES & EPISODES STUDIO
// ============================================================

async function loadSeries() {
  const tbody = document.getElementById('series-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading series catalog...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/content`);
    const data = await res.json();
    state.series = data.series || (data.data && data.data.series) || [];
    renderSeriesTable(state.series);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center error-text">Failed to load series.</td></tr>';
  }
}

function renderSeriesTable(seriesList) {
  const tbody = document.getElementById('series-tbody');
  if (!seriesList || seriesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 30px; color: #64748b;">No series found. Click "Add New Series" above.</td></tr>';
    return;
  }

  tbody.innerHTML = seriesList.map(s => {
    const seasonsCount = s.seasonsCount || (s.seasons ? s.seasons.length : 1);
    const epsCount = s.episodesCount || (s.seasons ? s.seasons.reduce((acc, x) => acc + (x.episodes?.length || 0), 0) : 0);

    return `
      <tr>
        <td>
          <img class="table-poster" src="${s.poster || 'assets/fobs_logo.png'}" onerror="this.src='assets/fobs_logo.png'" alt="">
        </td>
        <td>
          <div class="table-title-bold">${escapeHtml(s.title)}</div>
          <div class="table-meta-sub">${s.year || '2025'} • ${escapeHtml(s.genre || 'Series')}</div>
        </td>
        <td>
          <span class="badge-tag quality">${seasonsCount} Season${seasonsCount > 1 ? 's' : ''}</span>
          <span class="badge-tag" style="margin-left: 4px;">${epsCount} Episodes</span>
        </td>
        <td>⭐ ${s.rating || s.imdbRating || '8.4'}</td>
        <td><i class="fa-solid fa-eye" style="color: #64748b;"></i> ${(s.views || 0).toLocaleString()}</td>
        <td>
          <span class="badge-tag permanent"><i class="fa-solid fa-shield-check"></i> Permanent</span>
        </td>
        <td class="row-actions">
          <button class="btn-sm-secondary" style="margin-right: 6px; color: #00f2fe; border-color: rgba(0, 242, 254, 0.4);" onclick="checkSeriesUpdates('${s.id}')" title="Check &amp; Sync New Released Episodes">
            <i class="fa-solid fa-cloud-arrow-down"></i> Sync
          </button>
          <button class="btn-sm-primary" style="margin-right: 6px;" onclick="openEpisodesStudio('${s.id}')" title="Episodes Studio">
            <i class="fa-solid fa-clapperboard"></i> Studio
          </button>
          <button class="btn-action-icon edit" onclick="openEditSeriesModal('${s.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-action-icon danger" onclick="confirmDeleteSeries('${s.id}', '${escapeHtml(s.title)}')"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterSeriesTable() {
  const query = document.getElementById('series-search-input').value.trim().toLowerCase();
  const filtered = state.series.filter(s => !query || (s.title && s.title.toLowerCase().includes(query)));
  renderSeriesTable(filtered);
}

function openAddSeriesModal() {
  document.getElementById('series-form').reset();
  document.getElementById('series-id').value = '';
  document.getElementById('series-modal-title').innerHTML = '<i class="fa-solid fa-tv"></i> Add New Series';
  openModal('series-modal');
}

function openEditSeriesModal(id) {
  const series = state.series.find(s => s.id === id);
  if (!series) return;

  document.getElementById('series-id').value = series.id || '';
  document.getElementById('series-title').value = series.title || '';
  document.getElementById('series-year').value = series.year || '';
  document.getElementById('series-rating').value = series.rating || series.imdbRating || '';
  document.getElementById('series-poster').value = series.poster || '';
  document.getElementById('series-backdrop').value = series.cover || series.backdrop || '';
  document.getElementById('series-dub').value = series.dubLanguage || series.audio || '';
  document.getElementById('series-genre').value = series.genre || '';
  document.getElementById('series-overview').value = series.overview || series.description || '';

  document.getElementById('series-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Series';
  openModal('series-modal');
}

async function triggerAutoDetectSeries() {
  const query = (document.getElementById('s-autodetect-input')?.value || document.getElementById('series-title')?.value || '').trim();
  if (!query) {
    showToast('Enter a series title or MovieBox subjectId to auto-detect', 'warning');
    return;
  }

  showToast(`Auto-detecting series "${query}" from TMDb & MovieBox...`, 'info', 2500);

  try {
    const res = await authFetch(`${API_BASE}/api/admin/auto-detect?q=${encodeURIComponent(query)}&type=series`);
    const data = await res.json();
    if (!data.success || !data.data) throw new Error(data.error || 'No matching metadata found');
    const d = data.data;

    if (d.subjectId) document.getElementById('series-subject-id').value = d.subjectId;
    if (d.detailPath) document.getElementById('series-detail-path').value = d.detailPath;
    document.getElementById('series-title').value = d.title || query;
    document.getElementById('series-year').value = d.year || '2026';
    document.getElementById('series-rating').value = d.rating || '8.8';
    document.getElementById('series-poster').value = d.poster || '';
    document.getElementById('series-backdrop').value = d.backdrop || d.poster || '';
    document.getElementById('series-genre').value = d.genre || 'Drama, Mystery';
    document.getElementById('series-dub').value = d.isHindi ? 'Hindi Dubbed' : (d.dubLanguage || 'Korean / Original');
    document.getElementById('series-overview').value = d.overview || '';

    // Cache detected seasons & episodes so handleSeriesSubmit attaches them automatically!
    if (Array.isArray(d.seasons) && d.seasons.length > 0) {
      state.lastDetectedSeriesSeasons = JSON.parse(JSON.stringify(d.seasons));
      renderSeriesEpisodesPreview(state.lastDetectedSeriesSeasons);
    } else {
      renderSeriesEpisodesPreview([]);
    }

    const seCount = d.seasons ? d.seasons.length : 1;
    const epCount = d.totalEpisodes || (d.seasons ? d.seasons.reduce((sum, s) => sum + (s.episodes?.length || s.maxEp || 0), 0) : 16);

    showToast(`✨ Auto-detected: "${d.title}" (${d.year}) • ${seCount} Season(s), ${epCount} Episodes • ${d.industry} (${d.isHindi ? 'Hindi Dubbed' : 'Original'})!`, 'success', 5000);
  } catch (err) {
    showToast(`Auto-detect error: ${err.message}`, 'error', 4000);
  }
}

function renderSeriesEpisodesPreview(seasons) {
  const box = document.getElementById('series-episodes-preview-box');
  const tabsEl = document.getElementById('series-preview-seasons-tabs');
  const tableEl = document.getElementById('series-preview-episodes-table');
  const totalCountEl = document.getElementById('series-preview-total-eps');
  if (!box || !tabsEl || !tableEl) return;

  if (!Array.isArray(seasons) || seasons.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  const totalEps = seasons.reduce((sum, s) => sum + (Array.isArray(s.episodes) ? s.episodes.length : 0), 0);
  if (totalCountEl) totalCountEl.innerText = `${seasons.length} Seasons • ${totalEps} Episodes`;

  if (state.activeSeriesPreviewSeasonIdx === undefined || state.activeSeriesPreviewSeasonIdx >= seasons.length) {
    state.activeSeriesPreviewSeasonIdx = 0;
  }

  tabsEl.innerHTML = seasons.map((s, idx) => `
    <button type="button" class="btn-sm-secondary ${idx === state.activeSeriesPreviewSeasonIdx ? 'btn-sm-primary' : ''}" onclick="selectSeriesPreviewSeason(${idx})" style="padding: 5px 10px; font-size: 12px;">
      ${escapeHtml(s.title || `Season ${s.seasonNumber || (idx + 1)}`)} (${s.episodes?.length || 0})
    </button>
  `).join('');

  const activeSeason = seasons[state.activeSeriesPreviewSeasonIdx] || seasons[0];
  const eps = activeSeason.episodes || [];

  if (eps.length === 0) {
    tableEl.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px 0;">No episodes in this season.</div>';
    return;
  }

  tableEl.innerHTML = `
    <table class="data-table" style="font-size: 12px; margin-top: 6px;">
      <thead>
        <tr>
          <th style="width: 45px;">Ep</th>
          <th>Title</th>
          <th>Stream URL</th>
          <th style="width: 40px; text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${eps.map((ep, eIdx) => `
          <tr>
            <td><strong>${ep.episode || (eIdx + 1)}</strong></td>
            <td>
              <input type="text" class="custom-input-sm" value="${escapeHtml(ep.title || `Episode ${ep.episode || (eIdx + 1)}`)}" onchange="updateSeriesPreviewEp(${state.activeSeriesPreviewSeasonIdx}, ${eIdx}, 'title', this.value)" style="padding: 4px 8px; font-size: 12px;">
            </td>
            <td>
              <input type="text" class="custom-input-sm" value="${escapeHtml(ep.streamUrl || '')}" onchange="updateSeriesPreviewEp(${state.activeSeriesPreviewSeasonIdx}, ${eIdx}, 'streamUrl', this.value)" style="padding: 4px 8px; font-size: 11px;">
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn-action-icon danger" onclick="deleteSeriesPreviewEp(${state.activeSeriesPreviewSeasonIdx}, ${eIdx})" style="padding: 3px 6px; font-size: 11px;"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function selectSeriesPreviewSeason(idx) {
  state.activeSeriesPreviewSeasonIdx = idx;
  renderSeriesEpisodesPreview(state.lastDetectedSeriesSeasons);
}

function updateSeriesPreviewEp(sIdx, eIdx, field, val) {
  if (state.lastDetectedSeriesSeasons && state.lastDetectedSeriesSeasons[sIdx] && state.lastDetectedSeriesSeasons[sIdx].episodes[eIdx]) {
    state.lastDetectedSeriesSeasons[sIdx].episodes[eIdx][field] = val;
  }
}

function deleteSeriesPreviewEp(sIdx, eIdx) {
  if (state.lastDetectedSeriesSeasons && state.lastDetectedSeriesSeasons[sIdx] && state.lastDetectedSeriesSeasons[sIdx].episodes) {
    state.lastDetectedSeriesSeasons[sIdx].episodes.splice(eIdx, 1);
    state.lastDetectedSeriesSeasons[sIdx].episodesCount = state.lastDetectedSeriesSeasons[sIdx].episodes.length;
    renderSeriesEpisodesPreview(state.lastDetectedSeriesSeasons);
  }
}

async function handleSeriesSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('series-id').value.trim();
  const subjectId = document.getElementById('series-subject-id')?.value.trim() || '';
  const detailPath = document.getElementById('series-detail-path')?.value.trim() || '';

  const payload = {
    id: id || (subjectId ? `mb-s-${subjectId}` : `series_${Date.now()}`),
    subjectId,
    detailPath,
    title: document.getElementById('series-title').value.trim(),
    year: document.getElementById('series-year').value.trim() || '2025',
    rating: document.getElementById('series-rating').value.trim() || '8.5',
    poster: document.getElementById('series-poster').value.trim(),
    backdrop: document.getElementById('series-backdrop').value.trim(),
    cover: document.getElementById('series-backdrop').value.trim() || document.getElementById('series-poster').value.trim(),
    dubLanguage: document.getElementById('series-dub').value.trim(),
    genre: document.getElementById('series-genre').value.trim() || 'Drama',
    overview: document.getElementById('series-overview').value.trim(),
    description: document.getElementById('series-overview').value.trim(),
    isCustom: true
  };

  // If seasons were detected/customized via Auto-Detect, attach them
  if (state.lastDetectedSeriesSeasons && state.lastDetectedSeriesSeasons.length > 0) {
    payload.seasons = state.lastDetectedSeriesSeasons;
    payload.episodes = state.lastDetectedSeriesSeasons[0]?.episodes || [];
    payload.seasonsCount = payload.seasons.length;
    payload.episodesCount = payload.seasons.reduce((sum, s) => sum + (s.episodes?.length || s.maxEp || 0), 0);
  }

  try {
    const res = await authFetch(`${API_BASE}/api/admin/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      state.lastDetectedSeriesSeasons = null;
      closeModal('series-modal');
      showToast('Series saved permanently in catalog!');
      loadSeries();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to save series', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteSeries(id, title) {
  if (!confirm(`Are you sure you want to permanently delete "${title}" and all its episodes?`)) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Series deleted permanently.');
      loadSeries();
      loadDashboardData();
    } else {
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// EPISODES STUDIO MODAL
async function openEpisodesStudio(seriesId) {
  showToast('Loading full seasons and episodes...', 'info', 1500);
  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/${encodeURIComponent(seriesId)}`);
    const data = await res.json();
    if (!data.success || !data.series) throw new Error(data.error || 'Failed to load series details');
    const series = data.series;

    state.currentEpisodesStudio = JSON.parse(JSON.stringify(series));
    if (!Array.isArray(state.currentEpisodesStudio.seasons) || state.currentEpisodesStudio.seasons.length === 0) {
      if (Array.isArray(state.currentEpisodesStudio.episodes) && state.currentEpisodesStudio.episodes.length > 0) {
        state.currentEpisodesStudio.seasons = [{
          seasonNumber: 1,
          title: 'Season 1',
          episodes: state.currentEpisodesStudio.episodes
        }];
      } else {
        state.currentEpisodesStudio.seasons = [{
          seasonNumber: 1,
          title: 'Season 1',
          episodes: []
        }];
      }
    }
    state.activeSeasonIndex = 0;

    document.getElementById('episodes-modal-series-title').innerHTML = `<i class="fa-solid fa-clapperboard"></i> ${escapeHtml(series.title)}`;
    renderSeasonsList();
    renderEpisodesTable();
    openModal('episodes-modal');
  } catch (err) {
    showToast(`Error opening Episodes Studio: ${err.message}`, 'error');
  }
}

function deleteCurrentSeason() {
  const seasons = state.currentEpisodesStudio?.seasons;
  if (!seasons || seasons.length <= 1) {
    showToast('Cannot delete the only season in the series.', 'warning');
    return;
  }
  const cur = seasons[state.activeSeasonIndex];
  if (!confirm(`Delete ${cur.title || ('Season ' + (state.activeSeasonIndex + 1))} and all its episodes?`)) return;
  seasons.splice(state.activeSeasonIndex, 1);
  state.activeSeasonIndex = Math.max(0, state.activeSeasonIndex - 1);
  renderSeasonsList();
  renderEpisodesTable();
  showToast('Season removed. Click Save All Episodes to persist changes.', 'info');
}

async function reDetectEpisodesFromStudio() {
  const s = state.currentEpisodesStudio;
  if (!s) return;
  const q = s.subjectId || s.title;
  if (!q) {
    showToast('No Subject ID or title found to re-detect from MovieBox', 'warning');
    return;
  }

  showToast(`Re-detecting latest episodes for "${s.title}" from MovieBox...`, 'info', 3000);
  try {
    const res = await authFetch(`${API_BASE}/api/admin/auto-detect?q=${encodeURIComponent(q)}&type=series`);
    const data = await res.json();
    if (!data.success || !data.data) throw new Error(data.error || 'Failed to fetch latest episodes');
    const d = data.data;

    if (!Array.isArray(d.seasons) || d.seasons.length === 0) {
      showToast('No seasons detected from MovieBox.', 'warning');
      return;
    }

    if (!Array.isArray(s.seasons)) s.seasons = [];
    let addedCount = 0;

    for (const detSeason of d.seasons) {
      const seNum = detSeason.seasonNumber || 1;
      let existingSeason = s.seasons.find(x => (x.seasonNumber || 1) === seNum);
      if (!existingSeason) {
        s.seasons.push(detSeason);
        addedCount += (detSeason.episodes?.length || 0);
      } else {
        if (!Array.isArray(existingSeason.episodes)) existingSeason.episodes = [];
        const existingEpNums = new Set(existingSeason.episodes.map(e => e.episode || parseInt(e.number, 10)));
        for (const ep of (detSeason.episodes || [])) {
          const epNum = ep.episode || parseInt(ep.number, 10);
          if (!existingEpNums.has(epNum)) {
            existingSeason.episodes.push(ep);
            existingEpNums.add(epNum);
            addedCount++;
          }
        }
        existingSeason.episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
        existingSeason.episodesCount = existingSeason.episodes.length;
      }
    }

    s.seasons.sort((a, b) => (a.seasonNumber || 1) - (b.seasonNumber || 1));
    renderSeasonsList();
    renderEpisodesTable();
    showToast(`✨ Re-detect complete! Added / updated ${addedCount} episode(s). Click "Save All Episodes" to confirm.`, 'success', 5000);
  } catch (err) {
    showToast(`Re-detect error: ${err.message}`, 'error');
  }
}

function renderSeasonsList() {
  const seasons = state.currentEpisodesStudio.seasons;
  const listEl = document.getElementById('seasons-list');
  listEl.innerHTML = seasons.map((s, idx) => `
    <div class="season-nav-item ${idx === state.activeSeasonIndex ? 'active' : ''}" onclick="selectSeason(${idx})">
      ${escapeHtml(s.title || `Season ${s.seasonNumber || (idx + 1)}`)}
      <span style="font-size: 11px; opacity: 0.8; float: right;">(${s.episodes?.length || 0})</span>
    </div>
  `).join('');
}

function selectSeason(index) {
  state.activeSeasonIndex = index;
  renderSeasonsList();
  renderEpisodesTable();
}

function addNewSeason() {
  const seasons = state.currentEpisodesStudio.seasons;
  const nextNum = seasons.length + 1;
  seasons.push({
    seasonNumber: nextNum,
    title: `Season ${nextNum}`,
    episodes: []
  });
  state.activeSeasonIndex = seasons.length - 1;
  renderSeasonsList();
  renderEpisodesTable();
}

function renderEpisodesTable() {
  const seasons = state.currentEpisodesStudio.seasons;
  const activeSeason = seasons[state.activeSeasonIndex];
  if (!activeSeason) return;

  document.getElementById('current-season-title').innerText = `${activeSeason.title || 'Season'} (${activeSeason.episodes?.length || 0} Episodes)`;

  const container = document.getElementById('episodes-list');
  const eps = activeSeason.episodes || [];

  if (eps.length === 0) {
    container.innerHTML = '<div class="empty-state-mini"><p>No episodes added to this season yet.</p><button class="btn-sm-primary" onclick="addNewEpisode()"><i class="fa-solid fa-plus"></i> Add Episode 1</button></div>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 50px;">Ep</th>
          <th>Episode Title</th>
          <th>Direct Stream URL (.mp4 / .m3u8)</th>
          <th style="width: 50px; text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${eps.map((ep, idx) => `
          <tr>
            <td>
              <input type="number" class="custom-input-sm" value="${ep.episode || (idx + 1)}" onchange="updateEpisodeField(${idx}, 'episode', this.value)" style="width: 50px; padding: 6px;">
            </td>
            <td>
              <input type="text" class="custom-input-sm" value="${escapeHtml(ep.title || `Episode ${ep.episode || (idx + 1)}`)}" onchange="updateEpisodeField(${idx}, 'title', this.value)">
            </td>
            <td>
              <input type="url" class="custom-input-sm" value="${escapeHtml(ep.streamUrl || '')}" placeholder="https://..." onchange="updateEpisodeField(${idx}, 'streamUrl', this.value)">
            </td>
            <td style="text-align: right;">
              <button class="btn-action-icon danger" onclick="deleteEpisode(${idx})"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function updateEpisodeField(idx, field, value) {
  const season = state.currentEpisodesStudio.seasons[state.activeSeasonIndex];
  if (season && season.episodes[idx]) {
    season.episodes[idx][field] = value;
    if (field === 'streamUrl') {
      season.episodes[idx].servers = [
        { name: 'Server 1 (Direct Fast CDN)', url: value, quality: '1080p', isDirect: true }
      ];
    }
  }
}

function addNewEpisode() {
  const season = state.currentEpisodesStudio.seasons[state.activeSeasonIndex];
  if (!season) return;
  if (!Array.isArray(season.episodes)) season.episodes = [];
  const nextNum = season.episodes.length + 1;
  season.episodes.push({
    episode: nextNum,
    episodeNumber: nextNum,
    number: String(nextNum).padStart(2, '0'),
    title: `Episode ${nextNum}`,
    season: season.seasonNumber || (state.activeSeasonIndex + 1),
    streamUrl: '',
    duration: '45 min'
  });
  renderEpisodesTable();
  renderSeasonsList();
}

function deleteEpisode(idx) {
  const season = state.currentEpisodesStudio.seasons[state.activeSeasonIndex];
  if (season && season.episodes) {
    season.episodes.splice(idx, 1);
    renderEpisodesTable();
    renderSeasonsList();
  }
}

async function saveEpisodesStudioChanges() {
  const s = state.currentEpisodesStudio;
  if (!s || !s.id) return;

  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/${s.id}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seasons: s.seasons })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('episodes-modal');
      showToast('All seasons and episodes saved permanently!');
      loadSeries();
    } else {
      showToast(data.error || 'Failed to save episodes', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// LIVE TV CHANNELS
// ============================================================

async function loadChannels() {
  const tbody = document.getElementById('channels-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading channels...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/content`);
    const data = await res.json();
    const content = data.data ? { ...data, ...data.data } : data;
    state.channels = content.liveTv || [];
    renderChannelsTable(state.channels);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center error-text">Failed to load channels.</td></tr>';
  }
}

function renderChannelsTable(channelsList) {
  const tbody = document.getElementById('channels-tbody');
  if (!channelsList || channelsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 30px; color: #64748b;">No channels configured. Click "Add Channel".</td></tr>';
    return;
  }

  tbody.innerHTML = channelsList.map(c => `
    <tr>
      <td>
        <img class="table-poster" style="height: 44px; object-fit: contain; background: #000;" src="${c.logo || c.image || 'assets/fobs_logo.png'}" onerror="this.src='assets/fobs_logo.png'" alt="">
      </td>
      <td class="table-title-bold">${escapeHtml(c.name)}</td>
      <td><span class="badge-tag quality">${escapeHtml(c.category || 'General')}</span></td>
      <td style="font-family: var(--font-mono); font-size: 11px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(c.streamUrl || '')}
      </td>
      <td class="row-actions">
        <button class="btn-action-icon edit" onclick="openEditChannelModal('${c.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-action-icon danger" onclick="confirmDeleteChannel('${c.id}', '${escapeHtml(c.name)}')"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

function filterChannelsTable() {
  const query = document.getElementById('channel-search-input').value.trim().toLowerCase();
  const filtered = state.channels.filter(c => !query || (c.name && c.name.toLowerCase().includes(query)));
  renderChannelsTable(filtered);
}

function openAddChannelModal() {
  document.getElementById('channel-form').reset();
  document.getElementById('channel-id').value = '';
  document.getElementById('channel-modal-title').innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> Add Live Channel';
  openModal('channel-modal');
}

function openEditChannelModal(id) {
  const ch = state.channels.find(c => c.id === id);
  if (!ch) return;

  document.getElementById('channel-id').value = ch.id;
  document.getElementById('channel-name').value = ch.name || '';
  document.getElementById('channel-category').value = ch.category || 'Bangladesh';
  document.getElementById('channel-logo').value = ch.logo || ch.image || '';
  document.getElementById('channel-stream').value = ch.streamUrl || '';

  document.getElementById('channel-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Channel';
  openModal('channel-modal');
}

async function handleChannelSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('channel-id').value.trim();
  const payload = {
    id: id || `ch_${Date.now()}`,
    name: document.getElementById('channel-name').value.trim(),
    category: document.getElementById('channel-category').value,
    logo: document.getElementById('channel-logo').value.trim(),
    image: document.getElementById('channel-logo').value.trim(),
    streamUrl: document.getElementById('channel-stream').value.trim(),
    isCustom: true
  };

  try {
    const res = await authFetch(`${API_BASE}/api/admin/channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('channel-modal');
      showToast('Live Channel saved permanently!');
      loadChannels();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to save channel', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteChannel(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/channel/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Channel deleted.');
      loadChannels();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// POPUP NOTICES & ANNOUNCEMENTS
// ============================================================

async function loadAnnouncements() {
  const container = document.getElementById('announcements-cards-grid');
  container.innerHTML = '<div class="empty-state">Loading notices & popup announcements...</div>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications`);
    const data = await res.json();
    state.announcements = data.notifications || [];
    renderAnnouncements(state.announcements);
  } catch (err) {
    container.innerHTML = '<div class="empty-state error-text">Failed to load notices.</div>';
  }
}

function renderAnnouncements(list) {
  const container = document.getElementById('announcements-cards-grid');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No notices created yet.</p><button class="btn-primary" onclick="openAddNotificationModal()"><i class="fa-solid fa-plus"></i> Create Notice</button></div>';
    return;
  }

  container.innerHTML = list.map(item => {
    const likes = item.likes || 0;
    const dislikes = item.dislikes || 0;
    const commentsCount = Array.isArray(item.comments) ? item.comments.length : 0;
    const isPopup = !!item.isPopup;

    return `
      <div class="card glass announcement-card">
        ${item.image ? `<img class="announcement-banner" src="${item.image}" alt="">` : ''}
        <div class="announcement-body">
          <div class="announcement-tags-row">
            <span class="tag-pill">${escapeHtml(item.tag || 'NOTICE')}</span>
            <span class="announcement-date">${formatDate(item.createdAt)}</span>
          </div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.message)}</p>

          <div class="announcement-reactions-row">
            <span class="reaction-pill-badge like"><i class="fa-solid fa-thumbs-up"></i> ${likes} Likes</span>
            <span class="reaction-pill-badge dislike"><i class="fa-solid fa-thumbs-down"></i> ${dislikes} Dislikes</span>
            <span class="reaction-pill-badge comments" onclick="openNoticeCommentsModal('${item.id}')" title="Click to view all comments">
              <i class="fa-solid fa-comments"></i> ${commentsCount} Comments
            </span>
          </div>
        </div>

        <div class="announcement-actions-bar">
          <label class="toggle-control" title="Toggle active popup on v3.1.8 app launch">
            <input type="checkbox" ${isPopup ? 'checked' : ''} onchange="toggleNoticePopup('${item.id}')">
            <span class="toggle-slider"></span>
            <span class="toggle-label" style="font-size: 11.5px;">${isPopup ? 'Active Popup' : 'Normal Notice'}</span>
          </label>
          <div style="display: flex; gap: 6px;">
            <button class="btn-action-icon edit" onclick="openEditNotificationModal('${item.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn-action-icon danger" onclick="confirmDeleteNotification('${item.id}', '${escapeHtml(item.title)}')"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openAddNotificationModal() {
  document.getElementById('notification-form').reset();
  document.getElementById('notif-id').value = '';
  document.getElementById('notif-tag').value = 'NOTICE';
  document.getElementById('notif-ispopup').checked = true;
  document.getElementById('notification-modal-title').innerHTML = '<i class="fa-solid fa-bullhorn"></i> Create In-App Popup Notice';
  openModal('notification-modal');
}

function openEditNotificationModal(id) {
  const notif = state.announcements.find(n => n.id === id);
  if (!notif) return;

  document.getElementById('notif-id').value = notif.id;
  document.getElementById('notif-title').value = notif.title || '';
  document.getElementById('notif-tag').value = notif.tag || 'NOTICE';
  document.getElementById('notif-message').value = notif.message || '';
  document.getElementById('notif-image').value = notif.image || '';
  document.getElementById('notif-linktext').value = notif.linkText || '';
  document.getElementById('notif-link').value = notif.link || '';
  document.getElementById('notif-ispopup').checked = !!notif.isPopup;

  document.getElementById('notification-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Popup Notice';
  openModal('notification-modal');
}

async function handleNotificationSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('notif-id').value.trim();
  const payload = {
    id: id || `notif_${Date.now()}`,
    title: document.getElementById('notif-title').value.trim(),
    tag: document.getElementById('notif-tag').value.trim() || 'NOTICE',
    message: document.getElementById('notif-message').value.trim(),
    image: document.getElementById('notif-image').value.trim(),
    linkText: document.getElementById('notif-linktext').value.trim(),
    link: document.getElementById('notif-link').value.trim(),
    isPopup: document.getElementById('notif-ispopup').checked,
    active: true
  };

  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('notification-modal');
      showToast('Notice published successfully! Pop-up status updated.');
      loadAnnouncements();
      loadDashboardData();
    } else {
      showToast(data.error || 'Failed to save notice', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleNoticePopup(id) {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications/${id}/toggle-popup`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast(`Popup notice status: ${data.isPopup ? 'Active on App Launch' : 'Disabled'}`);
      loadAnnouncements();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteNotification(id, title) {
  if (!confirm(`Are you sure you want to delete notice "${title}"?`)) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Notice deleted.');
      loadAnnouncements();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// NOTICE COMMENTS & ENGAGEMENT MODAL
let currentNoticeReactionsData = null;

async function openNoticeCommentsModal(notifId) {
  const notif = state.announcements.find(n => n.id === notifId);
  if (!notif) return;
  state.activeNoticeId = notifId;

  const likes = notif.likes || 0;
  const dislikes = notif.dislikes || 0;
  const total = likes + dislikes;
  const ratio = total > 0 ? Math.round((likes / total) * 100) : 50;

  document.getElementById('notice-comments-modal-title').innerHTML = `<i class="fa-solid fa-comments"></i> ${escapeHtml(notif.title)}`;
  document.getElementById('modal-likes-count').innerText = likes;
  document.getElementById('modal-dislikes-count').innerText = dislikes;
  document.getElementById('modal-ratio-fill').style.width = `${ratio}%`;
  document.getElementById('modal-ratio-text').innerText = `${ratio}% Positive Reactions`;

  switchNoticeModalTab('comments');
  renderNoticeCommentsList(notif.comments || []);
  openModal('notice-comments-modal');

  // Load who reacted breakdown from server
  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications/${encodeURIComponent(notifId)}/reactions`);
    const rData = await res.json();
    if (rData && rData.success) {
      currentNoticeReactionsData = rData;
      const lCount = rData.totalLikes || (rData.likes ? rData.likes.length : 0);
      const dCount = rData.totalDislikes || (rData.dislikes ? rData.dislikes.length : 0);
      const tot = lCount + dCount;
      const rat = tot > 0 ? Math.round((lCount / tot) * 100) : 50;

      document.getElementById('modal-likes-count').innerText = lCount;
      document.getElementById('modal-dislikes-count').innerText = dCount;
      document.getElementById('modal-ratio-fill').style.width = `${rat}%`;
      document.getElementById('modal-ratio-text').innerText = `${rat}% Positive Reactions`;

      renderNoticeReactionsList(rData);
    }
  } catch (_) {}
}

function switchNoticeModalTab(tab) {
  const btnComments = document.getElementById('btn-tab-notice-comments');
  const btnReactions = document.getElementById('btn-tab-notice-reactions');
  const viewComments = document.getElementById('notice-tab-content-comments');
  const viewReactions = document.getElementById('notice-tab-content-reactions');

  if (tab === 'comments') {
    if (btnComments) btnComments.className = 'btn-sm-primary';
    if (btnReactions) btnReactions.className = 'btn-sm-secondary';
    if (viewComments) viewComments.style.display = 'block';
    if (viewReactions) viewReactions.style.display = 'none';
  } else {
    if (btnComments) btnComments.className = 'btn-sm-secondary';
    if (btnReactions) btnReactions.className = 'btn-sm-primary';
    if (viewComments) viewComments.style.display = 'none';
    if (viewReactions) viewReactions.style.display = 'block';
  }
}

function renderNoticeReactionsList(data) {
  const likesList = document.getElementById('notice-likes-list');
  const dislikesList = document.getElementById('notice-dislikes-list');
  const likeBadge = document.getElementById('notice-reactions-like-count');
  const dislikeBadge = document.getElementById('notice-reactions-dislike-count');

  const likes = data.likes || [];
  const dislikes = data.dislikes || [];
  if (likeBadge) likeBadge.innerText = likes.length;
  if (dislikeBadge) dislikeBadge.innerText = dislikes.length;

  if (likesList) {
    if (likes.length === 0) {
      likesList.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px 0;">No likes yet.</div>';
    } else {
      likesList.innerHTML = likes.map(u => `
        <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 8px;">
          <img src="${u.avatar}" style="width: 28px; height: 28px; border-radius: 50%;" alt="">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12.5px; font-weight: 600; color: #10b981;">${escapeHtml(u.userName || 'User')}</div>
            <div style="font-size: 11px; color: #64748b;">${formatDate(u.time)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  if (dislikesList) {
    if (dislikes.length === 0) {
      dislikesList.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px 0;">No dislikes yet.</div>';
    } else {
      dislikesList.innerHTML = dislikes.map(u => `
        <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 8px;">
          <img src="${u.avatar}" style="width: 28px; height: 28px; border-radius: 50%;" alt="">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12.5px; font-weight: 600; color: #ef4444;">${escapeHtml(u.userName || 'User')}</div>
            <div style="font-size: 11px; color: #64748b;">${formatDate(u.time)}</div>
          </div>
        </div>
      `).join('');
    }
  }
}

function renderNoticeCommentsList(comments) {
  const listEl = document.getElementById('modal-comments-list');
  const countBadge = document.getElementById('modal-comments-count-badge') || document.getElementById('modal-comments-count');
  if (countBadge) countBadge.innerText = comments.length;
  if (!listEl) return;

  if (comments.length === 0) {
    listEl.innerHTML = '<div class="empty-state-mini">No comments posted on this announcement yet.</div>';
    return;
  }

  listEl.innerHTML = comments.map(c => {
    const repliesHtml = (Array.isArray(c.replies) && c.replies.length > 0) ? `
      <div style="margin-top: 8px; margin-left: 12px; border-left: 2px solid #00f2fe; padding-left: 8px;">
        ${c.replies.map(r => `
          <div style="background: rgba(0,242,254,0.08); border-radius: 6px; padding: 6px 10px; margin-top: 4px;">
            <div style="font-size: 11px; font-weight: 700; color: #00f2fe;"><i class="fa-solid fa-shield-halved"></i> FOBS TV Admin <span style="font-size: 10px; color: #94a3b8; font-weight: 400;">• ${formatDate(r.createdAt)}</span></div>
            <div style="font-size: 12px; color: #fff; margin-top: 2px;">${escapeHtml(r.text)}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="comment-item" style="flex-direction: column; align-items: stretch;">
        <div style="display: flex; gap: 10px;">
          <img class="comment-avatar" src="${c.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(c.name || 'User')}" alt="">
          <div class="comment-content" style="flex: 1;">
            <div style="display: flex; justify-content: space-between;">
              <div>
                <span class="comment-user-name">${escapeHtml(c.name || 'Viewer')}</span>
                <span class="comment-time">${formatDate(c.createdAt)}</span>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn-sm-primary" style="padding: 2px 7px; font-size: 11px;" onclick="toggleNoticeReplyBox('${c.id}')"><i class="fa-solid fa-reply"></i> Reply</button>
                <button class="btn-action-icon danger" onclick="deleteNoticeComment('${state.activeNoticeId}', '${c.id}')" title="Delete comment"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>
            <div class="comment-text">${escapeHtml(c.text)}</div>
            ${repliesHtml}
            <div id="notice-reply-box-${c.id}" style="display: none; margin-top: 8px; margin-left: 12px; gap: 6px;">
              <input type="text" id="notice-reply-input-${c.id}" class="custom-input-sm" placeholder="Write reply to ${escapeHtml(c.name || 'viewer')} as Admin..." style="flex: 1;" onkeypress="if(event.key==='Enter') sendNoticeCommentReply('${state.activeNoticeId}', '${c.id}')">
              <button class="btn-sm-primary" onclick="sendNoticeCommentReply('${state.activeNoticeId}', '${c.id}')"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleNoticeReplyBox(commentId) {
  const box = document.getElementById(`notice-reply-box-${commentId}`);
  if (!box) return;
  const isHidden = box.style.display === 'none' || !box.style.display;
  box.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) {
    const input = document.getElementById(`notice-reply-input-${commentId}`);
    if (input) setTimeout(() => input.focus(), 100);
  }
}

async function sendNoticeCommentReply(noticeId, commentId) {
  const input = document.getElementById(`notice-reply-input-${commentId}`);
  if (!input) return;
  const replyText = input.value.trim();
  if (!replyText) {
    showToast('Please type a reply message', 'warning');
    return;
  }

  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications/${encodeURIComponent(noticeId)}/comments/${encodeURIComponent(commentId)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: replyText, author: 'FOBS TV Admin' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Reply published successfully!');
      input.value = '';
      const notif = state.announcements.find(n => n.id === noticeId);
      if (notif && notif.comments) {
        const c = notif.comments.find(x => x.id === commentId);
        if (c) {
          if (!Array.isArray(c.replies)) c.replies = [];
          c.replies.push(data.reply);
          renderNoticeCommentsList(notif.comments);
        }
      }
    } else {
      showToast(data.error || 'Failed to send reply', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteNoticeComment(notifId, commentId) {
  if (!confirm('Delete this user comment?')) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/notifications/${notifId}/comments/${commentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Comment deleted.');
      // Refresh local cache and UI
      await loadAnnouncements();
      openNoticeCommentsModal(notifId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// MEDIA COMMENTS & COMMUNITY REVIEWS
// ============================================================

async function loadAllComments() {
  const tbody = document.getElementById('comments-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading user comments stream...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/comments?limit=150`);
    const data = await res.json();
    state.comments = data.comments || [];
    renderCommentsTable(state.comments);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center error-text">Failed to load comments feed.</td></tr>';
  }
}

function renderCommentsTable(commentsList) {
  const tbody = document.getElementById('comments-tbody');
  if (!commentsList || commentsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 30px; color: #64748b;">No comments found.</td></tr>';
    return;
  }

  tbody.innerHTML = commentsList.map(c => {
    const repliesHtml = (Array.isArray(c.replies) && c.replies.length > 0) ? `
      <div style="margin-top: 6px;">
        ${c.replies.map(r => `
          <div style="background: rgba(0,242,254,0.08); border-left: 2px solid #00f2fe; padding: 4px 8px; border-radius: 4px; margin-top: 4px; font-size: 12px;">
            <span style="color: #00f2fe; font-weight: 700;"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(r.author || 'Admin')}:</span>
            <span style="color: #cbd5e1;">${escapeHtml(r.text)}</span>
            <span style="color: #64748b; font-size: 10px; margin-left: 6px;">${formatDate(r.createdAt)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img class="comment-avatar" src="${c.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(c.userName || 'User')}" alt="">
            <div>
              <div class="table-title-bold" style="font-size: 13.5px;">${escapeHtml(c.userName || 'Viewer')}</div>
              <div class="table-meta-sub">${escapeHtml(c.userId || 'Guest')}</div>
            </div>
          </div>
        </td>
        <td>
          <strong style="color: var(--primary); font-size: 13px;">${escapeHtml(c.mediaTitle || 'Media')}</strong>
        </td>
        <td style="max-width: 380px;">
          <div style="font-size: 13px; color: #e2e8f0; line-height: 1.4;">${escapeHtml(c.text)}</div>
          ${c.imageUrl ? `<a href="${c.imageUrl}" target="_blank"><img class="comment-photo-preview" src="${c.imageUrl}" alt="Attached photo"></a>` : ''}
          ${repliesHtml}
        </td>
        <td><span style="color: #38bdf8; font-weight: 700;"><i class="fa-solid fa-thumbs-up"></i> ${c.likes || 0}</span></td>
        <td style="font-size: 12px; color: #94a3b8;">${formatDate(c.createdAt)}</td>
        <td class="row-actions">
          <button class="btn-action-icon edit" onclick="openCommentReplyModal('${c.mediaId}', '${c.id}', '${escapeHtml(c.userName || 'Viewer')}', '${escapeHtml(c.text || '')}')" title="Reply to viewer comment" style="margin-right: 4px;">
            <i class="fa-solid fa-reply"></i>
          </button>
          <button class="btn-action-icon danger" onclick="confirmDeleteMediaComment('${c.mediaId}', '${c.id}')" title="Delete comment"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function openCommentReplyModal(mediaId, commentId, userName, commentText) {
  document.getElementById('reply-media-id').value = mediaId || '';
  document.getElementById('reply-comment-id').value = commentId || '';
  document.getElementById('reply-modal-meta').innerText = `Replying to ${userName || 'Viewer'}`;
  document.getElementById('reply-modal-quote').innerText = `"${commentText || ''}"`;
  document.getElementById('reply-text').value = '';
  openModal('comment-reply-modal');
  setTimeout(() => document.getElementById('reply-text').focus(), 150);
}

async function handleCommentReplySubmit(e) {
  e.preventDefault();
  const mediaId = document.getElementById('reply-media-id').value;
  const commentId = document.getElementById('reply-comment-id').value;
  const replyText = document.getElementById('reply-text').value.trim();
  if (!replyText) return;

  try {
    const res = await authFetch(`${API_BASE}/api/admin/comments/${encodeURIComponent(mediaId)}/${encodeURIComponent(commentId)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: replyText, author: 'FOBS TV Admin' })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('comment-reply-modal');
      showToast('Admin reply saved & visible to viewer!');
      loadAllComments();
    } else {
      showToast(data.error || 'Failed to post reply', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function filterCommentsTable() {
  const query = document.getElementById('comments-search-input').value.trim().toLowerCase();
  const filtered = state.comments.filter(c => {
    return !query || (c.userName && c.userName.toLowerCase().includes(query)) ||
      (c.text && c.text.toLowerCase().includes(query)) ||
      (c.mediaTitle && c.mediaTitle.toLowerCase().includes(query));
  });
  renderCommentsTable(filtered);
}

async function confirmDeleteMediaComment(mediaId, commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/comments/${mediaId}/${commentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Comment removed.');
      loadAllComments();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// v3.1.8 APP AUDIENCE & ACTIVE DEVICES
// ============================================================

let userAudienceFilter = 'all';

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">Loading v3.1.8 audience...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/users`);
    const data = await res.json();
    state.users = data.users || data.devices || [];

    const regCount = state.users.filter(u => u.type === 'Registered Member').length;
    const devCount = state.users.filter(u => u.type !== 'Registered Member').length;
    const onlineCount = state.users.filter(u => u.isOnline || u.status === 'Online Now').length;

    if (document.getElementById('users-stat-devices')) document.getElementById('users-stat-devices').innerText = state.users.length;
    if (document.getElementById('users-stat-online')) document.getElementById('users-stat-online').innerText = onlineCount;
    if (document.getElementById('users-stat-registered')) document.getElementById('users-stat-registered').innerText = regCount;
    if (document.getElementById('users-stat-app-devices')) document.getElementById('users-stat-app-devices').innerText = devCount;

    if (document.getElementById('chip-count-all')) document.getElementById('chip-count-all').innerText = state.users.length;
    if (document.getElementById('chip-count-registered')) document.getElementById('chip-count-registered').innerText = regCount;
    if (document.getElementById('chip-count-devices')) document.getElementById('chip-count-devices').innerText = devCount;
    if (document.getElementById('chip-count-online')) document.getElementById('chip-count-online').innerText = onlineCount;

    filterUsersTable();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center error-text">Failed to load v3.1.8 audience.</td></tr>';
  }
}

function setUserAudienceFilter(type) {
  userAudienceFilter = type;
  document.querySelectorAll('#tab-users .btn-filter-chip').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`chip-users-${type}`);
  if (activeBtn) activeBtn.classList.add('active');
  filterUsersTable();
}

function filterUsersTable() {
  const query = (document.getElementById('users-search-input')?.value || '').trim().toLowerCase();
  const filtered = (state.users || []).filter(u => {
    // Type filter
    if (userAudienceFilter === 'registered' && u.type !== 'Registered Member') return false;
    if (userAudienceFilter === 'devices' && u.type === 'Registered Member') return false;
    if (userAudienceFilter === 'online' && !u.isOnline && u.status !== 'Online Now') return false;

    // Search query
    if (!query) return true;
    return (u.name && u.name.toLowerCase().includes(query)) ||
      (u.id && String(u.id).toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.ip && u.ip.toLowerCase().includes(query)) ||
      (u.deviceModel && u.deviceModel.toLowerCase().includes(query)) ||
      (u.platform && u.platform.toLowerCase().includes(query));
  });

  renderUsersTable(filtered);
}

function renderUsersTable(usersList) {
  const tbody = document.getElementById('users-tbody');
  if (!usersList || usersList.length === 0) {
    const emptyMsg = userAudienceFilter === 'registered'
      ? 'No registered Google accounts found on v3.1.8.'
      : (userAudienceFilter === 'online' ? 'No users online in the last 10 minutes.' : 'No audience records matching this filter.');
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 36px; color: #64748b;">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = usersList.map(u => {
    const isOnline = u.isOnline || u.status === 'Online Now';
    const isReg = u.type === 'Registered Member';
    const rawIp = u.ip || (u.email && (u.email.includes('.') && !u.email.includes('@')) ? u.email.replace('IP: ', '') : '');

    const avatarHtml = isReg && u.picture
      ? `<div style="position: relative; display: inline-block;">
           <img src="${escapeHtml(u.picture)}" alt="${escapeHtml(u.name)}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1.5px solid #c084fc;">
           ${isOnline ? '<span class="pulse-dot-green" style="position: absolute; bottom: 0; right: 0; border: 1.5px solid #0f172a;"></span>' : ''}
         </div>`
      : `<div style="position: relative; display: inline-block;">
           <div style="width: 36px; height: 36px; border-radius: 50%; background: ${isReg ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'rgba(56, 189, 248, 0.15)'}; color: ${isReg ? '#fff' : '#38bdf8'}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid ${isReg ? 'rgba(168,85,247,0.4)' : 'rgba(56,189,248,0.3)'};">
             <i class="${isReg ? 'fa-solid fa-user' : 'fa-brands fa-android'}"></i>
           </div>
           ${isOnline ? '<span class="pulse-dot-green" style="position: absolute; bottom: 0; right: 0; border: 1.5px solid #0f172a;"></span>' : ''}
         </div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${avatarHtml}
            <div>
              <div class="table-title-bold" style="font-size: 13.5px; color: ${isReg ? '#f8fafc' : '#e2e8f0'}; font-weight: 700;">
                ${escapeHtml(u.name || (isReg ? 'Google Member' : 'Mobile App User'))}
              </div>
              <div class="table-meta-sub" style="font-family: var(--font-mono); font-size: 11px; color: #64748b;">
                ID: ${escapeHtml((u.id || u.deviceId || '').substring(0, 18))}...
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; font-size: 12.5px; color: #cbd5e1;">${escapeHtml(u.deviceModel || 'Android Phone')}</span>
            <span style="font-family: var(--font-mono); font-size: 11.5px; color: #94a3b8;">
              <i class="fa-solid fa-network-wired" style="font-size: 10px; color: #38bdf8; margin-right: 3px;"></i>
              ${escapeHtml(rawIp || 'Direct Connection')}
            </span>
          </div>
        </td>
        <td>
          <span class="badge-tag" style="background: ${isReg ? 'rgba(168, 85, 247, 0.18)' : 'rgba(56, 189, 248, 0.12)'}; color: ${isReg ? '#c084fc' : '#38bdf8'}; font-weight: 700; border: 1px solid ${isReg ? 'rgba(168, 85, 247, 0.35)' : 'rgba(56, 189, 248, 0.25)'};">
            ${isReg ? '<i class="fa-solid fa-user-shield"></i> Member' : '<i class="fa-brands fa-android"></i> App Device'}
          </span>
          ${isReg ? `<div class="table-meta-sub" style="font-size: 10.5px; margin-top: 3px;">Saved: ${u.watchlistCount || 0} &bull; History: ${u.historyCount || 0}</div>` : ''}
        </td>
        <td>
          <span class="badge-tag quality" style="background: rgba(16, 185, 129, 0.18); color: #34d399; font-weight: 800; border: 1px solid rgba(16, 185, 129, 0.4);">
            <i class="fa-solid fa-circle-check" style="margin-right: 3px;"></i> v3.1.8
          </span>
        </td>
        <td><i class="${isReg ? 'fa-brands fa-google' : 'fa-brands fa-android'}" style="color: ${isReg ? '#f59e0b' : '#34d399'}; margin-right: 4px;"></i> ${escapeHtml(u.platform || 'Android')}</td>
        <td style="font-size: 12.5px; color: #94a3b8;">${formatDate(u.createdAt)}</td>
        <td>
          <div style="font-size: 12.5px; font-weight: 600; color: #f1f5f9;" title="${u.lastActive}">${u.lastActiveAgo || formatTimeAgo(u.lastActive)}</div>
          <div class="table-meta-sub" style="font-size: 10.5px;">${formatDate(u.lastActive)}</div>
        </td>
        <td>
          ${isOnline
            ? '<span class="status-pill-online"><span class="pulse-dot-green"></span> Online Now</span>'
            : (u.status === 'Active Recently'
                ? '<span class="status-pill-recent"><i class="fa-solid fa-clock"></i> Recent</span>'
                : '<span class="status-pill-offline">Offline</span>')}
        </td>
        <td style="text-align: right;">
          <button class="btn-action-icon" onclick="copyToClipboard('${escapeHtml(rawIp || u.id)}')" title="Copy IP / ID">
            <i class="fa-regular fa-copy"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function purgeOldVersions() {
  if (!confirm('This will purge all legacy user sessions and devices older than v3.1.8, keeping strictly v3.1.8 verified users. Continue?')) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/users/purge-old`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '3.1.8' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Purged older records. Kept ${data.keptDevices} v3.1.8 devices and ${data.keptUsers} members.`);
      loadUsers();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// VIDEO REPORTS & STREAM DIAGNOSTICS
// ============================================================

let reportsFilter = 'all';

async function loadReports() {
  const tbody = document.getElementById('reports-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading video reports...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/reports`);
    const data = await res.json();
    state.reports = data.reports || [];

    const total = state.reports.length;
    const pending = state.reports.filter(r => (r.status || 'pending').toLowerCase() === 'pending').length;
    const resolved = state.reports.filter(r => (r.status || '').toLowerCase() === 'resolved').length;

    if (document.getElementById('stat-rep-total')) document.getElementById('stat-rep-total').innerText = total;
    if (document.getElementById('stat-rep-pending')) document.getElementById('stat-rep-pending').innerText = pending;
    if (document.getElementById('stat-rep-resolved')) document.getElementById('stat-rep-resolved').innerText = resolved;

    if (document.getElementById('chip-rep-count-all')) document.getElementById('chip-rep-count-all').innerText = total;
    if (document.getElementById('chip-rep-count-pending')) document.getElementById('chip-rep-count-pending').innerText = pending;
    if (document.getElementById('chip-rep-count-resolved')) document.getElementById('chip-rep-count-resolved').innerText = resolved;

    if (document.getElementById('badge-reports-count')) document.getElementById('badge-reports-count').innerText = pending;
    if (document.getElementById('stat-reports')) document.getElementById('stat-reports').innerText = pending;

    filterReportsTable();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center error-text">Failed to load reports.</td></tr>';
  }
}

function setReportsFilter(type) {
  reportsFilter = type;
  document.querySelectorAll('#tab-reports .btn-filter-chip').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`chip-rep-${type}`);
  if (activeBtn) activeBtn.classList.add('active');
  filterReportsTable();
}

function filterReportsTable() {
  const query = (document.getElementById('reports-search-input')?.value || '').trim().toLowerCase();
  const filtered = (state.reports || []).filter(r => {
    // Status filter
    const status = (r.status || 'pending').toLowerCase();
    if (reportsFilter === 'pending' && status !== 'pending') return false;
    if (reportsFilter === 'resolved' && status !== 'resolved') return false;

    // Search query
    if (!query) return true;
    return (r.mediaTitle && r.mediaTitle.toLowerCase().includes(query)) ||
      (r.reason && r.reason.toLowerCase().includes(query)) ||
      (r.details && r.details.toLowerCase().includes(query)) ||
      (r.userName && r.userName.toLowerCase().includes(query)) ||
      (r.userEmail && r.userEmail.toLowerCase().includes(query)) ||
      (r.ip && r.ip.toLowerCase().includes(query));
  });

  renderReportsTable(filtered);
}

function getReasonBadgeClass(reason) {
  const r = (reason || '').toLowerCase();
  if (r.includes('play') || r.includes('black') || r.includes('error')) return 'not-playing';
  if (r.includes('audio') || r.includes('sound') || r.includes('sync')) return 'audio-sync';
  if (r.includes('sub') || r.includes('bangla')) return 'sub-missing';
  if (r.includes('buffer') || r.includes('stuck') || r.includes('slow')) return 'buffering';
  return 'not-playing';
}

function renderReportsTable(reportsList) {
  const tbody = document.getElementById('reports-tbody');
  if (!reportsList || reportsList.length === 0) {
    const emptyMsg = reportsFilter === 'pending'
      ? '🎉 No pending video issue reports! All streams are working smoothly.'
      : 'No video reports matching this filter.';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 36px; color: #64748b;">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = reportsList.map(r => {
    const isPending = (r.status || 'pending').toLowerCase() === 'pending';
    const reasonClass = getReasonBadgeClass(r.reason);
    const seasonEp = (r.season > 0 || r.episode > 0) ? `S${r.season || 1} : E${r.episode || 1}` : 'Single Movie';
    const cleanIp = (r.ip || '').replace('::ffff:', '');

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #f8fafc; font-size: 13.5px;">${escapeHtml(r.mediaTitle || 'Unknown Video')}</div>
          <div class="table-meta-sub" style="font-size: 11px; color: #64748b;">ID: ${escapeHtml(r.mediaId || '')}</div>
        </td>
        <td>
          <span class="badge-tag" style="background: rgba(255,255,255,0.06); color: #e2e8f0; font-weight: 600;">
            ${seasonEp}
          </span>
          ${r.audioTrack ? `<div class="table-meta-sub" style="font-size: 10.5px; margin-top: 3px;">Audio: ${escapeHtml(r.audioTrack)}</div>` : ''}
        </td>
        <td>
          <span class="report-reason-badge ${reasonClass}">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${escapeHtml(r.reason || 'Playback Issue')}
          </span>
        </td>
        <td>
          ${r.details ? `<div class="report-user-quote">${escapeHtml(r.details)}</div>` : '<span style="color: #64748b; font-size: 12px; font-style: italic;">No extra details provided</span>'}
        </td>
        <td>
          <div style="font-size: 12.5px; font-weight: 600; color: #e2e8f0;">${escapeHtml(r.userName || 'Viewer')}</div>
          <div class="table-meta-sub" style="font-size: 11px; color: #94a3b8;">${escapeHtml(r.userEmail || cleanIp || 'Mobile App')}</div>
        </td>
        <td>
          <div style="font-size: 12.5px; color: #f1f5f9;">${formatTimeAgo(r.createdAt)}</div>
          <div class="table-meta-sub" style="font-size: 10.5px;">${formatDate(r.createdAt)}</div>
        </td>
        <td>
          ${isPending
            ? '<span class="badge-tag" style="background: rgba(239, 68, 68, 0.18); color: #f87171; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.4);"><i class="fa-solid fa-clock"></i> Pending</span>'
            : '<span class="badge-tag" style="background: rgba(16, 185, 129, 0.18); color: #34d399; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-check-double"></i> Resolved</span>'}
        </td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            ${isPending ? `
              <button class="btn-action-icon resolve" onclick="resolveReport('${r.id || r._id}')" title="Mark Resolved">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
            ${r.streamUrl ? `
              <button class="btn-action-icon test" onclick="window.open('${escapeHtml(r.streamUrl)}', '_blank')" title="Test Stream URL">
                <i class="fa-solid fa-play"></i>
              </button>
            ` : ''}
            <button class="btn-action-icon delete" onclick="deleteReport('${r.id || r._id}')" title="Delete Report">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function resolveReport(reportId) {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/reports/${reportId}/resolve`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Report marked as resolved!');
      loadReports();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteReport(reportId) {
  if (!confirm('Are you sure you want to permanently delete this report?')) return;
  try {
    const res = await authFetch(`${API_BASE}/api/admin/reports/${reportId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Report deleted.');
      loadReports();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard: ' + text);
  }).catch(() => {
    prompt('Copy value:', text);
  });
}

// ============================================================
// USER REQUESTS & PRE-BOOKINGS
// ============================================================

async function loadRequests() {
  const tbody = document.getElementById('requests-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading requests...</td></tr>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/requests`);
    const data = await res.json();
    state.requests = data.requests || [];
    renderRequestsTable(state.requests);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center error-text">Failed to load requests.</td></tr>';
  }
}

function renderRequestsTable(list) {
  const tbody = document.getElementById('requests-tbody');
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 30px; color: #64748b;">No user requests found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(r => {
    const status = (r.status || 'pending').toLowerCase();
    let badgeColor = 'rgba(245, 158, 11, 0.15); color: #fbbf24;';
    if (status === 'added') badgeColor = 'rgba(16, 185, 129, 0.15); color: #34d399;';
    if (status === 'rejected') badgeColor = 'rgba(239, 68, 68, 0.15); color: #f87171;';

    return `
      <tr>
        <td class="table-title-bold">${escapeHtml(r.title || 'Untitled')}</td>
        <td><span class="badge-tag">${escapeHtml(r.type || 'Media')}</span></td>
        <td>
          <div>${escapeHtml(r.userName || 'Anonymous')}</div>
          <div class="table-meta-sub">${escapeHtml(r.userEmail || '')}</div>
        </td>
        <td style="max-width: 250px; font-size: 12.5px; color: #cbd5e1;">${escapeHtml(r.note || r.comment || '')}</td>
        <td>${formatDate(r.createdAt)}</td>
        <td><span class="badge-tag" style="background: ${badgeColor}">${escapeHtml(status.toUpperCase())}</span></td>
        <td class="row-actions">
          <button class="btn-action-icon" style="color: #34d399;" onclick="updateRequestStatus('${r.id}', 'added')" title="Mark Added"><i class="fa-solid fa-check"></i></button>
          <button class="btn-action-icon edit" onclick="updateRequestStatus('${r.id}', 'approved')" title="Approve"><i class="fa-solid fa-thumbs-up"></i></button>
          <button class="btn-action-icon danger" onclick="updateRequestStatus('${r.id}', 'rejected')" title="Reject"><i class="fa-solid fa-xmark"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateRequestStatus(id, status) {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/requests/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Request marked as ${status}`);
      loadRequests();
      loadDashboardData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// MOVIEBOX 1-CLICK IMPORTER & MULTI-CRITERIA FILTER ENGINE
// ============================================================

state.movieboxRawItems = [];

// Live typing search debounce for importer
let importerSearchDebounceTimer = null;
function handleImporterSearchInput(val) {
  clearTimeout(importerSearchDebounceTimer);
  const q = (val || '').trim();
  if (q.length >= 3) {
    importerSearchDebounceTimer = setTimeout(() => {
      searchMovieBox();
    }, 400);
  } else if (q.length === 0) {
    loadMovieBoxRecent('all');
  }
}

async function loadMovieBoxRecent(filter = 'all', btnEl) {
  document.querySelectorAll('.importer-tab-btn').forEach(b => {
    b.classList.remove('active');
    if (btnEl && b === btnEl) {
      b.classList.add('active');
    } else if (!btnEl && b.getAttribute('onclick')?.includes(`'${filter}'`)) {
      b.classList.add('active');
    }
  });

  // Clear search input so user doesn't see old search text when browsing a feed!
  const inputEl = document.getElementById('importer-search-input');
  if (inputEl) inputEl.value = '';

  // Auto-reset dropdown filters so newly loaded feed items are immediately visible!
  const elKw = document.getElementById('imp-filter-keyword');
  if (elKw) elKw.value = '';
  const elAudio = document.getElementById('imp-filter-audio');
  if (elAudio) elAudio.value = 'all';
  const elCat = document.getElementById('imp-filter-category');
  if (elCat) elCat.value = 'all';
  const elType = document.getElementById('imp-filter-type');
  if (elType) elType.value = 'all';
  const elYear = document.getElementById('imp-filter-year');
  if (elYear) elYear.value = 'all';
  const elMonth = document.getElementById('imp-filter-month');
  if (elMonth) elMonth.value = 'all';
  const elStatus = document.getElementById('imp-filter-status');
  if (elStatus) elStatus.value = 'all';
  const elSort = document.getElementById('imp-filter-sort');
  if (elSort) elSort.value = 'default';

  const grid = document.getElementById('importer-results-grid');
  grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:var(--primary); margin-bottom:12px; display:block;"></i>Loading MovieBox feeds & pairing Original + Hindi titles...</div>';

  try {
    const res = await authFetch(`${API_BASE}/api/admin/moviebox/recent?filter=${encodeURIComponent(filter)}&hide_imported=false`);
    const data = await res.json();
    state.movieboxRawItems = data.items || [];
    applyImporterFilters();
  } catch (err) {
    grid.innerHTML = '<div class="empty-state error-text">Failed to fetch MovieBox items. Please try again.</div>';
  }
}

async function searchMovieBox() {
  const inputEl = document.getElementById('importer-search-input');
  const query = (inputEl ? inputEl.value : '').trim();
  if (!query) {
    showToast('Please enter a movie or series title to search', 'warning');
    return;
  }

  const grid = document.getElementById('importer-results-grid');
  grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:var(--primary); margin-bottom:12px; display:block;"></i>Searching MovieBox & pairing Original + Hindi titles for "${escapeHtml(query)}"...</div>`;

  // Auto-reset filters on new search so search results are NEVER hidden by leftover dropdowns!
  const elKw = document.getElementById('imp-filter-keyword');
  if (elKw) elKw.value = '';
  const elAudio = document.getElementById('imp-filter-audio');
  if (elAudio) elAudio.value = 'all';
  const elCat = document.getElementById('imp-filter-category');
  if (elCat) elCat.value = 'all';
  const elType = document.getElementById('imp-filter-type');
  if (elType) elType.value = 'all';
  const elYear = document.getElementById('imp-filter-year');
  if (elYear) elYear.value = 'all';
  const elMonth = document.getElementById('imp-filter-month');
  if (elMonth) elMonth.value = 'all';
  const elStatus = document.getElementById('imp-filter-status');
  if (elStatus) elStatus.value = 'all';

  document.querySelectorAll('.importer-tab-btn').forEach(b => b.classList.remove('active'));

  try {
    const res = await authFetch(`${API_BASE}/api/admin/moviebox/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    state.movieboxRawItems = data.items || [];
    applyImporterFilters();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state error-text"><i class="fa-solid fa-triangle-exclamation" style="font-size:24px; color:#ef4444; margin-bottom:10px; display:block;"></i>Search failed: ${escapeHtml(err.message || 'Network error')}. Please try again.</div>`;
  }
}

function applyImporterFilters() {
  const raw = state.movieboxRawItems || [];
  const audio = document.getElementById('imp-filter-audio')?.value || 'all';
  const category = document.getElementById('imp-filter-category')?.value || 'all';
  const type = document.getElementById('imp-filter-type')?.value || 'all';
  const year = document.getElementById('imp-filter-year')?.value || 'all';
  const month = document.getElementById('imp-filter-month')?.value || 'all';
  const status = document.getElementById('imp-filter-status')?.value || 'all';
  const sort = document.getElementById('imp-filter-sort')?.value || 'default';
  const keyword = (document.getElementById('imp-filter-keyword')?.value || '').trim().toLowerCase();

  let filtered = raw.filter(item => {
    const tLower = (item.title || '').toLowerCase();
    const isHindi = !!item.isHindi ||
      tLower.includes('hindi') ||
      (item.audioTag && /hindi/i.test(item.audioTag)) ||
      (item.category && /hindi/i.test(item.category)) ||
      (item.section && /hindi/i.test(item.section)) ||
      (item.dubLanguage && /hindi/i.test(item.dubLanguage)) ||
      (item.audio && /hindi/i.test(item.audio)) ||
      item.industry === 'Bollywood';

    const isBangla = !!item.isBangla ||
      tLower.includes('bangla') || tLower.includes('bengali') ||
      (item.audioTag && /bangla|bengali/i.test(item.audioTag)) ||
      (item.category && /bangla|bengali/i.test(item.category)) ||
      (item.section && /bangla|bengali/i.test(item.section)) ||
      item.industry === 'Tollywood';

    const isEnglish = !!item.isEnglish ||
      /\[\s*english\s*\]|\(\s*english\s*\)|\benglish\s*dub(bed)?\b/i.test(item.title || '') ||
      (item.audioTag && /english/i.test(item.audioTag));

    const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));

    // 1. Audio Filter
    if (audio === 'original' && (isHindi || isBangla || isEnglish)) return false;
    if (audio === 'hindi' && !isHindi) return false;
    if (audio === 'english' && !isEnglish) return false;
    if (audio === 'bangla' && !isBangla) return false;

    // 2. Category / Industry Filter
    if (category !== 'all') {
      const catLower = ((item.category || '') + ' ' + (item.industry || '') + ' ' + (item.section || '') + ' ' + tLower).toLowerCase();
      if (category === 'hollywood') {
        const isHwood = item.industry === 'Hollywood' || /hollywood|western|cinema|marvel|dc|disney|netflix|english/i.test(catLower);
        if (!isHwood) return false;
      } else if (category === 'bollywood') {
        const isBwood = (item.industry === 'Bollywood' || /bollywood/i.test(catLower)) && !/korean|kdrama|turkish|anime|chinese/i.test(catLower);
        if (!isBwood) return false;
      } else if (category === 'tollywood') {
        const isTwood = item.industry === 'Tollywood' || /tollywood|south indian|tamil|telugu|malayalam|kannada|kolkata|bangla/i.test(catLower);
        if (!isTwood) return false;
      } else if (category === 'korean') {
        const isKdrama = item.industry === 'Korean' || /korean|kdrama|k-drama|korea/i.test(catLower);
        if (!isKdrama) return false;
      } else if (category === 'turkish') {
        const isTurkish = item.industry === 'Turkish' || /turkish|turkey|dizi/i.test(catLower);
        if (!isTurkish) return false;
      } else if (category === 'anime') {
        const isAnime = item.industry === 'Anime' || /anime|japan|manga|donghua|heaven official|blessing|arcane/i.test(catLower);
        if (!isAnime) return false;
      } else if (category === 'chinese') {
        const isCdrama = item.industry === 'Chinese' || /chinese|cdrama|c-drama|wuxia|heaven official|blessing|donghua/i.test(catLower);
        if (!isCdrama) return false;
      } else if (category === 'series') {
        if (!isSeries && !catLower.includes('series') && !catLower.includes('drama') && !catLower.includes('show') && !catLower.includes('tv')) return false;
      }
    }

    // 3. Media Type Filter
    if (type === 'movie' && isSeries) return false;
    if (type === 'series' && !isSeries) return false;

    // 4. Year Filter
    if (year !== 'all') {
      const itemYearStr = String(item.year || '');
      const itemYearNum = parseInt(item.year, 10) || 0;
      if (year === 'older') {
        if (itemYearNum > 2020) return false;
      } else {
        if (!itemYearStr.includes(year)) return false;
      }
    }

    // 5. Month Filter
    if (month !== 'all') {
      const itemMonth = String(item.month || '').padStart(2, '0');
      const relMonth = item.releaseDate ? item.releaseDate.split('-')[1] : '';
      if (itemMonth !== month && relMonth !== month) return false;
    }

    // 6. Import Status Filter
    const isImported = isItemAlreadyImported(item);
    if (status === 'unimported' && isImported) return false;
    if (status === 'imported' && !isImported) return false;

    // 7. Instant In-Page Search Keyword
    if (keyword) {
      const searchable = [
        item.title,
        item.type,
        isSeries ? 'series tv drama show' : 'movie cinema film',
        item.year,
        isHindi ? 'hindi dubbed' : '',
        isEnglish ? 'english dubbed' : '',
        isBangla ? 'bangla dubbed' : '',
        (!isHindi && !isEnglish && !isBangla) ? 'original audio' : '',
        item.audioTag,
        item.category,
        item.industry,
        item.section
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(keyword)) return false;
    }

    return true;
  });

  // Sorting
  if (sort === 'rating-desc') {
    filtered.sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
  } else if (sort === 'year-desc') {
    filtered.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  } else if (sort === 'year-asc') {
    filtered.sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0));
  } else if (sort === 'title-asc') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else {
    // Default: Keep Original + Hindi paired side by side
    const grouped = new Map();
    for (const item of filtered) {
      const bKey = item.baseTitle || (item.title || '').replace(/\[.*?hindi.*?\]|\(.*?\bhindi\b.*?\)|\[.*?bangla.*?\]|\(.*?\bbangla\b.*?\)/gi, '').trim().toLowerCase();
      if (!grouped.has(bKey)) grouped.set(bKey, []);
      grouped.get(bKey).push(item);
    }
    const paired = [];
    for (const [_, grp] of grouped) {
      grp.sort((a, b) => {
        if (!a.isHindi && b.isHindi) return -1;
        if (a.isHindi && !b.isHindi) return 1;
        return 0;
      });
      paired.push(...grp);
    }
    filtered = paired;
  }

  // Update summary badge
  const countShownEl = document.getElementById('imp-count-shown');
  const countTotalEl = document.getElementById('imp-count-total');
  if (countShownEl) countShownEl.textContent = filtered.length;
  if (countTotalEl) countTotalEl.textContent = raw.length;

  renderImporterGrid(filtered);
}

function resetImporterFilters() {
  const elAudio = document.getElementById('imp-filter-audio');
  const elCat = document.getElementById('imp-filter-category');
  const elType = document.getElementById('imp-filter-type');
  const elYear = document.getElementById('imp-filter-year');
  const elMonth = document.getElementById('imp-filter-month');
  const elStatus = document.getElementById('imp-filter-status');
  const elSort = document.getElementById('imp-filter-sort');
  const elKw = document.getElementById('imp-filter-keyword');

  if (elAudio) elAudio.value = 'all';
  if (elCat) elCat.value = 'all';
  if (elType) elType.value = 'all';
  if (elYear) elYear.value = 'all';
  if (elMonth) elMonth.value = 'all';
  if (elStatus) elStatus.value = 'all';
  if (elSort) elSort.value = 'default';
  if (elKw) elKw.value = '';

  if (!state.movieboxRawItems || state.movieboxRawItems.length === 0) {
    loadMovieBoxRecent('all');
    return;
  }
  applyImporterFilters();
}

function isItemAlreadyImported(item) {
  if (!item) return false;
  if (item.alreadyImported) return true;

  const sid = String(item.subjectId || item.id || '').trim();
  const dPath = String(item.detailPath || '').trim();
  const rawTitle = String(item.title || '').trim();
  const cleanTitle = rawTitle
    .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
    .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
    .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
    .toLowerCase().trim();
  const isHindi = !!(item.isHindi || rawTitle.toLowerCase().includes('hindi'));

  // 1. Cross-check against state.series
  if (Array.isArray(state.series)) {
    for (const s of state.series) {
      const sSid = String(s.subjectId || '').trim();
      const sId = String(s.id || '').trim();
      const sDPath = String(s.detailPath || s.movieBoxDetailPath || '').trim();
      const sTitle = String(s.title || '').trim();
      const sClean = sTitle
        .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
        .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
        .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
        .toLowerCase().trim();
      const sIsHindi = !!(s.isHindi || sTitle.toLowerCase().includes('hindi'));

      if (sid && (sSid === sid || sId === sid || sId === `mb-s-${sid}`)) return true;
      if (dPath && sDPath && dPath === sDPath) return true;
      if (cleanTitle && sClean === cleanTitle && isHindi === sIsHindi) return true;
    }
  }

  // 2. Cross-check against state.movies
  if (Array.isArray(state.movies)) {
    for (const m of state.movies) {
      const mSid = String(m.subjectId || '').trim();
      const mId = String(m.id || '').trim();
      const mDPath = String(m.detailPath || m.movieBoxDetailPath || '').trim();
      const mTitle = String(m.title || '').trim();
      const mClean = mTitle
        .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
        .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
        .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
        .toLowerCase().trim();
      const mIsHindi = !!(m.isHindi || mTitle.toLowerCase().includes('hindi'));

      if (sid && (mSid === sid || mId === sid || mId === `mb-m-${sid}`)) return true;
      if (dPath && mDPath && dPath === mDPath) return true;
      if (cleanTitle && mClean === cleanTitle && isHindi === mIsHindi) return true;
    }
  }

  return false;
}

function getOptimizedImageUrl(url) {
  if (!url) return 'assets/fobs_logo.png';
  if (url.includes('pbcdnw.aoneroom.com')) {
    return `/api/proxy/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function renderImporterGrid(items) {
  state.lastMovieBoxItems = items || [];
  const grid = document.getElementById('importer-results-grid');
  if (!items || items.length === 0) {
    const rawTotal = (state.movieboxRawItems || []).length;
    const currentAudio = document.getElementById('imp-filter-audio')?.value || 'all';
    if (rawTotal > 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-filter-circle-xmark" style="font-size:32px; color:var(--text-dim); margin-bottom:12px; display:block;"></i>
          No matching titles found for the selected filters out of ${rawTotal} available titles.<br>
          <div style="display:inline-flex; gap:8px; margin-top:14px; flex-wrap:wrap; justify-content:center;">
            ${currentAudio !== 'all' ? `<button type="button" class="btn-primary" onclick="document.getElementById('imp-filter-audio').value='all'; applyImporterFilters();" style="font-size:12px;"><i class="fa-solid fa-volume-high"></i> Show All Audio Versions (${rawTotal})</button>` : ''}
            <button type="button" class="btn-secondary" onclick="resetImporterFilters()" style="font-size:12px;"><i class="fa-solid fa-rotate-left"></i> Reset All Filters</button>
          </div>
        </div>
      `;
    } else {
      grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass" style="font-size:32px; color:var(--text-dim); margin-bottom:12px; display:block;"></i>No titles available in this feed. Try searching or switching to another feed tab.<br><button type="button" class="btn-secondary" onclick="loadMovieBoxRecent(\'all\')" style="margin-top:12px; font-size:12px;"><i class="fa-solid fa-globe"></i> Load All Feeds</button></div>';
    }
    return;
  }

  const monthsMap = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  grid.innerHTML = items.map((item, idx) => {
    const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));
    const tLower = (item.title || '').toLowerCase();
    const isHindi = item.isHindi || tLower.includes('hindi') || (item.audioTag && /hindi/i.test(item.audioTag));
    const isEnglish = item.isEnglish || /\[\s*english\s*\]|\(\s*english\s*\)|\benglish\s*dub(bed)?\b/i.test(item.title || '') || (item.audioTag && /english/i.test(item.audioTag));
    const isBangla = item.isBangla || tLower.includes('bangla') || tLower.includes('bengali') || (item.audioTag && /bangla|bengali/i.test(item.audioTag));

    let audioBadgeHtml = '';
    if (isHindi) {
      audioBadgeHtml = '<span class="card-badge-top-left badge-audio-hindi"><i class="fa-solid fa-volume-high"></i> Hindi Dubbed</span>';
    } else if (isEnglish) {
      audioBadgeHtml = '<span class="card-badge-top-left badge-audio-english"><i class="fa-solid fa-volume-high"></i> English Dubbed</span>';
    } else if (isBangla) {
      audioBadgeHtml = '<span class="card-badge-top-left badge-audio-bangla"><i class="fa-solid fa-volume-high"></i> Bangla Dubbed</span>';
    } else {
      audioBadgeHtml = '<span class="card-badge-top-left badge-audio-original"><i class="fa-solid fa-headphones"></i> Original Audio</span>';
    }

    const typeBadgeHtml = isSeries
      ? '<span class="card-badge-top-right"><i class="fa-solid fa-tv"></i> Series</span>'
      : '<span class="card-badge-top-right"><i class="fa-solid fa-film"></i> Movie</span>';

    const ratingBadgeHtml = `<span class="card-badge-rating"><i class="fa-solid fa-star"></i> ${escapeHtml(item.rating || '8.5')}</span>`;

    const monthName = item.month && monthsMap[item.month] ? monthsMap[item.month] + ' ' : '';
    const dateSub = `${monthName}${item.year || '2026'}`;
    const indSub = item.industry ? ` &bull; ${escapeHtml(item.industry)}` : '';

    const isImported = isItemAlreadyImported(item);
    if (isImported) item.alreadyImported = true;

    const actionHtml = isImported
      ? `<div class="importer-card-imported-bar">
          <span class="badge-already-imported"><i class="fa-solid fa-circle-check"></i> Already Imported</span>
          <button type="button" class="btn-importer-update" onclick="event.stopPropagation(); openImporterItemUpdate(${idx})" title="Update / Check for new episodes">
            <i class="fa-solid fa-arrows-rotate"></i> Update
          </button>
        </div>`
      : `<button type="button" class="btn-primary glow importer-card-btn" onclick="event.stopPropagation(); openImportModalByIndex(${idx})">
          <i class="fa-solid fa-wand-magic-sparkles"></i> 1-Click Import
        </button>`;

    return `
      <div class="importer-card" onclick="openImporterCardClick(${idx})" style="cursor: pointer; position:relative;">
        <div class="importer-card-poster-wrap">
          <img src="${getOptimizedImageUrl(item.poster)}" loading="lazy" decoding="async" onerror="this.src='assets/fobs_logo.png'" alt="${escapeHtml(item.title)}">
          ${audioBadgeHtml}
          ${typeBadgeHtml}
          ${ratingBadgeHtml}
        </div>
        <div class="importer-card-info">
          <div class="importer-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="importer-card-sub">${dateSub}${indSub}</div>
          ${actionHtml}
        </div>
      </div>
    `;
  }).join('');
}

function openImporterCardClick(idx) {
  const item = state.lastMovieBoxItems?.[idx];
  if (!item) return;
  if (isItemAlreadyImported(item)) {
    openImporterItemUpdate(idx);
  } else {
    openImportModal(item);
  }
}

function openImporterItemUpdate(idx) {
  const item = state.lastMovieBoxItems?.[idx];
  if (!item) return;
  const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));
  if (isSeries) {
    checkSeriesUpdatesByItem(item);
  } else {
    // If it's a movie, check if it's already in state.movies
    const sid = String(item.subjectId || item.id || '').trim();
    const dPath = String(item.detailPath || '').trim();
    const cleanTitle = (item.title || '')
      .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
      .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
      .toLowerCase().trim();
    const isHindi = !!(item.isHindi || (item.title || '').toLowerCase().includes('hindi'));

    const existingMovie = (state.movies || []).find(m => {
      if (sid && (String(m.subjectId) === sid || m.id === `mb-m-${sid}` || m.id === sid)) return true;
      if (dPath && (m.detailPath === dPath || m.movieBoxDetailPath === dPath)) return true;
      const mClean = (m.title || '')
        .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
        .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
        .toLowerCase().trim();
      const mIsHindi = !!(m.isHindi || (m.title || '').toLowerCase().includes('hindi'));
      return mClean === cleanTitle && mIsHindi === isHindi;
    });

    if (existingMovie && typeof openEditMovieModal === 'function') {
      openEditMovieModal(existingMovie.id);
    } else {
      openImportModal(item);
    }
  }
}

function openImportModalByIndex(idx) {
  const item = state.lastMovieBoxItems?.[idx];
  if (!item) return;
  if (isItemAlreadyImported(item)) {
    openImporterItemUpdate(idx);
  } else {
    openImportModal(item);
  }
}

function toggleImportType(type) {
  const row = document.getElementById('imp-series-row');
  if (row) row.style.display = (type === 'series') ? 'flex' : 'none';
}

async function openImportModal(item) {
  const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));
  const sId = String(item.subjectId || item.id || '');
  const dPath = item.detailPath || '';

  document.getElementById('imp-subjectId').value = sId;
  document.getElementById('imp-detailPath').value = dPath;
  document.getElementById('imp-poster').value = item.poster || '';
  document.getElementById('imp-cover').value = item.backdrop || item.cover || item.poster || '';
  document.getElementById('imp-title').value = item.title || '';
  document.getElementById('imp-year').value = item.year || '2026';
  document.getElementById('imp-rating').value = item.rating || '8.5';
  document.getElementById('imp-type').value = isSeries ? 'series' : 'movie';
  toggleImportType(isSeries ? 'series' : 'movie');

  const trackerBox = document.getElementById('imp-ongoing-tracker-box');
  if (trackerBox) trackerBox.style.display = 'none';

  const seasonSel = document.getElementById('imp-season-mode');
  if (seasonSel) {
    seasonSel.innerHTML = '<option value="all">🌟 All Seasons (Auto-Detecting...)</option>';
  }

  const tLower = (item.title || '').toLowerCase();
  const isHindi = tLower.includes('[hindi]') || tLower.includes('hindi dubbed') || tLower.includes('hindi');
  document.getElementById('imp-ishindi').checked = isHindi;
  document.getElementById('imp-featured').checked = false;

  const statusText = document.getElementById('imp-autodetect-status');
  statusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #00f2fe;"></i> Auto-detecting real released episodes, stream URLs &amp; metadata from MovieBox &amp; TMDb...';

  openModal('import-modal');

  // Query unified Auto-Detect Engine
  try {
    let d = null;
    try {
      const autoRes = await authFetch(`${API_BASE}/api/admin/auto-detect?q=${encodeURIComponent(item.title || '')}&subjectId=${encodeURIComponent(sId)}&detailPath=${encodeURIComponent(dPath)}&type=${isSeries ? 'series' : 'movie'}`);
      const autoData = await autoRes.json();
      if (autoData && autoData.success && autoData.data) {
        d = autoData.data;
      }
    } catch (_) {}

    // Fallback directly to moviebox detail if auto-detect didn't return
    if (!d) {
      try {
        const data = await authFetch(`${API_BASE}/api/admin/moviebox/detail?subjectId=${encodeURIComponent(sId)}&detailPath=${encodeURIComponent(dPath)}`);
        const res = await data.json();
        if (res && res.success && res.detail) {
          d = res.detail;
        }
      } catch (_) {}
    }

    if (d) {
      if (d.title && !document.getElementById('imp-title').value.includes(d.title)) {
        document.getElementById('imp-title').value = d.title;
      }
      if (d.type) {
        document.getElementById('imp-type').value = d.type;
        toggleImportType(d.type);
      }

      state.isImportOngoing = !!d.isOngoing;
      state.importReleasedEps = Math.max(d.releasedEpisodesCount || d.totalEpisodes || 0, 1);
      state.importPlannedEps = Math.max(d.plannedEpisodesCount || 0, state.importReleasedEps, 1);

      const trackerBox = document.getElementById('imp-ongoing-tracker-box');
      const relCountEl = document.getElementById('imp-ongoing-released-count');
      const planCountEl = document.getElementById('imp-ongoing-planned-count');
      const ongoingTitleEl = document.getElementById('imp-ongoing-status-title');
      const ongoingDescEl = document.getElementById('imp-ongoing-status-desc');

      if (trackerBox && (isSeries || d.type === 'series')) {
        trackerBox.style.display = 'flex';
        if (relCountEl) relCountEl.textContent = state.importReleasedEps;
        if (planCountEl) planCountEl.textContent = state.importPlannedEps;
        if (d.isOngoing || state.importReleasedEps < state.importPlannedEps) {
          if (ongoingTitleEl) ongoingTitleEl.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Ongoing Series Real-Time Tracking';
          if (ongoingDescEl) ongoingDescEl.textContent = `${state.importReleasedEps} of ${state.importPlannedEps} Episode(s) currently released in MovieBox. Working streams ready.`;
        } else {
          if (ongoingTitleEl) ongoingTitleEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed Series';
          if (ongoingDescEl) ongoingDescEl.textContent = `All ${state.importReleasedEps} Episode(s) fully released and ready to import.`;
        }
      } else if (trackerBox) {
        trackerBox.style.display = 'none';
      }

      if (seasonSel) {
        seasonSel.innerHTML = '';
        if (d.seasons && d.seasons.length > 0) {
          const allOpt = document.createElement('option');
          allOpt.value = 'all';
          allOpt.textContent = `🌟 All Seasons (${d.seasons.length} Seasons • ${state.importReleasedEps} Episodes)`;
          seasonSel.appendChild(allOpt);

          d.seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = String(s.seasonNumber || s.se);
            const epC = Math.max(s.episodesCount || 0, s.episodes?.length || 0, s.plannedEpisodesCount || 0, s.releasedEpisodesCount || 0, s.maxEp || 0, 1);
            opt.textContent = `Season ${s.seasonNumber || s.se} (${epC} Episodes)`;
            seasonSel.appendChild(opt);
          });
        } else {
          const detectedEp = state.importReleasedEps;
          const opt = document.createElement('option');
          opt.value = 'all';
          opt.textContent = `🌟 Season 1 (${detectedEp} Episode${detectedEp > 1 ? 's' : ''})`;
          seasonSel.appendChild(opt);
        }
      }

      if (state.importReleasedEps) document.getElementById('imp-episodes').value = state.importReleasedEps;
      if (d.year) document.getElementById('imp-year').value = d.year;
      if (d.rating) document.getElementById('imp-rating').value = d.rating;
      if (d.industry) document.getElementById('imp-industry').value = d.industry;
      if (d.category) document.getElementById('imp-category').value = d.category;
      if (typeof d.isHindi === 'boolean') document.getElementById('imp-ishindi').checked = d.isHindi;
      if (d.cover) document.getElementById('imp-cover').value = d.cover;
      if (d.backdrop && !document.getElementById('imp-cover').value) document.getElementById('imp-cover').value = d.backdrop;

      if (d.seasons && d.seasons.length > 1) {
        const breakdown = d.seasons.map(s => `S${s.seasonNumber || s.se}: ${Math.max(s.episodesCount || 0, s.episodes?.length || 0, s.maxEp || 0)} eps`).join(' • ');
        statusText.innerHTML = `<i class="fa-solid fa-circle-check text-emerald" style="color: #10b981;"></i> <strong>Auto-Detected:</strong> ${d.seasons.length} Seasons (${state.importReleasedEps} Episodes) &bull; ${d.industry} (${d.category})<br><small style="color: #64748b;">${breakdown}</small>`;
      } else {
        statusText.innerHTML = `<i class="fa-solid fa-circle-check text-emerald" style="color: #10b981;"></i> <strong>Auto-Detected:</strong> ${state.importReleasedEps} Episode(s) Loaded &bull; ${d.industry} (${d.category})`;
      }

      // Initialize detailed seasons & episodes preview for import
      if (isSeries || d.type === 'series') {
        state.importPreviewSeasons = (Array.isArray(d.seasons) && d.seasons.length > 0)
          ? JSON.parse(JSON.stringify(d.seasons))
          : [];

        // Ensure every season has its full episodes generated
        state.importPreviewSeasons.forEach(season => {
          const seNum = parseInt(season.seasonNumber || season.se, 10) || 1;
          const targetEpCount = Math.max(
            parseInt(season.plannedEpisodesCount, 10) || 0,
            parseInt(season.releasedEpisodesCount, 10) || 0,
            parseInt(season.episodesCount, 10) || 0,
            parseInt(season.maxEp, 10) || 0,
            Array.isArray(season.episodes) ? season.episodes.length : 0,
            1
          );

          if (!Array.isArray(season.episodes) || season.episodes.length < targetEpCount) {
            const eps = Array.isArray(season.episodes) ? season.episodes : [];
            for (let ep = eps.length + 1; ep <= targetEpCount; ep++) {
              const epUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}` : '';
              eps.push({
                number: String(ep).padStart(2, '0'),
                episode: ep,
                season: seNum,
                title: `Episode ${ep}`,
                streamUrl: epUrl,
                duration: '45 min'
              });
            }
            season.episodes = eps;
            season.episodesCount = eps.length;
          }
        });

        if (state.importPreviewSeasons.length === 0) {
          const epCount = state.importReleasedEps || 16;
          const eps = [];
          for (let ep = 1; ep <= epCount; ep++) {
            const epUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=${ep}` : '';
            eps.push({
              number: String(ep).padStart(2, '0'),
              episode: ep,
              season: 1,
              title: `Episode ${ep}`,
              streamUrl: epUrl,
              duration: '45 min'
            });
          }
          state.importPreviewSeasons = [{ seasonNumber: 1, title: 'Season 1', episodesCount: eps.length, episodes: eps }];
        }

        const totalEpsAllSeasons = state.importPreviewSeasons.reduce((acc, s) => acc + (s.episodesCount || s.episodes?.length || 0), 0);
        if (totalEpsAllSeasons) document.getElementById('imp-episodes').value = totalEpsAllSeasons;

        const titleSeasonMatch = (item.title || d.title || '').match(/\b(?:s|season\s*)(\d+)\b/i);
        const targetSeasonNum = titleSeasonMatch ? parseInt(titleSeasonMatch[1], 10) : null;
        if (targetSeasonNum && d.seasons && d.seasons.some(s => (s.seasonNumber || s.se) === targetSeasonNum)) {
          if (seasonSel) seasonSel.value = String(targetSeasonNum);
          const matchIdx = state.importPreviewSeasons.findIndex(s => (s.seasonNumber || s.se) === targetSeasonNum);
          if (matchIdx !== -1) {
            state.activeImportPreviewSeasonIdx = matchIdx;
            const targetSeason = state.importPreviewSeasons[matchIdx];
            const epCount = targetSeason?.episodesCount || targetSeason?.episodes?.length;
            if (epCount) document.getElementById('imp-episodes').value = epCount;
          }
        } else {
          if (seasonSel) seasonSel.value = 'all';
          state.activeImportPreviewSeasonIdx = 0;
        }

        renderImportEpisodesPreview();
      } else {
        state.importPreviewSeasons = [];
        renderImportEpisodesPreview();
      }
    }
  } catch (err) {
    statusText.innerHTML = '<i class="fa-solid fa-circle-check text-emerald" style="color: #10b981;"></i> Auto-detect loaded standard metadata. Ready to import.';
  }
}

function renderImportEpisodesPreview() {
  const box = document.getElementById('imp-episodes-preview-box');
  const tabsEl = document.getElementById('imp-preview-seasons-tabs');
  const tableEl = document.getElementById('imp-preview-episodes-table');
  const totalCountEl = document.getElementById('imp-preview-total-eps');
  if (!box || !tabsEl || !tableEl) return;

  const seasons = state.importPreviewSeasons || [];
  if (seasons.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  const totalEps = seasons.reduce((sum, s) => sum + (Array.isArray(s.episodes) ? s.episodes.length : 0), 0);
  if (totalCountEl) totalCountEl.innerText = `${seasons.length} Seasons • ${totalEps} Episodes`;

  if (state.activeImportPreviewSeasonIdx === undefined || state.activeImportPreviewSeasonIdx >= seasons.length) {
    state.activeImportPreviewSeasonIdx = 0;
  }

  tabsEl.innerHTML = seasons.map((s, idx) => `
    <button type="button" class="btn-sm-secondary ${idx === state.activeImportPreviewSeasonIdx ? 'btn-sm-primary' : ''}" onclick="selectImportPreviewSeason(${idx})" style="padding: 5px 10px; font-size: 12px;">
      ${escapeHtml(s.title || `Season ${s.seasonNumber || (idx + 1)}`)} (${s.episodes?.length || 0})
    </button>
  `).join('');

  const activeSeason = seasons[state.activeImportPreviewSeasonIdx] || seasons[0];
  const eps = activeSeason.episodes || [];

  if (eps.length === 0) {
    tableEl.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px 0;">No episodes in this season. <button type="button" class="btn-sm-primary" onclick="addCustomEpisodeToImport()"><i class="fa-solid fa-plus"></i> Add Episode 1</button></div>';
    return;
  }

  tableEl.innerHTML = `
    <table class="data-table" style="font-size: 12px; margin-top: 6px;">
      <thead>
        <tr>
          <th style="width: 45px;">Ep</th>
          <th>Title</th>
          <th>Stream URL</th>
          <th style="width: 40px; text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${eps.map((ep, eIdx) => `
          <tr>
            <td><strong>${ep.episode || (eIdx + 1)}</strong></td>
            <td>
              <input type="text" class="custom-input-sm" value="${escapeHtml(ep.title || `Episode ${ep.episode || (eIdx + 1)}`)}" onchange="updateImportPreviewEp(${state.activeImportPreviewSeasonIdx}, ${eIdx}, 'title', this.value)" style="padding: 4px 8px; font-size: 12px;">
            </td>
            <td>
              <input type="text" class="custom-input-sm" value="${escapeHtml(ep.streamUrl || '')}" onchange="updateImportPreviewEp(${state.activeImportPreviewSeasonIdx}, ${eIdx}, 'streamUrl', this.value)" style="padding: 4px 8px; font-size: 11px;">
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn-action-icon danger" onclick="deleteImportPreviewEp(${state.activeImportPreviewSeasonIdx}, ${eIdx})" style="padding: 3px 6px; font-size: 11px;"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function selectImportPreviewSeason(idx) {
  state.activeImportPreviewSeasonIdx = idx;
  renderImportEpisodesPreview();
}

function updateImportPreviewEp(sIdx, eIdx, field, val) {
  if (state.importPreviewSeasons && state.importPreviewSeasons[sIdx] && state.importPreviewSeasons[sIdx].episodes[eIdx]) {
    state.importPreviewSeasons[sIdx].episodes[eIdx][field] = val;
  }
}

function deleteImportPreviewEp(sIdx, eIdx) {
  if (state.importPreviewSeasons && state.importPreviewSeasons[sIdx] && state.importPreviewSeasons[sIdx].episodes) {
    state.importPreviewSeasons[sIdx].episodes.splice(eIdx, 1);
    state.importPreviewSeasons[sIdx].episodesCount = state.importPreviewSeasons[sIdx].episodes.length;
    renderImportEpisodesPreview();
  }
}

function addCustomEpisodeToImport() {
  if (!state.importPreviewSeasons || state.importPreviewSeasons.length === 0) {
    state.importPreviewSeasons = [{ seasonNumber: 1, title: 'Season 1', episodes: [] }];
    state.activeImportPreviewSeasonIdx = 0;
  }
  const season = state.importPreviewSeasons[state.activeImportPreviewSeasonIdx];
  if (!season) return;
  if (!Array.isArray(season.episodes)) season.episodes = [];
  const nextNum = season.episodes.length + 1;
  const sId = document.getElementById('imp-subjectId')?.value || '';
  const dPath = document.getElementById('imp-detailPath')?.value || '';
  const seNum = season.seasonNumber || 1;
  const epUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${nextNum}` : '';

  season.episodes.push({
    episode: nextNum,
    episodeNumber: nextNum,
    number: String(nextNum).padStart(2, '0'),
    title: `Episode ${nextNum}`,
    season: seNum,
    streamUrl: epUrl,
    duration: '45 min'
  });
  season.episodesCount = season.episodes.length;
  renderImportEpisodesPreview();
}

function addCustomSeasonToImport() {
  if (!state.importPreviewSeasons) state.importPreviewSeasons = [];
  const nextSe = state.importPreviewSeasons.length + 1;
  state.importPreviewSeasons.push({
    seasonNumber: nextSe,
    title: `Season ${nextSe}`,
    episodes: []
  });
  state.activeImportPreviewSeasonIdx = state.importPreviewSeasons.length - 1;
  renderImportEpisodesPreview();
}

function filterImportPreviewSeason(val) {
  if (val === 'all') {
    state.activeImportPreviewSeasonIdx = 0;
    const totalEpsAllSeasons = (state.importPreviewSeasons || []).reduce((acc, s) => acc + (s.episodesCount || s.episodes?.length || 0), 0);
    if (totalEpsAllSeasons) document.getElementById('imp-episodes').value = totalEpsAllSeasons;
  } else {
    const seNum = parseInt(val, 10);
    const idx = (state.importPreviewSeasons || []).findIndex(s => (s.seasonNumber || s.se) === seNum);
    if (idx !== -1) {
      state.activeImportPreviewSeasonIdx = idx;
      const targetSeason = state.importPreviewSeasons[idx];
      const epCount = targetSeason.episodesCount || targetSeason.episodes?.length || 0;
      if (epCount) document.getElementById('imp-episodes').value = epCount;
    }
  }
  renderImportEpisodesPreview();
}

function loadAllPlannedEpisodesToImport() {
  if (!state.importPreviewSeasons || state.importPreviewSeasons.length === 0) return;
  const plannedTotal = state.importPlannedEps || 12;
  const sId = document.getElementById('imp-subjectId')?.value || '';
  const dPath = document.getElementById('imp-detailPath')?.value || '';

  const season = state.importPreviewSeasons[state.activeImportPreviewSeasonIdx || 0];
  if (!season) return;
  if (!Array.isArray(season.episodes)) season.episodes = [];

  const seNum = season.seasonNumber || 1;
  const currentCount = season.episodes.length;

  for (let ep = currentCount + 1; ep <= plannedTotal; ep++) {
    const epUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}` : '';
    season.episodes.push({
      number: String(ep).padStart(2, '0'),
      episode: ep,
      season: seNum,
      title: `Episode ${ep}`,
      streamUrl: epUrl,
      duration: '45 min'
    });
  }
  season.episodesCount = season.episodes.length;
  renderImportEpisodesPreview();
  showToast(`Loaded placeholder slots for all ${plannedTotal} planned episodes.`, 'info');
}

// ============================================================
// REAL-TIME ONGOING DRAMA & NEW EPISODES SYNC ENGINE
// ============================================================

state.currentNewEpisodesToSync = [];
state.updatingSeriesId = null;

async function checkSeriesUpdates(seriesId) {
  if (!seriesId) return;
  state.updatingSeriesId = seriesId;

  // Reset modal UI
  const titleEl = document.getElementById('series-update-title');
  const statusEl = document.getElementById('series-update-status-line');
  const posterEl = document.getElementById('series-update-poster');
  const alertEl = document.getElementById('series-update-alert-box');
  const listBox = document.getElementById('series-update-list-box');
  const btnSync = document.getElementById('btn-sync-new-episodes');

  if (titleEl) titleEl.textContent = 'Checking updates...';
  if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Connecting to MovieBox API & checking newly released episodes...';
  if (alertEl) alertEl.innerHTML = '';
  if (listBox) listBox.style.display = 'none';
  if (btnSync) btnSync.style.display = 'none';

  openModal('series-update-modal');

  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/${encodeURIComponent(seriesId)}/check-updates`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to check updates');

    if (titleEl) titleEl.textContent = data.title || 'Series';
    if (posterEl) posterEl.src = data.poster || 'assets/fobs_logo.png';
    if (statusEl) {
      statusEl.innerHTML = `Current in FOBS TV: <strong>${data.currentEpisodesTotal} Episodes</strong> &bull; Released on MovieBox: <strong>${data.mbReleasedTotal} Episodes</strong> ${data.isOngoing ? '<span class="badge-tag" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.4); margin-left:6px;"><i class="fa-solid fa-clock"></i> Ongoing Drama</span>' : ''}`;
    }

    state.currentNewEpisodesToSync = JSON.parse(JSON.stringify(data.newEpisodes || []));

    if (data.newEpisodesCount > 0) {
      if (alertEl) {
        alertEl.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 12px 14px; border-radius: 10px; color: #34d399; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-bell" style="font-size: 18px;"></i>
            <div>
              <strong style="font-size: 13.5px; display: block;">🎉 ${data.newEpisodesCount} New Released Episode(s) Found on MovieBox!</strong>
              <small style="color: #cbd5e1; font-size: 12px;">These episodes are now live. You can review, edit titles, add/remove, and 1-click sync below.</small>
            </div>
          </div>
        `;
      }
      renderSeriesUpdateTable();
      if (listBox) listBox.style.display = 'block';
      if (btnSync) {
        btnSync.style.display = 'inline-flex';
        btnSync.innerHTML = `<i class="fa-solid fa-bolt"></i> 1-Click Sync New Episodes (${data.newEpisodesCount})`;
      }
    } else {
      if (alertEl) {
        alertEl.innerHTML = `
          <div style="background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); padding: 14px; border-radius: 10px; color: #00f2fe; display: flex; align-items: center; gap: 12px;">
            <i class="fa-solid fa-circle-check" style="font-size: 20px;"></i>
            <div>
              <strong style="font-size: 13.5px; display: block;">✓ Completely Up to Date!</strong>
              <small style="color: #94a3b8; font-size: 12px;">All ${data.mbReleasedTotal} currently released episode(s) on MovieBox are already synced in your FOBS TV catalog. You can also manually add an episode below or open Full Studio.</small>
            </div>
          </div>
        `;
      }
      if (listBox) listBox.style.display = 'none';
      if (btnSync) btnSync.style.display = 'none';
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${escapeHtml(err.message)}</span>`;
  }
}

function renderSeriesUpdateTable() {
  const tbody = document.getElementById('series-update-tbody');
  const countEl = document.getElementById('series-update-new-count');
  const eps = state.currentNewEpisodesToSync || [];
  if (countEl) countEl.textContent = eps.length;
  if (!tbody) return;

  if (eps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:15px; color:#64748b;">No new episodes in list. <button type="button" class="btn-sm-primary" onclick="addCustomEpisodeToUpdate()"><i class="fa-solid fa-plus"></i> Add One</button></td></tr>';
    return;
  }

  tbody.innerHTML = eps.map((ep, idx) => `
    <tr>
      <td><strong>S${ep.seasonNumber || 1} Ep${ep.episode || (idx + 1)}</strong></td>
      <td>
        <input type="text" class="custom-input-sm" value="${escapeHtml(ep.title || `Episode ${ep.episode}`)}" onchange="updateNewEpisodeField(${idx}, 'title', this.value)" style="padding: 4px 8px; font-size: 12px;">
      </td>
      <td>
        <input type="text" class="custom-input-sm" value="${escapeHtml(ep.streamUrl || '')}" onchange="updateNewEpisodeField(${idx}, 'streamUrl', this.value)" style="padding: 4px 8px; font-size: 11px;">
      </td>
      <td style="text-align: right;">
        <button type="button" class="btn-action-icon danger" onclick="removeEpisodeFromUpdate(${idx})" title="Remove this episode"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

function updateNewEpisodeField(idx, field, val) {
  if (state.currentNewEpisodesToSync && state.currentNewEpisodesToSync[idx]) {
    state.currentNewEpisodesToSync[idx][field] = val;
  }
}

function removeEpisodeFromUpdate(idx) {
  if (state.currentNewEpisodesToSync) {
    state.currentNewEpisodesToSync.splice(idx, 1);
    renderSeriesUpdateTable();
    const btnSync = document.getElementById('btn-sync-new-episodes');
    if (btnSync) {
      if (state.currentNewEpisodesToSync.length > 0) {
        btnSync.innerHTML = `<i class="fa-solid fa-bolt"></i> 1-Click Sync New Episodes (${state.currentNewEpisodesToSync.length})`;
      } else {
        btnSync.style.display = 'none';
      }
    }
  }
}

function addCustomEpisodeToUpdate() {
  if (!state.currentNewEpisodesToSync) state.currentNewEpisodesToSync = [];
  const nextNum = state.currentNewEpisodesToSync.length + 1;
  state.currentNewEpisodesToSync.push({
    seasonNumber: 1,
    episode: nextNum,
    episodeNumber: nextNum,
    title: `Episode ${nextNum}`,
    streamUrl: '',
    duration: '45 min'
  });
  renderSeriesUpdateTable();
  const btnSync = document.getElementById('btn-sync-new-episodes');
  if (btnSync) {
    btnSync.style.display = 'inline-flex';
    btnSync.innerHTML = `<i class="fa-solid fa-bolt"></i> 1-Click Sync New Episodes (${state.currentNewEpisodesToSync.length})`;
  }
}

async function submitSyncNewEpisodes() {
  const eps = state.currentNewEpisodesToSync || [];
  if (eps.length === 0) {
    showToast('No new episodes selected to sync.', 'warning');
    return;
  }
  const btnSync = document.getElementById('btn-sync-new-episodes');
  if (btnSync) {
    btnSync.disabled = true;
    btnSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
  }

  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/${encodeURIComponent(state.updatingSeriesId)}/sync-new-episodes`, {
      method: 'POST',
      body: JSON.stringify({ episodes: eps })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to sync episodes');

    showToast(data.message || `🎉 Successfully synced ${eps.length} new episode(s)!`, 'success', 5000);
    closeModal('series-update-modal');

    // Refresh series catalog if on series tab
    if (typeof loadSeries === 'function') loadSeries();
    // Refresh dashboard stats
    if (typeof loadDashboardData === 'function') loadDashboardData();
  } catch (err) {
    showToast(`Sync error: ${err.message}`, 'error');
  } finally {
    if (btnSync) {
      btnSync.disabled = false;
    }
  }
}

function checkSeriesUpdatesByItem(item) {
  const sid = String(item.subjectId || item.id || '').trim();
  const dPath = String(item.detailPath || '').trim();
  const rawTitle = String(item.title || '').trim();
  const cleanTitle = rawTitle
    .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
    .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
    .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
    .toLowerCase().trim();
  const isHindi = !!(item.isHindi || rawTitle.toLowerCase().includes('hindi'));

  // Find in loaded series list by subjectId, detailPath, or cleanTitle + audio
  const existing = (state.series || []).find(s => {
    const sSid = String(s.subjectId || '').trim();
    const sId = String(s.id || '').trim();
    const sDPath = String(s.detailPath || s.movieBoxDetailPath || '').trim();
    const sTitle = String(s.title || '').trim();
    const sClean = sTitle
      .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
      .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
      .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
      .toLowerCase().trim();
    const sIsHindi = !!(s.isHindi || sTitle.toLowerCase().includes('hindi'));

    if (sid && (sSid === sid || sId === `mb-s-${sid}` || sId === sid)) return true;
    if (dPath && sDPath && dPath === sDPath) return true;
    if (cleanTitle && sClean === cleanTitle && isHindi === sIsHindi) return true;
    return false;
  });

  const identifier = existing ? existing.id : (`mb-s-${sid}`);
  checkSeriesUpdates(identifier);
}

function openEpisodesStudioFromUpdate() {
  const sid = state.updatingSeriesId;
  closeModal('series-update-modal');
  if (sid) openEpisodesStudio(sid);
}

async function autoSyncAllSeriesFromAdmin() {
  showToast('Scanning all TV series for newly released episodes on MovieBox...', 'info', 3000);
  try {
    const res = await authFetch(`${API_BASE}/api/admin/series/sync-all`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Auto-sync failed');
    showToast(data.message || 'Auto-sync completed!', 'success', 6000);
    loadSeries();
  } catch (err) {
    showToast(`Auto-sync error: ${err.message}`, 'error');
  }
}

async function handleImportSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-import-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing & Saving...';
  }

  const payload = {
    subjectId: document.getElementById('imp-subjectId').value.trim(),
    detailPath: document.getElementById('imp-detailPath').value.trim(),
    title: document.getElementById('imp-title').value.trim(),
    year: document.getElementById('imp-year').value.trim() || '2026',
    rating: document.getElementById('imp-rating').value.trim() || '8.5',
    type: document.getElementById('imp-type').value,
    industry: document.getElementById('imp-industry').value,
    category: document.getElementById('imp-category').value.trim() || 'Hollywood Movies',
    poster: document.getElementById('imp-poster').value.trim(),
    cover: document.getElementById('imp-cover').value.trim(),
    isHindi: document.getElementById('imp-ishindi').checked,
    isFeatured: document.getElementById('imp-featured').checked,
    seasonMode: document.getElementById('imp-season-mode')?.value || 'all',
    episodesCount: parseInt(document.getElementById('imp-episodes')?.value, 10) || 16
  };

  // Attach full customized seasons if series
  if (payload.type === 'series' && Array.isArray(state.importPreviewSeasons) && state.importPreviewSeasons.length > 0) {
    payload.seasons = state.importPreviewSeasons;
  }

  try {
    const res = await authFetch(`${API_BASE}/api/admin/moviebox/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('import-modal');
      showToast(`✨ "${payload.title}" successfully imported and permanently added to catalog!`);
      loadMovies();
      loadSeries();
      loadDashboardData();

      // Instantly mark matching item in raw MovieBox feed as imported and refresh importer grid
      const targetSid = String(payload.subjectId || '').trim();
      const targetDPath = String(payload.detailPath || '').trim();
      const targetCleanTitle = (payload.title || '')
        .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
        .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
        .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
        .toLowerCase().trim();
      const targetIsHindi = !!payload.isHindi;

      if (Array.isArray(state.movieboxRawItems)) {
        state.movieboxRawItems.forEach(item => {
          const itemSid = String(item.subjectId || item.id || '').trim();
          const itemDPath = String(item.detailPath || '').trim();
          const itemClean = (item.title || '')
            .replace(/\s*\[(hindi|bangla|english|orig)[^\]]*\]/gi, '')
            .replace(/\s*\((hindi|bangla|english|orig)[^)]*\)/gi, '')
            .replace(/\s*-\s*(hindi|bangla|english|orig)[^)]*$/gi, '')
            .toLowerCase().trim();
          const itemIsHindi = !!(item.isHindi || (item.title || '').toLowerCase().includes('hindi'));

          if (
            (targetSid && itemSid === targetSid) ||
            (targetDPath && itemDPath === targetDPath) ||
            (itemClean && itemClean === targetCleanTitle && itemIsHindi === targetIsHindi)
          ) {
            item.alreadyImported = true;
          }
        });
      }
      if (typeof applyImporterFilters === 'function') {
        applyImporterFilters();
      }
    } else {
      showToast(data.error || 'Failed to import', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Import &amp; Save Permanently to FOBS TV';
    }
  }
}

// ============================================================
// v3.1.8 APP CONTROL & REMOTE CONFIG
// ============================================================

async function loadAppSettings() {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/app-settings`);
    const data = await res.json();
    const update = data.appUpdate || {};

    document.getElementById('cfg-version-name').value = update.latestVersion || update.latestVersionName || 'v3.1.8';
    document.getElementById('cfg-version-code').value = update.latestVersionCode || 16;
    document.getElementById('cfg-download-url').value = update.downloadUrl || 'https://fobstv.duckdns.org/download/apk';
    document.getElementById('cfg-release-notes').value = Array.isArray(update.releaseNotes) ? update.releaseNotes.join('\n') : (update.releaseNotes || '');
    document.getElementById('cfg-force-update').checked = !!update.forceUpdate;
    document.getElementById('cfg-update-enabled').checked = update.enabled !== false;
  } catch (err) {
    console.error('Error loading app settings:', err);
  }
}

async function saveAppSettings(e) {
  e.preventDefault();
  const payload = {
    appUpdate: {
      latestVersion: document.getElementById('cfg-version-name').value.trim(),
      latestVersionCode: parseInt(document.getElementById('cfg-version-code').value.trim(), 10) || 16,
      minVersionCode: parseInt(document.getElementById('cfg-version-code').value.trim(), 10) || 16,
      downloadUrl: document.getElementById('cfg-download-url').value.trim(),
      releaseNotes: document.getElementById('cfg-release-notes').value.trim(),
      forceUpdate: document.getElementById('cfg-force-update').checked,
      enabled: document.getElementById('cfg-update-enabled').checked
    }
  };

  try {
    const res = await authFetch(`${API_BASE}/api/admin/app-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('v3.1.8 App Remote Configuration saved successfully!');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerRepairStreams() {
  showToast('Initiating playback stream auto-repair...', 'info');
  try {
    const res = await authFetch(`${API_BASE}/api/admin/repair-streams`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Playback streams repaired and renewed!');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function triggerRefreshCdn() {
  showToast('Renewing CDN tokens...', 'info');
  try {
    const res = await authFetch(`${API_BASE}/api/admin/refresh-cdn`);
    const data = await res.json();
    showToast(`CDN renewed: ${data.refreshedMovies || 0} movies, ${data.refreshedEpisodes || 0} episodes`);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function triggerVpsDeploy() {
  if (!confirm('Deploy latest updates to VPS server? This will pull Git code, preserve all custom content, and reload services.')) return;
  showToast('Deploying to VPS...', 'info');

  try {
    const res = await authFetch(`${API_BASE}/api/admin/deploy-vps`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('VPS Deploy completed successfully!');
    } else {
      showToast(data.error || 'Deploy failed', 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============================================================
// MODAL & TOAST HELPERS
// ============================================================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-message ${type}`;

  let icon = 'fa-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  if (type === 'info') icon = 'fa-info-circle';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return '--';
  try {
    return new Date(isoStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '--';
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch (e) {
    return '--';
  }
}

function previewImage(elId, url) {
  const img = document.getElementById(elId);
  if (img && url) img.src = url;
}
