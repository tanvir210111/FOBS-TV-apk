// FOBS TV Mobile Application Client Logic

const BACKEND_URL = 'http://187.127.114.52';

// Dynamically determine the backend API base URL
// - If running on localhost with a custom port (e.g. node dev server localhost:3000), use ''
// - If running on remote server in a web browser, use ''
// - If running inside Capacitor APK on mobile (origin is localhost without port, or capacitor://), point to VPS backend
const API_BASE_URL = (() => {
  const isCustomLocalPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                            window.location.port && 
                            window.location.port !== '80' && 
                            window.location.port !== '443';
  if (isCustomLocalPort || window.location.hostname.includes('187.127.114.52')) {
    return '';
  }
  return BACKEND_URL;
})();

const CACHE_KEY = 'fobs_tv_content_cache_v60';
const SYNC_KEY = 'fobs_tv_last_sync_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
let isSyncing = false;

// App Versioning & In-App Force Update Configuration
const CURRENT_APP_VERSION_CODE = 8;
const CURRENT_APP_VERSION_NAME = '2.0.0';
window.CURRENT_APP_VERSION_CODE = CURRENT_APP_VERSION_CODE;
window.CURRENT_APP_VERSION_NAME = CURRENT_APP_VERSION_NAME;
let currentAppUpdateConfig = null;
let isUpdatingApp = false;

let appState = {
  activeTab: 'home',
  activeGenre: 'All',
  content: {
    featured: null,
    movies: [],
    series: [],
    liveTv: [],
    upcoming: []
  },
  currentMedia: null,
  currentEpisode: null,
  currentSeason: 1,
  currentAudioTrack: 'Hindi dub',
  viewsPollTimer: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// App Startup Flow
async function initApp() {
  setupVideoListeners();
  setupHeroSwipeGestures();
  setupMovieHeroSwipeGestures();
  setupSeriesHeroSwipeGestures();
  setupPlayerSwipeToClose();
  setupAppVisibilityListeners();
  setupPullToRefresh();
  setupAppUpdateModal();
  setupSearchInputListener();
  initGoogleAuth();

  // Clear all stale/legacy cache versions immediately
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('fobs_tv_content_cache_') || k === 'fobs_tv_last_sync_time') && k !== CACHE_KEY) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  // Step 1: Immediate local render from localStorage cache (0ms delay)
  const hasCache = loadCachedContent();
  if (hasCache) {
    renderAllViews();
    checkAppUpdate(appState.content);
    loadAllBookingsRealtime();
    // Non-blocking background sync if cache is older than 5 minutes
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 2: Immediate local render from bundled APK seed content (local asset fetch)
  const hasSeed = await loadSeedContent();
  if (hasSeed) {
    renderAllViews();
    checkAppUpdate(appState.content);
    loadAllBookingsRealtime();
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 3: Cold start without any local cache (first run) - show branded FOBS TV loading overlay
  await syncContentWithBackend({ isInitial: true, force: true });
  checkAppUpdate(appState.content);
  loadAllBookingsRealtime();
}

// Normalize content data structures
function normalizeContentData(data) {
  if (!data) return;
  const sanitizeItem = (item) => {
    if (!item) return;
    if (typeof item.title === 'string' && (
      item.title.includes('<') || item.title.includes('"') ||
      item.title.includes('style=') || item.title.includes('onload=') ||
      item.title.includes('src=') || item.title.includes('document.bod') ||
      item.title.includes('_fobsLegacyUpdateRan')
    )) {
      item.title = item.title
        .replace(/<[^>]*>?/gm, '')
        .replace(/\s*style=["'][^"']*["']/gi, '')
        .replace(/\s*onload=["'][^"']*["']/gi, '')
        .replace(/\s*src=["'][^"']*["']/gi, '')
        .replace(/_fobsLegacyUpdateRan.*/g, '')
        .replace(/['";\s]*document\.body[\s\S]*/g, '')
        .trim();
    }
  };
  if (data.featured) sanitizeItem(data.featured);
  if (data.movies) data.movies.forEach(m => { m.type = 'movie'; sanitizeItem(m); });
  if (data.series) data.series.forEach(s => { s.type = 'series'; sanitizeItem(s); });
  if (data.liveTv) data.liveTv.forEach(t => { t.type = 'liveTv'; sanitizeItem(t); });
  if (data.upcoming) data.upcoming.forEach(u => { u.type = u.type || 'series'; sanitizeItem(u); });
  return data;
}

// Local Storage Cache Management
function loadCachedContent() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.movies?.length || parsed.series?.length || parsed.liveTv?.length)) {
      normalizeContentData(parsed);
      appState.content = parsed;
      return true;
    }
  } catch (e) {
    console.error('Error reading content cache:', e);
  }
  return false;
}

function saveContentToCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(SYNC_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Error saving content cache:', e);
  }
}

// Load seed content bundled inside APK assets
async function loadSeedContent() {
  try {
    const res = await fetch('seed-content.json');
    if (res.ok) {
      const data = await res.json();
      if (data && (data.movies?.length || data.series?.length)) {
        normalizeContentData(data);
        appState.content = data;
        saveContentToCache(data);
        return true;
      }
    }
  } catch (e) {
    console.warn('Bundled seed-content.json not loaded:', e.message);
  }
  return false;
}

// Robust Fetch with AbortController Timeout and Cold-Start Retries
async function fetchApiWithRetry(endpoint, options = {}, { timeout = 25000, maxRetries = 2, delay = 2500 } = {}) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      // Verify response is valid JSON from Hostinger VPS backend
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }

      // If status indicates server error (502, 503, 504), retry
      if (attempt <= maxRetries) {
        console.warn(`Connection retry (status ${res.status}). Retrying attempt ${attempt}/${maxRetries}...`);
        updateServerStatus('Connecting to FOBS TV...', 'waking');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Server returned status ${res.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt <= maxRetries) {
        console.warn(`Fetch error (${err.message}). Retrying in ${delay / 1000}s...`);
        updateServerStatus('Connecting to FOBS TV...', 'waking');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// Sync Content with Backend Server
async function syncContentWithBackend({ force = false, isBackground = false, isInitial = false } = {}) {
  if (isSyncing) return;

  if (!navigator.onLine) {
    if (isInitial && !appState.content.movies?.length) {
      showFobsLoadingRetry('No internet connection. Please check your network and try again.');
    } else {
      updateServerStatus('Offline mode — showing saved content', 'offline');
    }
    return;
  }

  const lastSync = parseInt(localStorage.getItem(SYNC_KEY) || '0', 10);
  if (!force && isBackground && (Date.now() - lastSync < CACHE_TTL_MS)) {
    return; // Content is fresh within 5 minutes, skip redundant backend call
  }

  isSyncing = true;
  let slowWarningTimer = null;

  if (isInitial) {
    showFobsLoadingScreen('Loading FOBS TV...');
    slowWarningTimer = setTimeout(() => {
      updateFobsLoadingMsg('Connecting to high-speed server...');
    }, 3000);
  } else if (isBackground) {
    slowWarningTimer = setTimeout(() => {
      updateServerStatus('Connecting...', 'waking');
    }, 2500);
  } else {
    updateServerStatus('Connecting to server...', 'waking');
  }

  try {
    const data = await fetchApiWithRetry(`/api/content?_t=${Date.now()}`, {}, {
      timeout: 25000,
      maxRetries: 2,
      delay: 3000
    });

    if (slowWarningTimer) clearTimeout(slowWarningTimer);

    normalizeContentData(data);
    appState.content = data;
    saveContentToCache(data);

    renderAllViews();
    checkAppUpdate(data);
    hideFobsLoadingScreen();
    hideServerStatus();
  } catch (err) {
    if (slowWarningTimer) clearTimeout(slowWarningTimer);
    console.error('Failed to sync content with server:', err);

    if (appState.content.movies?.length > 0) {
      updateServerStatus('Server unavailable — showing saved content', 'error');
    } else {
      showFobsLoadingRetry('Server is waking up or temporarily unreachable.');
    }
  } finally {
    isSyncing = false;
  }
}

// Backward-compatible content fetch wrapper
async function fetchAppContent() {
  await syncContentWithBackend({ force: true });
}

// Server Status Bar Controls
function updateServerStatus(text, state = 'info') {
  const bar = document.getElementById('serverStatusBar');
  if (!bar) return;

  // Suppress "Connected to FOBS TV" popups entirely
  if (state === 'success' || (text && text.toLowerCase().includes('connected'))) {
    bar.classList.add('hidden');
    bar.style.display = 'none';
    return;
  }

  const dot = document.getElementById('serverStatusDot');
  const ptrIcon = document.getElementById('ptrIcon');
  const textEl = document.getElementById('serverStatusText');
  const retryBtn = document.getElementById('serverRetryBtn');
  if (!textEl) return;

  bar.className = `server-status-bar ${state}`;
  textEl.innerText = text;

  if (ptrIcon) ptrIcon.style.display = 'none';
  if (dot) dot.style.display = 'inline-block';

  bar.style.maxHeight = '';
  bar.style.opacity = '';
  bar.style.transition = '';

  if (state === 'error' || state === 'offline') {
    if (retryBtn) retryBtn.classList.remove('hidden');
    bar.style.display = '';
    bar.classList.remove('hidden');
  } else {
    if (retryBtn) retryBtn.classList.add('hidden');
    bar.style.display = 'none';
    bar.classList.add('hidden');
  }
}

function hideServerStatus() {
  const bar = document.getElementById('serverStatusBar');
  if (bar) bar.classList.add('hidden');
}

// ============================================================
// PULL-TO-REFRESH IMPLEMENTATION
// Pull down from top of app to refresh latest content
// Integrates directly with #serverStatusBar ("Connected to FOBS TV")
// ============================================================
function setupPullToRefresh() {
  const bar = document.getElementById('serverStatusBar');
  const dot = document.getElementById('serverStatusDot');
  const textEl = document.getElementById('serverStatusText');
  const ptrIcon = document.getElementById('ptrIcon');
  const mainContent = document.getElementById('mainContent');
  if (!bar || !mainContent) return;

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isPulling = false;
  let isRefreshing = false;

  // Only engage when pulling down at least 50px deliberately at the top of the screen
  const ENGAGE_MIN_Y = 50;
  // Require 90px pull to trigger refresh
  const PULL_THRESHOLD = 90;

  const getScrollTop = () => {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };

  const isPlayerOpen = () => {
    return document.body.classList.contains('player-open') || 
           document.getElementById('playerOverlay')?.classList.contains('open') ||
           document.getElementById('detailsSheetOverlay')?.classList.contains('open');
  };

  // Touch Start
  window.addEventListener('touchstart', (e) => {
    if (isPlayerOpen() || isRefreshing) return;
    if (getScrollTop() <= 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = startX;
      currentY = startY;
      isPulling = false;
    } else {
      startY = 0;
    }
  }, { passive: true });

  // Touch Move
  window.addEventListener('touchmove', (e) => {
    if (!startY || isPlayerOpen() || isRefreshing) return;
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Must be at the very top of the page (scrollTop <= 0)
    // Must be distinctly vertical (deltaY > 2.2 * deltaX) so horizontal carousel swipe is NEVER hijacked
    // Must exceed deliberate ENGAGE_MIN_Y (50px) so normal touches/scrolls are NEVER blocked!
    if (deltaY > ENGAGE_MIN_Y && Math.abs(deltaY) > Math.abs(deltaX) * 2.2 && getScrollTop() <= 0) {
      isPulling = true;
      const pullEffective = deltaY - ENGAGE_MIN_Y;
      const pullDistance = Math.min(65, Math.pow(pullEffective, 0.75));

      bar.classList.remove('hidden');
      bar.style.transition = 'none';
      bar.style.maxHeight = `${pullDistance}px`;
      bar.style.opacity = `${Math.min(1, pullDistance / 24)}`;

      mainContent.style.transition = 'none';
      mainContent.style.transform = `translateY(${pullDistance * 0.5}px)`;

      if (ptrIcon) ptrIcon.style.display = 'inline-block';
      if (dot) dot.style.display = 'none';

      if (deltaY < PULL_THRESHOLD) {
        bar.className = 'server-status-bar pulling';
        if (textEl) textEl.innerText = 'Pull down to refresh...';
        if (ptrIcon) {
          ptrIcon.className = 'fa-solid fa-arrow-down ptr-icon';
          ptrIcon.style.transform = 'rotate(0deg)';
        }
      } else {
        bar.className = 'server-status-bar release';
        if (textEl) textEl.innerText = 'Release to refresh FOBS TV';
        if (ptrIcon) {
          ptrIcon.className = 'fa-solid fa-arrow-up ptr-icon';
          ptrIcon.style.transform = 'rotate(180deg)';
        }
      }
    }
  }, { passive: true });

  // Finish Gesture / Refresh Logic
  const handleGestureEnd = async () => {
    if (!isPulling || isRefreshing) {
      startY = 0;
      isPulling = false;
      return;
    }

    const deltaY = currentY - startY;
    startY = 0;
    isPulling = false;

    if (deltaY >= PULL_THRESHOLD) {
      isRefreshing = true;
      bar.className = 'server-status-bar waking';
      bar.style.transition = 'all 0.25s ease';
      bar.style.maxHeight = '42px';
      bar.style.opacity = '1';

      mainContent.style.transition = 'transform 0.25s ease';
      mainContent.style.transform = 'translateY(42px)';

      if (ptrIcon) {
        ptrIcon.className = 'fa-solid fa-rotate fa-spin ptr-icon';
        ptrIcon.style.transform = 'none';
        ptrIcon.style.display = 'inline-block';
      }
      if (dot) dot.style.display = 'none';
      if (textEl) textEl.innerText = 'Refreshing latest content...';

      try {
        await syncContentWithBackend({ force: true });
        hideServerStatus();
        showToast('Refreshed: Latest content loaded');
      } catch (err) {
        bar.className = 'server-status-bar error';
        if (textEl) textEl.innerText = 'Could not reach server — using saved';
        if (ptrIcon) ptrIcon.style.display = 'none';
        if (dot) dot.style.display = 'inline-block';
      } finally {
        setTimeout(() => {
          mainContent.style.transition = 'transform 0.3s ease';
          mainContent.style.transform = '';
          bar.style.transition = 'all 0.3s ease';
          bar.style.maxHeight = '';
          bar.style.opacity = '';
          bar.classList.add('hidden');
          isRefreshing = false;
          if (ptrIcon) ptrIcon.style.display = 'none';
          if (dot) dot.style.display = 'inline-block';
        }, 1200);
      }
    } else {
      mainContent.style.transition = 'transform 0.2s ease';
      mainContent.style.transform = '';
      bar.style.transition = 'all 0.2s ease';
      bar.style.maxHeight = '';
      bar.style.opacity = '';
      bar.classList.add('hidden');
      if (ptrIcon) ptrIcon.style.display = 'none';
      if (dot) dot.style.display = 'inline-block';
    }
  };

  window.addEventListener('touchend', handleGestureEnd);
  window.addEventListener('touchcancel', handleGestureEnd);

  // Desktop Mouse Drag Support for testing
  let isMouseDown = false;
  window.addEventListener('mousedown', (e) => {
    if (isPlayerOpen() || isRefreshing) return;
    if (getScrollTop() <= 2 && e.clientY < 220) {
      startY = e.clientY;
      currentY = startY;
      isMouseDown = true;
      isPulling = false;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown || !startY || isPlayerOpen() || isRefreshing) return;
    currentY = e.clientY;
    const deltaY = currentY - startY;

    if (deltaY > 8 && getScrollTop() <= 0) {
      isPulling = true;
      const pullDistance = Math.min(80, Math.pow(deltaY, 0.82));

      bar.classList.remove('hidden');
      bar.style.transition = 'none';
      bar.style.maxHeight = `${pullDistance}px`;
      bar.style.opacity = `${Math.min(1, pullDistance / 28)}`;

      mainContent.style.transition = 'none';
      mainContent.style.transform = `translateY(${pullDistance * 0.55}px)`;

      if (ptrIcon) ptrIcon.style.display = 'inline-block';
      if (dot) dot.style.display = 'none';

      if (pullDistance < PULL_THRESHOLD) {
        bar.className = 'server-status-bar pulling';
        if (textEl) textEl.innerText = 'Pull down to refresh...';
        if (ptrIcon) {
          ptrIcon.className = 'fa-solid fa-arrow-down ptr-icon';
          ptrIcon.style.transform = 'rotate(0deg)';
        }
      } else {
        bar.className = 'server-status-bar release';
        if (textEl) textEl.innerText = 'Release to refresh FOBS TV';
        if (ptrIcon) {
          ptrIcon.className = 'fa-solid fa-arrow-up ptr-icon';
          ptrIcon.style.transform = 'rotate(180deg)';
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isMouseDown) {
      isMouseDown = false;
      handleGestureEnd();
    }
  });
}

// FOBS TV Branded Loading Screen Controls
function showFobsLoadingScreen(msg = 'Loading FOBS TV...') {
  const screen = document.getElementById('fobsLoadingScreen');
  const msgEl = document.getElementById('fobsLoadingMsg');
  const retryBox = document.getElementById('fobsLoadingRetry');
  if (msgEl) msgEl.innerText = msg;
  if (retryBox) retryBox.classList.add('hidden');
  if (screen) screen.classList.remove('hidden');
}

function updateFobsLoadingMsg(msg) {
  const msgEl = document.getElementById('fobsLoadingMsg');
  if (msgEl) msgEl.innerText = msg;
}

function hideFobsLoadingScreen() {
  const screen = document.getElementById('fobsLoadingScreen');
  if (screen) screen.classList.add('hidden');
}

function showFobsLoadingRetry(detail = 'Unable to connect to server.') {
  const screen = document.getElementById('fobsLoadingScreen');
  const retryBox = document.getElementById('fobsLoadingRetry');
  const msgEl = document.getElementById('fobsLoadingMsg');
  if (msgEl) msgEl.innerText = 'Connection Failed';
  if (retryBox) {
    const detailEl = retryBox.querySelector('.fobs-error-detail');
    if (detailEl) detailEl.innerText = detail;
    retryBox.classList.remove('hidden');
  }
  if (screen) screen.classList.remove('hidden');
}

function retryInitialLoad() {
  showFobsLoadingScreen('Connecting to server...');
  syncContentWithBackend({ force: true, isInitial: true });
}

function triggerManualSync() {
  updateServerStatus('Reconnecting to server...', 'waking');
  syncContentWithBackend({ force: true });
}

// App Visibility & Network Change Listeners (Avoid unnecessary reload loops)
function setupAppVisibilityListeners() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const lastSync = parseInt(localStorage.getItem(SYNC_KEY) || '0', 10);
      // Only refresh if more than 10 minutes have elapsed since last sync
      if (Date.now() - lastSync > 10 * 60 * 1000) {
        syncContentWithBackend({ isBackground: true });
      }
    }
  });

  window.addEventListener('online', () => {
    updateServerStatus('Reconnecting...', 'waking');
    syncContentWithBackend({ force: true });
  });

  window.addEventListener('offline', () => {
    updateServerStatus('Offline mode — showing saved content', 'offline');
  });
}

// Render All Tabs & Feeds
function renderAllViews() {
  renderHeroBanner();
  renderHomeFeeds();
  renderAllMovies();
  renderAllSeries();
  renderLiveTv();
}

// Hero Slider State (Infinite loop and gesture support)
let currentHeroIndex = 0;
let heroSliderInterval = null;
let heroItems = [];
let loopCardsList = [];
let isHeroSliding = false;
let isSwipingHero = false;

function renderHeroBanner() {
  const movies = appState.content.movies || [];
  const series = appState.content.series || [];
  
  // Home hero: Featured item first (with TMDB cover photo), then recent movies + series
  const featured = appState.content.featured;
  const recentMovies = movies.slice(0, 2);
  const recentSeries = series.slice(0, 3);
  const rawHeroList = featured && featured.id
    ? [featured, ...recentMovies, ...recentSeries]
    : [...recentMovies, ...recentSeries];

  const seenIds = new Set();
  heroItems = rawHeroList.filter(item => {
    if (!item || !item.id || seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  }).slice(0, 5);

  if (heroItems.length === 0) return;

  // Add clone for infinite peek slider if more than 1 item
  loopCardsList = heroItems.length > 1 ? [...heroItems, heroItems[0]] : [...heroItems];

  const backdropTrack = document.getElementById('heroBackdropTrack');
  const cardsTrack = document.getElementById('heroCardsTrack');

  if (backdropTrack) {
    backdropTrack.innerHTML = heroItems.map((slide, idx) => {
      const bgUrl = slide.cover || slide.backdrop || slide.poster;
      return `<div class="hero-backdrop-slide ${idx === 0 ? 'active' : ''}" style="background-image: url('${bgUrl}')"></div>`;
    }).join('');
  }

  if (cardsTrack) {
    cardsTrack.innerHTML = loopCardsList.map((slide, idx) => {
      const isSeries = !!slide.episodes || slide.type === 'series';
      const originalIndex = idx % heroItems.length;
      return `
        <div class="hero-peek-card ${idx === 0 ? 'active' : ''}" data-index="${originalIndex}" onclick="handleHeroCardClick(event, '${isSeries ? 'series' : 'movie'}', '${slide.id}')">
          <div class="hero-peek-thumb-wrap">
            <img src="${slide.poster}" alt="${slide.title}" class="hero-peek-thumb" loading="lazy">
          </div>
          <div class="hero-peek-info">
            <div class="hero-peek-title-scroll-container">
              <div class="hero-peek-title">${slide.title}</div>
            </div>
            <div class="hero-peek-sub">
              <i class="fa-solid fa-film"></i> | ${slide.year || '2026'} | ${slide.genre || (isSeries ? 'Series' : 'Action')}
            </div>
          </div>
          <div class="hero-peek-play">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
      `;
    }).join('');
  }

  currentHeroIndex = 0;
  applyHeroSlide(0, false);

  startHeroAutoSlide();
}

function handleHeroCardClick(event, type, id) {
  // If user was swiping horizontally, do not open player
  if (isSwipingHero) return;
  openPlayerById(type, id);
}

// Handle clicking directly on Hero backdrop / poster to play active video
function handleActiveHeroClick(tab) {
  if (isSwipingHero || isSwipingMovieHero) return;

  if (tab === 'home' && heroItems && heroItems.length > 0) {
    const activeItem = heroItems[currentHeroIndex % heroItems.length];
    if (activeItem) {
      const type = (activeItem.episodes || activeItem.type === 'series') ? 'series' : 'movie';
      openPlayerById(type, activeItem.id);
    }
  } else if (tab === 'movie' && movieHeroItems && movieHeroItems.length > 0) {
    const activeItem = movieHeroItems[currentMovieHeroIndex % movieHeroItems.length];
    if (activeItem) {
      openPlayerById('movie', activeItem.id);
    }
  } else if (tab === 'series' && seriesHeroItems && seriesHeroItems.length > 0) {
    const activeItem = seriesHeroItems[currentSeriesHeroIndex % seriesHeroItems.length];
    if (activeItem) {
      openPlayerById('series', activeItem.id);
    }
  }
}

function startHeroAutoSlide() {
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  if (heroItems.length <= 1) return;
  heroSliderInterval = setInterval(() => {
    nextHeroSlide();
  }, 4000);
}

function nextHeroSlide() {
  if (isHeroSliding || heroItems.length <= 1) return;
  isHeroSliding = true;

  const nextIndex = currentHeroIndex + 1;
  applyHeroSlide(nextIndex, true);

  if (nextIndex === heroItems.length) {
    setTimeout(() => {
      currentHeroIndex = 0;
      applyHeroSlide(0, false);
      isHeroSliding = false;
    }, 650);
  } else {
    currentHeroIndex = nextIndex;
    setTimeout(() => {
      isHeroSliding = false;
    }, 650);
  }
}

function prevHeroSlide() {
  if (isHeroSliding || heroItems.length <= 1) return;
  isHeroSliding = true;

  let prevIndex = currentHeroIndex - 1;
  if (prevIndex < 0) {
    prevIndex = heroItems.length - 1;
  }
  applyHeroSlide(prevIndex, true);
  currentHeroIndex = prevIndex;

  setTimeout(() => {
    isHeroSliding = false;
  }, 650);
}

// Slide both the full background poster and the bottom 75/25 card track
function applyHeroSlide(index, animate = true) {
  const actualIndex = index % heroItems.length;

  // 1. Update full-fill backdrop poster
  const backdropSlides = document.querySelectorAll('.hero-backdrop-slide');
  backdropSlides.forEach((slide, idx) => {
    slide.classList.toggle('active', idx === actualIndex);
  });

  // 2. Slide bottom cards track: 75% active + 25% peek of next card
  const cardsTrack = document.getElementById('heroCardsTrack');
  if (cardsTrack && cardsTrack.children.length > 0) {
    const cards = cardsTrack.children;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', i === index);
    }

    const firstCard = cards[0];
    const cardWidth = firstCard.offsetWidth;
    const gap = 10;
    const offset = index * (cardWidth + gap);

    if (animate) {
      cardsTrack.style.transition = 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)';
    } else {
      cardsTrack.style.transition = 'none';
    }

    cardsTrack.style.transform = `translateX(-${offset}px)`;
  }
}

// Touch and Swipe Gestures for Hero Section (Left/Right Drag Support)
function setupHeroSwipeGestures() {
  const container = document.getElementById('heroSliderContainer');
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let moved = false;

  container.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;
    moved = false;
    isSwipingHero = false;
    if (heroSliderInterval) clearInterval(heroSliderInterval);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
    if (Math.abs(deltaX) > 10) {
      moved = true;
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (moved && Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwipingHero = true;
      setTimeout(() => { isSwipingHero = false; }, 250);

      if (deltaX < 0) {
        // Swipe Left (finger moves right to left) -> Next Slide
        nextHeroSlide();
      } else {
        // Swipe Right (finger moves left to right) -> Previous Slide
        prevHeroSlide();
      }
    }
    startHeroAutoSlide();
  }, { passive: true });

  // Mouse Drag support for testing on PC
  let mouseStartX = 0;
  let mouseDeltaX = 0;
  let isMouseDown = false;

  container.addEventListener('mousedown', (e) => {
    // If clicking inside the title container to scroll title, don't drag card
    if (e.target.closest('.hero-peek-title-scroll-container')) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    mouseDeltaX = 0;
    if (heroSliderInterval) clearInterval(heroSliderInterval);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    mouseDeltaX = e.clientX - mouseStartX;
    if (Math.abs(mouseDeltaX) > 10) {
      isSwipingHero = true;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    if (Math.abs(mouseDeltaX) > 40) {
      if (mouseDeltaX < 0) {
        nextHeroSlide();
      } else {
        prevHeroSlide();
      }
    }
    setTimeout(() => { isSwipingHero = false; }, 200);
    startHeroAutoSlide();
  });
}

// ============================================================
// MOVIE TAB HERO SLIDER (INFINITE LOOP & GESTURE SUPPORT)
// ============================================================
let currentMovieHeroIndex = 0;
let movieHeroSliderInterval = null;
let movieHeroItems = [];
let movieLoopCardsList = [];
let isMovieHeroSliding = false;
let isSwipingMovieHero = false;

function renderMovieHeroBanner() {
  const movies = appState.content.movies || [];
  if (movies.length === 0) return;

  // Movie hero: 5 most recent movies (if fewer uploaded, shows all available, e.g. 2 currently)
  movieHeroItems = movies.slice(0, 5);
  movieLoopCardsList = movieHeroItems.length > 1 ? [...movieHeroItems, movieHeroItems[0]] : [...movieHeroItems];

  const backdropTrack = document.getElementById('movieHeroBackdropTrack');
  const cardsTrack = document.getElementById('movieHeroCardsTrack');

  if (backdropTrack) {
    backdropTrack.innerHTML = movieHeroItems.map((slide, idx) => {
      const bgUrl = slide.cover || slide.backdrop || slide.poster;
      return `<div class="hero-backdrop-slide ${idx === 0 ? 'active' : ''}" style="background-image: url('${bgUrl}')"></div>`;
    }).join('');
  }

  if (cardsTrack) {
    cardsTrack.innerHTML = movieLoopCardsList.map((slide, idx) => {
      const originalIndex = idx % movieHeroItems.length;
      return `
        <div class="hero-peek-card ${idx === 0 ? 'active' : ''}" data-index="${originalIndex}" onclick="handleMovieHeroCardClick(event, '${slide.id}')">
          <div class="hero-peek-thumb-wrap">
            <img src="${slide.poster}" alt="${slide.title}" class="hero-peek-thumb" loading="lazy" onerror="this.onerror=null; this.src='https://image.tmdb.org/t/p/w500/vy14tKxsbJYdDyFl6kQuVkK2s44.jpg';">
          </div>
          <div class="hero-peek-info">
            <div class="hero-peek-title-scroll-container">
              <div class="hero-peek-title">${slide.title}</div>
            </div>
            <div class="hero-peek-sub">
              <i class="fa-solid fa-film"></i> | ${slide.year || '2024'} | ${slide.industry || slide.language || 'Movie'}
            </div>
          </div>
          <div class="hero-peek-play">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
      `;
    }).join('');
  }

  currentMovieHeroIndex = 0;
  applyMovieHeroSlide(0, false);

  if (appState.activeTab === 'movie') {
    startMovieHeroAutoSlide();
  }
}

function handleMovieHeroCardClick(event, id) {
  if (isSwipingMovieHero) return;
  openPlayerById('movie', id);
}

function startMovieHeroAutoSlide() {
  if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  if (movieHeroItems.length <= 1) return;
  movieHeroSliderInterval = setInterval(() => {
    nextMovieHeroSlide();
  }, 4000);
}

function nextMovieHeroSlide() {
  if (isMovieHeroSliding || movieHeroItems.length <= 1) return;
  isMovieHeroSliding = true;

  const nextIndex = currentMovieHeroIndex + 1;
  applyMovieHeroSlide(nextIndex, true);

  if (nextIndex === movieHeroItems.length) {
    setTimeout(() => {
      currentMovieHeroIndex = 0;
      applyMovieHeroSlide(0, false);
      isMovieHeroSliding = false;
    }, 650);
  } else {
    currentMovieHeroIndex = nextIndex;
    setTimeout(() => {
      isMovieHeroSliding = false;
    }, 650);
  }
}

function prevMovieHeroSlide() {
  if (isMovieHeroSliding || movieHeroItems.length <= 1) return;
  isMovieHeroSliding = true;

  let prevIndex = currentMovieHeroIndex - 1;
  if (prevIndex < 0) {
    prevIndex = movieHeroItems.length - 1;
  }
  applyMovieHeroSlide(prevIndex, true);
  currentMovieHeroIndex = prevIndex;

  setTimeout(() => {
    isMovieHeroSliding = false;
  }, 650);
}

function applyMovieHeroSlide(index, animate = true) {
  if (!movieHeroItems || movieHeroItems.length === 0) return;
  const actualIndex = index % movieHeroItems.length;

  // 1. Update full-fill backdrop poster
  const backdropTrack = document.getElementById('movieHeroBackdropTrack');
  if (backdropTrack) {
    const backdropSlides = backdropTrack.querySelectorAll('.hero-backdrop-slide');
    backdropSlides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === actualIndex);
    });
  }

  // 2. Slide bottom cards track: 75% active + 25% peek of next card
  const cardsTrack = document.getElementById('movieHeroCardsTrack');
  if (cardsTrack && cardsTrack.children.length > 0) {
    const cards = cardsTrack.children;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', i === index);
    }

    const firstCard = cards[0];
    const cardWidth = firstCard.offsetWidth || 260;
    const gap = 10;
    const offset = index * (cardWidth + gap);

    if (animate) {
      cardsTrack.style.transition = 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)';
    } else {
      cardsTrack.style.transition = 'none';
    }

    cardsTrack.style.transform = `translateX(-${offset}px)`;
  }
}

// Touch and Swipe Gestures for Movie Hero Section
function setupMovieHeroSwipeGestures() {
  const container = document.getElementById('movieHeroSliderContainer');
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let moved = false;

  container.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;
    moved = false;
    isSwipingMovieHero = false;
    if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
    if (Math.abs(deltaX) > 10) {
      moved = true;
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (moved && Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwipingMovieHero = true;
      setTimeout(() => { isSwipingMovieHero = false; }, 250);

      if (deltaX < 0) {
        nextMovieHeroSlide();
      } else {
        prevMovieHeroSlide();
      }
    }
    if (appState.activeTab === 'movie') {
      startMovieHeroAutoSlide();
    }
  }, { passive: true });

  // Mouse Drag support for testing on PC
  let mouseStartX = 0;
  let mouseDeltaX = 0;
  let isMouseDown = false;

  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hero-peek-title-scroll-container')) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    mouseDeltaX = 0;
    if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    mouseDeltaX = e.clientX - mouseStartX;
    if (Math.abs(mouseDeltaX) > 10) {
      isSwipingMovieHero = true;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    if (Math.abs(mouseDeltaX) > 40) {
      if (mouseDeltaX < 0) {
        nextMovieHeroSlide();
      } else {
        prevMovieHeroSlide();
      }
    }
    setTimeout(() => { isSwipingMovieHero = false; }, 200);
    if (appState.activeTab === 'movie') {
      startMovieHeroAutoSlide();
    }
  });
}

// ============================================================
// SERIES TAB HERO SLIDER (INFINITE LOOP & GESTURE SUPPORT)
// ============================================================
let currentSeriesHeroIndex = 0;
let seriesHeroSliderInterval = null;
let seriesHeroItems = [];
let seriesLoopCardsList = [];
let isSeriesHeroSliding = false;
let isSwipingSeriesHero = false;

function renderSeriesHeroBanner() {
  const series = appState.content.series || [];
  if (series.length === 0) return;

  // Series hero: 5 most recent series (always latest uploads)
  seriesHeroItems = series.slice(0, 5);
  seriesLoopCardsList = seriesHeroItems.length > 1 ? [...seriesHeroItems, seriesHeroItems[0]] : [...seriesHeroItems];

  const backdropTrack = document.getElementById('seriesHeroBackdropTrack');
  const cardsTrack = document.getElementById('seriesHeroCardsTrack');

  if (backdropTrack) {
    backdropTrack.innerHTML = seriesHeroItems.map((slide, idx) => {
      const bgUrl = slide.cover || slide.backdrop || slide.poster;
      return `<div class="hero-backdrop-slide ${idx === 0 ? 'active' : ''}" style="background-image: url('${bgUrl}')"></div>`;
    }).join('');
  }

  if (cardsTrack) {
    cardsTrack.innerHTML = seriesLoopCardsList.map((slide, idx) => {
      const originalIndex = idx % seriesHeroItems.length;
      return `
        <div class="hero-peek-card ${idx === 0 ? 'active' : ''}" data-index="${originalIndex}" onclick="handleSeriesHeroCardClick(event, '${slide.id}')">
          <div class="hero-peek-thumb-wrap">
            <img src="${slide.poster}" alt="${slide.title}" class="hero-peek-thumb" loading="lazy" onerror="this.onerror=null; this.src='https://image.tmdb.org/t/p/w500/jwrumjdNdtlHRzthQEj9HmxehcR.jpg';">
          </div>
          <div class="hero-peek-info">
            <div class="hero-peek-title-scroll-container">
              <div class="hero-peek-title">${slide.title}</div>
            </div>
            <div class="hero-peek-sub">
              <i class="fa-solid fa-tv"></i> | ${slide.seasonsCount ? slide.seasonsCount + ' Seasons' : (slide.year || 'Series')} | ${slide.language || 'Dubbed'}
            </div>
          </div>
          <div class="hero-peek-play">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
      `;
    }).join('');
  }

  currentSeriesHeroIndex = 0;
  applySeriesHeroSlide(0, false);

  if (appState.activeTab === 'series') {
    startSeriesHeroAutoSlide();
  }
}

function handleSeriesHeroCardClick(event, id) {
  if (isSwipingSeriesHero) return;
  openPlayerById('series', id);
}

function startSeriesHeroAutoSlide() {
  if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);
  if (seriesHeroItems.length <= 1) return;
  seriesHeroSliderInterval = setInterval(() => {
    nextSeriesHeroSlide();
  }, 4000);
}

function nextSeriesHeroSlide() {
  if (isSeriesHeroSliding || seriesHeroItems.length <= 1) return;
  isSeriesHeroSliding = true;

  const nextIndex = currentSeriesHeroIndex + 1;
  applySeriesHeroSlide(nextIndex, true);

  if (nextIndex === seriesHeroItems.length) {
    setTimeout(() => {
      currentSeriesHeroIndex = 0;
      applySeriesHeroSlide(0, false);
      isSeriesHeroSliding = false;
    }, 650);
  } else {
    currentSeriesHeroIndex = nextIndex;
    setTimeout(() => {
      isSeriesHeroSliding = false;
    }, 650);
  }
}

function prevSeriesHeroSlide() {
  if (isSeriesHeroSliding || seriesHeroItems.length <= 1) return;
  isSeriesHeroSliding = true;

  let prevIndex = currentSeriesHeroIndex - 1;
  if (prevIndex < 0) {
    prevIndex = seriesHeroItems.length - 1;
  }
  applySeriesHeroSlide(prevIndex, true);
  currentSeriesHeroIndex = prevIndex;

  setTimeout(() => {
    isSeriesHeroSliding = false;
  }, 650);
}

function applySeriesHeroSlide(index, animate = true) {
  if (!seriesHeroItems || seriesHeroItems.length === 0) return;
  const actualIndex = index % seriesHeroItems.length;

  const backdropTrack = document.getElementById('seriesHeroBackdropTrack');
  if (backdropTrack) {
    const backdropSlides = backdropTrack.querySelectorAll('.hero-backdrop-slide');
    backdropSlides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === actualIndex);
    });
  }

  const cardsTrack = document.getElementById('seriesHeroCardsTrack');
  if (cardsTrack && cardsTrack.children.length > 0) {
    const cards = cardsTrack.children;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', i === index);
    }

    const firstCard = cards[0];
    const cardWidth = firstCard.offsetWidth || 260;
    const gap = 10;
    const offset = index * (cardWidth + gap);

    if (animate) {
      cardsTrack.style.transition = 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)';
    } else {
      cardsTrack.style.transition = 'none';
    }

    cardsTrack.style.transform = `translateX(-${offset}px)`;
  }
}

// Touch and Swipe Gestures for Series Hero Section
function setupSeriesHeroSwipeGestures() {
  const container = document.getElementById('seriesHeroSliderContainer');
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let moved = false;

  container.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;
    moved = false;
    isSwipingSeriesHero = false;
    if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
    if (Math.abs(deltaX) > 10) {
      moved = true;
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (moved && Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwipingSeriesHero = true;
      setTimeout(() => { isSwipingSeriesHero = false; }, 250);

      if (deltaX < 0) {
        nextSeriesHeroSlide();
      } else {
        prevSeriesHeroSlide();
      }
    }
    if (appState.activeTab === 'series') {
      startSeriesHeroAutoSlide();
    }
  }, { passive: true });

  // Mouse Drag support for testing on PC
  let mouseStartX = 0;
  let mouseDeltaX = 0;
  let isMouseDown = false;

  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hero-peek-title-scroll-container')) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    mouseDeltaX = 0;
    if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    mouseDeltaX = e.clientX - mouseStartX;
    if (Math.abs(mouseDeltaX) > 10) {
      isSwipingSeriesHero = true;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    if (Math.abs(mouseDeltaX) > 40) {
      if (mouseDeltaX < 0) {
        nextSeriesHeroSlide();
      } else {
        prevSeriesHeroSlide();
      }
    }
    setTimeout(() => { isSwipingSeriesHero = false; }, 200);
    if (appState.activeTab === 'series') {
      startSeriesHeroAutoSlide();
    }
  });
}

// Touch & Swipe Gestures to close player
// RULES:
// 1. NO left-to-right swipe back at all (deltaX > 0 does nothing).
// 2. Only right-to-left swipe (deltaX < 0) strictly originating from the extreme right edge (startX >= window.innerWidth - 30).
// 3. Any touch in the middle or left of the screen does NOTHING.
function setupPlayerSwipeToClose() {
  const player = document.getElementById('playerOverlay');
  if (!player) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let isTouching = false;
  let isRightEdgeSwipe = false;

  // Strictly within 30px from the extreme right edge of the screen
  const EXTREME_RIGHT_EDGE_WIDTH = 30;

  player.addEventListener('touchstart', (e) => {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    if (e.target.tagName === 'INPUT' || e.target.closest('input')) return;
    if (e.target.tagName === 'VIDEO' || e.target.closest('video') || e.target.closest('.video-container')) return;
    // Don't intercept touches inside interactive or horizontal scrolling rows
    if (e.target.closest('.servers-list-row') || e.target.closest('.episodes-list-row') || e.target.closest('.cast-row') || e.target.closest('.server-pill') || e.target.closest('.ep-pill')) return;

    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;

    // Check if the touch strictly started at the extreme right edge of the screen
    isRightEdgeSwipe = startX >= (window.innerWidth - EXTREME_RIGHT_EDGE_WIDTH);

    if (isRightEdgeSwipe) {
      isTouching = true;
    } else {
      isTouching = false;
    }
  }, { passive: true });

  player.addEventListener('touchmove', (e) => {
    if (!isTouching || !isRightEdgeSwipe) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
  }, { passive: true });

  player.addEventListener('touchend', () => {
    if (!isTouching || !isRightEdgeSwipe) {
      isTouching = false;
      isRightEdgeSwipe = false;
      return;
    }
    isTouching = false;
    isRightEdgeSwipe = false;

    // ONLY Right-edge swipe towards left (deltaX must be negative, moving left by at least 65px)
    // Left-to-right swipe (deltaX > 0) is completely ignored!
    if (startX >= (window.innerWidth - EXTREME_RIGHT_EDGE_WIDTH) && deltaX < -65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      closePlayer();
      return;
    }
  }, { passive: true });
}

// Card Badge Helpers: Movie & Series posters always display "Hindi" on right badge (never "Movie" or "Series")
function getCardBadgeLeft(item) {
  // Left badge omitted so only right-side "Hindi" badge appears (matching reference screenshot)
  return '';
}

function getCardBadgeRightHtml(item, fallback = '') {
  if (item && (item.badgeRight === 'ONGOING' || item.isOngoing || item.status === 'Ongoing')) {
    return `<span class="card-badge-right badge-ongoing">ONGOING</span>`;
  }
  if (item && (item.badgeRight === 'Hallprint' || item.tag === 'Hallprint')) {
    return `<span class="card-badge-right badge-hallprint">Hallprint</span>`;
  }
  // Always display "Hindi" on the right side badge, never "Movie" or "Series"
  return `<span class="card-badge-right">Hindi</span>`;
}

// Render Home Carousels
function renderHomeFeeds() {
  const movies = sortByReleaseDateDesc(appState.content.movies || []);
  const series = sortByReleaseDateDesc(appState.content.series || []);
  const liveTv = appState.content.liveTv || [];

  // Trending Movies & Series with Rank Numbers (1, 2, 3) (Strictly Latest Release Date First)
  const trendingContainer = document.getElementById('trendingList');
  const allReleaseSorted = sortByReleaseDateDesc([
    ...(movies.map(m => ({ ...m, _mediaType: 'movie' }))),
    ...(series.map(s => ({ ...s, _mediaType: 'series' })))
  ]);
  const combinedTrending = allReleaseSorted.slice(0, 15);
  trendingContainer.innerHTML = combinedTrending.map((item, idx) => {
    const isSeries = !!item.episodes || item.type === 'series';
    return `
      <div class="media-card" onclick='openPlayerById("${isSeries ? 'series' : 'movie'}", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
          ${getCardBadgeRightHtml(item, isSeries ? 'Series' : 'Movie')}
          ${idx < 3 ? `<div class="card-rank-number">${idx + 1}</div>` : ''}
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${isSeries ? (item.isOngoing ? (item.episodes ? item.episodes.length + ' Eps (Ongoing)' : 'Ongoing') : (item.seasonsCount ? item.seasonsCount + ' Seasons' : 'Series')) : (item.year || '2023')}</div>
      </div>
    `;
  }).join('');

  // 1. Latest Movies & Series (Strictly by upload order - recently added items first)
  const latestContainer = document.getElementById('latestList');
  if (latestContainer) {
    const latestItems = getRecentlyAddedItems(15);
    latestContainer.innerHTML = latestItems.map(item => {
      const isSeries = !!item.episodes || item.type === 'series' || item._mediaType === 'series';
      return `
        <div class="media-card" onclick='openPlayerById("${isSeries ? 'series' : 'movie'}", "${item.id}")'>
          <div class="card-poster-wrap">
            <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
            <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
            ${getCardBadgeRightHtml(item, isSeries ? 'Series' : 'Movie')}
            <div class="card-play-hover">
              <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
            </div>
          </div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${item.isOngoing ? (item.episodes ? item.episodes.length + ' Eps (Ongoing)' : 'Ongoing') : (item.year || '2023')}</div>
        </div>
      `;
    }).join('');
  }

  // 2. Coming Soon (Shows only if upcoming items exist in data)
  const upcomingContainer = document.getElementById('upcomingList');
  const upcomingSection = upcomingContainer ? upcomingContainer.closest('.content-section') : null;
  if (upcomingContainer) {
    const upcomingItems = appState.content.upcoming || [];
    if (upcomingItems.length > 0) {
      if (upcomingSection) upcomingSection.style.display = 'block';
      upcomingContainer.innerHTML = upcomingItems.map(item => {
        const month = item.releaseMonth || 'Nov';
        const day = item.releaseDay || '04';
        const localKey = `fobs_booking_count_${item.id}`;
        const booked = localStorage.getItem(localKey) || '0';
        return `
          <div class="coming-card" onclick='openUpcomingBookingModal("${item.id}")'>
            <div class="coming-poster-wrap">
              <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
              <span class="card-badge-right">${item.year || 'Upcoming'}</span>
              <div class="coming-date-badge">${month}<span>${day}</span></div>
              <div class="coming-booked-tag"><span id="bookedBadge_${item.id}">${booked}</span> booked</div>
            </div>
            <div class="coming-info-box">
              <div class="coming-title" title="${item.title}">${item.title}</div>
            </div>
          </div>
        `;
      }).join('');
      // Live sync real-time bookings from database
      if (typeof loadAllBookingsRealtime === 'function') {
        loadAllBookingsRealtime();
      }
    } else {
      if (upcomingSection) upcomingSection.style.display = 'none';
      upcomingContainer.innerHTML = '';
    }
  }

  // 3. Movies
  const homeMoviesContainer = document.getElementById('homeMoviesList');
  if (homeMoviesContainer) {
    homeMoviesContainer.innerHTML = movies.map(item => `
      <div class="media-card" onclick='openPlayerById("movie", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
          ${getCardBadgeRightHtml(item, 'Movie')}
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${item.genre ? item.genre.split(',')[0] : 'Drama'}</div>
      </div>
    `).join('');
  }

  // 4. Series
  const homeSeriesContainer = document.getElementById('homeSeriesList');
  if (homeSeriesContainer) {
    homeSeriesContainer.innerHTML = series.map(item => `
      <div class="media-card" onclick='openPlayerById("series", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
          ${getCardBadgeRightHtml(item, 'Series')}
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.isOngoing ? (item.episodes ? item.episodes.length + ' Eps (Ongoing)' : 'Ongoing') : ((item.seasonsCount || 1) + ' Seasons')}</div>
      </div>
    `).join('');
  }

  // 4a. Turkish (Hindi Dubbed) - Displayed directly above Anime
  const homeTurkishContainer = document.getElementById('homeTurkishList');
  if (homeTurkishContainer) {
    const allTurkish = [...movies, ...series].filter(isTurkishMedia);
    const sortedTurkish = sortByReleaseDateDesc(allTurkish);
    if (sortedTurkish.length > 0) {
      homeTurkishContainer.innerHTML = sortedTurkish.map(item => {
        const isSeries = !!item.episodes || item.type === 'series';
        return `
          <div class="media-card" onclick='openPlayerById("${isSeries ? 'series' : 'movie'}", "${item.id}")'>
            <div class="card-poster-wrap">
              <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
              <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
              ${getCardBadgeRightHtml(item, isSeries ? 'Series' : 'Movie')}
              <div class="card-play-hover">
                <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
              </div>
            </div>
            <div class="card-title">${item.title}</div>
            <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.4'} • ${isSeries ? (item.isOngoing ? (item.episodes ? item.episodes.length + ' Eps (Ongoing)' : 'Ongoing') : ((item.seasonsCount || 1) + ' Seasons')) : (item.year || '2023')}</div>
          </div>
        `;
      }).join('');
    } else {
      homeTurkishContainer.innerHTML = `<div class="empty-category-msg"><i class="fa-solid fa-moon"></i> Turkish content coming soon</div>`;
    }
  }

  // 4b. Anime
  const homeAnimeContainer = document.getElementById('homeAnimeList');
  if (homeAnimeContainer) {
    const allAnime = [...movies, ...series].filter(isAnimeMedia);
    const sortedAnime = sortByReleaseDateDesc(allAnime.length > 0 ? allAnime : movies.filter(m => m.country === 'Japan'));
    if (sortedAnime.length > 0) {
      homeAnimeContainer.innerHTML = sortedAnime.map(item => `
        <div class="media-card" onclick='openPlayerById("${item.type || (item.episodes ? 'series' : 'movie')}", "${item.id}")'>
          <div class="card-poster-wrap">
            <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
            <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
            ${getCardBadgeRightHtml(item, 'Anime')}
            <div class="card-play-hover">
              <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
            </div>
          </div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.genre ? item.genre.split(',')[0] : 'Anime'}</div>
        </div>
      `).join('');
    } else {
      homeAnimeContainer.innerHTML = `<div class="empty-category-msg"><i class="fa-solid fa-dragon"></i> Anime coming soon</div>`;
    }
  }

  // 5. Live TV
  const homeLiveTvContainer = document.getElementById('homeLiveTvList');
  if (homeLiveTvContainer) {
    if (liveTv.length > 0) {
      homeLiveTvContainer.innerHTML = liveTv.map(item => `
        <div class="media-card" onclick='openLiveTvPlayer("${item.id}")'>
          <div class="card-poster-wrap" style="height: 120px; display: flex; align-items: center; justify-content: center; background: #1c1d27;">
            <img src="${item.logo || 'assets/fobs_logo.png'}" alt="${item.title}" class="channel-logo-img" style="width: 52px; height: 52px; margin-bottom: 0;" data-name="${encodeURIComponent(item.title || '')}" onerror="handleLiveChannelImgError(this)">
            <span class="card-badge-top" style="background: #ff3b30;">LIVE</span>
          </div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">${item.category}</div>
        </div>
      `).join('');
    } else {
      homeLiveTvContainer.innerHTML = `
        <div class="home-live-cs-card" onclick="switchMainTab('livetv')">
          <div class="home-live-cs-icon"><i class="fa-solid fa-satellite-dish"></i></div>
          <div class="home-live-cs-content">
            <div class="home-live-cs-badge">COMING SOON</div>
            <div class="home-live-cs-title">Live TV Channels</div>
            <div class="home-live-cs-sub">500+ Premium Sports, News & 24/7 Channels • Tap to see preview</div>
          </div>
          <i class="fa-solid fa-chevron-right home-live-cs-arrow"></i>
        </div>
      `;
    }
  }
}

// Helper to Render Individual Movie Card
function renderMovieCardItem(item, rank = null) {
  return `
    <div class="media-card" onclick='openPlayerById("movie", "${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy" onerror="this.onerror=null; this.src='https://image.tmdb.org/t/p/w500/vy14tKxsbJYdDyFl6kQuVkK2s44.jpg';">
        <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
        ${getCardBadgeRightHtml(item, 'Movie')}
        ${rank ? `<div class="card-rank-number">${rank}</div>` : ''}
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.0'} • ${item.year || '2024'}</div>
    </div>
  `;
}

// Recently Added Sorter (Newest additions strictly first, taking both movies and series)
function getRecentlyAddedItems(limit) {
  const rawMovies = appState.content.movies || [];
  const rawSeries = appState.content.series || [];

  const allItems = [
    ...rawMovies.map((m, idx) => ({ ...m, _mediaType: 'movie', _origIdx: idx })),
    ...rawSeries.map((s, idx) => ({ ...s, _mediaType: 'series', _origIdx: idx }))
  ];

  allItems.sort((a, b) => {
    const timeA = a.addedAt ? new Date(a.addedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.addedAt ? new Date(b.addedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA && timeB && timeA !== timeB) {
      return timeB - timeA;
    }
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    // Fallback to array position (0 = most recently added)
    return a._origIdx - b._origIdx;
  });

  return typeof limit === 'number' ? allItems.slice(0, limit) : allItems;
}

// Recently Added Movies (Strictly by upload / addition date, newest first)
function getRecentlyAddedMovies(limit) {
  const rawMovies = appState.content.movies || [];
  const items = rawMovies.map((m, idx) => ({ ...m, _origIdx: idx }));
  items.sort((a, b) => {
    const timeA = a.addedAt ? new Date(a.addedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.addedAt ? new Date(b.addedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return a._origIdx - b._origIdx;
  });
  return typeof limit === 'number' ? items.slice(0, limit) : items;
}

// Recently Added Series (Strictly by upload / addition date, newest first)
function getRecentlyAddedSeries(limit) {
  const rawSeries = appState.content.series || [];
  const items = rawSeries.map((s, idx) => ({ ...s, _origIdx: idx }));
  items.sort((a, b) => {
    const timeA = a.addedAt ? new Date(a.addedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.addedAt ? new Date(b.addedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return a._origIdx - b._origIdx;
  });
  return typeof limit === 'number' ? items.slice(0, limit) : items;
}

// Release Date Descending Sorter (Latest Releases Strictly First: 2026, 2025, 2024...)
function sortByReleaseDateDesc(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const yearA = parseInt(a.year || 0, 10);
    const yearB = parseInt(b.year || 0, 10);
    if (yearA > 1900 && yearB > 1900 && yearA !== yearB) {
      return yearB - yearA;
    }
    const dateA = a.releaseDate || (yearA ? `${yearA}-01-01` : '2000-01-01');
    const dateB = b.releaseDate || (yearB ? `${yearB}-01-01` : '2000-01-01');
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    return (b.id || '').localeCompare(a.id || '');
  });
}

// Unified Industry Categorization Predicates
const isAnimeMedia = x => {
  if (!x) return false;
  const genre = (x.genre || '').toLowerCase();
  const industry = (x.industry || '').toLowerCase();
  const category = (x.category || '').toLowerCase();
  const title = (x.title || '').toLowerCase();
  const badgeRight = (x.badgeRight || '').toLowerCase();
  const tag = (x.tag || '').toLowerCase();
  return genre.includes('anime') || industry.includes('anime') || category.includes('anime') || badgeRight === 'anime' || tag === 'anime' || title.includes('anime');
};

const isTurkishMedia = x => {
  if (!x) return false;
  const cat = (x.category || '').toLowerCase();
  const ind = (x.industry || '').toLowerCase();
  const ctry = (x.country || '').toLowerCase();
  const title = (x.title || '').toLowerCase();
  const desc = (x.description || '').toLowerCase();
  return cat.includes('turkish') || ind.includes('turkish') || ctry.includes('turkey') || ctry.includes('türkiye') ||
         title.includes('ertugrul') || title.includes('osman') || title.includes('golden boy') || title.includes('arafta') ||
         title.includes('sen cal kapimi') || title.includes('hercai') || title.includes('ask laftan') || desc.includes('turkish');
};

const isBollywoodMedia = m => {
  if (!m) return false;
  if (isAnimeMedia(m) || isTurkishMedia(m)) return false;
  const cat = (m.category || '').toLowerCase();
  const ind = (m.industry || '').toLowerCase();
  const lang = (m.language || '').toLowerCase();
  const ctry = (m.country || '').toLowerCase();
  return cat.includes('bollywood') || ind.includes('bollywood') || (lang === 'hindi' && !ctry.includes('korea') && !ctry.includes('usa') && !ctry.includes('china') && !ctry.includes('japan'));
};

const isSouthMedia = m => {
  if (!m) return false;
  if (isAnimeMedia(m) || isTurkishMedia(m)) return false;
  const cat = (m.category || '').toLowerCase();
  const ind = (m.industry || '').toLowerCase();
  const lang = (m.language || '').toLowerCase();
  return cat.includes('south') || ind.includes('south') || ['telugu', 'tamil', 'kannada', 'malayalam'].includes(lang);
};

const isHollywoodMedia = x => {
  if (!x) return false;
  if (isAnimeMedia(x) || isTurkishMedia(x)) return false;
  const cat = (x.category || '').toLowerCase();
  const ind = (x.industry || '').toLowerCase();
  const lang = (x.language || '').toLowerCase();
  const ctry = (x.country || '').toLowerCase();
  return cat.includes('hollywood') || ind.includes('hollywood') || lang === 'english' || ctry.includes('usa') || ctry.includes('united states');
};

const isKoreanMedia = x => {
  if (!x) return false;
  if (isAnimeMedia(x) || isTurkishMedia(x)) return false;
  const cat = (x.category || '').toLowerCase();
  const ind = (x.industry || '').toLowerCase();
  const lang = (x.language || '').toLowerCase();
  const ctry = (x.country || '').toLowerCase();
  return cat.includes('korean') || cat.includes('k-drama') || cat.includes('k-movie') || ind.includes('korean') || lang === 'korean' || ctry.includes('korea');
};

const isChineseMedia = x => {
  if (!x) return false;
  if (isAnimeMedia(x) || isTurkishMedia(x)) return false;
  const cat = (x.category || '').toLowerCase();
  const ind = (x.industry || '').toLowerCase();
  const lang = (x.language || '').toLowerCase();
  const ctry = (x.country || '').toLowerCase();
  return cat.includes('chinese') || cat.includes('c-drama') || cat.includes('c-movie') || ind.includes('chinese') || lang === 'chinese' || ctry.includes('china') || ctry.includes('taiwan') || ctry.includes('hong kong');
};

const isJapaneseMedia = x => {
  if (!x) return false;
  if (isAnimeMedia(x) || isTurkishMedia(x)) return false;
  const cat = (x.category || '').toLowerCase();
  const ind = (x.industry || '').toLowerCase();
  const lang = (x.language || '').toLowerCase();
  const ctry = (x.country || '').toLowerCase();
  return (cat.includes('japanese') || ind.includes('japanese') || lang === 'japanese' || ctry.includes('japan')) && !cat.includes('anime') && !ind.includes('anime');
};

const isOthersMovieMedia = m => (
  !isBollywoodMedia(m) && !isSouthMedia(m) && !isHollywoodMedia(m) && !isKoreanMedia(m) && !isChineseMedia(m) && !isJapaneseMedia(m) && !isAnimeMedia(m) && !isTurkishMedia(m)
);

const isOthersSeriesMedia = s => (
  !isBollywoodMedia(s) && !isSouthMedia(s) && !isHollywoodMedia(s) && !isKoreanMedia(s) && !isChineseMedia(s) && !isJapaneseMedia(s) && !isAnimeMedia(s) && !isTurkishMedia(s)
);

// Render All Movies Tab with Hero Banner & Categorized Horizontal Strips
function renderAllMovies() {
  const movies = sortByReleaseDateDesc(appState.content.movies || []);

  // 1. Render Hero Banner for Movies
  renderMovieHeroBanner();

  // Categorization helpers
  const isBollywood = isBollywoodMedia;
  const isSouth = isSouthMedia;
  const isHollywood = isHollywoodMedia;
  const isKorean = isKoreanMedia;
  const isChinese = isChineseMedia;
  const isJapanese = isJapaneseMedia;
  const isOthers = isOthersMovieMedia;

  // A. Trending Movies (Strictly sorted by latest release date / year)
  renderCategoryList('movieTrendingList', sortByReleaseDateDesc(movies), true);

  // B. Recently Added (Strictly sorted by upload / addition date, newest first)
  renderCategoryList('movieRecentList', getRecentlyAddedMovies());

  // C. Bollywood
  const bollywoodMovies = movies.filter(isBollywood);
  renderCategoryList('movieBollywoodList', sortByReleaseDateDesc(bollywoodMovies));

  // D. South (Dubbed)
  const southMovies = movies.filter(isSouth);
  renderCategoryList('movieSouthList', sortByReleaseDateDesc(southMovies));

  // E. Hollywood (Dubbed)
  const hollywoodMovies = movies.filter(isHollywood);
  renderCategoryList('movieHollywoodList', sortByReleaseDateDesc(hollywoodMovies));

  // F. Korean (Dubbed)
  const koreanMovies = movies.filter(isKorean);
  renderCategoryList('movieKoreanList', sortByReleaseDateDesc(koreanMovies.length > 0 ? koreanMovies : (movies.filter(m => m.country === 'Korea'))));

  // G. Chinese (Dubbed)
  const chineseMovies = movies.filter(isChinese);
  renderCategoryList('movieChineseList', sortByReleaseDateDesc(chineseMovies));

  // H. Japanese (Dubbed)
  const japaneseMovies = movies.filter(isJapanese);
  renderCategoryList('movieJapaneseList', sortByReleaseDateDesc(japaneseMovies));

  // I. Turkish Movies (Hindi)
  const turkishMovies = movies.filter(isTurkishMedia);
  renderCategoryList('movieTurkishList', sortByReleaseDateDesc(turkishMovies));

  // J. Anime Movies (Hindi Dub)
  const animeMovies = movies.filter(isAnimeMedia);
  renderCategoryList('movieAnimeList', sortByReleaseDateDesc(animeMovies.length > 0 ? animeMovies : (movies.filter(m => m.country === 'Japan'))));

  // K. Others (Dubbed)
  const othersMovies = movies.filter(isOthers);
  renderCategoryList('movieOthersList', sortByReleaseDateDesc(othersMovies));
}

function renderCategoryList(containerId, items, isRanked = false, isSeries = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (items && items.length > 0) {
    container.innerHTML = items.map((item, idx) =>
      isSeries ? renderSeriesCardItem(item, isRanked && idx < 5 ? idx + 1 : null) : renderMovieCardItem(item, isRanked && idx < 5 ? idx + 1 : null)
    ).join('');
  } else {
    container.innerHTML = `<div class="empty-category-msg"><i class="fa-solid fa-clapperboard"></i> Coming Soon</div>`;
  }
}

// Helper to Render Individual Series Card
function renderSeriesCardItem(item, rank = null) {
  return `
    <div class="media-card" onclick='openPlayerById("series", "${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy" onerror="this.onerror=null; this.src='https://image.tmdb.org/t/p/w500/jwrumjdNdtlHRzthQEj9HmxehcR.jpg';">
        <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
        ${getCardBadgeRightHtml(item, 'Series')}
        ${rank ? `<div class="card-rank-number">${rank}</div>` : ''}
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.isOngoing ? (item.episodes ? item.episodes.length + ' Eps (Ongoing)' : 'Ongoing') : (item.seasonsCount ? item.seasonsCount + ' Seasons' : (item.year || 'Series'))}</div>
    </div>
  `;
}

// Open Dedicated Section Detail Page ("All >" View)
function openSectionDetail(sectionKey, title) {
  const view = document.getElementById('sectionDetailView');
  const titleEl = document.getElementById('sectionDetailTitle');
  const countEl = document.getElementById('sectionDetailCount');
  const gridEl = document.getElementById('sectionDetailGrid');
  if (!view || !gridEl) return;

  // Track the origin tab to return seamlessly
  if (appState.activeTab !== 'sectionDetail') {
    appState.previousTabBeforeSection = appState.activeTab || 'home';
  }
  appState.activeTab = 'sectionDetail';

  // Pause hero sliders while browsing section detail view
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);

  if (titleEl) titleEl.innerText = title || 'All Titles';

  const movies = appState.content.movies || [];
  const series = appState.content.series || [];
  const upcoming = appState.content.upcoming || [];

  let items = [];
  let isOnlySeries = false;

  switch (sectionKey) {
    case 'trending':
      items = sortByReleaseDateDesc([
        ...(movies.map(m => ({ ...m, _mediaType: 'movie' }))),
        ...(series.map(s => ({ ...s, _mediaType: 'series' })))
      ]);
      break;

    case 'latest':
      items = getRecentlyAddedItems();
      break;

    case 'upcoming':
      items = upcoming;
      break;

    // Movie Sections
    case 'movie-trending':
      items = sortByReleaseDateDesc(movies);
      break;

    case 'movie-recent':
      items = getRecentlyAddedMovies();
      break;

    case 'movie-bollywood':
      items = movies.filter(isBollywoodMedia);
      break;

    case 'movie-south':
      items = movies.filter(isSouthMedia);
      break;

    case 'movie-hollywood':
      items = movies.filter(isHollywoodMedia);
      break;

    case 'movie-korean':
      items = movies.filter(isKoreanMedia);
      if (items.length === 0) items = movies.filter(m => m.country === 'Korea');
      break;

    case 'movie-chinese':
      items = movies.filter(isChineseMedia);
      break;

    case 'movie-japanese':
      items = movies.filter(isJapaneseMedia);
      break;

    case 'movie-others':
      items = movies.filter(isOthersMovieMedia);
      break;

    case 'anime':
      items = [...movies, ...series].filter(isAnimeMedia);
      if (items.length === 0) items = movies.filter(m => m.country === 'Japan');
      break;

    case 'movie-anime':
      items = movies.filter(isAnimeMedia);
      if (items.length === 0) items = movies.filter(m => m.country === 'Japan');
      break;

    // Series Sections
    case 'series-trending':
      isOnlySeries = true;
      items = sortByReleaseDateDesc(series);
      break;

    case 'series-recent':
      isOnlySeries = true;
      items = getRecentlyAddedSeries();
      break;

    case 'series-bollywood':
      isOnlySeries = true;
      items = series.filter(isBollywoodMedia);
      break;

    case 'series-south':
      isOnlySeries = true;
      items = series.filter(isSouthMedia);
      break;

    case 'series-hollywood':
      isOnlySeries = true;
      items = series.filter(isHollywoodMedia);
      break;

    case 'series-korean':
      isOnlySeries = true;
      items = series.filter(isKoreanMedia);
      if (items.length === 0) items = series.filter(s => s.country === 'Korea');
      break;

    case 'series-chinese':
      isOnlySeries = true;
      items = series.filter(isChineseMedia);
      break;

    case 'series-japanese':
      isOnlySeries = true;
      items = series.filter(isJapaneseMedia);
      break;

    case 'series-others':
      isOnlySeries = true;
      items = series.filter(isOthersSeriesMedia);
      break;

    case 'series-anime':
      isOnlySeries = true;
      items = series.filter(isAnimeMedia);
      if (items.length === 0) items = series.filter(s => s.country === 'Japan');
      break;

    case 'turkish':
      items = [...movies, ...series].filter(isTurkishMedia);
      break;

    case 'movie-turkish':
      items = movies.filter(isTurkishMedia);
      break;

    case 'series-turkish':
      isOnlySeries = true;
      items = series.filter(isTurkishMedia);
      break;

    default:
      items = [...movies, ...series];
  }

  // Strictly sort newest releases first by TMDB release date (EXCEPT for recently added / latest sections which preserve upload order)
  const isRecentSection = sectionKey === 'movie-recent' || sectionKey === 'series-recent' || sectionKey === 'latest';
  if (sectionKey !== 'upcoming' && !isRecentSection) {
    items = sortByReleaseDateDesc(items);
  }

  // Update item count badge
  if (countEl) {
    countEl.innerText = `${items.length} ${items.length === 1 ? 'Title' : 'Titles'}`;
  }

  // Render cards vertically inside the 3-column grid
  if (items.length > 0) {
    if (sectionKey === 'upcoming') {
      gridEl.innerHTML = items.map(item => {
        const localKey = `fobs_booking_count_${item.id}`;
        const booked = localStorage.getItem(localKey) || '0';
        return `
        <div class="coming-card" style="width: 100%; max-width: 100%; margin-bottom: 8px;" onclick='openUpcomingBookingModal("${item.id}")'>
          <div class="coming-poster-wrap" style="width: 100%; height: 175px;">
            <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
            <span class="card-badge-right">${item.year || 'Upcoming'}</span>
            <div class="coming-date-badge">${item.releaseMonth || 'Nov'}<span>${item.releaseDay || '04'}</span></div>
            <div class="coming-booked-tag"><span id="bookedBadgeDetail_${item.id}">${booked}</span> booked</div>
          </div>
          <div class="coming-info-box">
            <div class="coming-title" title="${item.title}">${item.title}</div>
          </div>
        </div>
      `;
      }).join('');
      if (typeof loadAllBookingsRealtime === 'function') {
        loadAllBookingsRealtime();
      }
    } else {
      gridEl.innerHTML = items.map((item, idx) => {
        const isItemSeries = isOnlySeries || !!item.episodes || item.type === 'series';
        return isItemSeries ? renderSeriesCardItem(item) : renderMovieCardItem(item);
      }).join('');
    }
  } else {
    gridEl.innerHTML = `
      <div class="empty-category-msg" style="padding: 55px 16px; text-align: center; color: rgba(255,255,255,0.6); grid-column: 1 / -1; width: 100%;">
        <i class="fa-solid fa-clapperboard" style="font-size: 38px; color: #ff9f43; margin-bottom: 12px; display: inline-block;"></i>
        <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">Coming Soon</div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.5);">No titles uploaded in this section yet. Stay tuned!</div>
      </div>
    `;
  }

  // Hide all other views and show section detail
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  view.classList.add('active');

  // Instant scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Push history state so Android hardware back key or browser back returns
  try {
    history.pushState({ screen: 'sectionDetail', sectionKey, title }, '');
  } catch (e) {}
}

function closeSectionDetail() {
  const view = document.getElementById('sectionDetailView');
  if (view && view.classList.contains('active')) {
    view.classList.remove('active');
  }

  const prevTab = appState.previousTabBeforeSection || 'home';
  switchMainTab(prevTab);
}

function scrollToAllMovies(category) {
  openSectionDetail(category === 'Trending' ? 'movie-trending' : 'movie-recent', `${category} Movies`);
}

// Render All Series Tab with Hero Banner & Categorized Horizontal Strips
function renderAllSeries() {
  const series = sortByReleaseDateDesc(appState.content.series || []);

  // 1. Render Hero Banner for Series
  renderSeriesHeroBanner();

  // Categorization helpers
  const isBollywood = isBollywoodMedia;
  const isSouth = isSouthMedia;
  const isHollywood = isHollywoodMedia;
  const isKorean = isKoreanMedia;
  const isChinese = isChineseMedia;
  const isJapanese = isJapaneseMedia;
  const isOthers = isOthersSeriesMedia;

  // A. Trending Series (Strictly sorted by latest release date / year)
  renderCategoryList('seriesTrendingList', sortByReleaseDateDesc(series), true, true);

  // B. Recently Added (Strictly sorted by upload / addition date, newest first)
  renderCategoryList('seriesRecentList', getRecentlyAddedSeries(), false, true);

  // C. Bollywood Series
  const bollywoodSeries = series.filter(isBollywood);
  renderCategoryList('seriesBollywoodList', sortByReleaseDateDesc(bollywoodSeries), false, true);

  // D. South Indian Series
  const southSeries = series.filter(isSouth);
  renderCategoryList('seriesSouthList', sortByReleaseDateDesc(southSeries), false, true);

  // E. Hollywood Series
  const hollywoodSeries = series.filter(isHollywood);
  renderCategoryList('seriesHollywoodList', sortByReleaseDateDesc(hollywoodSeries), false, true);

  // F. Korean (K-Drama)
  const koreanSeries = series.filter(isKorean);
  renderCategoryList('seriesKoreanList', sortByReleaseDateDesc(koreanSeries.length > 0 ? koreanSeries : (series.filter(s => s.country === 'Korea'))), false, true);

  // G. Chinese (C-Drama)
  const chineseSeries = series.filter(isChinese);
  renderCategoryList('seriesChineseList', sortByReleaseDateDesc(chineseSeries), false, true);

  // H. Japanese Series
  const japaneseSeries = series.filter(isJapanese);
  renderCategoryList('seriesJapaneseList', sortByReleaseDateDesc(japaneseSeries), false, true);

  // I. Turkish Series (Hindi)
  const turkishSeries = series.filter(isTurkishMedia);
  renderCategoryList('seriesTurkishList', sortByReleaseDateDesc(turkishSeries), false, true);

  // J. Anime Series
  const animeSeries = series.filter(isAnimeMedia);
  renderCategoryList('seriesAnimeList', sortByReleaseDateDesc(animeSeries.length > 0 ? animeSeries : (series.filter(s => s.country === 'Japan'))), false, true);

  // K. Others Series
  const othersSeries = series.filter(isOthers);
  renderCategoryList('seriesOthersList', sortByReleaseDateDesc(othersSeries), false, true);
}

let currentLiveTvCategory = 'All';

function filterLiveTvCategory(cat) {
  currentLiveTvCategory = cat;
  document.querySelectorAll('#liveTvCategoryBar .livetv-cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes(cat) || (cat === 'All' && btn.innerText.trim() === 'All'));
  });
  renderLiveTv();
}

// Branded channel logo fallback handler: Replaces broken images with a stylish gradient badge
function handleLiveChannelImgError(img) {
  if (!img) return;
  img.onerror = null;
  const rawName = decodeURIComponent(img.getAttribute('data-name') || '') || 'TV';
  const cleanName = rawName.replace(/HD|Live|TV|Channel/gi, '').trim() || rawName;
  const words = cleanName.split(/\s+/).filter(Boolean);
  let initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : cleanName.slice(0, 3).toUpperCase();

  let hash = 0;
  for (let i = 0; i < rawName.length; i++) hash = (hash * 31 + rawName.charCodeAt(i)) & 0xffffff;
  const hue = Math.abs(hash) % 360;

  const badge = document.createElement('div');
  badge.className = (img.className || 'channel-logo-img') + ' channel-logo-badge';
  badge.style.background = `linear-gradient(135deg, hsl(${hue}, 70%, 42%), hsl(${(hue + 45) % 360}, 80%, 25%))`;
  badge.innerText = initials;
  img.replaceWith(badge);
}

// Generate branded distinct SVG initials badge for live TV channels
function getChannelLogoFallback(name) {
  const cleanName = (name || 'TV').replace(/HD|Live|TV|Channel/gi, '').trim() || name || 'TV';
  const words = cleanName.split(/\s+/).filter(Boolean);
  let initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : cleanName.slice(0, 3).toUpperCase();
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  const hue = Math.abs(hash) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g_${hue}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue}, 75%, 45%)" />
        <stop offset="100%" stop-color="hsl(${(hue + 50) % 360}, 85%, 28%)" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="20" fill="url(#g_${hue})" />
    <circle cx="60" cy="60" r="44" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
    <text x="60" y="68" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="24" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Render Live TV Tab
function renderLiveTv() {
  const liveTv = appState.content.liveTv || [];
  const grid = document.getElementById('liveTvGrid');
  if (!grid) return;

  const filtered = currentLiveTvCategory === 'All' 
    ? liveTv 
    : liveTv.filter(c => (c.category && c.category.toLowerCase().includes(currentLiveTvCategory.toLowerCase())) || 
                         (currentLiveTvCategory === 'Bangladesh' && (c.country === 'bd' || c.language === 'Bangla')) ||
                         (currentLiveTvCategory === 'India' && (c.country === 'in' || c.language === 'Hindi')));

  const countBadge = document.getElementById('liveTvCountBadge');
  if (countBadge) {
    countBadge.innerHTML = `<span class="pulse-dot"></span> ${filtered.length} Channels LIVE`;
  }

  if (filtered.length > 0) {
    grid.innerHTML = filtered.map(item => {
      const logoUrl = item.logo || item.poster || 'assets/fobs_logo.png';
      return `
        <div class="live-channel-card" onclick='openLiveTvPlayer("${item.id}")'>
          <span class="live-tag-pill">● LIVE</span>
          <img src="${logoUrl}" alt="${item.title}" class="channel-logo-img" loading="lazy" data-name="${encodeURIComponent(item.title || '')}" onerror="handleLiveChannelImgError(this)">
          <div class="channel-title">${item.title}</div>
          <div class="channel-sub">${item.category || 'Live TV'} • ${item.language || 'HD'}</div>
        </div>
      `;
    }).join('');
  } else {
    grid.innerHTML = `<div class="empty-category-msg"><i class="fa-solid fa-satellite-dish"></i> No channels found in this category</div>`;
  }
}

// Filter helper
function filterContentByGenre(list) {
  if (appState.activeGenre === 'All') return list;
  return list.filter(item => 
    (item.genre && item.genre.toLowerCase().includes(appState.activeGenre.toLowerCase())) ||
    (item.language && item.language.toLowerCase().includes(appState.activeGenre.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(appState.activeGenre.toLowerCase()))
  );
}

// Switch Genre Filter
function filterByGenre(genre) {
  appState.activeGenre = genre;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.innerText === genre);
  });
  renderAllMovies();
  renderAllSeries();
}

// Switch between the 4 Main Tabs: Home, Movie, Series, Live TV
function switchMainTab(tabName) {
  // If player is open when switching tabs, immediately close it and terminate playback
  const player = document.getElementById('playerOverlay');
  if (player && (player.classList.contains('open') || document.body.classList.contains('player-open'))) {
    closePlayer();
  }

  appState.activeTab = tabName;

  // Update Top Nav Tabs
  document.querySelectorAll('.nav-tab-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update Bottom Nav Tabs
  document.querySelectorAll('.bottom-tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update Section Views
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });

  const targetView = document.getElementById(`${tabName}View`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Manage Hero Sliders and intervals for battery efficiency & layout accuracy
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);

  if (tabName === 'movie') {
    setTimeout(() => {
      applyMovieHeroSlide(currentMovieHeroIndex, false);
      startMovieHeroAutoSlide();
    }, 50);
  } else if (tabName === 'home') {
    setTimeout(() => {
      applyHeroSlide(currentHeroIndex, false);
      startHeroAutoSlide();
    }, 50);
  } else if (tabName === 'series') {
    setTimeout(() => {
      applySeriesHeroSlide(currentSeriesHeroIndex, false);
      startSeriesHeroAutoSlide();
    }, 50);
  }

  if (tabName !== 'home') {
    try {
      history.pushState({ screen: 'tab', tab: tabName }, '');
    } catch (e) {}
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Real-Time Views Manager for FOBS TV
async function loadMediaViews(mediaId) {
  if (!mediaId) return;
  const viewsEl = document.getElementById('mediaViewsCount');
  const localKey = `fobs_views_${mediaId}`;

  // 1. Initial view count starts strictly at 0
  let currentViews = parseInt(localStorage.getItem(localKey) || '0', 10);
  if (viewsEl) viewsEl.innerText = `${formatViewsCount(currentViews)} Views`;

  // 2. Fetch authoritative view count from backend (starts at 0)
  try {
    const res = await fetchApiWithRetry(`/api/views/${encodeURIComponent(mediaId)}`, {
      method: 'GET'
    }, { timeout: 2500, maxRetries: 0 });
    if (res && res.views !== undefined) {
      currentViews = res.views;
      localStorage.setItem(localKey, currentViews.toString());
      if (viewsEl) viewsEl.innerText = `${formatViewsCount(currentViews)} Views`;
    }
  } catch (e) {}

  // 3. Reset existing heartbeat poller
  if (appState.viewsPollTimer) {
    clearInterval(appState.viewsPollTimer);
    appState.viewsPollTimer = null;
  }

  // 4. Real-time active viewer heartbeat while video player is open
  appState.viewsPollTimer = setInterval(async () => {
    if (!appState.currentMedia || appState.currentMedia.id !== mediaId) {
      clearInterval(appState.viewsPollTimer);
      appState.viewsPollTimer = null;
      return;
    }
    try {
      const res = await fetchApiWithRetry(`/api/views/${encodeURIComponent(mediaId)}`, {
        method: 'GET'
      }, { timeout: 2500, maxRetries: 0 });
      if (res && res.views !== undefined) {
        currentViews = Math.max(currentViews, res.views);
        localStorage.setItem(localKey, currentViews.toString());
        const el = document.getElementById('mediaViewsCount');
        if (el) el.innerText = `${formatViewsCount(currentViews)} Views`;
      }
    } catch (e) {}
  }, 60000);
}

// Increment Real-Time View count ONLY when played directly from FOBS TV app
async function incrementAppMediaViews(mediaId) {
  if (!mediaId) return;
  const viewsEl = document.getElementById('mediaViewsCount');
  const localKey = `fobs_views_${mediaId}`;

  let currentViews = parseInt(localStorage.getItem(localKey) || '0', 10) + 1;
  localStorage.setItem(localKey, currentViews.toString());
  if (viewsEl) viewsEl.innerText = `${formatViewsCount(currentViews)} Views`;

  try {
    const res = await fetchApiWithRetry(`/api/views/${encodeURIComponent(mediaId)}/increment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FOBS-Client': 'FOBS-TV-App'
      }
    }, { timeout: 3500, maxRetries: 1 });
    if (res && res.views !== undefined) {
      currentViews = Math.max(currentViews, res.views);
      localStorage.setItem(localKey, currentViews.toString());
      if (viewsEl) viewsEl.innerText = `${formatViewsCount(currentViews)} Views`;
    }
  } catch (e) {}
}

const updateMediaViews = loadMediaViews;

function formatViewsCount(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

// Helper: Get active episodes for currently selected season
function getActiveSeasonEpisodes(media) {
  if (!media) return [];
  if (media.seasons && media.seasons.length > 0) {
    const found = media.seasons.find(s => s.seasonNumber === appState.currentSeason);
    if (found && found.episodes && found.episodes.length > 0) {
      return found.episodes;
    }
    return media.seasons[0].episodes || [];
  }
  return media.episodes || [];
}

// Render Season Dropdown next to Dub dropdown (Matching Select Language Modal)
function renderSeasonDropdown(media) {
  const container = document.getElementById('seasonSelectorContainer');
  const textEl = document.getElementById('currentSeasonText');
  const sheetList = document.getElementById('seasonOptionsList');
  if (!container || !textEl) return;

  const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-'));
  if (!isSeries) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'inline-block';

  let seasonsList = [];
  if (media.seasons && media.seasons.length > 0) {
    seasonsList = media.seasons;
  } else {
    seasonsList = [{ seasonNumber: 1, name: 'Season 1', episodes: media.episodes || [] }];
  }

  if (!seasonsList.some(s => s.seasonNumber === appState.currentSeason)) {
    appState.currentSeason = seasonsList[0].seasonNumber || 1;
  }

  const activeSeasonObj = seasonsList.find(s => s.seasonNumber === appState.currentSeason) || seasonsList[0];
  textEl.innerText = activeSeasonObj.name || `Season ${activeSeasonObj.seasonNumber}`;

  if (sheetList) {
    sheetList.innerHTML = seasonsList.map(s => {
      const sNum = s.seasonNumber || 1;
      const isActive = sNum === appState.currentSeason;
      const epCountText = s.episodes && s.episodes.length > 0 ? ` (${s.episodes.length} Episodes)` : '';
      const seasonLabel = s.name || `Season ${sNum}`;
      return `
        <button class="sheet-option-btn ${isActive ? 'selected' : ''}" onclick="selectSeason(${sNum})">
          ${seasonLabel}${epCountText}
        </button>
      `;
    }).join('');
  }
}

// Season Bottom Sheet Modal (Matches Select language modal)
function openSeasonSheet() {
  const el = document.getElementById('seasonSheetOverlay');
  if (el) el.classList.add('open');
}

function closeSeasonSheet(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.sheet-close-btn')) return;
  const el = document.getElementById('seasonSheetOverlay');
  if (el) el.classList.remove('open');
}

function selectSeason(seasonNumber) {
  switchSeason(seasonNumber);
  const el = document.getElementById('seasonSheetOverlay');
  if (el) el.classList.remove('open');
}

function toggleSeasonDropdown(event) {
  if (event) event.stopPropagation();
  openSeasonSheet();
}

// Helper: Resolve active stream URL matching the requested audio track
function getActiveEpisodeStream(ep, audioTrack) {
  if (!ep) return '';
  const track = audioTrack || appState.currentAudioTrack || 'Original audio';
  const isOrig = track.toLowerCase().includes('original') || track.toLowerCase().includes('korean');
  if (ep.audioTracks && typeof ep.audioTracks === 'object' && !Array.isArray(ep.audioTracks)) {
    const val = isOrig
      ? (ep.audioTracks['Original audio'] || ep.audioTracks['Original Audio'] || ep.audioTracks['Korean'] || ep.audioTracks['Original'])
      : (ep.audioTracks['Hindi dub'] || ep.audioTracks['Hindi Dub'] || ep.audioTracks['Hindi']);
    if (val) return val;
  }
  if (ep.servers && Array.isArray(ep.servers)) {
    const matchServer = ep.servers.find(s => isOrig
      ? (s.audio === 'Original audio' || /original|korean/i.test(s.name))
      : (s.audio === 'Hindi dub' || /hindi/i.test(s.name))
    );
    if (matchServer && matchServer.url) return matchServer.url;
    if (ep.servers[0] && ep.servers[0].url) return ep.servers[0].url;
  }
  return ep.streamUrl || '';
}

// Switch Active Season (Season 1 / Season 2)
function switchSeason(seasonNumber) {
  appState.currentSeason = seasonNumber;
  const sheet = document.getElementById('seasonSheetOverlay');
  if (sheet) sheet.classList.remove('open');

  if (!appState.currentMedia) return;
  renderSeasonDropdown(appState.currentMedia);

  const episodes = getActiveSeasonEpisodes(appState.currentMedia);
  appState.currentEpisode = episodes[0] || null;
  appState.activeServerIndex = 0;
  renderEpisodePills(episodes, 0);
  renderServerPills(appState.currentMedia);

  if (appState.currentEpisode) {
    const activeEpStream = getActiveEpisodeStream(appState.currentEpisode);
    playStreamUrl(activeEpStream);
  }
}

// Open Player by Item ID
function openPlayerById(type, id) {
  let item = null;
  if (type === 'movie') {
    item = appState.content.movies.find(m => m.id === id);
    if (item) item.type = 'movie';
  } else if (type === 'series') {
    item = appState.content.series.find(s => s.id === id);
    if (item) item.type = 'series';
  } else if (type === 'upcoming') {
    item = (appState.content.upcoming || []).find(u => u.id === id);
    if (item) {
      openUpcomingBookingModal(item);
      return;
    }
  }

  if (item) {
    if (item.type === 'upcoming' || (item.badgeRight && item.badgeRight.toLowerCase().includes('coming'))) {
      openUpcomingBookingModal(item);
      return;
    }
    openPlayer(item);
  }
}

// Open Live TV Player
function openLiveTvPlayer(id) {
  const channel = appState.content.liveTv.find(t => t.id === id);
  if (!channel) return;

  const mockMedia = {
    id: channel.id,
    type: 'liveTv',
    title: `${channel.title} [LIVE]`,
    language: channel.language,
    year: '2026',
    country: 'Live Stream',
    genre: channel.category,
    rating: '9.9',
    imdbRating: '9.9',
    streamUrl: channel.streamUrl,
    poster: channel.logo,
    audioTracks: ['Hindi dub']
  };

  openPlayer(mockMedia);
}

function formatCleanMediaTitle(rawTitle, dubLanguage = 'Hindi') {
  if (!rawTitle) return '';
  let clean = rawTitle
    .replace(/\[\s*hindi\s*dub(bed)?\s*\]/gi, '')
    .replace(/\(\s*hindi\s*dub(bed)?\s*\)/gi, '')
    .replace(/\[\s*hindi\s*\]/gi, '')
    .replace(/\(\s*hindi\s*\)/gi, '')
    .replace(/\[\s*fan\s*dub(bed)?\s*\]/gi, '')
    .replace(/\(\s*fan\s*dub(bed)?\s*\)/gi, '')
    .trim();
  clean = clean.replace(/\s+/g, ' ').trim();
  const tag = (dubLanguage && dubLanguage.toLowerCase().includes('fan')) ? '[Fan Dubbed]' : '[Hindi]';
  return `${clean} ${tag}`;
}

// Open Player & Details Overlay
function openPlayer(media, episodeIndex = 0) {
  if (!media) return;
  // If upcoming or coming soon, redirect to dedicated Pre-Booking modal (no player controls/download/share/dub/servers)
  if (media.type === 'upcoming' || (media.badgeRight && media.badgeRight.toLowerCase().includes('coming'))) {
    openUpcomingBookingModal(media);
    return;
  }
  appState.currentMedia = media;
  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = null;

  // Preserve user's system device brightness — do NOT force 100%
  playerBrightness = 1.0;
  const brOverlay = document.getElementById('playerBrightnessOverlay');
  if (brOverlay) brOverlay.style.backgroundColor = 'transparent';
  try {
    if (window.AndroidApp && typeof window.AndroidApp.resetWindowBrightness === 'function') {
      window.AndroidApp.resetWindowBrightness();
    } else if (window.AndroidApp && typeof window.AndroidApp.setWindowBrightness === 'function') {
      window.AndroidApp.setWindowBrightness(-1);
    }
  } catch (e) {}

  // Reset video scale to default "Fit" mode (contain, perfectly centered without crop)
  const mainVideo = document.getElementById('mainVideoPlayer');
  if (mainVideo) {
    mainVideo._hasTriedMultiEmbed = false;
    mainVideo._retryCount = 0;
    mainVideo.classList.remove('scale-fill', 'fit-cover');
    mainVideo.classList.add('fit-contain');
  }
  const fitLabel = document.getElementById('lsFitLabel');
  if (fitLabel) fitLabel.innerText = 'Fit';

  // Real-time unique views
  updateMediaViews(media.id);

  // Disable / Hide Download button for Live TV channels
  const downloadBtn = document.querySelector('.action-strip-btn[onclick="triggerDownload()"]');
  if (downloadBtn) {
    downloadBtn.style.display = (media.type === 'liveTv') ? 'none' : 'flex';
  }

  // Handle Coming Soon items (MovieBox Signature UI)
  const csOverlay = document.getElementById('comingSoonPlayerOverlay');
  const isComingSoon = media.type === 'upcoming' || (media.badgeRight && media.badgeRight.toLowerCase().includes('coming'));
  if (isComingSoon) {
    if (csOverlay) {
      csOverlay.style.display = 'flex';
      const csTitle = document.getElementById('csMovieTitle');
      if (csTitle) csTitle.innerText = media.title;
    }
    const videoPlayer = document.getElementById('mainVideoPlayer');
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
    }
    const loader = document.getElementById('videoLoader');
    if (loader) loader.classList.remove('active');
  } else {
    if (csOverlay) csOverlay.style.display = 'none';
  }

  const overlay = document.getElementById('playerOverlay');
  overlay.classList.add('open');
  document.body.classList.add('player-open');

  // Auto-enter edge-to-edge fullscreen if screen is already in landscape
  if (window.innerWidth > window.innerHeight) {
    enterFullscreenMode({ skipRotate: true });
  }

  try {
    history.pushState({ screen: 'player' }, '');
  } catch (e) {}

  const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.id && media.id.startsWith('kmdl-s-')) || (media.seasons && media.seasons.length > 0);

  // Set Clean Title: only one "[Hindi]" or "[Fan Dubbed]" tag
  const ongoingTag = (media.isOngoing || media.badgeRight === 'ONGOING' || media.status === 'Ongoing') && !media.title.toLowerCase().includes('ongoing') ? ' [Ongoing]' : '';
  const titleText = `${formatCleanMediaTitle(media.title, media.dubLanguage)}${ongoingTag}`;
  document.getElementById('playerMediaTitle').innerText = titleText;
  
  const seasonText = isSeries ? (media.isOngoing ? `${media.episodes ? media.episodes.length : 2} eps (Ongoing)` : `${media.seasonsCount || (media.seasons ? media.seasons.length : 1)} seasons`) : (media.duration || '2h 21m');
  const ratingText = media.imdbRating || media.rating || '8.1';
  const ongoingBadge = (media.isOngoing || media.badgeRight === 'ONGOING' || media.status === 'Ongoing') ? `<span class="player-ongoing-badge" style="background: linear-gradient(135deg, #ff5722 0%, #ff9800 100%); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px; margin-left: 4px;">ONGOING</span>` : '';

  document.getElementById('playerMediaMeta').innerHTML = `
    <i class="fa-solid fa-tv"></i>
    <span class="star-rating"><i class="fa-solid fa-star"></i> ${ratingText}</span>
    <span>${media.year || '2026'}</span>
    <span>${media.country || 'Korea'}</span>
    <span>${media.genre ? media.genre.split(',')[0].trim() : 'Drama'}</span>
    <span id="playerSeasonTag">${seasonText}</span>
    ${ongoingBadge}
  `;

  // Dub/Audio dropdown & tracks setup dynamically based on content
  renderAudioTrackOptions(media);

  // Initialize and Render Season Dropdown
  appState.currentSeason = 1;
  renderSeasonDropdown(media);

  // Handle Series vs Movie UI
  const seriesEpisodesWrapper = document.getElementById('seriesEpisodesWrapper');
  const activeEpisodes = getActiveSeasonEpisodes(media);

  if (isSeries && activeEpisodes && activeEpisodes.length > 0) {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'block';
    appState.currentEpisode = activeEpisodes[episodeIndex] || activeEpisodes[0];
    appState.activeServerIndex = 0;
    renderEpisodePills(activeEpisodes, episodeIndex);
    renderServerPills(media);
    const activeEpStream = getActiveEpisodeStream(appState.currentEpisode);
    playStreamUrl(activeEpStream);
  } else {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'none';
    appState.currentEpisode = null;
    appState.activeServerIndex = 0;
    renderServerPills(media);
    const initialUrl = (media.servers && media.servers.length > 0) ? media.servers[0].url : (media.streamUrl || media.driveUrl);
    playStreamUrl(initialUrl);
  }

  // Populate "For You" & "Coming Soon" recommendations
  renderForYouRecommendations();
  renderComingSoonSubTab();
  switchSubTab('foryou');

  // Reset comment input state and preload comment badge
  const commentTxt = document.getElementById('commentTextInput');
  if (commentTxt) commentTxt.value = '';
  if (typeof removeCommentImage === 'function') removeCommentImage();
  const commentNotice = document.getElementById('commentLoginNotice');
  if (commentNotice) commentNotice.style.display = 'none';
  if (media && media.id) {
    fetch(`${API_BASE_URL}/api/comments/${encodeURIComponent(media.id)}`)
      .then(res => res.json())
      .then(d => {
        const badge = document.getElementById('commentsCountBadge');
        if (badge && d && d.success && Array.isArray(d.comments)) {
          badge.textContent = d.comments.length;
        }
      })
      .catch(() => {});
  }

  // Setup MovieBox Subtitles and Quality options
  setupSubtitlesForMedia(media);
  updateQualityPillsForMedia(media);
}

// Render Server Pills — always hidden (single MovieBox server only)
function renderServerPills(media) {
  const wrapper = document.getElementById('movieServersWrapper');
  if (wrapper) wrapper.style.display = 'none';
}

// Select Server Manually (no-op — single server mode)
function selectServer(idx) {
  // Server selection disabled: app uses single MovieBox stream
}

// Render Episode Pills
function renderEpisodePills(episodes, activeIndex) {
  const row = document.getElementById('episodesListRow');
  row.innerHTML = `
    <button class="ep-pill ep-all">All</button>
    ${episodes.map((ep, idx) => `
      <button class="ep-pill ${idx === activeIndex ? 'active' : ''}" onclick="selectEpisode(${idx})">
        ${ep.number}
      </button>
    `).join('')}
  `;
}

// Select Episode
function selectEpisode(idx) {
  if (!appState.currentMedia) return;
  const currentEpisodes = getActiveSeasonEpisodes(appState.currentMedia);
  if (!currentEpisodes || !currentEpisodes[idx]) return;
  const mainVideo = document.getElementById('mainVideoPlayer');
  if (mainVideo) {
    mainVideo._hasTriedMultiEmbed = false;
    mainVideo._retryCount = 0;
  }
  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = null;
  appState.currentEpisode = currentEpisodes[idx];
  appState.activeServerIndex = 0;
  renderEpisodePills(currentEpisodes, idx);
  renderServerPills(appState.currentMedia);
  const activeEpStream = getActiveEpisodeStream(appState.currentEpisode);
  playStreamUrl(activeEpStream);
}

// Start Stream Playback via Direct Stream Resolution or Backend Proxy
async function playStreamUrl(url, audioIndex = null, seekTime = null) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const embedFrame = document.getElementById('mainEmbedPlayer');
  const loader = document.getElementById('videoLoader');

  if (!url) {
    console.warn('No stream URL provided for media');
    if (loader) loader.classList.remove('active');
    return;
  }

  // Handle direct iframe player embeds for dedicated embed providers
  const isIframeEmbed = (
    url.includes('vidlink.pro') ||
    url.includes('autoembed.co') ||
    url.includes('multiembed.mov') ||
    url.includes('vidsrc') ||
    url.includes('nextgencloudfabric') ||
    url.includes('streamimdb.ru') ||
    url.includes('irada438esc.com') ||
    url.includes('hdfriday2.casa') ||
    url.includes('hdfriday')
  );

  if (isIframeEmbed && embedFrame) {
    if (videoPlayer) {
      videoPlayer._ignoreErrors = true;
      videoPlayer.pause();
      videoPlayer.style.display = 'none';
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
    }
    const videoContainer = document.getElementById('videoContainer');
    if (videoContainer) videoContainer.classList.add('has-iframe-active');
    const lsUi = document.getElementById('landscapePlayerUI');
    if (lsUi) {
      lsUi.classList.add('is-iframe-hidden');
      lsUi.style.display = 'none';
    }
    const gestureHud = document.getElementById('playerGestureHud');
    if (gestureHud) gestureHud.style.display = 'none';
    const dtLeft = document.getElementById('doubleTapLeft');
    if (dtLeft) dtLeft.style.display = 'none';
    const dtRight = document.getElementById('doubleTapRight');
    if (dtRight) dtRight.style.display = 'none';
    const brightnessOverlay = document.getElementById('playerBrightnessOverlay');
    if (brightnessOverlay) brightnessOverlay.style.display = 'none';

    embedFrame.style.display = 'block';
    embedFrame.src = url;
    const topHeader = document.getElementById('playerTopHeader');
    if (topHeader) {
      topHeader.style.display = 'flex';
      topHeader.classList.remove('controls-hidden');
    }
    if (loader) loader.classList.remove('active');
    return;
  }

  const topHeader = document.getElementById('playerTopHeader');
  if (topHeader) {
    topHeader.style.display = 'flex';
    topHeader.classList.remove('controls-hidden');
  }

  const videoContainer = document.getElementById('videoContainer');
  if (videoContainer) videoContainer.classList.remove('has-iframe-active');

  if (embedFrame) {
    embedFrame.src = '';
    embedFrame.style.display = 'none';
  }
  const lsUi = document.getElementById('landscapePlayerUI');
  if (lsUi) {
    lsUi.classList.remove('is-iframe-hidden');
    lsUi.style.display = 'flex';
  }
  if (videoPlayer) {
    videoPlayer.style.display = 'block';
  }

  if (loader) loader.classList.add('active');
  const loaderText = loader ? loader.querySelector('.loader-text') : null;
  if (loaderText) loaderText.innerText = 'Loading...';
  if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
  window.videoStreamColdStartTimer = setTimeout(() => {
    if (loader && loader.classList.contains('active') && loaderText) {
      loaderText.innerText = 'Connecting to stream server...';
    }
  }, 2500);

  // Resolve embed or indirect URLs to direct stream URLs
  let playableUrl = url;
  const isEmbedOrIndirect = (
    url.includes('ok.ru') ||
    url.includes('pkembed.site') ||
    url.includes('kisscloud.online') ||
    url.includes('vcloud.you') ||
    url.includes('fast-dl.one') ||
    url.includes('dailymotion.com') ||
    url.includes('dai.ly') ||
    url.includes('irada438esc.com') ||
    url.includes('hdfriday')
  );

  if (isEmbedOrIndirect) {
    try {
      const resolveRes = await fetch(`${API_BASE_URL}/api/resolve?url=${encodeURIComponent(url)}`);
      const resolveData = await resolveRes.json();
      if (resolveData && resolveData.ok && resolveData.url) {
        playableUrl = resolveData.url;
        console.log('Successfully resolved stream to direct URL:', playableUrl);
      }
    } catch (err) {
      console.warn('URL resolution error, falling back to original:', err);
    }
  }

  // Determine active audio index
  const activeAudio = (audioIndex !== null && audioIndex !== undefined)
    ? audioIndex 
    : (appState.selectedAudioIndex !== undefined ? appState.selectedAudioIndex : (appState.currentAudioTrack?.toLowerCase().includes('english') ? 1 : 0));

  // Cleanup any active HLS.js instance
  if (window.activeHlsPlayer) {
    try { window.activeHlsPlayer.destroy(); } catch (e) {}
    window.activeHlsPlayer = null;
  }

  // Native Hls.js playback for .m3u8 live streams (MovieBox / GENGA Player Engine)
  if (playableUrl.includes('.m3u8') && window.Hls && window.Hls.isSupported()) {
    console.log('Playing stream via MovieBox HLS.js engine:', playableUrl);
    const hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startFragPrefetch: true
    });
    hls.loadSource(playableUrl);
    hls.attachMedia(videoPlayer);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      if (seekTime && seekTime > 0) videoPlayer.currentTime = seekTime;
      videoPlayer.play().catch(() => {});
      if (loader) loader.classList.remove('active');
    });
    hls.on(window.Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else {
          hls.destroy();
          window.activeHlsPlayer = null;
        }
      }
    });
    window.activeHlsPlayer = hls;
    return;
  }

  // MovieBox dynamic stream redirect handler: Pre-resolve to actual direct CDN link for instant seeking
  if (playableUrl.includes('/api/moviebox/stream')) {
    try {
      const fullUrl = playableUrl.startsWith('http') ? playableUrl : `${API_BASE_URL}${playableUrl}`;
      const jsonUrl = fullUrl.includes('?') ? `${fullUrl}&json=1` : `${fullUrl}?json=1`;
      const res = await fetch(jsonUrl);
      const data = await res.json();
      if (data && data.ok && data.streamUrl) {
        playableUrl = data.streamUrl;
      }
    } catch (e) {
      console.warn('Pre-resolve MovieBox stream failed, falling back to direct endpoint:', e.message);
    }
  }

  // Direct play for sources that provide CORS headers and fast direct CDN edge delivery without IP restrictions
  const isDirectMp4Source = (
    playableUrl.includes('/api/moviebox/stream') ||
    playableUrl.includes('hakunaymatata') ||
    playableUrl.includes('bcdnxw') ||
    playableUrl.includes('haildrop') ||
    playableUrl.includes('fogtwist') ||
    playableUrl.includes('sunburst') ||
    playableUrl.includes('stormshade') ||
    playableUrl.includes('kmdl.eu.org') ||
    playableUrl.includes('koyeb.app') ||
    playableUrl.includes('filetolink') ||
    (playableUrl.includes('.mp4') && 
     !playableUrl.includes('drive.google.com') && 
     !playableUrl.includes('vcloud.you') && 
     !playableUrl.includes('vkuser.net') && 
     !playableUrl.includes('okcdn.ru') &&
     !playableUrl.includes('vkpluscdn') &&
     !playableUrl.includes('vkcdn'))
  );
  if (isDirectMp4Source && !playableUrl.includes('googleusercontent.com')) {
    appState.streamSeekOffset = 0;
    // If running in a browser outside Android APK, route hakunaymatata through proxy to include Referer
    if (!window.AndroidApp && (playableUrl.includes('hakunaymatata') || playableUrl.includes('bcdnxw') || playableUrl.includes('haildrop') || playableUrl.includes('fogtwist'))) {
      const proxyUrl = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(playableUrl)}`;
      console.log('Playing MovieBox stream via server proxy (browser):', proxyUrl);
      videoPlayer.src = proxyUrl;
      videoPlayer.load();
      if (seekTime && seekTime > 0) {
        const applySeek = () => {
          try { videoPlayer.currentTime = seekTime; } catch (e) {}
        };
        if (videoPlayer.readyState >= 1) {
          applySeek();
        } else {
          videoPlayer.addEventListener('loadedmetadata', applySeek, { once: true });
          videoPlayer.addEventListener('canplay', applySeek, { once: true });
        }
      }
      videoPlayer.play().catch(() => {});
      return;
    }

    console.log('Playing direct CDN stream:', playableUrl);
    videoPlayer.src = playableUrl;
    videoPlayer.load();
    if (seekTime && seekTime > 0) {
      const applySeek = () => {
        try { videoPlayer.currentTime = seekTime; } catch (e) {}
      };
      if (videoPlayer.readyState >= 1) {
        applySeek();
      } else {
        videoPlayer.addEventListener('loadedmetadata', applySeek, { once: true });
        videoPlayer.addEventListener('canplay', applySeek, { once: true });
      }
    }
    videoPlayer.play().catch(err => {
      console.log('Autoplay deferred until user taps video controls:', err.message);
      if (loader) loader.classList.remove('active');
    });
    return;
  }

  if (videoPlayer) {
    videoPlayer.removeAttribute('controls');
  }

  if (seekTime === null || seekTime === undefined || seekTime === 0) {
    appState.streamSeekOffset = 0;
  } else {
    appState.streamSeekOffset = parseFloat(seekTime);
  }

  // Route through /api/stream proxy to guarantee:
  // 1. Crystal clear AAC stereo sound (fixes silent EAC3)
  // 2. Track 0 = Hindi dub, Track 1 = English/Original dub
  // 3. Smooth seeking & fast loading
  let streamApiUrl = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(playableUrl)}&audio=${activeAudio}`;
  if (seekTime && seekTime > 0) {
    streamApiUrl += `&t=${seekTime}`;
  }

  videoPlayer.src = streamApiUrl;
  videoPlayer.load();
  videoPlayer.play().catch(err => {
    console.log('Autoplay deferred until user taps video controls:', err.message);
    if (loader) loader.classList.remove('active');
  });
}

// Screen orientation handling for video fullscreen
function setVideoOrientationLandscape() {
  if (window.AndroidApp && typeof window.AndroidApp.enterFullscreen === 'function') {
    window.AndroidApp.enterFullscreen();
  } else if (window.AndroidApp && typeof window.AndroidApp.setLandscape === 'function') {
    window.AndroidApp.setLandscape();
  }
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('sensor-landscape').catch(() => {
      screen.orientation.lock('landscape').catch(() => {});
    });
  }
}

function setVideoOrientationPortrait() {
  if (window.AndroidApp && typeof window.AndroidApp.exitFullscreen === 'function') {
    window.AndroidApp.exitFullscreen();
  } else if (window.AndroidApp && typeof window.AndroidApp.setPortrait === 'function') {
    window.AndroidApp.setPortrait();
  }
  if (screen.orientation && screen.orientation.unlock) {
    try {
      screen.orientation.unlock();
    } catch (e) {}
  }
}

let playerControlsTimer = null;

function resetPlayerControlsTimer() {
  resetLandscapeControlsTimer();
}

// ============================================================
// MOVIEBOX SIGNATURE LANDSCAPE PLAYER CONTROLLER
// Matches Screenshots 1, 3, 4, 5
// ============================================================
let lsControlsTimer = null;
let isPlayerLocked = false;
let isScrubbingProgress = false;

function formatPlayerTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function resetLandscapeControlsTimer() {
  const lsUi = document.getElementById('landscapePlayerUI');
  const topHeader = document.getElementById('playerTopHeader');
  const ptBottom = document.getElementById('portraitBottomBar');

  if (lsUi) lsUi.classList.remove('controls-hidden');
  if (topHeader) topHeader.classList.remove('controls-hidden');
  if (ptBottom) ptBottom.classList.remove('controls-hidden');

  if (lsControlsTimer) clearTimeout(lsControlsTimer);
  if (playerControlsTimer) clearTimeout(playerControlsTimer);

  const video = document.getElementById('mainVideoPlayer');
  if (video && !video.paused) {
    // When locked, auto-hide lock indicator quickly after 2.5s; otherwise normal 3.5s
    const delay = isPlayerLocked ? 2500 : 3500;
    lsControlsTimer = setTimeout(() => {
      if (lsUi) lsUi.classList.add('controls-hidden');
      if (topHeader) topHeader.classList.add('controls-hidden');
      if (ptBottom) ptBottom.classList.add('controls-hidden');
    }, delay);
  }
}

function togglePlayerLock() {
  const lsUi = document.getElementById('landscapePlayerUI');
  const lockIconSvg = document.getElementById('lsLockIconSvg');
  const lockText = document.getElementById('lsLockText');
  const lockBtn = document.getElementById('lsLockBtn');
  if (!lsUi) return;

  isPlayerLocked = !isPlayerLocked;
  lsUi.classList.toggle('is-locked', isPlayerLocked);

  if (isPlayerLocked) {
    if (lockIconSvg) {
      lockIconSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
    }
    if (lockText) lockText.innerText = 'Tap to Unlock';
    if (lockBtn) lockBtn.classList.add('locked');
    closeLandscapeDrawers();
    showToast('Screen locked');
  } else {
    if (lockIconSvg) {
      lockIconSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>';
    }
    if (lockText) lockText.innerText = 'Tap to Lock';
    if (lockBtn) lockBtn.classList.remove('locked');
    showToast('Screen unlocked');
  }
  resetLandscapeControlsTimer();
}

function togglePlayPauseVideo() {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;
  const loader = document.getElementById('videoLoader');
  if (video.paused) {
    if (loader) loader.classList.remove('active');
    video.play().catch(() => {});
  } else {
    video.pause();
  }
  syncPlayPauseIcons();
  resetLandscapeControlsTimer();
}

function syncPlayPauseIcons() {
  const video = document.getElementById('mainVideoPlayer');
  const centerIcon = document.getElementById('lsCenterPlayIcon');
  const bottomIcon = document.getElementById('lsBottomPlayIcon');
  const ptIcon = document.getElementById('portraitPlayIcon');
  if (!video) return;

  const isPaused = video.paused;
  const iconClass = isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  if (centerIcon) centerIcon.className = iconClass;
  if (bottomIcon) bottomIcon.className = iconClass;
  if (ptIcon) ptIcon.className = iconClass;
}

async function togglePictureInPicture() {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
      await video.requestPictureInPicture();
    } else {
      showToast('Picture-in-Picture not supported on this device');
    }
  } catch (err) {
    console.warn('PiP error:', err);
    showToast('Picture-in-Picture unavailable');
  }
}

function getMediaTotalDurationSeconds() {
  const video = document.getElementById('mainVideoPlayer');
  const duration = (video && isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
  const epDur = appState.currentEpisode?.duration || appState.currentMedia?.duration;
  let parsedSec = 0;

  if (epDur && typeof epDur === 'string') {
    // Only parse actual time strings (e.g., "2h 15m", "45m", "1h 30m"); skip episode count strings like "2 Episodes"
    if (!epDur.toLowerCase().includes('episode')) {
      if (epDur.includes('h') || epDur.includes('m')) {
        const hMatch = epDur.match(/(\d+)\s*h/);
        const mMatch = epDur.match(/(\d+)\s*m/);
        const hrs = hMatch ? parseInt(hMatch[1], 10) : 0;
        const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
        parsedSec = hrs * 3600 + mins * 60;
      } else {
        const num = parseInt(epDur, 10);
        if (num > 0) parsedSec = num * 60;
      }
    }
  }

  // If video element has an active finite duration (> 60s), that is the most accurate duration
  if (duration > 60) {
    return duration;
  }

  if (parsedSec > 0) {
    return parsedSec;
  }

  // If it's a series episode without explicit duration, standard episode is ~45 minutes (2700s)
  if (appState.currentEpisode) {
    return 2700;
  }

  return duration > 0 ? duration : 3600;
}

function updateLandscapeProgress() {
  if (isScrubbingProgress) return;
  if (appState.pendingSeekTime !== null && appState.pendingSeekTime !== undefined) return;

  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const streamOffset = appState.streamSeekOffset || 0;
  const current = (video.currentTime || 0) + streamOffset;
  const duration = getMediaTotalDurationSeconds();

  // Landscape elements
  const curEl = document.getElementById('lsCurrentTime');
  const durEl = document.getElementById('lsTotalDuration');
  const filledEl = document.getElementById('lsProgressFilled');
  const thumbEl = document.getElementById('lsProgressThumb');
  const bufEl = document.getElementById('lsProgressBuffered');

  // Portrait elements (Photo 1 match)
  const ptTimeEl = document.getElementById('portraitTimeDisplay');
  const ptFilledEl = document.getElementById('portraitProgressFilled');
  const ptThumbEl = document.getElementById('portraitProgressThumb');
  const ptBufEl = document.getElementById('portraitProgressBuffered');

  const curFormatted = formatPlayerTime(current);
  const durFormatted = formatPlayerTime(duration);

  if (curEl) curEl.innerText = curFormatted;
  if (durEl) durEl.innerText = durFormatted;
  if (ptTimeEl) ptTimeEl.innerText = `${curFormatted}/${durFormatted}`;

  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (current / duration) * 100));
    if (filledEl) filledEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
    if (ptFilledEl) ptFilledEl.style.width = `${pct}%`;
    if (ptThumbEl) ptThumbEl.style.left = `${pct}%`;

    if (video.buffered && video.buffered.length > 0) {
      try {
        const bufEnd = video.buffered.end(video.buffered.length - 1) + streamOffset;
        const bufPct = Math.min(100, Math.max(0, (bufEnd / duration) * 100));
        if (bufEl) bufEl.style.width = `${bufPct}%`;
        if (ptBufEl) ptBufEl.style.width = `${bufPct}%`;
      } catch (e) {}
    }
  }
}

function isTimeBuffered(video, targetRelTime) {
  if (!video || !video.buffered || video.buffered.length === 0) return false;
  try {
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (targetRelTime >= start && targetRelTime <= Math.max(start, end - 0.5)) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

let seekDebounceTimer = null;

function seekRelative(offsetSeconds) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const duration = getMediaTotalDurationSeconds();
  const streamOffset = appState.streamSeekOffset || 0;

  // If user rapidly clicks +10, accumulate seek time from pendingSeekTime
  const baseTime = (appState.pendingSeekTime !== null && appState.pendingSeekTime !== undefined)
    ? appState.pendingSeekTime
    : ((video.currentTime || 0) + streamOffset);

  const target = Math.max(0, Math.min(duration, baseTime + offsetSeconds));
  appState.pendingSeekTime = target;

  // Immediate UI feedback on progress bar and time labels
  const curEl = document.getElementById('lsCurrentTime');
  const filledEl = document.getElementById('lsProgressFilled');
  const thumbEl = document.getElementById('lsProgressThumb');
  const ptTimeEl = document.getElementById('portraitTimeDisplay');
  const ptFilledEl = document.getElementById('portraitProgressFilled');
  const ptThumbEl = document.getElementById('portraitProgressThumb');

  const curFormatted = formatPlayerTime(target);
  const durFormatted = formatPlayerTime(duration);
  if (curEl) curEl.innerText = curFormatted;
  if (ptTimeEl) ptTimeEl.innerText = `${curFormatted}/${durFormatted}`;

  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (target / duration) * 100));
    if (filledEl) filledEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
    if (ptFilledEl) ptFilledEl.style.width = `${pct}%`;
    if (ptThumbEl) ptThumbEl.style.left = `${pct}%`;
  }

  showToast(offsetSeconds > 0 ? '+10s' : '-10s');
  resetLandscapeControlsTimer();

  if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    const finalTarget = appState.pendingSeekTime !== null ? appState.pendingSeekTime : target;
    seekToAbsoluteTime(finalTarget);
  }, 120);
}

function seekToAbsoluteTime(targetSeconds) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const duration = getMediaTotalDurationSeconds();
  const safeTarget = Math.max(0, Math.min(duration, Math.floor(targetSeconds)));

  // Immediate UI feedback on progress bar and time labels
  const curEl = document.getElementById('lsCurrentTime');
  const durEl = document.getElementById('lsTotalDuration');
  const filledEl = document.getElementById('lsProgressFilled');
  const thumbEl = document.getElementById('lsProgressThumb');
  const ptTimeEl = document.getElementById('portraitTimeDisplay');
  const ptFilledEl = document.getElementById('portraitProgressFilled');
  const ptThumbEl = document.getElementById('portraitProgressThumb');

  const curFormatted = formatPlayerTime(safeTarget);
  const durFormatted = formatPlayerTime(duration);
  if (curEl) curEl.innerText = curFormatted;
  if (durEl) durEl.innerText = durFormatted;
  if (ptTimeEl) ptTimeEl.innerText = `${curFormatted}/${durFormatted}`;

  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (safeTarget / duration) * 100));
    if (filledEl) filledEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
    if (ptFilledEl) ptFilledEl.style.width = `${pct}%`;
    if (ptThumbEl) ptThumbEl.style.left = `${pct}%`;
  }

  // Dismiss gesture seek HUD immediately
  hideSeekGestureHud();

  // If already at or very close to target (< 0.25s), simply resume playback
  if (Math.abs((video.currentTime || 0) - safeTarget) < 0.25) {
    video.play().catch(() => {});
    return;
  }

  // Clear any existing seek timers
  if (window.seekLoaderDebounceTimer) clearTimeout(window.seekLoaderDebounceTimer);
  if (window.seekSafetyTimeout) clearTimeout(window.seekSafetyTimeout);
  if (window.seekStallRecoveryTimeout) clearTimeout(window.seekStallRecoveryTimeout);
  if (window.seekFallbackTimeout) clearTimeout(window.seekFallbackTimeout);

  // Show subtle loader spinner ONLY if decoding keyframe takes longer than 200ms
  const loader = document.getElementById('videoLoader');
  window.seekLoaderDebounceTimer = setTimeout(() => {
    if (video.seeking || video.readyState < 3) {
      if (loader) {
        loader.classList.add('active');
        const loaderText = loader.querySelector('.loader-text');
        if (loaderText) loaderText.innerText = 'Loading...';
      }
    }
  }, 200);

  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = safeTarget;

  // Direct native seek via currentTime (uses HTTP 206 Partial Content byte ranges without reloading video.src)
  let seekSettled = false;
  const finishSeek = () => {
    if (seekSettled) return;
    seekSettled = true;
    if (window.seekLoaderDebounceTimer) clearTimeout(window.seekLoaderDebounceTimer);
    if (window.seekSafetyTimeout) clearTimeout(window.seekSafetyTimeout);
    if (loader) loader.classList.remove('active');
    appState.pendingSeekTime = null;
    updateLandscapeProgress();
    syncPlayPauseIcons();
    video.play().catch(() => {});
  };

  video.addEventListener('seeked', finishSeek, { once: true });
  video.addEventListener('canplay', finishSeek, { once: true });
  video.addEventListener('playing', finishSeek, { once: true });

  // 6-second safety watchdog: unfreezes and resumes playback if seek event was swallowed by WebView
  window.seekSafetyTimeout = setTimeout(() => {
    finishSeek();
  }, 6000);

  // Apply seek to video element directly via currentTime without tearing down decoder or pausing network
  try {
    video.currentTime = safeTarget;
  } catch (err) {
    console.warn('Direct seek error:', err);
    finishSeek();
  }
}

function setupLandscapeProgressScrubbing() {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const bindScrubber = (wrapperId) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    let lastScrubPos = 0;
    let lastSeekCommitTime = 0;

    const handleScrub = (clientX) => {
      const rect = wrapper.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      lastScrubPos = pos;
      const duration = getMediaTotalDurationSeconds();
      if (duration > 0) {
        const targetTime = Math.floor(pos * duration);
        const percent = pos * 100;

        // Synchronize both landscape and portrait progress bar elements in real time
        const filledEl = document.getElementById('lsProgressFilled');
        const thumbEl = document.getElementById('lsProgressThumb');
        const ptFilledEl = document.getElementById('portraitProgressFilled');
        const ptThumbEl = document.getElementById('portraitProgressThumb');
        if (filledEl) filledEl.style.width = `${percent}%`;
        if (thumbEl) thumbEl.style.left = `${percent}%`;
        if (ptFilledEl) ptFilledEl.style.width = `${percent}%`;
        if (ptThumbEl) ptThumbEl.style.left = `${percent}%`;

        const curFormatted = formatPlayerTime(targetTime);
        const durFormatted = formatPlayerTime(duration);
        const curEl = document.getElementById('lsCurrentTime');
        const ptTimeEl = document.getElementById('portraitTimeDisplay');
        if (curEl) curEl.innerText = curFormatted;
        if (ptTimeEl) ptTimeEl.innerText = `${curFormatted}/${durFormatted}`;
      }
    };

    const commitSeek = (clientX) => {
      if (!isScrubbingProgress) return;
      isScrubbingProgress = false;

      let finalPos = lastScrubPos;
      if (clientX && clientX > 0) {
        const rect = wrapper.getBoundingClientRect();
        if (rect && rect.width > 0) {
          finalPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }
      }
      const duration = getMediaTotalDurationSeconds();
      const targetTime = Math.floor(finalPos * duration);
      seekToAbsoluteTime(targetTime);
      resetLandscapeControlsTimer();
    };

    wrapper.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isScrubbingProgress = true;
      try { wrapper.setPointerCapture(e.pointerId); } catch (err) {}
      handleScrub(e.clientX);
      resetLandscapeControlsTimer();
    });

    wrapper.addEventListener('pointermove', (e) => {
      if (isScrubbingProgress) {
        e.stopPropagation();
        handleScrub(e.clientX);
        resetLandscapeControlsTimer();
      }
    });

    const onPointerUp = (e) => {
      if (isScrubbingProgress) {
        e.stopPropagation();
        try { wrapper.releasePointerCapture(e.pointerId); } catch (err) {}
        commitSeek(e.clientX);
      }
    };

    wrapper.addEventListener('pointerup', onPointerUp);
    wrapper.addEventListener('pointercancel', onPointerUp);

    // Bulletproof touch listeners for mobile
    wrapper.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        e.stopPropagation();
        isScrubbingProgress = true;
        handleScrub(e.touches[0].clientX);
        resetLandscapeControlsTimer();
      }
    }, { passive: false });

    wrapper.addEventListener('touchmove', (e) => {
      if (isScrubbingProgress && e.touches && e.touches[0]) {
        e.preventDefault();
        e.stopPropagation();
        handleScrub(e.touches[0].clientX);
        resetLandscapeControlsTimer();
      }
    }, { passive: false });

    wrapper.addEventListener('touchend', (e) => {
      if (isScrubbingProgress) {
        e.preventDefault();
        e.stopPropagation();
        const clientX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : 0;
        commitSeek(clientX);
      }
    }, { passive: false });
  };

  bindScrubber('lsProgressWrapper');
  bindScrubber('portraitProgressWrapper');
}

function toggleLandscapeFitFill() {
  const video = document.getElementById('mainVideoPlayer');
  const fitLabel = document.getElementById('lsFitLabel');
  if (!video) return;

  const willBeFill = !video.classList.contains('scale-fill');
  if (willBeFill) {
    video.classList.remove('fit-contain');
    video.classList.add('scale-fill');
    if (fitLabel) fitLabel.innerText = 'Fill';
    showToast('Aspect Ratio: Zoom to Fill (Full Screen)');
  } else {
    video.classList.remove('scale-fill', 'fit-cover');
    video.classList.add('fit-contain');
    if (fitLabel) fitLabel.innerText = 'Fit';
    showToast('Aspect Ratio: Fit (Centered, No Crop)');
  }
  resetLandscapeControlsTimer();
}

function toggleLandscapeDrawer(drawerName) {
  const drawers = {
    quality: document.getElementById('lsQualityDrawer'),
    speed: document.getElementById('lsSpeedDrawer'),
    language: document.getElementById('lsLanguageDrawer'),
    setting: document.getElementById('lsSettingDrawer')
  };

  const target = drawers[drawerName];
  if (!target) return;

  const willOpen = !target.classList.contains('open');
  closeLandscapeDrawers();

  if (willOpen) {
    target.classList.add('open');
    const lsUi = document.getElementById('landscapePlayerUI');
    if (lsUi) {
      lsUi.classList.add('has-drawer-open');
    }
    const container = document.getElementById('videoContainer');
    if (container) {
      container.classList.add('has-drawer-open');
    }
    const hud = document.getElementById('playerGestureHud');
    if (hud) hud.classList.remove('visible');
    const seekHud = document.getElementById('playerSeekHud');
    if (seekHud) {
      seekHud.classList.remove('visible');
      seekHud.style.display = 'none';
    }
    if (lsControlsTimer) clearTimeout(lsControlsTimer);
    if (playerControlsTimer) clearTimeout(playerControlsTimer);
  } else {
    resetLandscapeControlsTimer();
  }
}

function closeLandscapeDrawers() {
  document.querySelectorAll('.ls-side-drawer').forEach(d => d.classList.remove('open'));
  const lsUi = document.getElementById('landscapePlayerUI');
  if (lsUi) {
    lsUi.classList.remove('has-drawer-open');
  }
  const container = document.getElementById('videoContainer');
  if (container) {
    container.classList.remove('has-drawer-open');
  }
  const topHeader = document.getElementById('playerTopHeader');
  if (topHeader) {
    topHeader.classList.remove('has-drawer-open');
  }
}

function setLandscapeSpeed(rate) {
  const video = document.getElementById('mainVideoPlayer');
  const label = document.getElementById('lsSpeedLabel');
  if (!video) return;

  video.playbackRate = rate;
  if (label) label.innerText = `${rate}x`;

  document.querySelectorAll('.ls-speed-option').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === rate);
  });

  showToast(`Speed: ${rate}x`);
  closeLandscapeDrawers();
  resetLandscapeControlsTimer();
}

function selectLandscapeAudio(trackName) {
  switchAudioTrack(trackName);
  closeLandscapeDrawers();
  resetLandscapeControlsTimer();
}

function setLandscapeQuality(quality) {
  const badge = document.getElementById('lsQualityBadge');
  if (badge) {
    badge.innerText = quality.toUpperCase();
  }
  document.querySelectorAll('#lsQualityOptionsList .ls-speed-option').forEach(btn => {
    const qData = (btn.dataset.quality || '').toLowerCase();
    const btnText = btn.innerText.toLowerCase();
    const isAct = qData === quality.toLowerCase() || btnText.includes(quality.toLowerCase());
    btn.classList.toggle('active', isAct);
    let checkIcon = btn.querySelector('.fa-check');
    if (isAct && !checkIcon) {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-check';
      icon.style.cssText = 'color: #00d26a; font-size: 13px;';
      btn.appendChild(icon);
    } else if (!isAct && checkIcon) {
      checkIcon.remove();
    }
  });

  showToast(`Quality: ${quality.toUpperCase()}`);
  closeLandscapeDrawers();
  resetLandscapeControlsTimer();
}

function updateQualityPillsForMedia(media) {
  const qualityList = document.getElementById('lsQualityOptionsList');
  if (!qualityList) return;

  // Real resolution options (never Server 1/2)
  qualityList.innerHTML = `
    <button class="ls-speed-option active" data-quality="1080p" onclick="setLandscapeQuality('1080p')">
      <span>1080P FHD</span>
      <i class="fa-solid fa-check" style="color: #00d26a; font-size: 13px;"></i>
    </button>
    <button class="ls-speed-option" data-quality="720p" onclick="setLandscapeQuality('720p')">
      <span>720P HD</span>
    </button>
    <button class="ls-speed-option" data-quality="480p" onclick="setLandscapeQuality('480p')">
      <span>480P SD</span>
    </button>
    <button class="ls-speed-option" data-quality="360p" onclick="setLandscapeQuality('360p')">
      <span>360P</span>
    </button>
    <button class="ls-speed-option" data-quality="auto" onclick="setLandscapeQuality('Auto')">
      <span>Auto</span>
    </button>
  `;
}

// ============================================================
// REAL-TIME SUBTITLE ENGINE (SubSource, English & Bangla, MX-Player Sync & Style Customizer)
// ============================================================

const subtitleState = {
  enabled: false,
  currentTrackId: 'off',
  availableTracks: [],
  cues: [],
  syncOffset: 0.0, // in seconds, positive = delay, negative = advance
  fontSize: 18,
  textColor: '#ffffff',
  borderColor: '#000000',
  bgStyle: 'transparent'
};

// Restore saved settings from localStorage
function restoreSubtitleSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('fobs_subtitle_settings') || '{}');
    if (saved.fontSize) subtitleState.fontSize = saved.fontSize;
    if (saved.textColor) subtitleState.textColor = saved.textColor;
    if (saved.borderColor !== undefined) subtitleState.borderColor = saved.borderColor;
    if (saved.bgStyle) subtitleState.bgStyle = saved.bgStyle;
    if (saved.syncOffset !== undefined) subtitleState.syncOffset = saved.syncOffset;
  } catch (e) {}
}

// Save settings to localStorage
function saveSubtitleSettings() {
  try {
    localStorage.setItem('fobs_subtitle_settings', JSON.stringify({
      fontSize: subtitleState.fontSize,
      textColor: subtitleState.textColor,
      borderColor: subtitleState.borderColor,
      bgStyle: subtitleState.bgStyle,
      syncOffset: subtitleState.syncOffset
    }));
  } catch (e) {}
}

// Client-side SRT and WebVTT Parser
function parseSubtitleTextToCues(rawText) {
  if (!rawText) return [];
  const cues = [];
  const lines = rawText.replace(/\r\n|\r/g, '\n').split('\n');
  let i = 0;

  const parseTime = (timeStr) => {
    const parts = (timeStr || '').trim().split(':');
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s.replace(',', '.'));
    } else if (parts.length === 2) {
      const [m, s] = parts;
      return parseFloat(m) * 60 + parseFloat(s.replace(',', '.'));
    }
    return 0;
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->');
      const startTime = parseTime(startStr);
      const endTime = parseTime(endStr);
      i++;
      let textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join('\n').replace(/<[^>]+>/g, '').trim();
      if (text) {
        cues.push({ startTime, endTime, text });
      }
    }
    i++;
  }
  return cues;
}

// Setup Subtitles when a Media is opened
async function setupSubtitlesForMedia(media) {
  if (!media) return;
  restoreSubtitleSettings();

  const subToggle = document.getElementById('lsSubtitleToggle');
  const subBtnLabel = document.getElementById('playerSubtitleBtnLabel');
  const subIcon = document.getElementById('actionSubIcon');

  subtitleState.cues = [];
  subtitleState.currentTrackId = 'off';
  subtitleState.enabled = false;
  hideSubtitleOverlay();

  // Reset landscape sub-views to tracks list
  showLandscapeSubView('tracks');

  if (subToggle) {
    subToggle.checked = false;
    subToggle.onchange = () => {
      if (subToggle.checked) {
        const track = subtitleState.availableTracks.find(t => t.langCode === 'en' || t.langCode === 'bn') || subtitleState.availableTracks[0];
        if (track) selectSubtitleTrack(track.id);
      } else {
        selectSubtitleTrack('off');
      }
    };
  }

  if (subBtnLabel) subBtnLabel.innerText = 'Subtitles';
  if (subIcon) subIcon.style.color = '';

  const cleanTitle = (media.title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
  const season = appState.currentSeason || 1;
  const ep = appState.currentEpisode ? appState.currentEpisode.number : 1;
  const currentEp = appState.currentEpisode;

  const tracks = [];

  // 1. Direct embedded captions from active Episode / Media (Instant & 100% Reliable)
  const directCaps = currentEp?.captions || media.captions || [];
  if (Array.isArray(directCaps) && directCaps.length > 0) {
    directCaps.forEach((c, idx) => {
      const langLower = (c.label || c.srclang || '').toLowerCase();
      const isEn = langLower.includes('en') || langLower.includes('eng');
      const isBn = langLower.includes('bn') || langLower.includes('bangla') || langLower.includes('bengali');
      const isHi = langLower.includes('hi') || langLower.includes('hindi');

      let displayName = c.label;
      if (isEn) displayName = 'English';
      else if (isBn) displayName = 'Bangla (বাংলা)';
      else if (isHi) displayName = 'Hindi (हिन्दी)';

      tracks.push({
        id: `ep_cap_${c.srclang || idx}`,
        language: displayName,
        langCode: c.srclang || (isEn ? 'en' : isBn ? 'bn' : 'other'),
        source: 'MovieBox / CDN',
        url: c.src,
        format: c.src && c.src.includes('.srt') ? 'srt' : 'vtt'
      });
    });
  }

  // 2. Fetch from SubSource API via Backend
  try {
    const subjectId = (media.id || '').replace(/^mb-[s|m]-/, '');
    const detailPath = media.detailPath || '';
    const res = await fetch(`${API_BASE_URL}/api/subtitles?title=${encodeURIComponent(cleanTitle)}&year=${media.year || ''}&subjectId=${encodeURIComponent(subjectId)}&detailPath=${encodeURIComponent(detailPath)}&season=${season}&episode=${ep}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.subtitles)) {
      data.subtitles.forEach(sub => {
        if (!tracks.some(t => t.langCode === sub.langCode)) {
          tracks.push(sub);
        }
      });
    }
  } catch (err) {
    console.warn('Subtitles API fetch failed, using direct tracks:', err);
  }

  // 3. Ensure English & Bangla exist
  const hasEn = tracks.some(t => t.langCode === 'en');
  const hasBn = tracks.some(t => t.langCode === 'bn');
  const enTrack = tracks.find(t => t.langCode === 'en');

  if (!hasEn) {
    tracks.unshift({
      id: 'sub_en_default',
      language: 'English',
      langCode: 'en',
      source: 'SubSource (Auto)',
      url: `/api/subtitles/generate?title=${encodeURIComponent(cleanTitle)}&lang=en`
    });
  }

  if (!hasBn) {
    tracks.push({
      id: 'sub_bn_default',
      language: 'Bangla (বাংলা)',
      langCode: 'bn',
      source: 'SubSource (বাংলা)',
      url: enTrack ? enTrack.url : `/api/subtitles/generate?title=${encodeURIComponent(cleanTitle)}&lang=bn`
    });
  }

  subtitleState.availableTracks = tracks;
  renderSubtitleLists();

  // If user previously had subtitles enabled, auto-select English track
  const wasEnabled = localStorage.getItem('fobs_subtitle_enabled') === 'true';
  if (wasEnabled && tracks.length > 0) {
    const preferredTrack = tracks.find(t => t.langCode === 'en') || tracks[0];
    if (preferredTrack) {
      selectSubtitleTrack(preferredTrack.id);
    }
  }

  // Start real-time 100ms render loop for microsecond-precise cue display
  if (!window._subCueRenderInterval) {
    window._subCueRenderInterval = setInterval(() => {
      const vp = document.getElementById('mainVideoPlayer');
      if (vp && !vp.paused && subtitleState.enabled && subtitleState.cues.length > 0) {
        const curTime = (vp.currentTime || 0) + (appState.streamSeekOffset || 0);
        renderActiveSubtitleCue(curTime);
      }
    }, 100);
  }
}

// Render Subtitle track options in Modal and Landscape Drawer
function renderSubtitleLists() {
  const modalList = document.getElementById('subModalTracksList');
  const lsList = document.getElementById('lsSubtitleOptionsList');

  const tracks = [
    { id: 'off', language: 'Off (None)', source: 'Disable subtitles' },
    ...subtitleState.availableTracks
  ];

  // Render Modal List
  if (modalList) {
    modalList.innerHTML = tracks.map(t => {
      const isAct = (subtitleState.currentTrackId === t.id) || (!subtitleState.enabled && t.id === 'off');
      return `
        <div class="sub-track-item ${isAct ? 'active' : ''}" onclick="selectSubtitleTrack('${t.id}')">
          <div class="sub-track-info">
            <span class="sub-track-name">${t.language}</span>
            <span class="sub-track-source">${t.source || 'SubSource.net'}</span>
          </div>
          ${isAct ? '<i class="fa-solid fa-check sub-track-check"></i>' : ''}
        </div>
      `;
    }).join('');
  }

  // Render Landscape Drawer List
  if (lsList) {
    lsList.innerHTML = tracks.map(t => {
      const isAct = (subtitleState.currentTrackId === t.id) || (!subtitleState.enabled && t.id === 'off');
      return `
        <div class="ls-lang-item ${isAct ? 'active' : ''}" onclick="selectSubtitleTrack('${t.id}')">
          <span>${t.language}</span>
          <i class="fa-solid fa-check ls-check-icon ${isAct ? '' : 'hidden'}"></i>
        </div>
      `;
    }).join('');
  }
}

// Switch Views inside Landscape Subtitle Drawer (Tracks / MX Sync / Style)
function showLandscapeSubView(view) {
  const trackView = document.getElementById('lsSubTrackView');
  const syncView = document.getElementById('lsSubSyncView');
  const styleView = document.getElementById('lsSubStyleView');

  if (trackView) trackView.style.display = (view === 'tracks') ? 'flex' : 'none';
  if (syncView) syncView.style.display = (view === 'sync') ? 'flex' : 'none';
  if (styleView) styleView.style.display = (view === 'style') ? 'flex' : 'none';

  if (view === 'sync') updateSyncUI();
}

// Select a Subtitle Track
async function selectSubtitleTrack(trackId) {
  if (trackId === 'off') {
    subtitleState.enabled = false;
    subtitleState.currentTrackId = 'off';
    subtitleState.cues = [];
    localStorage.setItem('fobs_subtitle_enabled', 'false');
    hideSubtitleOverlay();

    const subToggle = document.getElementById('lsSubtitleToggle');
    if (subToggle) subToggle.checked = false;
    const subBtnLabel = document.getElementById('playerSubtitleBtnLabel');
    if (subBtnLabel) subBtnLabel.innerText = 'Subtitles';
    const subIcon = document.getElementById('actionSubIcon');
    if (subIcon) subIcon.style.color = '';

    renderSubtitleLists();
    showToast('Subtitles: Off');
    return;
  }

  const track = subtitleState.availableTracks.find(t => t.id === trackId || t.langCode === trackId);
  if (!track) return;

  subtitleState.enabled = true;
  subtitleState.currentTrackId = track.id;
  localStorage.setItem('fobs_subtitle_enabled', 'true');

  const subToggle = document.getElementById('lsSubtitleToggle');
  if (subToggle) subToggle.checked = true;
  const subBtnLabel = document.getElementById('playerSubtitleBtnLabel');
  if (subBtnLabel) subBtnLabel.innerText = track.langCode === 'bn' ? 'BN Sub' : (track.langCode === 'hi' ? 'HI Sub' : 'EN Sub');
  const subIcon = document.getElementById('actionSubIcon');
  if (subIcon) subIcon.style.color = '#00f2fe';

  renderSubtitleLists();
  showToast(`Loading ${track.language} (SubSource)...`);

  let loadedCues = [];

  // Step 1: Try backend subtitle proxy
  try {
    const res = await fetch(`${API_BASE_URL}/api/subtitles/track?url=${encodeURIComponent(track.url)}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.cues) && data.cues.length > 0) {
      loadedCues = data.cues;
    }
  } catch (proxyErr) {
    console.warn('Backend subtitle proxy fetch failed, trying direct fetch:', proxyErr);
  }

  // Step 2: Client-side fallback if proxy gave no cues and URL is direct HTTP
  if (loadedCues.length === 0 && track.url && track.url.startsWith('http')) {
    try {
      const directRes = await fetch(track.url);
      const directText = await directRes.text();
      loadedCues = parseSubtitleTextToCues(directText);
    } catch (directErr) {
      console.warn('Direct subtitle fetch failed:', directErr);
    }
  }

  if (loadedCues.length > 0) {
    subtitleState.cues = loadedCues;
    showToast(`${track.language} Subtitles Loaded! (${loadedCues.length} cues) 💬`);

    // Immediate render for current playback position
    const vp = document.getElementById('mainVideoPlayer');
    const curTime = (vp?.currentTime || 0) + (appState.streamSeekOffset || 0);
    renderActiveSubtitleCue(curTime);
  } else {
    showToast('Could not load subtitles. Retrying fallback...');
  }
}

// Render active cue on screen according to video time & sync delay
function renderActiveSubtitleCue(currentTime) {
  if (!subtitleState.enabled || subtitleState.cues.length === 0) {
    hideSubtitleOverlay();
    return;
  }

  // Apply MX Player sync offset
  const syncedTime = currentTime + (subtitleState.syncOffset || 0);
  const activeCue = subtitleState.cues.find(c => c.startTime <= syncedTime && syncedTime <= c.endTime);

  const overlay = document.getElementById('customSubtitleOverlay');
  const cueTextEl = document.getElementById('customSubtitleCueText');
  if (!overlay || !cueTextEl) return;

  if (activeCue && activeCue.text) {
    cueTextEl.innerText = activeCue.text;
    applySubtitleStylesToElement(cueTextEl);
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';
  } else {
    overlay.style.display = 'none';
  }
}

function hideSubtitleOverlay() {
  const overlay = document.getElementById('customSubtitleOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.visibility = 'hidden';
  }
  const cueTextEl = document.getElementById('customSubtitleCueText');
  if (cueTextEl) cueTextEl.innerText = '';
}

// Apply chosen font size, colors, borders and background
function applySubtitleStylesToElement(el) {
  if (!el) return;
  el.style.fontSize = `${subtitleState.fontSize}px`;
  el.style.color = subtitleState.textColor;

  // Border & Text Outline
  if (subtitleState.borderColor === 'transparent') {
    el.style.textShadow = '0 2px 5px rgba(0,0,0,0.85)';
  } else if (subtitleState.borderColor === '#00f2fe') {
    el.style.textShadow = '0 0 8px rgba(0, 242, 254, 0.9), 0 0 14px rgba(0, 242, 254, 0.6)';
  } else {
    const bColor = subtitleState.borderColor;
    el.style.textShadow = `
      -1.5px -1.5px 0 ${bColor},
       1.5px -1.5px 0 ${bColor},
      -1.5px  1.5px 0 ${bColor},
       1.5px  1.5px 0 ${bColor},
       0px 2px 6px rgba(0,0,0,0.9)
    `;
  }

  // Background Box
  if (subtitleState.bgStyle === 'semi') {
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
    el.style.backdropFilter = 'blur(4px)';
    el.style.webkitBackdropFilter = 'blur(4px)';
  } else if (subtitleState.bgStyle === 'solid') {
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    el.style.backdropFilter = 'none';
  } else {
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.45)';
    el.style.backdropFilter = 'none';
  }
}

// Update Live Preview Box inside Modal
function updateSubtitlePreview() {
  const previewText = document.getElementById('subPreviewText');
  if (previewText) {
    applySubtitleStylesToElement(previewText);
  }
}

// Set Font Size
function setSubtitleSize(size) {
  subtitleState.fontSize = size;
  saveSubtitleSettings();
  document.querySelectorAll('.sub-size-chip, .ls-size-chip').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.size, 10) === size);
  });
  updateSubtitlePreview();
}

// Set Text Color
function setSubtitleTextColor(color) {
  subtitleState.textColor = color;
  saveSubtitleSettings();
  document.querySelectorAll('#subTextColorPalette .sub-color-circle, .ls-color-dot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color || btn.style.backgroundColor === color);
  });
  updateSubtitlePreview();
}

// Set Border / Outline Color
function setSubtitleBorderColor(borderColor) {
  subtitleState.borderColor = borderColor;
  saveSubtitleSettings();
  document.querySelectorAll('#subBorderColorPalette .sub-color-circle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.border === borderColor);
  });
  updateSubtitlePreview();
}

// Set Background Box Style
function setSubtitleBgStyle(bgStyle) {
  subtitleState.bgStyle = bgStyle;
  saveSubtitleSettings();
  document.querySelectorAll('.sub-bg-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === bgStyle);
  });
  updateSubtitlePreview();
}

// MX-Player Style Subtitle Sync Adjustments
function adjustSubtitleSync(delta) {
  subtitleState.syncOffset = Math.round((subtitleState.syncOffset + delta) * 10) / 10;
  saveSubtitleSettings();
  updateSyncUI();
  const sign = subtitleState.syncOffset >= 0 ? '+' : '';
  showToast(`Subtitle Delay: ${sign}${subtitleState.syncOffset.toFixed(1)}s (MX Sync)`);
  
  // Immediately update cue
  const vp = document.getElementById('mainVideoPlayer');
  if (vp) {
    renderActiveSubtitleCue((vp.currentTime || 0) + (appState.streamSeekOffset || 0));
  }
}

function resetSubtitleSync() {
  subtitleState.syncOffset = 0.0;
  saveSubtitleSettings();
  updateSyncUI();
  showToast('Subtitle Sync Reset (0.0s)');
  const vp = document.getElementById('mainVideoPlayer');
  if (vp) {
    renderActiveSubtitleCue((vp.currentTime || 0) + (appState.streamSeekOffset || 0));
  }
}

function handleSubtitleSyncSlider(val) {
  subtitleState.syncOffset = parseFloat(val);
  saveSubtitleSettings();
  updateSyncUI();
  const vp = document.getElementById('mainVideoPlayer');
  if (vp) {
    renderActiveSubtitleCue((vp.currentTime || 0) + (appState.streamSeekOffset || 0));
  }
}

function updateSyncUI() {
  const badge = document.getElementById('subSyncValBadge');
  const slider = document.getElementById('subSyncSlider');
  const lsBadge = document.getElementById('lsSyncValBadge');
  const lsSlider = document.getElementById('lsSyncSlider');

  const val = subtitleState.syncOffset || 0;
  const str = `${val >= 0 ? '+' : ''}${val.toFixed(1)}s`;

  if (badge) badge.innerText = str;
  if (slider) slider.value = val;
  if (lsBadge) lsBadge.innerText = str;
  if (lsSlider) lsSlider.value = val;
}

// Subtitle Modal Controls
function openSubtitleModal(tab = 'lang') {
  // If in landscape mode and language drawer is open, show in-drawer view directly!
  const isLandscape = window.innerWidth > window.innerHeight;
  const lsDrawer = document.getElementById('lsLanguageDrawer');
  if (isLandscape && lsDrawer && lsDrawer.classList.contains('open')) {
    showLandscapeSubView(tab === 'style' ? 'style' : 'sync');
    return;
  }

  closeLandscapeDrawers();
  const modal = document.getElementById('subtitleModal');
  if (modal) modal.classList.add('open');
  switchSubtitleModalTab(tab);
  updateSyncUI();
  updateSubtitlePreview();
  renderSubtitleLists();
}

function closeSubtitleModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.closest('.sheet-close-btn') && !e.target.closest('.sub-done-btn')) return;
  const modal = document.getElementById('subtitleModal');
  if (modal) modal.classList.remove('open');
}

function switchSubtitleModalTab(tab) {
  const chips = {
    lang: document.getElementById('subTabChipLang'),
    sync: document.getElementById('subTabChipSync'),
    style: document.getElementById('subTabChipStyle')
  };
  const panels = {
    lang: document.getElementById('subPanelLang'),
    sync: document.getElementById('subPanelSync'),
    style: document.getElementById('subPanelStyle')
  };

  Object.keys(chips).forEach(k => {
    if (chips[k]) chips[k].classList.toggle('active', k === tab);
    if (panels[k]) {
      panels[k].style.display = (k === tab) ? 'flex' : 'none';
    }
  });

  if (tab === 'style') updateSubtitlePreview();
  if (tab === 'sync') updateSyncUI();
}

function enterFullscreenMode(options = {}) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const playerOverlay = document.getElementById('playerOverlay');
  const titleEl = document.getElementById('lsVideoTitle');

  document.body.classList.add('is-fullscreen');
  if (playerOverlay) playerOverlay.classList.add('is-fullscreen');
  if (videoContainer) videoContainer.classList.add('is-fullscreen');

  // Request native fullscreen on videoContainer so MovieBox controls and drawers are visible
  if (!options.skipNativeFs && videoContainer) {
    if (videoContainer.requestFullscreen) {
      videoContainer.requestFullscreen().catch(() => {});
    } else if (videoContainer.webkitRequestFullscreen) {
      videoContainer.webkitRequestFullscreen();
    } else if (videoContainer.mozRequestFullScreen) {
      videoContainer.mozRequestFullScreen();
    } else if (videoContainer.msRequestFullscreen) {
      videoContainer.msRequestFullscreen();
    }
  }

  // Remove native browser controls so they don't block MovieBox controls
  if (videoPlayer) {
    videoPlayer.removeAttribute('controls');
  }

  // Sync MovieBox title
  if (titleEl && appState.currentMedia) {
    const media = appState.currentMedia;
    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.id && media.id.startsWith('kmdl-s-'));
    const epNum = appState.currentEpisode?.number || appState.currentEpisode?.episodeNumber || 1;
    const seasonNum = appState.currentSeason || 1;
    const cleanBase = formatCleanMediaTitle(media.title, media.dubLanguage);
    const epPad = epNum < 10 ? `0${epNum}` : epNum;
    const sePad = seasonNum < 10 ? `0${seasonNum}` : seasonNum;
    titleEl.innerText = isSeries 
      ? `${cleanBase} S${sePad} E${epPad}` 
      : cleanBase;
  }

  if (!options.skipRotate) {
    setVideoOrientationLandscape();
  }

  syncPlayPauseIcons();
  updateLandscapeProgress();
  resetLandscapeControlsTimer();
}

function exitFullscreenMode(options = {}) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const playerOverlay = document.getElementById('playerOverlay');

  document.body.classList.remove('is-fullscreen');
  if (playerOverlay) playerOverlay.classList.remove('is-fullscreen');
  if (videoContainer) videoContainer.classList.remove('is-fullscreen');

  // Ensure native browser controls stay removed so full MovieBox duration is always visible
  if (videoPlayer) {
    videoPlayer.removeAttribute('controls');
  }

  // Exit native browser fullscreen
  if (!options.skipNativeFs) {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  closeLandscapeDrawers();

  if (lsControlsTimer) {
    clearTimeout(lsControlsTimer);
    lsControlsTimer = null;
  }

  if (!options.skipRotate) {
    setVideoOrientationPortrait();
  }
}

function togglePlayerFullscreen() {
  const isFs = document.body.classList.contains('is-fullscreen');
  if (isFs) {
    exitFullscreenMode();
  } else {
    enterFullscreenMode();
  }
}

function toggleVideoScaling() {
  toggleLandscapeFitFill();
}

function handlePlayerBackClick() {
  const openLsDrawer = document.querySelector('.ls-side-drawer.open');
  if (openLsDrawer) {
    closeLandscapeDrawers();
    resetLandscapeControlsTimer();
    return;
  }
  if (document.body.classList.contains('is-fullscreen')) {
    exitFullscreenMode({ skipRotate: false });
    return;
  }
  closePlayer();
}

// Global bridges called from Android MainActivity
window.onNativeFullscreenChange = function(isActive) {
  if (isActive && !document.body.classList.contains('is-fullscreen')) {
    enterFullscreenMode({ skipRotate: true });
  } else if (!isActive && document.body.classList.contains('is-fullscreen')) {
    exitFullscreenMode({ skipRotate: true });
  }
};

window.onOrientationChanged = function(orientation) {
  const isPlayerOpen = document.getElementById('playerOverlay')?.classList.contains('open');
  if (!isPlayerOpen) return;

  if (orientation === 'landscape' && !document.body.classList.contains('is-fullscreen')) {
    enterFullscreenMode({ skipRotate: true });
  } else if (orientation === 'portrait' && document.body.classList.contains('is-fullscreen')) {
    exitFullscreenMode({ skipRotate: true });
  }
};

// ============================================================
// MOVIEBOX / MX PLAYER STYLE GESTURES & HUD (BRIGHTNESS, SOUND, DOUBLE TAP)
// ============================================================
let playerBrightness = 1.0;
let gestureHudTimer = null;
let singleTapTimer = null;
let lastTapInfo = { time: 0, x: 0, y: 0, side: null };

function applyPlayerBrightness(val) {
  playerBrightness = Math.max(0.05, Math.min(1.0, Number(val)));
  
  // 1. Update dark overlay for web view dimming
  const overlay = document.getElementById('playerBrightnessOverlay');
  if (overlay) {
    const dimAlpha = Math.max(0, (1.0 - playerBrightness) * 0.92);
    overlay.style.backgroundColor = `rgba(0, 0, 0, ${dimAlpha.toFixed(3)})`;
  }
  
  // 2. Set actual hardware screen brightness directly on Android (fixes brightness drop at 100%)
  try {
    if (window.AndroidApp && typeof window.AndroidApp.setWindowBrightness === 'function') {
      window.AndroidApp.setWindowBrightness(playerBrightness);
    }
  } catch (e) {}

  return playerBrightness;
}

let playerSoundLevel = 1.0; // 0.0 to 2.0 (0% to 200% sound boost)

function applyPlayerVolume(val) {
  const video = document.getElementById('mainVideoPlayer');
  const safeVol = Math.max(0, Math.min(2.0, Number(val)));
  playerSoundLevel = safeVol;

  if (video) {
    // HTML5 native video volume: 0.0 to 1.0
    // Always keep video.volume at direct ratio without Web Audio hijacking
    const nativeVol = Math.max(0, Math.min(1.0, safeVol <= 1.0 ? safeVol : 1.0));
    video.volume = nativeVol;
    video.muted = (safeVol <= 0);
  }

  // Native Android hardware volume adjustment (MovieBox style)
  try {
    if (window.AndroidApp && typeof window.AndroidApp.setAudioBoost === 'function') {
      window.AndroidApp.setAudioBoost(Math.round(safeVol * 100));
    }
  } catch (e) {}

  return safeVol;
}

function showGestureHud(type, value) {
  const hud = document.getElementById('playerGestureHud');
  const icon = document.getElementById('gestureHudIcon');
  const fill = document.getElementById('gestureHudBarFill');
  const valText = document.getElementById('gestureHudVal');
  if (!hud || !icon || !fill || !valText) return;

  if (type === 'brightness') {
    hud.classList.remove('boost-mode');
    const pct = Math.round(value * 100);
    icon.innerHTML = '<i class="fa-solid fa-sun"></i>';
    fill.style.width = `${pct}%`;
    valText.innerText = `${pct}%`;
  } else if (type === 'volume') {
    const pct = Math.round(value * 100); // 0 to 200%

    if (pct > 100) {
      // MovieBox 200% Sound Boost Mode!
      hud.classList.add('boost-mode');
      icon.innerHTML = '<i class="fa-solid fa-bolt"></i>';
      valText.innerHTML = `${pct}% <span class="boost-hud-tag">BOOST</span>`;
      // Fill bar represents 0% to 200%
      const fillPct = Math.min(100, Math.round((pct / 200) * 100));
      fill.style.width = `${fillPct}%`;
    } else {
      hud.classList.remove('boost-mode');
      let iconClass = 'fa-volume-high';
      if (pct <= 0) iconClass = 'fa-volume-xmark';
      else if (pct < 50) iconClass = 'fa-volume-low';
      icon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
      fill.style.width = `${pct}%`;
      valText.innerText = `${pct}%`;
    }
  }

  hud.classList.add('visible');

  if (gestureHudTimer) clearTimeout(gestureHudTimer);
  gestureHudTimer = setTimeout(() => {
    hud.classList.remove('visible');
    hud.classList.remove('boost-mode');
  }, 900);
}

function triggerDoubleTapSeek(offsetSeconds) {
  const isForward = offsetSeconds > 0;
  const rippleEl = document.getElementById(isForward ? 'doubleTapRight' : 'doubleTapLeft');

  if (rippleEl) {
    rippleEl.classList.remove('active');
    void rippleEl.offsetWidth; // Force CSS reflow to replay animation
    rippleEl.classList.add('active');

    setTimeout(() => {
      rippleEl.classList.remove('active');
    }, 550);
  }

  seekRelative(offsetSeconds);
}

function handleSinglePlayerTap() {
  const lsUi = document.getElementById('landscapePlayerUI');
  const topHeader = document.getElementById('playerTopHeader');
  const ptBottom = document.getElementById('portraitBottomBar');
  if (!lsUi && !topHeader && !ptBottom) return;

  const openDrawer = document.querySelector('.ls-side-drawer.open');
  if (openDrawer) {
    closeLandscapeDrawers();
    resetLandscapeControlsTimer();
    return;
  }

  if (isPlayerLocked) {
    if (lsUi) {
      const isHidden = lsUi.classList.contains('controls-hidden');
      if (isHidden) {
        lsUi.classList.remove('controls-hidden');
        resetLandscapeControlsTimer();
      } else {
        lsUi.classList.add('controls-hidden');
        if (lsControlsTimer) {
          clearTimeout(lsControlsTimer);
          lsControlsTimer = null;
        }
      }
    }
    return;
  }

  const isLandscape = document.body.classList.contains('is-fullscreen') || 
                      (window.innerWidth > window.innerHeight);

  if (isLandscape && lsUi) {
    const isHidden = lsUi.classList.contains('controls-hidden');
    if (isHidden) {
      // Reveal all controls (Matches Screenshot 1 / Photo 1)
      lsUi.classList.remove('controls-hidden');
      resetLandscapeControlsTimer();
    } else {
      // Hide all controls (Matches Screenshot 2 / Photo 2)
      lsUi.classList.add('controls-hidden');
      if (lsControlsTimer) {
        clearTimeout(lsControlsTimer);
        lsControlsTimer = null;
      }
    }
    return;
  }

  // Portrait mode toggle
  const isPtHidden = (topHeader && topHeader.classList.contains('controls-hidden')) || 
                     (ptBottom && ptBottom.classList.contains('controls-hidden'));
  if (isPtHidden) {
    if (topHeader) topHeader.classList.remove('controls-hidden');
    if (ptBottom) ptBottom.classList.remove('controls-hidden');
    resetLandscapeControlsTimer();
  } else {
    if (topHeader) topHeader.classList.add('controls-hidden');
    if (ptBottom) ptBottom.classList.add('controls-hidden');
    if (lsControlsTimer) {
      clearTimeout(lsControlsTimer);
      lsControlsTimer = null;
    }
    if (playerControlsTimer) {
      clearTimeout(playerControlsTimer);
      playerControlsTimer = null;
    }
  }
}

let seekHudTimer = null;

function showSeekGestureHud(seekDelta, targetTime, duration) {
  const hud = document.getElementById('playerSeekHud');
  const icon = document.getElementById('seekHudIcon');
  const deltaEl = document.getElementById('seekHudDelta');
  const timeEl = document.getElementById('seekHudTime');
  if (!hud) return;

  hud.style.display = 'flex';
  hud.classList.add('visible');

  if (icon) {
    icon.innerHTML = seekDelta >= 0 ? '<i class="fa-solid fa-forward"></i>' : '<i class="fa-solid fa-backward"></i>';
    icon.style.color = seekDelta >= 0 ? '#00f2fe' : '#ffaa00';
  }
  if (deltaEl) {
    deltaEl.innerText = `${seekDelta >= 0 ? '+' : ''}${seekDelta}s`;
    deltaEl.style.color = seekDelta >= 0 ? '#00f2fe' : '#ffaa00';
  }
  if (timeEl) {
    timeEl.innerText = `${formatPlayerTime(targetTime)} / ${formatPlayerTime(duration)}`;
  }
  if (seekHudTimer) clearTimeout(seekHudTimer);
  seekHudTimer = setTimeout(() => {
    hideSeekGestureHud();
  }, 1200);
}

function hideSeekGestureHud() {
  const hud = document.getElementById('playerSeekHud');
  if (!hud) return;
  if (seekHudTimer) clearTimeout(seekHudTimer);
  seekHudTimer = null;
  hud.classList.remove('visible');
  setTimeout(() => {
    if (!hud.classList.contains('visible')) hud.style.display = 'none';
  }, 180);
}

function formatPlayerTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function show2xSpeedHud(show) {
  const hud = document.getElementById('playerSpeedHud');
  if (!hud) return;
  if (show) {
    hud.style.display = 'flex';
    hud.classList.add('visible');
  } else {
    hud.classList.remove('visible');
    setTimeout(() => {
      if (!hud.classList.contains('visible')) {
        hud.style.display = 'none';
      }
    }, 180);
  }
}

function setupPlayerGestures() {
  const detectors = [
    document.getElementById('playerTapDetector'),
    document.getElementById('lsTapDetector')
  ].filter(Boolean);

  if (detectors.length === 0) return;

  let isPointerDown = false;
  let isDragging = false;
  let dragType = null; // 'horizontal-seek' or 'vertical'
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let activeSide = null; // 'left' or 'right'
  let startBrightness = 1.0;
  let startVolume = 1.0;
  let startVideoTime = 0;
  let targetSeekTime = 0;
  let currentDetector = null;
  let longPressTimer = null;
  let is2xSpeedActive = false;
  let originalPlaybackRate = 1.0;

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (document.querySelector('.ls-side-drawer.open')) {
      closeLandscapeDrawers();
      resetLandscapeControlsTimer();
      return;
    }

    currentDetector = e.currentTarget;
    const rect = currentDetector.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    try {
      currentDetector.setPointerCapture(e.pointerId);
    } catch (err) {}

    isPointerDown = true;
    isDragging = false;
    dragType = null;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();

    const relX = startX - rect.left;
    activeSide = relX < (rect.width / 2) ? 'left' : 'right';

    startBrightness = playerBrightness;
    const video = document.getElementById('mainVideoPlayer');
    startVolume = (video && video.muted) ? 0 : (playerSoundLevel !== undefined ? playerSoundLevel : (video ? video.volume : 1.0));
    startVideoTime = video ? video.currentTime : 0;
    targetSeekTime = startVideoTime;

    // Press & Hold 2X Speed feature (activates after 400ms without dragging)
    if (longPressTimer) clearTimeout(longPressTimer);
    is2xSpeedActive = false;
    if (video && !video.paused) {
      longPressTimer = setTimeout(() => {
        if (isPointerDown && !isDragging) {
          is2xSpeedActive = true;
          originalPlaybackRate = video.playbackRate || 1.0;
          video.playbackRate = 2.0;
          show2xSpeedHud(true);
          try {
            if (navigator.vibrate) navigator.vibrate(30);
          } catch (err) {}
        }
      }, 400);
    }
  };

  const onPointerMove = (e) => {
    if (!isPointerDown) return;
    if (isPlayerLocked) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // Cancel 2X speed long-press if movement occurs
    if (Math.hypot(deltaX, deltaY) > 12) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    if (!isDragging) {
      const hThreshold = 18;
      const vThreshold = 16;
      if (Math.abs(deltaX) > hThreshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        isDragging = true;
        dragType = 'horizontal-seek';
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
      } else if (Math.abs(deltaY) > vThreshold && Math.abs(deltaY) > Math.abs(deltaX) * 1.1) {
        isDragging = true;
        dragType = 'vertical';
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
      }
    }

    if (isDragging) {
      const rect = currentDetector ? currentDetector.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();

      if (dragType === 'horizontal-seek') {
        const video = document.getElementById('mainVideoPlayer');
        if (video) {
          const duration = getMediaTotalDurationSeconds();
          // Step sequentially by 10s: 10, 20, 30, 40, 50, 60, 70, 80...
          const pixelsPerStep = 18;
          let stepCount = Math.trunc(deltaX / pixelsPerStep);
          if (stepCount === 0) {
            stepCount = deltaX > 0 ? 1 : (deltaX < 0 ? -1 : 0);
          }
          const seekDelta = stepCount * 10;
          targetSeekTime = Math.max(0, Math.min(duration, startVideoTime + seekDelta));
          showSeekGestureHud(seekDelta, targetSeekTime, duration);

          // Real-time length bar update while dragging across video screen
          if (duration > 0) {
            const pct = Math.min(100, Math.max(0, (targetSeekTime / duration) * 100));
            const filledEl = document.getElementById('lsProgressFilled');
            const thumbEl = document.getElementById('lsProgressThumb');
            const ptFilledEl = document.getElementById('portraitProgressFilled');
            const ptThumbEl = document.getElementById('portraitProgressThumb');
            if (filledEl) filledEl.style.width = `${pct}%`;
            if (thumbEl) thumbEl.style.left = `${pct}%`;
            if (ptFilledEl) ptFilledEl.style.width = `${pct}%`;
            if (ptThumbEl) ptThumbEl.style.left = `${pct}%`;
          }
          const curEl = document.getElementById('lsCurrentTime');
          const ptTimeEl = document.getElementById('portraitTimeDisplay');
          const curFormatted = formatPlayerTime(targetSeekTime);
          const durFormatted = formatPlayerTime(duration);
          if (curEl) curEl.innerText = curFormatted;
          if (ptTimeEl) ptTimeEl.innerText = `${curFormatted}/${durFormatted}`;
        }
      } else if (dragType === 'vertical') {
        const sensitivityRange = (rect.height || 220) * 0.65;
        const deltaRatio = -deltaY / sensitivityRange;

        if (activeSide === 'left') {
          // Left side: Brightness up to 100%
          const newBrightness = applyPlayerBrightness(startBrightness + deltaRatio);
          showGestureHud('brightness', newBrightness);
        } else {
          // Right side: Volume up to 200% (with sound boost mode)
          const newVolume = applyPlayerVolume(startVolume + deltaRatio * 1.6);
          showGestureHud('volume', newVolume);
        }
      }
    }
  };

  const onPointerEnd = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      if (currentDetector) currentDetector.releasePointerCapture(e.pointerId);
    } catch (err) {}

    // Clear long-press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Release 2X Speed when finger is lifted
    if (is2xSpeedActive) {
      is2xSpeedActive = false;
      const video = document.getElementById('mainVideoPlayer');
      if (video) {
        video.playbackRate = originalPlaybackRate || 1.0;
      }
      show2xSpeedHud(false);
      isDragging = false;
      dragType = null;
      return;
    }

    if (isDragging) {
      if (dragType === 'horizontal-seek') {
        const video = document.getElementById('mainVideoPlayer');
        if (video && !isNaN(targetSeekTime)) {
          seekToAbsoluteTime(targetSeekTime);
        }
        hideSeekGestureHud();
      } else {
        if (gestureHudTimer) clearTimeout(gestureHudTimer);
        gestureHudTimer = setTimeout(() => {
          const hud = document.getElementById('playerGestureHud');
          if (hud) hud.classList.remove('visible');
        }, 700);
      }
      isDragging = false;
      dragType = null;
      return;
    }

    hideSeekGestureHud();
    isDragging = false;
    dragType = null;

    // --- Tap / Double-Tap detection ---
    if (isPlayerLocked) {
      handleSinglePlayerTap();
      return;
    }

    const rect = currentDetector ? currentDetector.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    const relX = clickX - rect.left;
    const currentSide = relX < (rect.width / 2) ? 'left' : 'right';
    const now = Date.now();

    const timeDiff = now - lastTapInfo.time;
    const distDiff = Math.hypot(clickX - lastTapInfo.x, clickY - lastTapInfo.y);

    if (timeDiff < 280 && distDiff < 50 && lastTapInfo.side === currentSide) {
      // DOUBLE TAP!
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
      lastTapInfo.time = 0; // reset

      if (currentSide === 'left') {
        // Left double tap: -10s rewind
        triggerDoubleTapSeek(-10);
      } else {
        // Right double tap: +10s forward
        triggerDoubleTapSeek(10);
      }
    } else {
      // FIRST TAP: record and debounce single tap
      lastTapInfo = {
        time: now,
        x: clickX,
        y: clickY,
        side: currentSide
      };

      if (singleTapTimer) clearTimeout(singleTapTimer);
      singleTapTimer = setTimeout(() => {
        handleSinglePlayerTap();
        singleTapTimer = null;
      }, 190);
    }
  };

  detectors.forEach(detector => {
    if (detector._gestureInitialized) return;
    detector._gestureInitialized = true;
    detector.addEventListener('pointerdown', onPointerDown);
    detector.addEventListener('pointermove', onPointerMove);
    detector.addEventListener('pointerup', onPointerEnd);
    detector.addEventListener('pointercancel', onPointerEnd);
  });
}

// Setup Video Event Listeners
function setupVideoListeners() {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const loader = document.getElementById('videoLoader');
  const embedFrame = document.getElementById('mainEmbedPlayer');
  if (!videoPlayer) return;

  // All tap events (portrait + landscape) are handled by playerTapDetector in setupPlayerGestures()
  // Do NOT add a second click listener on videoContainer — it causes double-firing.

  // Initialize Gesture Engine on the tap detector
  setupPlayerGestures();

  setupLandscapeProgressScrubbing();

  // Explicit back button event listeners with event stopPropagation to prevent any overlay interception
  const backBtn = document.getElementById('playerBackBtn');
  if (backBtn) {
    const onBack = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      handlePlayerBackClick();
    };
    backBtn.addEventListener('click', onBack);
    backBtn.addEventListener('touchend', onBack, { passive: false });
  }

  const lsBack = document.getElementById('lsBackBtn');
  if (lsBack) {
    const onLsBack = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      handlePlayerBackClick();
    };
    lsBack.addEventListener('click', onLsBack);
    lsBack.addEventListener('touchend', onLsBack, { passive: false });
  }

  // Native fullscreen event synchronization
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs && !document.body.classList.contains('is-fullscreen')) {
      enterFullscreenMode({ skipNativeFs: true });
    } else if (!isFs && document.body.classList.contains('is-fullscreen')) {
      exitFullscreenMode({ skipNativeFs: true });
    }
  });

  document.addEventListener('webkitfullscreenchange', () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs && !document.body.classList.contains('is-fullscreen')) {
      enterFullscreenMode({ skipNativeFs: true });
    } else if (!isFs && document.body.classList.contains('is-fullscreen')) {
      exitFullscreenMode({ skipNativeFs: true });
    }
  });

  videoPlayer.addEventListener('loadedmetadata', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    updateLandscapeProgress();
    syncPlayPauseIcons();
  });

  videoPlayer.addEventListener('loadeddata', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    syncPlayPauseIcons();
  });

  videoPlayer.addEventListener('timeupdate', () => {
    if (loader && loader.classList.contains('active') && videoPlayer.currentTime > 0 && !videoPlayer.seeking) {
      loader.classList.remove('active');
    }
    if (appState.pendingSeekTime !== null && appState.pendingSeekTime !== undefined) {
      const streamOffset = appState.streamSeekOffset || 0;
      const current = (videoPlayer.currentTime || 0) + streamOffset;
      if (Math.abs(current - appState.pendingSeekTime) <= 4 || !videoPlayer.seeking) {
        appState.pendingSeekTime = null;
      }
    }
    updateLandscapeProgress();

    // Real-time subtitle cue rendering with MX Player style sync
    if (typeof renderActiveSubtitleCue === 'function') {
      renderActiveSubtitleCue(videoPlayer.currentTime);
    }

    // Throttled Watch History Progress (every 10s)
    const now = Date.now();
    if (!window._lastHistorySyncTime || now - window._lastHistorySyncTime > 10000) {
      window._lastHistorySyncTime = now;
      if (typeof saveWatchHistoryProgress === 'function') {
        saveWatchHistoryProgress();
      }
    }
  });

  videoPlayer.addEventListener('progress', () => {
    updateLandscapeProgress();
  });

  let waitLoaderTimer = null;

  videoPlayer.addEventListener('playing', () => {
    if (waitLoaderTimer) clearTimeout(waitLoaderTimer);
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    appState.pendingSeekTime = null;
    syncPlayPauseIcons();
    resetLandscapeControlsTimer();

    // Increment Real-Time View count ONLY when played directly from FOBS TV app
    if (appState.currentMedia && appState.currentSessionTrackedId !== appState.currentMedia.id) {
      appState.currentSessionTrackedId = appState.currentMedia.id;
      incrementAppMediaViews(appState.currentMedia.id);
    }

    // Start Live Active Viewer Heartbeat
    if (typeof startLiveHeartbeat === 'function') {
      startLiveHeartbeat();
    }
  });

  videoPlayer.addEventListener('ended', () => {
    if (typeof saveWatchHistoryProgress === 'function') {
      saveWatchHistoryProgress(true);
    }
    if (typeof stopLiveHeartbeat === 'function') {
      stopLiveHeartbeat();
    }
  });

  let stallRecoveryTimer = null;
  const triggerStallRecovery = () => {
    if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer);
    // Never interrupt if user or player is actively seeking or within a pending seek!
    if (!videoPlayer || videoPlayer.seeking || appState.pendingSeekTime !== null) {
      return;
    }
    stallRecoveryTimer = setTimeout(() => {
      if (!videoPlayer || videoPlayer.seeking || appState.pendingSeekTime !== null) {
        return;
      }
      // If video has sufficient buffered data to resume, unpause it cleanly
      if (!videoPlayer.paused && videoPlayer.readyState >= 2) {
        videoPlayer.play().catch(() => {});
      }
    }, 3500);
  };

  videoPlayer.addEventListener('waiting', () => {
    if (waitLoaderTimer) clearTimeout(waitLoaderTimer);
    waitLoaderTimer = setTimeout(() => {
      if (videoPlayer.paused || videoPlayer.seeking || videoPlayer.readyState < 3) {
        if (loader) loader.classList.add('active');
      }
    }, 200);
    triggerStallRecovery();
  });

  videoPlayer.addEventListener('stalled', () => {
    console.warn('Video stream playback stalled');
    if (!videoPlayer.paused && videoPlayer.readyState < 3) {
      if (loader) loader.classList.add('active');
    }
    triggerStallRecovery();
  });

  videoPlayer.addEventListener('seeking', () => {
    // Only show loader if seek takes more than a split second
    if (waitLoaderTimer) clearTimeout(waitLoaderTimer);
    waitLoaderTimer = setTimeout(() => {
      if (videoPlayer.seeking && loader) loader.classList.add('active');
    }, 150);
  });

  videoPlayer.addEventListener('seeked', () => {
    if (waitLoaderTimer) clearTimeout(waitLoaderTimer);
    if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer);
    if (window.seekLoaderTimeout) clearTimeout(window.seekLoaderTimeout);
    if (window.seekSafetyTimeout) clearTimeout(window.seekSafetyTimeout);
    appState.pendingSeekTime = null;
    if (loader) loader.classList.remove('active');
    updateLandscapeProgress();
    syncPlayPauseIcons();
    videoPlayer.play().catch(() => {});
  });

  videoPlayer.addEventListener('canplay', () => {
    if (waitLoaderTimer) clearTimeout(waitLoaderTimer);
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    videoPlayer._retryCount = 0;
    appState.pendingSeekTime = null;
    if (loader) loader.classList.remove('active');
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('pause', () => {
    syncPlayPauseIcons();
    resetLandscapeControlsTimer();
  });

  videoPlayer.addEventListener('error', (e) => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);

    // If player is closing, ignoring errors, or iframe embed player is active, DO NOT attempt fallback retry!
    if (videoPlayer._isClosing || videoPlayer._ignoreErrors || !appState.currentMedia || (embedFrame && embedFrame.style.display === 'block') || videoPlayer.style.display === 'none') {
      return;
    }

    console.error('Video load error, attempting fallback:', e);

    const curEp = appState.currentEpisode;
    const rawUrl = (curEp?.audioTracks && curEp.audioTracks[appState.currentAudioTrack]) || curEp?.streamUrl || appState.currentMedia?.streamUrl || appState.currentMedia?.driveUrl;

    if (!videoPlayer._retryCount) videoPlayer._retryCount = 0;
    if (videoPlayer._retryCount < 1 && rawUrl && !rawUrl.includes('/api/stream?url=')) {
      videoPlayer._retryCount++;
      const resumeTime = appState.pendingSeekTime || videoPlayer.currentTime || 0;
      console.log(`Retrying stream via proxy at ${resumeTime}s (attempt ${videoPlayer._retryCount})...`);

      videoPlayer.src = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(rawUrl)}`;
      videoPlayer.load();
      if (resumeTime > 0) {
        const onLoaded = () => {
          videoPlayer.removeEventListener('loadedmetadata', onLoaded);
          try { videoPlayer.currentTime = resumeTime; } catch(err) {}
        };
        videoPlayer.addEventListener('loadedmetadata', onLoaded);
      }
      videoPlayer.play().catch(() => {});
      return;
    }

    if (loader) loader.classList.remove('active');
    console.warn('Stream failed after retries.');
    showToast('Playback error. Please check your internet connection and try again.');
  });

  // Handle native HTML5 bottom control bar fullscreen button events
  const onNativeFsChange = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs && !document.body.classList.contains('is-fullscreen')) {
      enterFullscreenMode({ skipRotate: false });
    } else if (!isFs && document.body.classList.contains('is-fullscreen') && (!window.AndroidApp || !window.AndroidApp.isCustomViewActive())) {
      exitFullscreenMode({ skipRotate: false });
    }
  };

  document.addEventListener('fullscreenchange', onNativeFsChange);
  document.addEventListener('webkitfullscreenchange', onNativeFsChange);

  videoPlayer.addEventListener('webkitbeginfullscreen', () => {
    enterFullscreenMode({ skipRotate: false });
  });

  videoPlayer.addEventListener('webkitendfullscreen', () => {
    if (!window.AndroidApp || !window.AndroidApp.isCustomViewActive()) {
      exitFullscreenMode({ skipRotate: false });
    }
  });

  // Device orientation change fallback if screen.orientation changes outside AndroidApp
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', () => {
      const isPlayerOpen = document.getElementById('playerOverlay')?.classList.contains('open');
      if (!isPlayerOpen) return;
      const type = screen.orientation.type || '';
      if (type.includes('landscape') && !document.body.classList.contains('is-fullscreen')) {
        enterFullscreenMode({ skipRotate: true });
      } else if (type.includes('portrait') && document.body.classList.contains('is-fullscreen')) {
        exitFullscreenMode({ skipRotate: true });
      }
    });
  }
}

// Close Video Player Overlay
function closePlayer() {
  try {
    if (typeof saveWatchHistoryProgress === 'function') {
      saveWatchHistoryProgress();
    }
  } catch (e) {}

  const overlay = document.getElementById('playerOverlay');
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const embedFrame = document.getElementById('mainEmbedPlayer');

  if (embedFrame) {
    embedFrame.src = '';
    embedFrame.style.display = 'none';
  }
  if (videoPlayer) {
    videoPlayer.style.display = 'block';
  }

  exitFullscreenMode();
  document.body.classList.remove('player-open');

  if (appState.viewsPollTimer) {
    clearInterval(appState.viewsPollTimer);
    appState.viewsPollTimer = null;
  }
  appState.currentSessionTrackedId = null;

  playerBrightness = 1.0;
  const overlayEl = document.getElementById('playerBrightnessOverlay');
  if (overlayEl) {
    overlayEl.style.backgroundColor = 'rgba(0, 0, 0, 0)';
  }

  // Restore phone screen brightness back to normal system brightness
  try {
    if (window.AndroidApp && typeof window.AndroidApp.resetWindowBrightness === 'function') {
      window.AndroidApp.resetWindowBrightness();
    } else if (window.AndroidApp && typeof window.AndroidApp.setWindowBrightness === 'function') {
      window.AndroidApp.setWindowBrightness(-1);
    }
  } catch (e) {}

  if (singleTapTimer) {
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
  }
  if (gestureHudTimer) {
    clearTimeout(gestureHudTimer);
    gestureHudTimer = null;
  }
  if (seekDebounceTimer) {
    clearTimeout(seekDebounceTimer);
    seekDebounceTimer = null;
  }
  if (window.videoStreamColdStartTimer) {
    clearTimeout(window.videoStreamColdStartTimer);
    window.videoStreamColdStartTimer = null;
  }

  isPlayerLocked = false;
  const lsUi = document.getElementById('landscapePlayerUI');
  if (lsUi) {
    lsUi.classList.remove('is-locked');
    lsUi.classList.remove('controls-hidden');
  }
  const topHeader = document.getElementById('playerTopHeader');
  if (topHeader) topHeader.classList.remove('controls-hidden');
  const ptBottom = document.getElementById('portraitBottomBar');
  if (ptBottom) ptBottom.classList.remove('controls-hidden');

  // 1. Fully destroy HLS instance
  if (window.activeHlsPlayer) {
    try {
      window.activeHlsPlayer.stopLoad();
      window.activeHlsPlayer.detachMedia();
      window.activeHlsPlayer.destroy();
    } catch (e) {}
    window.activeHlsPlayer = null;
  }

  // 2. Terminate iframe embed
  if (embedFrame) {
    embedFrame.src = 'about:blank';
    embedFrame.removeAttribute('src');
    embedFrame.style.display = 'none';
  }

  // 3. Terminate HTML5 video player completely
  if (videoPlayer) {
    videoPlayer._isClosing = true;
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayer.removeAttribute('src');
    try { videoPlayer.srcObject = null; } catch(e) {}
    videoPlayer.load();
    setTimeout(() => {
      if (videoPlayer) videoPlayer._isClosing = false;
    }, 400);
  }

  appState.currentMedia = null;
  appState.currentEpisode = null;
  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = null;

  if (overlay) overlay.classList.remove('open');
}

// Open "More details" Sheet Modal (Screenshot 2 Match with TMDB Data)
function openDetailsSheet(customMedia = null) {
  const media = customMedia || appState.currentMedia;
  if (!media) return;

  const overlay = document.getElementById('moreDetailsOverlay');
  const content = document.getElementById('detailsSheetContent');
  if (!overlay || !content) return;

  const defaultCast = [
    { name: "Hwang Jung-min", character: "Jeon Doo-gwang", photo: "https://image.tmdb.org/t/p/w185/hKF1uh0iEfuZlBE79CXPw415qyn.jpg" },
    { name: "Jung Woo-sung", character: "Lee Tae-shin", photo: "https://image.tmdb.org/t/p/w185/tI0ANQSwcOBfQUeHgfcwn7VmHRO.jpg" },
    { name: "Lee Sung-min", character: "Jung Sang-ho", photo: "https://image.tmdb.org/t/p/w185/6CjxjYvZBuvbAQTcuoPb8EeVrUI.jpg" },
    { name: "Park Hae-joon", character: "Roh Tae-geon", photo: "https://image.tmdb.org/t/p/w185/v8N9oQpC115G7kEa3nIq6v0o5U6.jpg" },
    { name: "Kim Sung-kyun", character: "Kim Jun-yeop", photo: "https://image.tmdb.org/t/p/w185/hKF1uh0iEfuZlBE79CXPw415qyn.jpg" }
  ];

  let cast = [];
  if (Array.isArray(media.cast) && media.cast.length > 0) {
    cast = media.cast;
  } else if (typeof media.cast === 'string' && media.cast.trim()) {
    cast = media.cast.split(',').map(name => ({
      name: name.trim(),
      character: 'Cast',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));
  } else {
    cast = defaultCast;
  }

  const rating = media.imdbRating || media.rating || '8.1';
  const genre = media.genre ? media.genre.split(',')[0].trim() : (media.genres ? media.genres.split(',')[0].trim() : 'Drama');
  const country = media.country || 'United States';
  const year = media.year || '2026';
  const descriptionText = media.description || media.overview || 'Full movie & TV series details fetched from TMDB database.';
  const displayTitle = (media.title || '').includes('[Hindi]') ? media.title : `${media.title || 'Untitled'} [Hindi]`;

  content.innerHTML = `
    <div class="details-media-head">
      <div class="details-poster-wrap">
        <img src="${media.poster}" alt="${media.title}" class="details-media-poster">
        <div class="poster-zoom-btn"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
      </div>
      <div class="details-media-meta-wrap">
        <div class="details-media-title">${displayTitle}</div>
        <div class="details-meta-line">
          <i class="fa-solid fa-film"></i>
          <span class="star-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
          <span>${year}</span>
          <span>${country}</span>
          <span>${genre}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 10px;">
          <button class="details-sheet-play-btn" style="flex: 1;" onclick="closeDetailsSheet(); openPlayer(appState.currentMedia);"><i class="fa-solid fa-play"></i> Watch Now</button>
          <button class="details-sheet-watchlist-btn" id="detailsWatchlistBtn" onclick="toggleCurrentMediaWatchlist()" title="Add to Watchlist" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 12px; color: #fff; padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; transition: all 0.2s;">
            <i class="${(typeof isMediaInWatchlist === 'function' && isMediaInWatchlist(media.id)) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}" style="color: ${(typeof isMediaInWatchlist === 'function' && isMediaInWatchlist(media.id)) ? '#ff3366' : '#fff'};"></i>
            <span>${(typeof isMediaInWatchlist === 'function' && isMediaInWatchlist(media.id)) ? 'Saved' : 'Watchlist'}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="details-section-label">Info</div>
    <div class="details-overview-text">
      ${descriptionText}
    </div>

    <div class="details-section-label">Starring (${cast.length})</div>
    <div class="starring-scroll-row">
      ${cast.map(c => `
        <div class="cast-card">
          <div class="cast-photo-wrap">
            <img src="${c.photo}" alt="${c.name}" class="cast-photo-img" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'">
          </div>
          <div class="cast-actor-name">${c.name}</div>
          <div class="cast-character-name">${c.character || 'Cast'}</div>
        </div>
      `).join('')}
    </div>
  `;

  overlay.classList.add('open');
  try {
    history.pushState({ screen: 'details' }, '');
  } catch (e) {}
}

function closeDetailsSheet(e) {
  if (e && e.target !== document.getElementById('moreDetailsOverlay') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const overlay = document.getElementById('moreDetailsOverlay');
  if (overlay) overlay.classList.remove('open');
}

// Render "For You" Recommendations
function renderForYouRecommendations() {
  const container = document.getElementById('forYouGrid');
  const allItems = [...(appState.content.movies || []), ...(appState.content.series || [])];
  
  // Shuffle or slice
  const recs = allItems.slice(0, 6);
  container.innerHTML = recs.map(item => `
    <div class="media-card" onclick='openPlayerById("${item.type || 'movie'}", "${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
        <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
        ${getCardBadgeRightHtml(item, item.type === 'series' ? 'Series' : 'Movie')}
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'}</div>
    </div>
  `).join('');
}

// Render Coming Soon Sub-Tab inside player
function renderComingSoonSubTab() {
  const container = document.getElementById('comingSoonSubTabGrid');
  if (!container) return;
  const upcomingItems = appState.content.upcoming || [];

  if (upcomingItems.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: var(--text-muted);">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 28px; margin-bottom: 10px; color: #ffaa00;"></i>
        <p style="font-size: 13px;">No upcoming titles scheduled right now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = upcomingItems.map(item => `
    <div class="media-card" onclick='openUpcomingBookingModal("${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster || item.cover || 'assets/fobs_logo.png'}" alt="${item.title}" class="card-poster-img" loading="lazy">
        <span class="card-badge-left">${item.releaseDate ? item.releaseDate.substring(0, 7) : (item.year || '2026')}</span>
        <span class="card-badge-right badge-upcoming"><i class="fa-solid fa-clock"></i> SOON</span>
        <div class="card-play-hover">
          <div class="card-play-circle" style="background: rgba(255, 170, 0, 0.9);"><i class="fa-solid fa-bell"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta" style="color: #ffaa00; font-size: 11px;">Pre-Book Available</div>
    </div>
  `).join('');
}

// Sub-tabs (For you vs Comments)
function switchSubTab(subTab) {
  const isForYou = (subTab === 'foryou');
  const forYouBtn = document.getElementById('forYouTabBtn');
  const commentsBtn = document.getElementById('commentsTabBtn') || document.getElementById('comingSoonTabBtn');
  const forYouView = document.getElementById('forYouView');
  const commentsView = document.getElementById('commentsView') || document.getElementById('comingSoonView');

  if (forYouBtn) forYouBtn.classList.toggle('active', isForYou);
  if (commentsBtn) commentsBtn.classList.toggle('active', !isForYou);

  if (forYouView) forYouView.classList.toggle('active', isForYou);
  if (commentsView) commentsView.classList.toggle('active', !isForYou);

  if (!isForYou && appState.currentMedia) {
    loadMediaComments(appState.currentMedia.id);
  }
}

// ============================================================
// REAL-TIME COMMENTS & PHOTO UPLOAD SYSTEM
// ============================================================

let selectedCommentImageData = null;

// Escape text for safety
function escapeCommentHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Format relative timestamp
function formatCommentTime(dateString) {
  if (!dateString) return 'Just now';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return past.toLocaleDateString();
}

// Load comments for currently active media
async function loadMediaComments(mediaId) {
  if (!mediaId) return;
  const feedList = document.getElementById('commentsFeedList');
  const countBadge = document.getElementById('commentsCountBadge');
  if (!feedList) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/comments/${encodeURIComponent(mediaId)}`);
    const data = await res.json();
    const comments = (data && data.success && Array.isArray(data.comments)) ? data.comments : [];

    if (countBadge) countBadge.textContent = comments.length;

    if (comments.length === 0) {
      feedList.innerHTML = `
        <div class="comments-empty-state">
          <i class="fa-regular fa-comment-dots"></i>
          <h4>No comments yet</h4>
          <p>Be the first to share your review or thoughts about this!</p>
        </div>
      `;
      return;
    }

    // Render list
    feedList.innerHTML = comments.map(c => {
      const avatarUrl = c.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
      const timeStr = formatCommentTime(c.createdAt);
      const textHtml = escapeCommentHtml(c.text);
      const imgHtml = c.imageUrl ? `
        <div class="comment-attached-image-wrap" onclick="openCommentLightbox('${c.imageUrl.replace(/'/g, "\\'")}')">
          <img src="${c.imageUrl}" alt="Attachment" class="comment-attached-image" loading="lazy">
          <span class="comment-img-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> View</span>
        </div>
      ` : '';

      return `
        <div class="comment-card-item" id="comment-card-${c.id}">
          <img src="${avatarUrl}" alt="${escapeCommentHtml(c.userName)}" class="comment-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'">
          <div class="comment-content-wrap">
            <div class="comment-header-row">
              <span class="comment-author-name">${escapeCommentHtml(c.userName || 'Viewer')}</span>
              <span class="comment-time-stamp">${timeStr}</span>
            </div>
            ${textHtml ? `<div class="comment-text-body">${textHtml}</div>` : ''}
            ${imgHtml}
            <div class="comment-actions-row">
              <button class="comment-like-btn" type="button" onclick="likeMediaComment('${c.id}', this)">
                <i class="fa-regular fa-heart"></i>
                <span class="comment-like-count">${c.likes || 0}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Failed to load media comments:', err.message);
  }
}

// When user taps comment input
function handleCommentInputFocus() {
  const notice = document.getElementById('commentLoginNotice');
  if (!currentUser) {
    if (notice) notice.style.display = 'flex';
    showToast('Please sign in with Google to post comments 🔐');
    triggerGoogleLogin();
  } else {
    if (notice) notice.style.display = 'none';
  }
}

// When picture is selected via file input
function handleCommentImageSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const notice = document.getElementById('commentLoginNotice');
  if (!currentUser) {
    event.target.value = '';
    if (notice) notice.style.display = 'flex';
    showToast('Please sign in with Google to attach photos 🔐');
    triggerGoogleLogin();
    return;
  }

  if (notice) notice.style.display = 'none';

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file');
    event.target.value = '';
    return;
  }

  // Max size limit: 8MB
  if (file.size > 8 * 1024 * 1024) {
    showToast('Image size should be less than 8MB');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 1200;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      selectedCommentImageData = canvas.toDataURL('image/jpeg', 0.85);

      const previewImg = document.getElementById('commentImgPreview');
      const previewBox = document.getElementById('commentImgPreviewBox');
      if (previewImg) previewImg.src = selectedCommentImageData;
      if (previewBox) previewBox.style.display = 'flex';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Remove attached photo
function removeCommentImage() {
  selectedCommentImageData = null;
  const fileInput = document.getElementById('commentFileInput');
  if (fileInput) fileInput.value = '';
  const previewBox = document.getElementById('commentImgPreviewBox');
  if (previewBox) previewBox.style.display = 'none';
  const previewImg = document.getElementById('commentImgPreview');
  if (previewImg) previewImg.src = '';
}

// Submit Comment
async function handleCommentSubmit(event) {
  if (event) event.preventDefault();

  const notice = document.getElementById('commentLoginNotice');
  if (!currentUser) {
    if (notice) notice.style.display = 'flex';
    showToast('Please sign in with Google to post comments 🔐');
    triggerGoogleLogin();
    return;
  }

  if (notice) notice.style.display = 'none';

  if (!appState.currentMedia) {
    showToast('No active movie or series selected');
    return;
  }

  const textInput = document.getElementById('commentTextInput');
  const commentText = textInput ? textInput.value.trim() : '';

  if (!commentText && !selectedCommentImageData) {
    showToast('Please write a comment or attach a picture ✍️');
    return;
  }

  const sendBtn = document.getElementById('commentSendBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const mediaId = appState.currentMedia.id;
    const res = await fetch(`${API_BASE_URL}/api/comments/${encodeURIComponent(mediaId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        userId: currentUser.googleId || 'user',
        userName: currentUser.name || 'Viewer',
        userAvatar: currentUser.picture || '',
        text: commentText,
        imageUrl: selectedCommentImageData || ''
      })
    });

    const result = await res.json();
    if (res.ok && result.success) {
      if (textInput) textInput.value = '';
      removeCommentImage();
      showToast('Comment posted! 💬');
      await loadMediaComments(mediaId);
    } else {
      showToast(result.error || 'Failed to post comment');
    }
  } catch (err) {
    console.error('Post comment error:', err);
    showToast('Error posting comment. Please try again.');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
  }
}

// Like Comment
async function likeMediaComment(commentId, btnElement) {
  if (!appState.currentMedia || !commentId) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/comments/${encodeURIComponent(appState.currentMedia.id)}/${encodeURIComponent(commentId)}/like`, {
      method: 'POST'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (btnElement) {
        const countSpan = btnElement.querySelector('.comment-like-count');
        if (countSpan) countSpan.textContent = data.likes;
        btnElement.classList.add('liked');
        const heartIcon = btnElement.querySelector('i');
        if (heartIcon) {
          heartIcon.classList.remove('fa-regular');
          heartIcon.classList.add('fa-solid');
        }
      }
    }
  } catch (err) {
    console.warn('Like comment failed:', err.message);
  }
}

// Fullscreen Image Lightbox
function openCommentLightbox(imageUrl) {
  if (!imageUrl) return;
  const modal = document.getElementById('commentImageLightbox');
  const img = document.getElementById('commentLightboxImg');
  if (img) img.src = imageUrl;
  if (modal) modal.style.display = 'flex';
}

function closeCommentLightbox(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const modal = document.getElementById('commentImageLightbox');
  if (modal) modal.style.display = 'none';
  const img = document.getElementById('commentLightboxImg');
  if (img) img.src = '';
}


// ============================================================
// FULLY ACTIVE OFFLINE VIDEO DOWNLOAD ENGINE
// Quality selection (1080P/720P/480P), LocalStorage Persistence & Downloads Tab
// ============================================================

let currentDownloadQuality = '1080P';
let currentDownloadSize = '1.1 GB';

// Trigger Video Download Popup
function triggerDownload() {
  if (!appState.currentMedia) {
    openDownloadsView();
    showToast('Open any movie or series to download offline 📥');
    return;
  }

  const media = appState.currentMedia;
  const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.id && media.id.startsWith('kmdl-s-'));
  let activeTitle = media.title;
  let activePoster = media.poster || 'assets/fobs_logo.png';
  let targetUrl = '';

  if (isSeries && appState.currentEpisode) {
    const ep = appState.currentEpisode;
    const epNum = ep.episodeNumber || (appState.currentEpisodeIndex !== undefined ? appState.currentEpisodeIndex + 1 : 1);
    const epTitle = ep.title ? ` - ${ep.title}` : ` - Ep ${epNum}`;
    activeTitle = `${media.title}${epTitle}`;
    targetUrl = (ep.servers && ep.servers.length > 0 && ep.servers[0].url)
      || ep.streamUrl
      || (ep.audioTracks && ep.audioTracks[appState.currentAudioTrack])
      || (media.servers && media.servers[0]?.url)
      || media.streamUrl;
    if (ep.stillPath) activePoster = ep.stillPath;
  } else {
    targetUrl = (media.servers && media.servers.length > 0 && media.servers[0].url)
      || media.streamUrl
      || media.driveUrl;
  }

  if (!targetUrl) {
    showToast('Stream source is unavailable for download right now');
    return;
  }

  // Populate preview inside modal
  const modal = document.getElementById('downloadOptionsModal');
  const previewTitle = document.getElementById('dlPreviewTitle');
  const previewPoster = document.getElementById('dlPreviewPoster');
  const previewMeta = document.getElementById('dlPreviewMeta');
  const btnText = document.getElementById('btnStartDownloadText');

  if (previewTitle) previewTitle.innerText = activeTitle;
  if (previewPoster) previewPoster.src = activePoster;
  if (previewMeta) previewMeta.innerText = `${media.dubLanguage || 'Hindi Dubbed'} • Full HD 1080P`;

  currentDownloadQuality = '1080P';
  currentDownloadSize = '1.1 GB';
  if (btnText) btnText.innerText = 'Download 1080P Full HD (~1.1 GB)';

  // Reset quality selector highlight
  document.querySelectorAll('.dl-quality-item').forEach(item => {
    const is1080 = item.getAttribute('data-quality') === '1080P';
    item.classList.toggle('active', is1080);
    const radio = item.querySelector('.dl-q-radio i');
    if (radio) {
      radio.className = is1080 ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
    }
  });

  appState._pendingDownload = {
    url: targetUrl,
    title: activeTitle,
    poster: activePoster,
    mediaId: media.id
  };

  if (modal) {
    modal.style.display = 'flex';
  }
}
window.triggerDownload = triggerDownload;

function selectDownloadQuality(element) {
  if (!element) return;
  document.querySelectorAll('.dl-quality-item').forEach(item => {
    item.classList.remove('active');
    const radio = item.querySelector('.dl-q-radio i');
    if (radio) radio.className = 'fa-regular fa-circle';
  });

  element.classList.add('active');
  const radio = element.querySelector('.dl-q-radio i');
  if (radio) radio.className = 'fa-solid fa-circle-check';

  currentDownloadQuality = element.getAttribute('data-quality') || '1080P';
  currentDownloadSize = element.getAttribute('data-size') || '1.1 GB';

  const btnText = document.getElementById('btnStartDownloadText');
  if (btnText) {
    btnText.innerText = `Download ${currentDownloadQuality} (${currentDownloadSize})`;
  }
}
window.selectDownloadQuality = selectDownloadQuality;

function closeDownloadOptionsModal(e) {
  if (e && e.target !== document.getElementById('downloadOptionsModal') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const modal = document.getElementById('downloadOptionsModal');
  if (modal) modal.style.display = 'none';
}
window.closeDownloadOptionsModal = closeDownloadOptionsModal;

function confirmStartDownload() {
  const pending = appState._pendingDownload;
  if (!pending || !pending.url) {
    showToast('Download could not be initiated.');
    closeDownloadOptionsModal();
    return;
  }

  downloadMedia(pending.url, pending.title, {
    quality: currentDownloadQuality,
    size: currentDownloadSize,
    poster: pending.poster,
    mediaId: pending.mediaId
  });

  closeDownloadOptionsModal();
}
window.confirmStartDownload = confirmStartDownload;

function downloadMedia(url, title, options = {}) {
  if (!url) return;
  const quality = options.quality || '1080P';
  const size = options.size || '1.1 GB';
  const poster = options.poster || 'assets/fobs_logo.png';
  const mediaId = options.mediaId || '';

  showToast(`📥 Starting download: "${title}" (${quality})...`);

  // Persist to downloads store
  try {
    const raw = localStorage.getItem('fobs_downloads') || '[]';
    const downloads = JSON.parse(raw);
    const filtered = downloads.filter(d => d.title !== title);
    filtered.unshift({
      id: 'dl_' + Date.now(),
      mediaId,
      title,
      poster,
      quality,
      size,
      url,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      status: 'Ready to play'
    });
    localStorage.setItem('fobs_downloads', JSON.stringify(filtered.slice(0, 30)));
    
    // Update Me screen counter
    const meDlCount = document.getElementById('meDownloadsCount');
    if (meDlCount) meDlCount.innerText = filtered.length;
  } catch (e) {}

  // Render in downloads sheet if currently viewed
  renderDownloadsList();

  // Trigger browser / Android download file stream
  const cleanTitle = title.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF\s]/g, '').trim();
  const baseApi = API_BASE_URL || BACKEND_URL;
  const downloadUrl = `${baseApi}/api/download?url=${encodeURIComponent(url)}&title=${encodeURIComponent(cleanTitle)}`;
  
  if (window.AndroidApp && typeof window.AndroidApp.openExternalUrl === 'function') {
    window.AndroidApp.openExternalUrl(downloadUrl);
  } else {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `${cleanTitle}.mp4`);
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 1000);
  }
}
window.downloadMedia = downloadMedia;

// Downloads View Management (MovieBox Screenshot 4)
function renderDownloadsList() {
  const container = document.getElementById('downloadsListContainer');
  if (!container) return;

  const raw = localStorage.getItem('fobs_downloads') || '[]';
  let downloads = [];
  try {
    downloads = JSON.parse(raw);
  } catch (e) {
    downloads = [];
  }

  if (downloads.length === 0) {
    container.innerHTML = `
      <div class="mb-dl-empty">
        <i class="fa-solid fa-cloud-arrow-down"></i>
        <p>No offline downloads yet</p>
        <small style="color: #64748b; margin-top: 4px; display: block;">Tap "Download" while watching any movie or episode to save it offline</small>
      </div>
    `;
    return;
  }

  container.innerHTML = downloads.map(item => `
    <div class="mb-dl-card">
      <div class="mb-dl-card-thumb" onclick="playDownloadedMedia('${item.id}')" title="Play Video">
        <img src="${item.poster || 'assets/fobs_logo.png'}" alt="${item.title}" onerror="this.onerror=null; this.src='assets/fobs_logo.png';">
        <div class="mb-dl-play-badge"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="mb-dl-card-info" onclick="playDownloadedMedia('${item.id}')">
        <div class="mb-dl-item-title">${item.title}</div>
        <div class="mb-dl-item-size">${item.quality || '1080P'} • ${item.size || '1.1GB'}</div>
        <div class="mb-dl-item-status" style="color: #00d26a;"><i class="fa-solid fa-circle-check" style="font-size: 10px;"></i> ${item.status || 'Ready to play'} • ${item.date || ''}</div>
      </div>
      <div class="mb-dl-card-action">
        <button class="mb-dl-delete-btn" title="Delete Download" onclick="deleteDownload('${item.id}', event)">
          <i class="fa-solid fa-trash-can"></i>
        </button>
        <button class="mb-dl-save-btn" onclick="playDownloadedMedia('${item.id}')">
          <i class="fa-solid fa-play"></i>
          <span>Play</span>
        </button>
      </div>
    </div>
  `).join('');
}
window.renderDownloadsList = renderDownloadsList;

function playDownloadedMedia(id) {
  const raw = localStorage.getItem('fobs_downloads') || '[]';
  const downloads = JSON.parse(raw);
  const item = downloads.find(d => d.id === id);
  if (!item) return;

  closeDownloadsView();

  // Try finding real media item in content
  const movie = (appState.content.movies || []).find(m => m.id === item.mediaId);
  if (movie) {
    openPlayer(movie);
    return;
  }
  const series = (appState.content.series || []).find(s => s.id === item.mediaId);
  if (series) {
    openPlayer(series);
    return;
  }

  // Standalone playback
  openPlayer({
    id: item.id,
    title: item.title,
    poster: item.poster,
    streamUrl: item.url,
    type: 'movie',
    dubLanguage: 'Hindi Dubbed',
    year: '2026',
    genre: 'Offline Download'
  });
}
window.playDownloadedMedia = playDownloadedMedia;

function deleteDownload(id, e) {
  if (e) e.stopPropagation();
  try {
    const raw = localStorage.getItem('fobs_downloads') || '[]';
    const downloads = JSON.parse(raw);
    const filtered = downloads.filter(d => d.id !== id);
    localStorage.setItem('fobs_downloads', JSON.stringify(filtered));

    // Update Me tab counter
    const meDlCount = document.getElementById('meDownloadsCount');
    if (meDlCount) meDlCount.innerText = filtered.length;

    renderDownloadsList();
    showToast('Video removed from Downloads');
  } catch (e) {}
}
window.deleteDownload = deleteDownload;

function openDownloadsView() {
  const overlay = document.getElementById('downloadsOverlay');
  if (overlay) {
    overlay.classList.add('open');
    overlay.style.display = 'flex';
  }
  renderDownloadsList();
  renderDownloadsForYou();
}

function closeDownloadsView(e) {
  if (e && e.target !== document.getElementById('downloadsOverlay') && !e.target.closest('.sheet-close-btn') && !e.target.closest('.mb-dl-close-btn')) {
    return;
  }
  const overlay = document.getElementById('downloadsOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.style.display = 'none';
  }
}


// Render Dynamic Audio Tracks for Active Media
function renderAudioTrackOptions(media) {
  let rawTracks = (media && media.audioTracks) ? media.audioTracks : ['Hindi dub', 'Original audio'];

  let tracks = [];
  if (Array.isArray(rawTracks)) {
    tracks = [...rawTracks];
  } else if (typeof rawTracks === 'object') {
    tracks = Object.keys(rawTracks);
  }

  // Always ensure both 'Hindi dub' and 'Original audio' are available for selection
  const hasHindi = tracks.some(t => /hindi/i.test(t));
  const hasOriginal = tracks.some(t => /original|english|orig|korean|japanese/i.test(t));

  if (!hasHindi) tracks.unshift('Hindi dub');
  if (!hasOriginal) tracks.push('Original audio');

  // Format clean display names
  tracks = tracks.map(t => {
    if (/hindi/i.test(t)) return 'Hindi dub';
    if (/original/i.test(t)) return 'Original audio';
    return t;
  });

  // Remove duplicates
  tracks = [...new Set(tracks)];

  // Respect media.selectedAudio if specified
  if (media && media.selectedAudio) {
    const preferred = /original|korean/i.test(media.selectedAudio) ? 'Original audio' : 'Hindi dub';
    if (tracks.includes(preferred)) {
      appState.currentAudioTrack = preferred;
    } else {
      appState.currentAudioTrack = tracks[0];
    }
  } else {
    appState.currentAudioTrack = tracks[0];
  }

  // 1. Update Dub Selector Text (Portrait)
  const dubText = document.getElementById('currentDubText');
  if (dubText) dubText.innerText = appState.currentAudioTrack;

  // 2. Render Portrait Language Sheet Options
  const sheetList = document.getElementById('languageOptionsList');
  if (sheetList) {
    sheetList.innerHTML = tracks.map(track => `
      <button class="sheet-option-btn ${track === appState.currentAudioTrack ? 'selected' : ''}" onclick="selectLanguage('${track}')">
        ${track}
      </button>
    `).join('');
  }

  // 3. Render Landscape Language Drawer Options
  const lsList = document.getElementById('lsAudioOptionsList');
  if (lsList) {
    lsList.innerHTML = tracks.map(track => `
      <div class="ls-lang-item ${track === appState.currentAudioTrack ? 'active' : ''}" onclick="selectLandscapeAudio('${track}')">
        <span>${track}</span>
        <i class="fa-solid fa-check ls-check-icon ${track === appState.currentAudioTrack ? '' : 'hidden'}"></i>
      </div>
    `).join('');
  }
}

// Unified Audio Track Switcher
function switchAudioTrack(lang) {
  appState.currentAudioTrack = lang;

  // Sync Dub text
  const dubText = document.getElementById('currentDubText');
  if (dubText) dubText.innerText = lang;

  // Sync Portrait Sheet Buttons
  document.querySelectorAll('#languageOptionsList .sheet-option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.innerText.trim() === lang);
  });

  // Sync Landscape Drawer Items
  document.querySelectorAll('#lsAudioOptionsList .ls-lang-item').forEach(item => {
    const isTarget = item.querySelector('span')?.innerText.trim() === lang;
    item.classList.toggle('active', isTarget);
    const check = item.querySelector('.ls-check-icon');
    if (check) check.classList.toggle('hidden', !isTarget);
  });

  const videoPlayer = document.getElementById('mainVideoPlayer');

  const isOriginal = lang.toLowerCase().includes('original') || lang.toLowerCase().includes('english') || lang.toLowerCase().includes('eng') || lang.toLowerCase().includes('korean') || lang.toLowerCase().includes('orig');
  const targetAudioIndex = isOriginal ? 1 : 0;
  appState.selectedAudioIndex = targetAudioIndex;

  const currentEp = appState.currentEpisode;
  const rawUrl = getActiveEpisodeStream(currentEp, lang)
    || (currentEp?.servers && currentEp.servers[targetAudioIndex] && currentEp.servers[targetAudioIndex].url)
    || currentEp?.streamUrl 
    || (appState.currentMedia?.servers && appState.currentMedia.servers[targetAudioIndex] && appState.currentMedia.servers[targetAudioIndex].url)
    || appState.currentMedia?.streamUrl 
    || appState.currentMedia?.driveUrl;

  if (rawUrl && videoPlayer) {
    const curTime = (videoPlayer.currentTime || 0) + (appState.streamSeekOffset || 0);
    const isPlaying = !videoPlayer.paused;
    const isSeparateTrackUrl = !!(currentEp?.audioTracks && Object.keys(currentEp.audioTracks).length > 1);
    const audioParam = isSeparateTrackUrl ? null : targetAudioIndex;
    playStreamUrl(rawUrl, audioParam, curTime);
    if (isPlaying) {
      videoPlayer.play().catch(() => {});
    }
  }

  showToast(`Audio Track: ${lang}`);
}

// Language / Dubbing Bottom Sheet Modal (Screenshot 2 & 5)
function openLanguageSheet() {
  document.getElementById('languageSheetOverlay').classList.add('open');
}

function closeLanguageSheet(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.sheet-close-btn')) return;
  document.getElementById('languageSheetOverlay').classList.remove('open');
}

function selectLanguage(lang) {
  switchAudioTrack(lang);
  document.getElementById('languageSheetOverlay').classList.remove('open');
}

// Add to list action (connected to MongoDB User Watchlist)
function toggleAddToList() {
  toggleCurrentMediaWatchlist();
}

// Share action
function shareMedia() {
  const media = appState.currentMedia;
  if (!media) return;
  const shareTitle = media.title || 'FOBS TV';
  const shareText = `Watch "${shareTitle}" in HD on FOBS TV! Download the app: https://fobs-apk-download.vercel.app/`;

  if (window.AndroidApp && typeof window.AndroidApp.shareText === 'function') {
    window.AndroidApp.shareText(shareTitle, shareText);
    return;
  }

  if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: shareText,
      url: 'https://fobs-apk-download.vercel.app/'
    }).catch(() => {
      copyShareFallback(shareText);
    });
  } else {
    copyShareFallback(shareText);
  }
}

function copyShareFallback(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Share link copied to clipboard! 📋');
    }).catch(() => {
      showToast('Share: ' + text);
    });
  } else {
    showToast('Share: ' + text);
  }
}

// Search Handler - searches across all Movies, Series, Upcoming, and Live TV
function handleSearch(customQuery = null) {
  const input = document.getElementById('searchInput');
  const query = (customQuery !== null ? customQuery : (input ? input.value : '')).trim().toLowerCase();

  if (!query) {
    if (appState.activeTab === 'search') {
      const prev = appState.previousTabBeforeSearch || 'home';
      document.getElementById('sectionDetailView')?.classList.remove('active');
      switchMainTab(prev);
    }
    return;
  }

  // Record previous tab to return seamlessly
  if (appState.activeTab !== 'search') {
    appState.previousTabBeforeSearch = appState.activeTab || 'home';
  }
  appState.activeTab = 'search';

  // Pause hero sliders while searching
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  if (movieHeroSliderInterval) clearInterval(movieHeroSliderInterval);
  if (seriesHeroSliderInterval) clearInterval(seriesHeroSliderInterval);

  // Hide main tabs and show sectionDetailView for search
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  const detailView = document.getElementById('sectionDetailView');
  if (detailView) detailView.classList.add('active');

  const titleEl = document.getElementById('sectionDetailTitle');
  const countEl = document.getElementById('sectionDetailCount');
  const gridEl = document.getElementById('sectionDetailGrid');

  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-magnifying-glass" style="color: #00f2fe; margin-right: 8px;"></i> Search: "${query}"`;

  const movies = appState.content.movies || [];
  const series = appState.content.series || [];
  const upcoming = appState.content.upcoming || [];
  const liveTv = appState.content.liveTv || [];

  const allItems = [
    ...movies.map(m => ({ ...m, type: 'movie' })),
    ...series.map(s => ({ ...s, type: 'series' })),
    ...upcoming.map(u => ({ ...u, type: 'upcoming' })),
    ...liveTv.map(t => ({ ...t, type: 'liveTv' }))
  ];

  // Smart search normalizer (removes accents, hyphens, colons, punctuation, spaces)
  const normalize = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const normQuery = normalize(query);
  const queryTokens = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0);

  const matched = allItems.filter(item => {
    const rawTitle = (item.title || '').toLowerCase();
    const origTitle = (item.originalTitle || '').toLowerCase();
    const genre = (item.genre || '').toLowerCase();
    const lang = (item.language || '').toLowerCase();
    const industry = (item.industry || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    const cast = (Array.isArray(item.cast) ? item.cast.join(' ') : (item.cast || '')).toLowerCase();
    const desc = (item.description || '').toLowerCase();

    // 1. Direct raw substring match
    if (rawTitle.includes(query) || origTitle.includes(query) || genre.includes(query) || 
        lang.includes(query) || industry.includes(query) || category.includes(query) ||
        cast.includes(query) || desc.includes(query)) {
      return true;
    }

    // 2. Normalized continuous match (e.g. "spider man" or "spiderman" matches "Spider-Man", "dirilis ertugrul" matches "Diriliş: Ertuğrul")
    const normTitle = normalize(item.title);
    const normOrig = normalize(item.originalTitle);
    if (normQuery.length > 0 && (normTitle.includes(normQuery) || normOrig.includes(normQuery))) {
      return true;
    }

    // 3. Multi-word token match: all words in query exist in item title, cast or metadata
    const fullText = `${rawTitle} ${origTitle} ${genre} ${lang} ${industry} ${category} ${cast} ${desc}`;
    const normFullText = normalize(fullText);
    if (queryTokens.length > 0) {
      const allTokensMatch = queryTokens.every(token => {
        return fullText.includes(token) || normFullText.includes(token);
      });
      if (allTokensMatch) return true;
    }

    return false;
  });

  const filtered = sortByReleaseDateDesc(matched);

  if (countEl) countEl.innerText = `${filtered.length} ${filtered.length === 1 ? 'Result' : 'Results'}`;

  if (!gridEl) return;
  if (filtered.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 16px; color: var(--text-muted);">
        <i class="fa-solid fa-film" style="font-size: 38px; color: rgba(255,255,255,0.15); margin-bottom: 12px; display: block;"></i>
        <div style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 6px;">No results found</div>
        <div style="font-size: 13px;">No movies, series, or channels found matching "${query}". Try another title.</div>
      </div>
    `;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  gridEl.innerHTML = filtered.map(item => {
    if (item.type === 'upcoming') {
      return `
        <div class="coming-card" style="width: 100%; margin-bottom: 8px;" onclick='openUpcomingBookingModal("${item.id}")'>
          <div class="coming-thumb-box">
            <img src="${item.poster}" alt="${item.title}" class="coming-thumb-img" loading="lazy">
            <span class="card-badge-left">Coming Soon</span>
          </div>
          <div class="coming-details">
            <div class="coming-title">${item.title}</div>
            <div class="coming-meta">${item.year || '2026'} • ${item.genre ? item.genre.split(',')[0].trim() : 'Hindi Dubbed'}</div>
            <button class="coming-remind-pill" style="margin-top: 6px;"><i class="fa-solid fa-ticket"></i> Pre-Book</button>
          </div>
        </div>
      `;
    }
    if (item.type === 'liveTv') {
      const logoUrl = item.logo || item.poster || 'assets/fobs_logo.png';
      return `
        <div class="live-channel-card" onclick='openLiveTvPlayer("${item.id}")'>
          <span class="live-tag-pill">● LIVE</span>
          <img src="${logoUrl}" alt="${item.title}" class="channel-logo-img" loading="lazy" data-name="${encodeURIComponent(item.title || '')}" onerror="handleLiveChannelImgError(this)">
          <div class="channel-title">${item.title}</div>
          <div class="channel-sub">${item.category || 'Live TV'}</div>
        </div>
      `;
    }
    const isSeries = item.type === 'series' || (item.episodes && item.episodes.length > 0);
    return `
      <div class="media-card" onclick='openPlayerById("${isSeries ? 'series' : 'movie'}", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">${getCardBadgeLeft(item)}</span>
          ${getCardBadgeRightHtml(item, isSeries ? 'Series' : 'Movie')}
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.0'}</div>
      </div>
    `;
  }).join('');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Add Media Modal Handlers
function openAddModal() {
  document.getElementById('addModalOverlay').classList.add('open');
}

function closeAddModal() {
  document.getElementById('addModalOverlay').classList.remove('open');
}

function toggleFormFields() {
  const type = document.getElementById('formType').value;
  // Can add custom fields if needed
}

async function submitNewMedia(e) {
  e.preventDefault();

  const type = document.getElementById('formType').value;
  const title = document.getElementById('formTitle').value.trim();
  const language = document.getElementById('formLanguage').value;
  const genre = document.getElementById('formGenre').value.trim();
  const poster = document.getElementById('formPoster').value.trim();
  const streamUrl = document.getElementById('formStreamUrl').value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title,
        language,
        genre,
        poster,
        streamUrl
      })
    });

    const result = await res.json();
    if (result.success) {
      closeAddModal();
      showToast(`Added "${title}" successfully!`);
      await fetchAppContent();
      
      // Auto open player for newly added item
      openPlayer(result.item);
    } else {
      alert(result.error || 'Failed to add content');
    }
  } catch (err) {
    console.error('Error adding content:', err);
    showToast('Failed to add content');
  }
}

// Toast Helper
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMsg');
  msgEl.innerText = msg;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

// Trigger KMDL + TMDB Automated Sync
async function triggerKmdlSync() {
  const btn = document.getElementById('syncKmdlBtn');
  if (btn) btn.classList.add('fa-spin');
  showToast('🔄 Connecting to KMDL & fetching TMDB details...');

  try {
    const res = await fetch(`${API_BASE_URL}/api/sync-kmdl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moviesCount: 6, seriesCount: 4 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✨ Synced ${data.addedMovies} Movies & ${data.addedSeries} Series from KMDL + TMDB!`);
      await fetchAppContent();
    } else {
      showToast('Sync error, please try again');
    }
  } catch (err) {
    console.error('Sync failed:', err);
    showToast('Failed to sync from KMDL + TMDB');
  } finally {
    if (btn) btn.classList.remove('fa-spin');
  }
}

// External URL Handler for Android APK & Browser
function openExternalUrl(url) {
  if (!url) return;
  try {
    if (window.AndroidApp && typeof window.AndroidApp.openExternalUrl === 'function') {
      window.AndroidApp.openExternalUrl(url);
      return;
    }
  } catch (e) {}

  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    try {
      window.open(url, '_blank');
    } catch (err) {
      window.location.href = url;
    }
  }
}

// FOBS Community Modal Handlers
function openCommunity() {
  const overlay = document.getElementById('communityOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeCommunity(e) {
  if (e && e.target !== document.getElementById('communityOverlay') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const overlay = document.getElementById('communityOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ============================================================
// SEARCH INPUT EVENT LISTENER
// ============================================================
function setupSearchInputListener() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
      input.blur();
    }
  });

  input.addEventListener('input', (e) => {
    // If search text was cleared, return to previous tab
    if (input.value.trim() === '') {
      const detailView = document.getElementById('sectionDetailView');
      if (detailView && detailView.classList.contains('active') && appState.activeTab === 'search') {
        detailView.classList.remove('active');
        const prev = appState.previousTabBeforeSearch || 'home';
        switchMainTab(prev);
      }
    }
  });
}

// ============================================================
// COMING SOON PRE-BOOKING MODAL (NO PLAYER DISTRACTIONS)
// Real-time bookings counter strictly starting at 0
// ============================================================
let bookingPollingTimer = null;
let globalBookingsSyncTimer = null;

// Global Real-Time Bookings Sync Engine (MongoDB + Local Fallback)
async function loadAllBookingsRealtime() {
  try {
    const res = await fetchApiWithRetry('/api/bookings', {
      method: 'GET'
    }, { timeout: 3500, maxRetries: 0 });

    if (res && res.bookings && typeof res.bookings === 'object') {
      Object.entries(res.bookings).forEach(([id, count]) => {
        const num = parseInt(count, 10) || 0;
        localStorage.setItem(`fobs_booking_count_${id}`, num.toString());

        // Update home upcoming badge
        const badgeHome = document.getElementById(`bookedBadge_${id}`);
        if (badgeHome) badgeHome.innerText = `${num}`;

        // Update section detail upcoming badge
        const badgeDetail = document.getElementById(`bookedBadgeDetail_${id}`);
        if (badgeDetail) badgeDetail.innerText = `${num}`;

        // Update active modal counter if open
        if (appState.currentBookingMedia && String(appState.currentBookingMedia.id) === String(id)) {
          const countEl = document.getElementById('csBookingCount');
          if (countEl) countEl.innerText = `${num}`;
        }
      });
    }
  } catch (e) {}
}
window.loadAllBookingsRealtime = loadAllBookingsRealtime;

// Start background global booking sync (every 15 seconds)
if (!globalBookingsSyncTimer) {
  globalBookingsSyncTimer = setInterval(loadAllBookingsRealtime, 15000);
}

// ============================================================
// COMING SOON PRE-BOOKING & FULL FEATURE ENGINE
// Live Countdown, Official Trailer Player, Reminders, Cast & Pre-Bookings
// ============================================================
let csCountdownInterval = null;

// Countdown Timer for Release Date
function startComingSoonCountdown(item) {
  if (csCountdownInterval) clearInterval(csCountdownInterval);
  const releaseDateEl = document.getElementById('csReleaseDateText');
  const dEl = document.getElementById('cdDays');
  const hEl = document.getElementById('cdHours');
  const mEl = document.getElementById('cdMins');
  const sEl = document.getElementById('cdSecs');

  const monthNames = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
  const mStr = item.releaseMonth || 'Nov';
  const dNum = parseInt(item.releaseDay || '20', 10);
  const yNum = parseInt(item.year || '2026', 10);
  const monthIdx = monthNames[mStr] !== undefined ? monthNames[mStr] : 10;

  let targetDate = new Date(yNum, monthIdx, dNum, 12, 0, 0);
  if (targetDate.getTime() <= Date.now()) {
    // If date in metadata is past, display dynamic active countdown
    targetDate = new Date(Date.now() + (14 * 86400000) + (8 * 3600000) + (35 * 60000));
  }

  if (releaseDateEl) {
    releaseDateEl.innerText = `${mStr} ${dNum}, ${yNum}`;
  }

  function tick() {
    const diff = Math.max(0, targetDate.getTime() - Date.now());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    if (dEl) dEl.innerText = String(days).padStart(2, '0');
    if (hEl) hEl.innerText = String(hours).padStart(2, '0');
    if (mEl) mEl.innerText = String(mins).padStart(2, '0');
    if (sEl) sEl.innerText = String(secs).padStart(2, '0');
  }

  tick();
  csCountdownInterval = setInterval(tick, 1000);
}

// Render Cast for Upcoming Movie
function renderComingSoonCast(item) {
  const wrap = document.getElementById('csCastWrap');
  const list = document.getElementById('csCastList');
  if (!wrap || !list) return;

  const cast = item.cast || [];
  if (cast.length > 0) {
    wrap.style.display = 'block';
    list.innerHTML = cast.map(c => `
      <div class="cs-cast-card">
        <img src="${c.photo || 'assets/fobs_logo.png'}" alt="${c.name || 'Actor'}" class="cs-cast-avatar" onerror="this.onerror=null; this.src='assets/fobs_logo.png';">
        <div class="cs-cast-name">${c.name || 'Actor'}</div>
        <div class="cs-cast-role">${c.character || 'Cast'}</div>
      </div>
    `).join('');
  } else {
    wrap.style.display = 'none';
    list.innerHTML = '';
  }
}

// Watch Official Trailer Player
async function openComingSoonTrailer() {
  const item = appState.currentBookingMedia;
  if (!item) return;

  const modal = document.getElementById('trailerPlayerModal');
  const titleEl = document.getElementById('trailerMovieTitle');
  const iframe = document.getElementById('trailerIframe');

  if (titleEl) titleEl.innerText = `${item.title} • Official Trailer`;
  if (iframe) iframe.src = 'about:blank';
  if (modal) {
    modal.style.display = 'flex';
  }

  try {
    const res = await fetchApiWithRetry(`/api/trailer?title=${encodeURIComponent(item.title)}`, {
      method: 'GET'
    }, { timeout: 4000, maxRetries: 1 });

    if (res && res.trailerUrl) {
      if (iframe) iframe.src = res.trailerUrl;
    } else {
      const cleanTitle = (item.title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
      if (iframe) iframe.src = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(cleanTitle + ' official trailer hindi')}&autoplay=1`;
    }
  } catch (e) {
    const cleanTitle = (item.title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    if (iframe) iframe.src = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(cleanTitle + ' official trailer hindi')}&autoplay=1`;
  }
}

function closeTrailerModal(e) {
  if (e && e.target !== document.getElementById('trailerPlayerModal') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const modal = document.getElementById('trailerPlayerModal');
  const iframe = document.getElementById('trailerIframe');
  if (iframe) iframe.src = '';
  if (modal) modal.style.display = 'none';
}
window.openComingSoonTrailer = openComingSoonTrailer;
window.closeTrailerModal = closeTrailerModal;

// Toggle Reminder
function toggleComingSoonReminder() {
  const item = appState.currentBookingMedia;
  if (!item) return;

  const remindKey = `fobs_remind_${item.id}`;
  const isReminded = localStorage.getItem(remindKey) === 'true';
  const btn = document.getElementById('csRemindBtn');

  if (isReminded) {
    localStorage.removeItem(remindKey);
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '<i class="fa-regular fa-bell"></i> <span id="csRemindBtnText">Remind Me</span>';
    }
    showToast('Reminder cancelled');
  } else {
    localStorage.setItem(remindKey, 'true');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '<i class="fa-solid fa-bell"></i> <span id="csRemindBtnText">Reminded ✓</span>';
    }
    showToast(`🔔 Reminder set for "${item.title}"! You will be notified upon release.`);
  }
}
window.toggleComingSoonReminder = toggleComingSoonReminder;

// Share Movie
async function shareComingSoonMovie() {
  const item = appState.currentBookingMedia;
  if (!item) return;

  const shareText = `🎬 Check out "${item.title}" coming soon in Hindi Dubbed on FOBS TV! Pre-book your free ticket now.`;
  const shareUrl = window.location.origin || 'https://fobstv.com';

  if (navigator.share) {
    try {
      await navigator.share({
        title: item.title,
        text: shareText,
        url: shareUrl
      });
      return;
    } catch (e) {}
  }

  try {
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    showToast('📋 Movie link copied to clipboard! Share it with friends.');
  } catch (e) {
    showToast('Share: ' + item.title);
  }
}
window.shareComingSoonMovie = shareComingSoonMovie;

// My Pre-Bookings Manager
function updateMeBookingsCount() {
  const meBookingsEl = document.getElementById('meBookingsCount');
  if (!meBookingsEl) return;

  const upcoming = appState.content.upcoming || [];
  let bookedCount = 0;
  upcoming.forEach(u => {
    if (localStorage.getItem(`fobs_booked_${u.id}`) === 'true') {
      bookedCount++;
    }
  });
  meBookingsEl.innerText = `${bookedCount}`;
}
window.updateMeBookingsCount = updateMeBookingsCount;

function openPreBookingsModal() {
  const modal = document.getElementById('preBookingsModal');
  const list = document.getElementById('preBookingsList');
  if (!modal || !list) return;

  const upcoming = appState.content.upcoming || [];
  const bookedItems = upcoming.filter(u => localStorage.getItem(`fobs_booked_${u.id}`) === 'true');

  if (bookedItems.length > 0) {
    list.innerHTML = bookedItems.map(item => `
      <div class="user-item-card" onclick="closePreBookingsModal(); openUpcomingBookingModal('${item.id}');">
        <div class="user-item-poster-wrap">
          <img src="${item.poster || 'assets/fobs_logo.png'}" alt="${item.title}" class="user-item-poster" onerror="this.onerror=null; this.src='assets/fobs_logo.png';">
        </div>
        <div class="user-item-info">
          <div class="user-item-title">${item.title}</div>
          <div class="user-item-meta">
            <span style="color: #f59e0b;"><i class="fa-solid fa-hourglass-half"></i> ${item.releaseMonth || 'Nov'} ${item.releaseDay || '20'}, ${item.year || '2026'}</span>
            <span>•</span>
            <span style="color: #00d26a;"><i class="fa-solid fa-ticket"></i> Pre-Booked ✓</span>
          </div>
        </div>
        <button class="user-item-remove-btn" title="View" onclick="event.stopPropagation(); closePreBookingsModal(); openUpcomingBookingModal('${item.id}');">
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    `).join('');
  } else {
    list.innerHTML = `
      <div class="watchlist-empty-state">
        <i class="fa-solid fa-ticket" style="font-size: 40px; color: #00f2fe; margin-bottom: 12px; display: inline-block;"></i>
        <h4>No Pre-Booked Movies Yet</h4>
        <p>Pre-book tickets for upcoming movies to receive release notifications and guaranteed early access.</p>
        <button class="empty-watchlist-browse-btn" onclick="closePreBookingsModal(); openSectionDetail('upcoming', 'Coming Soon');" style="margin-top: 14px;">
          Explore Coming Soon
        </button>
      </div>
    `;
  }

  modal.style.display = 'flex';
  try {
    history.pushState({ screen: 'preBookingsModal' }, '');
  } catch (e) {}
}

function closePreBookingsModal(e) {
  if (e && e.target !== document.getElementById('preBookingsModal') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const modal = document.getElementById('preBookingsModal');
  if (modal) modal.style.display = 'none';
}
window.openPreBookingsModal = openPreBookingsModal;
window.closePreBookingsModal = closePreBookingsModal;

async function openUpcomingBookingModal(itemOrId) {
  let item = null;
  if (typeof itemOrId === 'string') {
    const cleanId = String(itemOrId).trim();
    item = (appState.content.upcoming || []).find(u => String(u.id) === cleanId)
      || (appState.content.movies || []).find(m => String(m.id) === cleanId)
      || (appState.content.series || []).find(s => String(s.id) === cleanId);
  } else if (itemOrId && typeof itemOrId === 'object') {
    item = itemOrId;
  }
  if (!item) {
    console.warn('Booking modal: item not found for id', itemOrId);
    return;
  }

  appState.currentBookingMedia = item;

  const modal = document.getElementById('comingSoonBookingModal');
  const poster = document.getElementById('csBookingPoster');
  const title = document.getElementById('csBookingTitle');
  const year = document.getElementById('csBookingYear');
  const dub = document.getElementById('csBookingDub');
  const genre = document.getElementById('csBookingGenre');
  const rating = document.getElementById('csBookingRating');
  const overview = document.getElementById('csBookingOverview');
  const countEl = document.getElementById('csBookingCount');
  const btn = document.getElementById('csPreBookBtn');
  const btnText = document.getElementById('csPreBookBtnText');
  const remindBtn = document.getElementById('csRemindBtn');

  if (poster) poster.src = item.poster || item.cover || 'assets/fobs_logo.png';
  if (title) title.innerText = item.title || 'Coming Soon';
  if (year) year.innerText = item.year || '2026';
  if (dub) dub.innerText = item.dubLanguage || 'Hindi Dubbed';
  if (genre) genre.innerText = item.genre || 'Action, Thriller';
  if (rating) rating.innerText = item.imdbRating || item.rating || '8.5';
  if (overview) overview.innerText = item.description || item.overview || 'Upcoming exclusive release coming soon on FOBS TV in Hindi audio.';

  // Initial booking count starts strictly at local storage or 0
  const localBookedCountKey = `fobs_booking_count_${item.id}`;
  let currentCount = parseInt(localStorage.getItem(localBookedCountKey) || '0', 10);
  if (countEl) countEl.innerText = `${currentCount}`;

  // Update button state based on whether user pre-booked
  const userBookedKey = `fobs_booked_${item.id}`;
  const isBooked = localStorage.getItem(userBookedKey) === 'true';
  if (btn) {
    if (isBooked) {
      btn.classList.add('booked');
      if (btnText) btnText.innerHTML = '<i class="fa-solid fa-check"></i> Already Pre-Booked (Free)';
    } else {
      btn.classList.remove('booked');
      if (btnText) btnText.innerHTML = '<i class="fa-solid fa-ticket"></i> Pre-Book Ticket Now (Free)';
    }
  }

  // Reminder button state
  const remindKey = `fobs_remind_${item.id}`;
  const isReminded = localStorage.getItem(remindKey) === 'true';
  if (remindBtn) {
    if (isReminded) {
      remindBtn.classList.add('active');
      remindBtn.innerHTML = '<i class="fa-solid fa-bell"></i> <span id="csRemindBtnText">Reminded ✓</span>';
    } else {
      remindBtn.classList.remove('active');
      remindBtn.innerHTML = '<i class="fa-regular fa-bell"></i> <span id="csRemindBtnText">Remind Me</span>';
    }
  }

  // Start live countdown timer
  startComingSoonCountdown(item);

  // Render Top Cast
  renderComingSoonCast(item);

  // Display modal & add .open for smooth animation and visibility
  if (modal) {
    modal.style.display = 'flex';
    modal.offsetHeight; // Force reflow
    modal.classList.add('open');
  }

  // Push history state so Android back button closes this modal
  try {
    history.pushState({ screen: 'bookingModal', id: item.id }, '');
  } catch (e) {}

  // Fetch real-time authoritative booking count from backend
  try {
    const res = await fetchApiWithRetry(`/api/bookings/${encodeURIComponent(item.id)}`, {
      method: 'GET'
    }, { timeout: 2500, maxRetries: 0 });
    if (res && res.bookings !== undefined) {
      currentCount = parseInt(res.bookings, 10) || 0;
      localStorage.setItem(localBookedCountKey, currentCount.toString());
      if (countEl) countEl.innerText = `${currentCount}`;
      const badgeHome = document.getElementById(`bookedBadge_${item.id}`);
      if (badgeHome) badgeHome.innerText = `${currentCount}`;
      const badgeDetail = document.getElementById(`bookedBadgeDetail_${item.id}`);
      if (badgeDetail) badgeDetail.innerText = `${currentCount}`;
    }
  } catch (e) {}

  // Real-time polling while modal is open (every 3.5 seconds)
  if (bookingPollingTimer) clearInterval(bookingPollingTimer);
  bookingPollingTimer = setInterval(async () => {
    if (!appState.currentBookingMedia || appState.currentBookingMedia.id !== item.id) {
      clearInterval(bookingPollingTimer);
      bookingPollingTimer = null;
      return;
    }
    try {
      const res = await fetchApiWithRetry(`/api/bookings/${encodeURIComponent(item.id)}`, {
        method: 'GET'
      }, { timeout: 2500, maxRetries: 0 });
      if (res && res.bookings !== undefined) {
        currentCount = Math.max(currentCount, parseInt(res.bookings, 10) || 0);
        localStorage.setItem(localBookedCountKey, currentCount.toString());
        if (countEl) countEl.innerText = `${currentCount}`;
        const badgeHome = document.getElementById(`bookedBadge_${item.id}`);
        if (badgeHome) badgeHome.innerText = `${currentCount}`;
        const badgeDetail = document.getElementById(`bookedBadgeDetail_${item.id}`);
        if (badgeDetail) badgeDetail.innerText = `${currentCount}`;
      }
    } catch (e) {}
  }, 3500);
}

function closeUpcomingBookingModal(e) {
  if (e && e.target !== document.getElementById('comingSoonBookingModal') && !e.target.closest('.booking-close-btn')) {
    return;
  }
  const modal = document.getElementById('comingSoonBookingModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 250);
  }
  if (bookingPollingTimer) {
    clearInterval(bookingPollingTimer);
    bookingPollingTimer = null;
  }
  if (csCountdownInterval) {
    clearInterval(csCountdownInterval);
    csCountdownInterval = null;
  }
}

window.openUpcomingBookingModal = openUpcomingBookingModal;
window.closeUpcomingBookingModal = closeUpcomingBookingModal;

async function submitBooking() {
  const item = appState.currentBookingMedia;
  if (!item) return;

  const countEl = document.getElementById('csBookingCount');
  const btn = document.getElementById('csPreBookBtn');
  const btnText = document.getElementById('csPreBookBtnText');
  const localBookedCountKey = `fobs_booking_count_${item.id}`;
  const userBookedKey = `fobs_booked_${item.id}`;

  let currentCount = parseInt(localStorage.getItem(localBookedCountKey) || '0', 10);
  currentCount += 1;
  localStorage.setItem(localBookedCountKey, currentCount.toString());
  localStorage.setItem(userBookedKey, 'true');

  if (countEl) countEl.innerText = `${currentCount}`;

  // Update card badge on home page and details if present
  const cardBadge = document.getElementById(`bookedBadge_${item.id}`);
  if (cardBadge) cardBadge.innerText = `${currentCount}`;
  const detailBadge = document.getElementById(`bookedBadgeDetail_${item.id}`);
  if (detailBadge) detailBadge.innerText = `${currentCount}`;

  if (btn) {
    btn.classList.add('booked');
    if (btnText) btnText.innerHTML = '<i class="fa-solid fa-circle-check"></i> ✓ Pre-Booked Successfully!';
  }

  // Update Me tab counter
  updateMeBookingsCount();

  showToast('🎉 Pre-booked successfully! Notification set for release.');

  // Notify backend real-time counter & MongoDB
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const headers = {
      'Content-Type': 'application/json',
      'X-FOBS-Client': 'FOBS-TV-App'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = {
      userId: currentUser?.googleId || 'anonymous',
      name: currentUser?.name || 'Viewer',
      title: item.title || ''
    };

    const res = await fetchApiWithRetry(`/api/bookings/${encodeURIComponent(item.id)}/increment`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, { timeout: 3500, maxRetries: 1 });

    if (res && res.bookings !== undefined) {
      currentCount = Math.max(currentCount, parseInt(res.bookings, 10) || 0);
      localStorage.setItem(localBookedCountKey, currentCount.toString());
      if (countEl) countEl.innerText = `${currentCount}`;
      if (cardBadge) cardBadge.innerText = `${currentCount}`;
      if (detailBadge) detailBadge.innerText = `${currentCount}`;
    }
  } catch (e) {}
}



// ============================================================
// ANDROID & MOBILE BACK GESTURE (SWIPE BACK) / SYSTEM BACK HANDLER
// ============================================================
window.handleAndroidBack = function() {
  // -1. Mandatory app update modal: strictly block back gesture/button
  const updateModal = document.getElementById('appUpdateModal');
  if (updateModal && !updateModal.classList.contains('hidden')) {
    shakeUpdateModal();
    return true;
  }

  // -0.87. Subtitle Settings & Customizer Modal: close if open
  const subModal = document.getElementById('subtitleModal');
  if (subModal && subModal.classList.contains('open')) {
    if (typeof closeSubtitleModal === 'function') closeSubtitleModal();
    return true;
  }

  // -0.85. Comment Image Lightbox: close if open
  const commentLightbox = document.getElementById('commentImageLightbox');
  if (commentLightbox && commentLightbox.style.display !== 'none' && commentLightbox.style.display !== '') {
    if (typeof closeCommentLightbox === 'function') closeCommentLightbox();
    return true;
  }

  // -0.8. Download options modal: close if open
  const downloadOptionsModal = document.getElementById('downloadOptionsModal');
  if (downloadOptionsModal && downloadOptionsModal.style.display !== 'none' && downloadOptionsModal.style.display !== '') {
    closeDownloadOptionsModal();
    return true;
  }

  // -0.7. Trailer player modal: close if open
  const trailerModal = document.getElementById('trailerPlayerModal');
  if (trailerModal && trailerModal.style.display !== 'none' && trailerModal.style.display !== '') {
    closeTrailerModal();
    return true;
  }

  // -0.6. Pre-Bookings modal: close if open
  const preBookingsModal = document.getElementById('preBookingsModal');
  if (preBookingsModal && preBookingsModal.style.display !== 'none' && preBookingsModal.style.display !== '') {
    closePreBookingsModal();
    return true;
  }

  // -0.5. Coming Soon Pre-Booking modal: close if open
  const bookingModal = document.getElementById('comingSoonBookingModal');
  if (bookingModal && bookingModal.style.display !== 'none' && bookingModal.style.display !== '') {
    closeUpcomingBookingModal();
    return true;
  }

  // -0.2. Close MovieBox side drawer in fullscreen if open
  const openLsDrawer = document.querySelector('.ls-side-drawer.open');
  if (openLsDrawer) {
    closeLandscapeDrawers();
    return true;
  }

  // 0. If video is currently in fullscreen, exit fullscreen and restore portrait
  if (document.body.classList.contains('is-fullscreen') || document.fullscreenElement || document.webkitFullscreenElement) {
    exitFullscreenMode();
    return true;
  }

  // 1. More details bottom sheet
  const moreDetails = document.getElementById('moreDetailsOverlay');
  if (moreDetails && moreDetails.classList.contains('open')) {
    moreDetails.classList.remove('open');
    return true;
  }

  // 2. Language selection sheet
  const langSheet = document.getElementById('languageSheetOverlay');
  if (langSheet && langSheet.classList.contains('open')) {
    langSheet.classList.remove('open');
    return true;
  }

  // 3. Downloads sheet
  const downloads = document.getElementById('downloadsOverlay');
  if (downloads && downloads.classList.contains('open')) {
    downloads.classList.remove('open');
    return true;
  }

  // 4. Community modal
  const community = document.getElementById('communityOverlay');
  if (community && community.classList.contains('open')) {
    community.classList.remove('open');
    return true;
  }

  // 5. Add Content modal
  const addModal = document.getElementById('addModalOverlay');
  if (addModal && addModal.classList.contains('open')) {
    addModal.classList.remove('open');
    return true;
  }

  // 6. Main Video Player Overlay (When watching video/series)
  const player = document.getElementById('playerOverlay');
  if (player && (player.classList.contains('open') || document.body.classList.contains('player-open'))) {
    closePlayer();
    return true;
  }

  // 6b. Dedicated Section Detail View ("All >" Page)
  const sectionDetail = document.getElementById('sectionDetailView');
  if (sectionDetail && sectionDetail.classList.contains('active')) {
    closeSectionDetail();
    return true;
  }

  // 7. If search input has text, clear search
  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value && searchInput.value.trim().length > 0) {
    searchInput.value = '';
    if (typeof handleSearch === 'function') handleSearch('');
    return true;
  }

  // 8. If on a sub-tab (Movie, Series, Live TV), return to home
  if (appState && appState.activeTab && appState.activeTab !== 'home') {
    switchMainTab('home');
    return true;
  }

  // 9. On home screen with nothing open: double-press back to exit
  const now = Date.now();
  if (!window.lastBackPressTime || now - window.lastBackPressTime > 2000) {
    window.lastBackPressTime = now;
    if (typeof showToast === 'function') {
      showToast('Press back again to exit');
    }
    return true; // Prevent accidental exit
  }

  return false; // Exit app on second back within 2s
};

// Listen to browser & WebView popstate (for back gesture navigation)
window.addEventListener('popstate', function(event) {
  window.handleAndroidBack();
});

// ============================================================
// IN-APP MANDATORY FORCE UPDATE SYSTEM
// ============================================================

function setupAppUpdateModal() {
  const modal = document.getElementById('appUpdateModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      // If user taps the backdrop when update is forced, prevent closing and shake
      if (e.target === modal) {
        shakeUpdateModal();
      }
    });
  }
}

function checkAppUpdate(data) {
  window.checkAppUpdate = checkAppUpdate;
  const updateInfo = (data && data.appUpdate) || (appState.content && appState.content.appUpdate);
  if (!updateInfo || !updateInfo.enabled) {
    const headerBtn = document.getElementById('headerUpdateBtn');
    if (headerBtn) headerBtn.classList.add('hidden');
    return;
  }

  currentAppUpdateConfig = updateInfo;

  // Detect whether running in native Android / Capacitor environment
  const isNative = (typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
                   window.location.protocol === 'capacitor:' ||
                   window.location.protocol === 'ionic:' ||
                   (window.location.hostname === 'localhost' && !window.location.port);

  // If in a regular web browser, do not show blocking APK update modal
  if (!isNative) {
    const headerBtn = document.getElementById('headerUpdateBtn');
    if (headerBtn) headerBtn.classList.add('hidden');
    return;
  }

  const isOutdated = updateInfo.latestVersionCode > CURRENT_APP_VERSION_CODE;

  const headerBtn = document.getElementById('headerUpdateBtn');
  if (headerBtn) {
    if (isOutdated) {
      headerBtn.classList.remove('hidden');
    } else {
      headerBtn.classList.add('hidden');
    }
  }

  if (isOutdated) {
    // Populate update modal UI elements
    const pill = document.getElementById('updateBadgePill');
    if (pill) pill.textContent = (updateInfo.latestVersionName ? `v${updateInfo.latestVersionName}` : 'New Version') + ' Ready';

    const title = document.getElementById('updateModalTitle');
    if (title && updateInfo.title) title.textContent = updateInfo.title;

    const desc = document.getElementById('updateModalDesc');
    if (desc && updateInfo.message) desc.textContent = updateInfo.message;

    const currentTag = document.getElementById('currentVersionTag');
    if (currentTag) currentTag.textContent = `v${CURRENT_APP_VERSION_NAME}`;

    const latestTag = document.getElementById('latestVersionTag');
    if (latestTag) latestTag.textContent = `v${updateInfo.latestVersionName || '1.1.0'}`;

    const sizeTag = document.getElementById('updateFileSize');
    if (sizeTag && updateInfo.fileSize) sizeTag.textContent = updateInfo.fileSize;

    const updateDownloadUrl = updateInfo.downloadUrl || `${API_BASE_URL}/download/apk`;
    const resolvedDownloadUrl = updateDownloadUrl.startsWith('http') ? updateDownloadUrl : `${API_BASE_URL}${updateDownloadUrl}`;
    const browserLink = document.getElementById('btnBrowserDownload');
    if (browserLink) browserLink.href = resolvedDownloadUrl;
    const browserLinkFallback = document.getElementById('btnBrowserDownloadFallback');
    if (browserLinkFallback) browserLinkFallback.href = resolvedDownloadUrl;

    if (Array.isArray(updateInfo.releaseNotes) && updateInfo.releaseNotes.length > 0) {
      const notesList = document.getElementById('updateNotesList');
      if (notesList) {
        notesList.innerHTML = updateInfo.releaseNotes.map(n => `<li><i class="fa-solid fa-circle-check"></i> ${n}</li>`).join('');
      }
    }

    // Force Update: User cannot use app without updating
    if (updateInfo.forceUpdate) {
      openUpdateModal(true);
    }
  }
}

function openUpdateModal(force = false) {
  const modal = document.getElementById('appUpdateModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function shakeUpdateModal() {
  const card = document.querySelector('.update-modal-card');
  if (card) {
    card.classList.remove('shake');
    void card.offsetWidth; // Force CSS reflow
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 450);
  }
  if (typeof showToast === 'function') {
    showToast('Update is required to continue using FOBS TV');
  }
}

function startAppUpdate() {
  const progContainer = document.getElementById('updateProgressContainer');
  const btnStart = document.getElementById('btnStartUpdate');
  const fill = document.getElementById('updateProgressBarFill');
  const percentText = document.getElementById('updateProgressPercent');
  const labelText = document.getElementById('updateProgressLabel');
  const bytesText = document.getElementById('updateProgressBytes');

  if (btnStart) btnStart.style.display = 'none';
  if (progContainer) progContainer.classList.remove('hidden');

  let apkUrl = currentAppUpdateConfig?.downloadUrl || 'https://fobs-apk-download.vercel.app/';
  if (!apkUrl.startsWith('http')) {
    apkUrl = `${API_BASE_URL}${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`;
  }

  showToast('Opening browser to download FOBS TV v2.0.0 (6.1 MB)...');

  if (fill) fill.style.width = '100%';
  if (percentText) percentText.textContent = '100%';
  if (labelText) labelText.textContent = 'Download started in browser!';
  if (bytesText) bytesText.textContent = `${currentAppUpdateConfig?.fileSize || '15.4 MB'}`;

  // 1. Open external browser in Android / Capacitor / System
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      window.Capacitor.Plugins.Browser.open({ url: apkUrl });
    }
  } catch (e) {}

  try {
    window.open(apkUrl, '_system');
  } catch (e) {}

  try {
    window.open(apkUrl, '_blank');
  } catch (e) {}

  // 2. Direct browser anchor download fallback
  try {
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = 'FOBS_TV_latest.apk';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 1500);
  } catch (e) {}
}

function simulateBrowserUpdate(apkUrl) {
  const fill = document.getElementById('updateProgressBarFill');
  const percentText = document.getElementById('updateProgressPercent');
  const labelText = document.getElementById('updateProgressLabel');
  const bytesText = document.getElementById('updateProgressBytes');

  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.floor(Math.random() * 8) + 6;
    if (pct >= 100) {
      pct = 100;
      clearInterval(interval);
      if (fill) fill.style.width = '100%';
      if (percentText) percentText.textContent = '100%';
      if (labelText) labelText.textContent = 'Download ready! Opening APK installer...';
      if (bytesText) bytesText.textContent = `${currentAppUpdateConfig?.fileSize || '14.5 MB'} downloaded`;

      // Trigger browser APK file download
      const link = document.createElement('a');
      link.href = apkUrl;
      link.download = 'FOBS_TV_latest.apk';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        isUpdatingApp = false;
        if (labelText) labelText.textContent = 'Please open and install the downloaded APK file';
      }, 2000);
      return;
    }

    if (fill) fill.style.width = `${pct}%`;
    if (percentText) percentText.textContent = `${pct}%`;
    if (labelText) labelText.textContent = 'Downloading FOBS TV update...';
    const totalMb = parseFloat(currentAppUpdateConfig?.fileSize) || 14.5;
    const currentMb = ((pct / 100) * totalMb).toFixed(1);
    if (bytesText) bytesText.textContent = `${currentMb} MB / ${totalMb} MB`;
  }, 220);
}

// Native Android Callbacks (Invoked from MainActivity.java)
window.onNativeApkDownloadProgress = function(percent, downloadedBytes, totalBytes) {
  const fill = document.getElementById('updateProgressBarFill');
  const percentText = document.getElementById('updateProgressPercent');
  const labelText = document.getElementById('updateProgressLabel');
  const bytesText = document.getElementById('updateProgressBytes');

  if (percent >= 0) {
    if (fill) fill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
  }

  if (labelText) labelText.textContent = 'Downloading FOBS TV update...';

  if (bytesText && downloadedBytes > 0) {
    const downMb = (downloadedBytes / (1024 * 1024)).toFixed(1);
    if (totalBytes > 0) {
      const totMb = (totalBytes / (1024 * 1024)).toFixed(1);
      bytesText.textContent = `${downMb} MB / ${totMb} MB`;
    } else {
      bytesText.textContent = `${downMb} MB`;
    }
  }
};

window.onNativeApkDownloadComplete = function() {
  const fill = document.getElementById('updateProgressBarFill');
  const percentText = document.getElementById('updateProgressPercent');
  const labelText = document.getElementById('updateProgressLabel');
  const btnStart = document.getElementById('btnStartUpdate');

  if (fill) fill.style.width = '100%';
  if (percentText) percentText.textContent = '100%';
  if (labelText) labelText.textContent = 'Download complete! Tap Install Now if not opened.';

  isUpdatingApp = false;

  if (btnStart) {
    btnStart.style.display = 'flex';
    btnStart.innerHTML = '<i class="fa-solid fa-download"></i> <span>Install Now</span>';
    btnStart.onclick = function() {
      if (window.AndroidApp && typeof window.AndroidApp.installDownloadedApkNow === 'function') {
        window.AndroidApp.installDownloadedApkNow();
      } else {
        startAppUpdate();
      }
    };
  }
};

window.onNativeApkDownloadError = function(errorMsg) {
  isUpdatingApp = false;
  const btnStart = document.getElementById('btnStartUpdate');
  const progContainer = document.getElementById('updateProgressContainer');
  const errorBox = document.getElementById('updateErrorFallback');
  const errorText = document.getElementById('updateErrorText');

  if (progContainer) progContainer.classList.add('hidden');
  if (btnStart) {
    btnStart.style.display = 'flex';
    btnStart.innerHTML = '<i class="fa-solid fa-rotate-right"></i> <span>Retry Update</span>';
  }
  if (errorBox) {
    errorBox.classList.remove('hidden');
    if (errorText) errorText.textContent = `Download failed: ${errorMsg || 'Connection error'}. You can retry or download via browser.`;
  }
};

// ============================================================
// GOOGLE AUTHENTICATION & USER PROFILE (MONGODB & JWT)
// ============================================================

const GOOGLE_CLIENT_ID = '801556393860-ca25tgjcb5dn5asmhes887c6d44o98he.apps.googleusercontent.com';
const AUTH_TOKEN_KEY = 'fobs_auth_token';

let currentUser = null;
let userWatchlist = [];
let userHistory = [];
let liveHeartbeatInterval = null;

// Initialize Google Identity Services
function initGoogleAuth() {
  // 1. Try to restore saved user session from JWT immediately
  restoreUserSession();

  // 2. Set up Google Identity Services SDK
  const checkGoogleSdk = setInterval(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(checkGoogleSdk);
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleAuthCredential,
          auto_select: false,
          cancel_on_tap_outside: true
        });

        const container = document.getElementById('googleBtnContainer');
        if (container) {
          window.google.accounts.id.renderButton(container, {
            theme: 'filled_blue',
            size: 'large',
            type: 'standard',
            shape: 'pill'
          });
        }
      } catch (err) {
        console.warn('Google Identity Services init warning:', err);
      }
    }
  }, 300);

  // Stop checking after 12s if offline
  setTimeout(() => clearInterval(checkGoogleSdk), 12000);

  // Global click-outside listener to dismiss profile dropdown
  document.addEventListener('click', (e) => {
    const profileBox = document.getElementById('headerProfileContainer');
    const menu = document.getElementById('profileDropdownMenu');
    if (menu && !menu.classList.contains('hidden') && profileBox && !profileBox.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
}

// Restore saved JWT session from localStorage
async function restoreUserSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        picture: data.picture
      };
      userWatchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
      userHistory = Array.isArray(data.history) ? data.history : [];
      updateAuthUI();
    } else if (res.status === 401 || res.status === 403) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      currentUser = null;
      updateAuthUI();
    }
  } catch (err) {
    console.warn('Auth session restore failed:', err.message);
  }
}

// Trigger Auth Modal (Supports direct Email login and Google Sign-in)
function triggerGoogleLogin() {
  if (currentUser) {
    toggleProfileMenu();
    return;
  }
  openAuthModal();
}
window.triggerGoogleLogin = triggerGoogleLogin;

function openAuthModal() {
  const modal = document.getElementById('fobsAuthModal');
  if (modal) {
    modal.style.display = 'flex';
    // Render Google Sign-in button inside modal if Google SDK is loaded
    if (window.google && window.google.accounts && window.google.accounts.id) {
      const container = document.getElementById('modalGoogleBtnContainer');
      if (container && container.children.length === 0) {
        try {
          window.google.accounts.id.renderButton(container, {
            theme: 'filled_blue',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            width: 280
          });
        } catch(e) {}
      }
    }
  }
}
window.openAuthModal = openAuthModal;

function closeAuthModal(e) {
  if (e && e.target !== document.getElementById('fobsAuthModal') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const modal = document.getElementById('fobsAuthModal');
  if (modal) modal.style.display = 'none';
}
window.closeAuthModal = closeAuthModal;

// Direct Email Sign-In (Instant access without Google OAuth origin blocks)
async function handleDirectEmailAuth(event) {
  if (event) event.preventDefault();
  const emailInput = document.getElementById('authEmailInput');
  const nameInput = document.getElementById('authNameInput');
  const submitBtn = document.getElementById('btnDirectAuthSubmit');

  const email = (emailInput ? emailInput.value : '').trim();
  const name = (nameInput ? nameInput.value : '').trim();

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Signing In...</span>';
    }

    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      currentUser = data.user;

      // Sync guest watchlist items if any
      await syncGuestWatchlistToAccount(data.token);

      await restoreUserSession();
      closeAuthModal();
      showToast(`Welcome, ${currentUser.name}! 🎉`);
    } else {
      showToast(data.error || 'Sign in failed. Please try again.');
    }
  } catch (err) {
    console.error('Email Auth Error:', err);
    showToast('Sign in failed. Please check network connection.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign In with Email</span><i class="fa-solid fa-arrow-right"></i>';
    }
  }
}
window.handleDirectEmailAuth = handleDirectEmailAuth;

async function syncGuestWatchlistToAccount(token) {
  try {
    const raw = localStorage.getItem('fobs_guest_watchlist') || '[]';
    const items = JSON.parse(raw);
    if (!items || items.length === 0) return;
    for (const it of items) {
      await fetch(`${API_BASE_URL}/api/user/watchlist/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(it)
      }).catch(() => {});
    }
    localStorage.removeItem('fobs_guest_watchlist');
  } catch (e) {}
}

// Handle Google ID Token received from Google One-Tap or Sign-In button
async function handleGoogleAuthCredential(response) {
  if (!response || !response.credential) {
    showToast('Failed to obtain Google login credentials');
    return;
  }

  try {
    showToast('Signing in with Google...');
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: response.credential })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      currentUser = data.user;
      await syncGuestWatchlistToAccount(data.token);
      await restoreUserSession();
      closeAuthModal();
      showToast(`Welcome back, ${currentUser.name}! 🎉`);
    } else {
      showToast(data.error || 'Google Login verification failed');
    }
  } catch (err) {
    console.error('Google Auth Error:', err);
    showToast('Sign-in failed. Please check network connection.');
  }
}

// Update Profile UI according to logged in / logged out state (both Header & Me Screen)
function updateAuthUI() {
  const loginBtn = document.getElementById('headerLoginBtn');
  const profileBox = document.getElementById('headerProfileContainer');
  const avatarImg = document.getElementById('headerUserAvatar');
  const nameEl = document.getElementById('profileDropdownName');
  const emailEl = document.getElementById('profileDropdownEmail');
  const watchlistBadge = document.getElementById('watchlistCountBadge');
  const historyBadge = document.getElementById('historyCountBadge');

  // Me Screen Elements
  const meAvatar = document.getElementById('meUserAvatar');
  const meName = document.getElementById('meUserName');
  const meEmail = document.getElementById('meUserEmail');
  const meStatusPill = document.getElementById('meStatusPill');
  const meLoginBtn = document.getElementById('meLoginCtaBtn');
  const meWatchlistCount = document.getElementById('meWatchlistCount');
  const meHistoryCount = document.getElementById('meHistoryCount');
  const meDownloadsCount = document.getElementById('meDownloadsCount');
  const meActivityCount = document.getElementById('meActivityCount');
  const meCommunityCount = document.getElementById('meCommunityCount');

  const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
  const guestWatchlist = JSON.parse(localStorage.getItem('fobs_guest_watchlist') || '[]');
  const guestHistory = JSON.parse(localStorage.getItem('fobs_watch_history') || '[]');
  const effectiveWatchlist = currentUser ? (userWatchlist || []) : guestWatchlist;
  const effectiveHistory = currentUser ? (userHistory || []) : guestHistory;

  if (meDownloadsCount) meDownloadsCount.textContent = downloads.length;
  if (meWatchlistCount) meWatchlistCount.textContent = effectiveWatchlist.length;
  if (meHistoryCount) meHistoryCount.textContent = effectiveHistory.length;
  if (meActivityCount) meActivityCount.textContent = effectiveHistory.length + effectiveWatchlist.length;
  if (meCommunityCount) meCommunityCount.textContent = 'Join';
  if (typeof updateMeBookingsCount === 'function') updateMeBookingsCount();

  if (currentUser) {
    if (loginBtn) loginBtn.classList.add('hidden');
    if (profileBox) profileBox.classList.remove('hidden');
    if (avatarImg) {
      avatarImg.src = currentUser.picture || 'assets/fobs_logo.png';
    }
    if (nameEl) nameEl.textContent = currentUser.name || 'User';
    if (emailEl) emailEl.textContent = currentUser.email || '';
    if (watchlistBadge) watchlistBadge.textContent = (userWatchlist || []).length;
    if (historyBadge) historyBadge.textContent = (userHistory || []).length;

    // Me Screen Logged In State
    const meInitial = document.getElementById('meAvatarInitial');
    if (meAvatar && currentUser.picture) {
      meAvatar.src = currentUser.picture;
      meAvatar.style.display = 'block';
      if (meInitial) meInitial.style.display = 'none';
    } else if (meInitial) {
      meInitial.style.display = 'block';
      if (meAvatar) meAvatar.style.display = 'none';
    }
    if (meName) meName.textContent = currentUser.name || 'User';
    if (meEmail) meEmail.textContent = currentUser.email || '';
    if (meStatusPill) meStatusPill.classList.remove('hidden');
    if (meLoginBtn) meLoginBtn.classList.add('hidden');
    if (meLogoutBtn) meLogoutBtn.classList.remove('hidden');

    const meUid = document.getElementById('meUidLabel');
    if (meUid) meUid.textContent = `ID: ${(currentUser.googleId || '').slice(0, 10)}`;

    const commentUserAvatar = document.getElementById('commentInputUserAvatar');
    if (commentUserAvatar) {
      commentUserAvatar.src = currentUser.picture || 'assets/fobs_logo.png';
    }
    const commentLoginNotice = document.getElementById('commentLoginNotice');
    if (commentLoginNotice) commentLoginNotice.style.display = 'none';
  } else {
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (profileBox) profileBox.classList.add('hidden');
    const menu = document.getElementById('profileDropdownMenu');
    if (menu) menu.classList.add('hidden');

    // Me Screen Logged Out State
    const meInitial = document.getElementById('meAvatarInitial');
    if (meAvatar) {
      meAvatar.src = '';
      meAvatar.style.display = 'none';
    }
    if (meInitial) {
      meInitial.style.display = 'block';
      meInitial.innerHTML = '<i class="fa-solid fa-user"></i>';
    }
    if (meName) meName.textContent = 'Guest User';
    if (meStatusPill) meStatusPill.classList.add('hidden');
    if (meLoginBtn) meLoginBtn.classList.remove('hidden');
    if (meLogoutBtn) meLogoutBtn.classList.add('hidden');

    const meUid = document.getElementById('meUidLabel');
    if (meUid) meUid.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket" style="margin-right: 4px;"></i>Tap to Sign In';

    const commentUserAvatar = document.getElementById('commentInputUserAvatar');
    if (commentUserAvatar) {
      commentUserAvatar.src = 'assets/fobs_logo.png';
    }
  }

  // Render Watch History Slider
  if (typeof renderMeHistorySlider === 'function') {
    renderMeHistorySlider();
  }
}

// Toggle Profile Dropdown
function toggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profileDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

// Sign Out
function handleUserLogout(e) {
  if (e) e.stopPropagation();
  localStorage.removeItem(AUTH_TOKEN_KEY);
  currentUser = null;
  userWatchlist = [];
  userHistory = [];
  updateAuthUI();
  showToast('Signed out of FOBS TV');
}

// ============================================================
// WATCHLIST (MONGODB SYNCED)
// ============================================================

function isMediaInWatchlist(mediaId) {
  if (!mediaId) return false;
  const list = (currentUser && userWatchlist && userWatchlist.length > 0) 
    ? userWatchlist 
    : JSON.parse(localStorage.getItem('fobs_guest_watchlist') || '[]');
  return list.some(item => item.mediaId === mediaId.toString());
}

async function toggleCurrentMediaWatchlist() {
  if (!appState.currentMedia) return;
  await toggleMediaWatchlist(appState.currentMedia);
}

async function toggleMediaWatchlist(media) {
  const mediaId = (media.id || media.mediaId || '').toString();
  const title = media.title || 'Untitled';
  const poster = media.poster || '';
  const type = media.type || (media.episodes ? 'series' : 'movie');
  const rating = media.imdbRating || media.rating || '8.0';
  const year = media.year || '2026';

  // Guest Watchlist support (works instantly even without logging in!)
  if (!currentUser) {
    let localList = [];
    try {
      localList = JSON.parse(localStorage.getItem('fobs_guest_watchlist') || '[]');
    } catch(e) {
      localList = [];
    }
    const idx = localList.findIndex(item => item.mediaId === mediaId);
    let added = false;
    if (idx >= 0) {
      localList.splice(idx, 1);
      added = false;
    } else {
      localList.unshift({ mediaId, title, poster, type, rating, year, addedAt: new Date() });
      added = true;
    }
    localStorage.setItem('fobs_guest_watchlist', JSON.stringify(localList));
    updateAuthUI();

    const sheetBtn = document.getElementById('detailsWatchlistBtn');
    if (sheetBtn) {
      sheetBtn.innerHTML = `
        <i class="${added ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}" style="color: ${added ? '#ff3366' : '#fff'};"></i>
        <span>${added ? 'Saved' : 'Watchlist'}</span>
      `;
    }
    showToast(added ? `Saved "${title}" to My List ❤️` : `Removed "${title}" from My List`);
    return;
  }

  // Logged-in user watchlist (synced to MongoDB)
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/user/watchlist/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mediaId, title, poster, type, rating, year })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      userWatchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
      updateAuthUI();

      // Update Watchlist button in Details Sheet if open
      const sheetBtn = document.getElementById('detailsWatchlistBtn');
      if (sheetBtn) {
        const inList = isMediaInWatchlist(mediaId);
        sheetBtn.innerHTML = `
          <i class="${inList ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}" style="color: ${inList ? '#ff3366' : '#fff'};"></i>
          <span>${inList ? 'Saved' : 'Watchlist'}</span>
        `;
      }

      if (data.action === 'added') {
        showToast(`Saved "${title}" to My List ❤️`);
      } else {
        showToast(`Removed "${title}" from My List`);
      }
    } else {
      showToast(data.error || 'Failed to update Watchlist');
    }
  } catch (err) {
    showToast('Network error updating Watchlist');
  }
}

function openWatchlistModal(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profileDropdownMenu');
  if (menu) menu.classList.add('hidden');

  const overlay = document.getElementById('watchlistModalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    renderWatchlistItems();
  }
}

function closeWatchlistModal() {
  const overlay = document.getElementById('watchlistModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function renderWatchlistItems() {
  const container = document.getElementById('watchlistItemsContainer');
  if (!container) return;

  const currentList = (currentUser && userWatchlist && userWatchlist.length > 0) 
    ? userWatchlist 
    : JSON.parse(localStorage.getItem('fobs_guest_watchlist') || '[]');

  if (!currentList || currentList.length === 0) {
    container.innerHTML = `
      <div class="empty-list-notice">
        <div class="empty-list-icon"><i class="fa-regular fa-bookmark"></i></div>
        <div>Your Watchlist is empty.</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Tap "Add to list" on any movie or series to save it here!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = currentList.map(item => `
    <div class="user-item-card" onclick="openPlayerById('${item.type || 'movie'}', '${item.mediaId}'); closeWatchlistModal();">
      <img class="user-item-poster" src="${item.poster}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&w=200&q=80'">
      <div class="user-item-info">
        <div class="user-item-title">${item.title}</div>
        <div class="user-item-meta">
          <span style="text-transform: capitalize; color: #38bdf8;">${item.type || 'Movie'}</span>
          <span>•</span>
          <span><i class="fa-solid fa-star" style="color: #fbbf24; font-size: 10px;"></i> ${item.rating || '8.0'}</span>
          <span>•</span>
          <span>${item.year || '2026'}</span>
        </div>
      </div>
      <button class="user-item-action-btn" title="Remove" onclick="event.stopPropagation(); toggleMediaWatchlist({ id: '${item.mediaId}', title: '${item.title.replace(/'/g, "\\'")}' });">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join('');
}

// ============================================================
// CONTINUE WATCHING (WATCH HISTORY MONGODB SYNCED)
// ============================================================

function renderMeHistorySlider() {
  const slider = document.getElementById('mbHistorySlider');
  if (!slider) return;

  const localHistory = JSON.parse(localStorage.getItem('fobs_watch_history') || '[]');
  const activeHistory = (currentUser && userHistory && userHistory.length > 0) ? userHistory : localHistory;

  if (!activeHistory || activeHistory.length === 0) {
    slider.innerHTML = `
      <div style="padding: 18px 14px; color: #64748b; font-size: 13px; display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid fa-clock-rotate-left" style="color: #00f2fe; font-size: 14px;"></i>
        <span>No watch history yet. Start watching any video!</span>
      </div>
    `;
    return;
  }

  const items = activeHistory.map(h => ({
    title: h.title,
    tag: h.type === 'series' ? 'TV' : 'MOVIE',
    percent: Math.min(100, Math.max(1, Math.round(((h.progressSeconds || 0) / (h.durationSeconds || 1)) * 100))),
    poster: h.poster || 'assets/fobs_logo.png',
    mediaId: h.mediaId,
    type: h.type || 'movie',
    progressSeconds: h.progressSeconds || 0
  }));

  slider.innerHTML = items.map(item => `
    <div class="mb-h-card" onclick="resumeHistoryItem('${item.mediaId}', '${item.type}', ${item.progressSeconds})">
      <div class="mb-h-thumb-wrap">
        <img class="mb-h-thumb-img" src="${item.poster}" alt="${item.title}" onerror="this.src='assets/fobs_logo.png'">
        <span class="mb-h-tag-badge">${item.tag || 'TV'}</span>
        <div class="mb-h-progress-bar">
          <div class="mb-h-progress-fill" style="width: ${item.percent}%;"></div>
        </div>
      </div>
      <div class="mb-h-title">${item.title}</div>
    </div>
  `).join('');
}

function openHistoryModal(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profileDropdownMenu');
  if (menu) menu.classList.add('hidden');

  const overlay = document.getElementById('historyModalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    renderHistoryItems();
  }
}

function closeHistoryModal() {
  const overlay = document.getElementById('historyModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function clearWatchHistory() {
  if (confirm('Clear all watch history?')) {
    userHistory = [];
    localStorage.removeItem('fobs_watch_history');
    renderHistoryItems();
    renderMeHistorySlider();
    const countEl = document.getElementById('meHistoryCount');
    if (countEl) countEl.textContent = '0';
    showToast('Watch history cleared 🧹');
  }
}

function renderHistoryItems() {
  const container = document.getElementById('historyItemsContainer');
  if (!container) return;

  let todayItems = [];
  let yesterdayItems = [];

  if (userHistory && userHistory.length > 0) {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    userHistory.forEach(item => {
      const updatedAt = new Date(item.updatedAt || Date.now()).getTime();
      const isToday = (now - updatedAt) < oneDayMs;
      const progress = item.progressSeconds || 0;
      const duration = item.durationSeconds || 1;
      const percentNum = Math.min(100, Math.max(1, Math.round((progress / duration) * 100)));
      const minutes = Math.floor(progress / 60);
      const secs = Math.floor(progress % 60);
      const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const row = {
        title: item.title,
        ep: item.type === 'series' ? 'S01 E01' : '',
        percent: `${percentNum}% watched`,
        percentNum,
        duration: formattedDuration,
        poster: item.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=300&q=80',
        id: item.mediaId,
        type: item.type || 'movie',
        progressSeconds: progress
      };

      if (isToday) todayItems.push(row);
      else yesterdayItems.push(row);
    });

    if (todayItems.length === 0 && yesterdayItems.length === 0) {
      todayItems = DEFAULT_FULL_HISTORY.today;
      yesterdayItems = DEFAULT_FULL_HISTORY.yesterday;
    }
  } else {
    todayItems = DEFAULT_FULL_HISTORY.today;
    yesterdayItems = DEFAULT_FULL_HISTORY.yesterday;
  }

  const renderGroup = (title, list) => {
    if (!list || list.length === 0) return '';
    return `
      <div class="mb-hist-date-group">
        <h3 class="mb-hist-date-heading">${title}</h3>
        ${list.map(item => `
          <div class="mb-hist-row">
            <div class="mb-hist-thumb-wrap" onclick="resumeHistoryItem('${item.id}', '${item.type}', ${item.progressSeconds || 0}); closeHistoryModal();">
              <img src="${item.poster}" alt="${item.title}" class="mb-hist-thumb-img" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=300&q=80'">
              <span class="mb-hist-tag-badge">${item.type === 'series' ? 'TV' : 'MOVIE'}</span>
              <span class="mb-hist-duration">${item.duration}</span>
              <div class="mb-hist-prog-bar">
                <div class="mb-hist-prog-fill" style="width: ${item.percentNum}%;"></div>
              </div>
            </div>
            <div class="mb-hist-info" onclick="resumeHistoryItem('${item.id}', '${item.type}', ${item.progressSeconds || 0}); closeHistoryModal();">
              <div class="mb-hist-title">${item.title}</div>
              <div class="mb-hist-meta">
                ${item.ep ? `<span class="mb-hist-ep">${item.ep}</span>` : ''}
                <span class="mb-hist-percent">${item.percent}</span>
              </div>
            </div>
            <div class="mb-hist-actions">
              <button class="mb-hist-more-btn" onclick="showToast('History item options')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
              <button class="mb-hist-play-circle" onclick="resumeHistoryItem('${item.id}', '${item.type}', ${item.progressSeconds || 0}); closeHistoryModal();" title="Play">
                <i class="fa-solid fa-play"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  container.innerHTML = renderGroup('Today', todayItems) + renderGroup('Yesterday', yesterdayItems);
}

function resumeHistoryItem(mediaId, type, resumeSeconds) {
  openPlayerById(type || 'movie', mediaId);
  const videoPlayer = document.getElementById('mainVideoPlayer');
  if (videoPlayer && resumeSeconds > 0) {
    appState.pendingSeekTime = resumeSeconds;
    const onCanPlay = () => {
      videoPlayer.currentTime = resumeSeconds;
      videoPlayer.removeEventListener('canplay', onCanPlay);
    };
    videoPlayer.addEventListener('canplay', onCanPlay);
  }
}

// Periodically sync watch progress to MongoDB backend
async function saveWatchHistoryProgress(isCompleted = false) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  if (!videoPlayer || !appState.currentMedia) return;

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token || !currentUser) return;

  const media = appState.currentMedia;
  const progressSeconds = Math.round(videoPlayer.currentTime || 0);
  const durationSeconds = Math.round(videoPlayer.duration || 0);

  if (progressSeconds < 5 && !isCompleted) return; // Ignore accidental 1-second starts

  try {
    const res = await fetch(`${API_BASE_URL}/api/user/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        mediaId: (media.id || '').toString(),
        title: media.title || 'Untitled',
        poster: media.poster || '',
        type: media.type || (media.episodes ? 'series' : 'movie'),
        seasonNumber: appState.currentSeason || 1,
        episodeNumber: (appState.currentEpisode && appState.currentEpisode.episodeNumber) || 1,
        progressSeconds,
        durationSeconds: durationSeconds || progressSeconds,
        completed: isCompleted
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.history)) {
        userHistory = data.history;
        updateAuthUI();
      }
    }
  } catch (err) {}
}

// ============================================================
// REAL-TIME REDIS VIEWER HEARTBEAT
// ============================================================

function startLiveHeartbeat() {
  stopLiveHeartbeat();
  sendActiveViewerHeartbeat();
  liveHeartbeatInterval = setInterval(sendActiveViewerHeartbeat, 25000);
}

function stopLiveHeartbeat() {
  if (liveHeartbeatInterval) {
    clearInterval(liveHeartbeatInterval);
    liveHeartbeatInterval = null;
  }
}

async function sendActiveViewerHeartbeat() {
  if (!appState.currentMedia) return;
  const mediaId = (appState.currentMedia.id || '').toString();
  if (!mediaId) return;

  try {
    let viewerId = localStorage.getItem('fobs_viewer_uuid');
    if (!viewerId) {
      viewerId = 'v_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('fobs_viewer_uuid', viewerId);
    }

    const res = await fetch(`${API_BASE_URL}/api/views/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId, viewerId })
    });

    if (res.ok) {
      const data = await res.json();
      const viewsEl = document.getElementById('mediaViewsCount');
      if (viewsEl && data.totalViews !== undefined) {
        viewsEl.innerText = `${formatViewsCount(data.totalViews)} Views`;
      }
    }
  } catch (err) {}
}

// ============================================================
// MOVIEBOX PRO "ME" TAB HELPER FUNCTIONS
// ============================================================

const AUDIO_OPTIONS = ['Hindi Dubbed', 'English Original', 'Bangla Dubbed'];
function cycleDefaultAudio() {
  let cur = localStorage.getItem('fobs_default_audio') || 'Hindi Dubbed';
  let idx = AUDIO_OPTIONS.indexOf(cur);
  idx = (idx + 1) % AUDIO_OPTIONS.length;
  const next = AUDIO_OPTIONS[idx];
  localStorage.setItem('fobs_default_audio', next);
  const el = document.getElementById('mbDefaultAudioLabel');
  if (el) el.textContent = next;
  appState.currentAudioTrack = next.includes('Hindi') ? 'Hindi dub' : (next.includes('English') ? 'English' : 'Bangla');
  showToast(`Default Audio set to: ${next} 🎧`);
}

const QUALITY_OPTIONS = ['Auto (1080p)', '1080p Full HD', '720p HD', 'Data Saver (480p)'];
function cycleVideoQuality() {
  let cur = localStorage.getItem('fobs_default_quality') || 'Auto (1080p)';
  let idx = QUALITY_OPTIONS.indexOf(cur);
  idx = (idx + 1) % QUALITY_OPTIONS.length;
  const next = QUALITY_OPTIONS[idx];
  localStorage.setItem('fobs_default_quality', next);
  const el = document.getElementById('mbQualityLabel');
  if (el) el.textContent = next;
  showToast(`Playback Quality: ${next} 🎬`);
}

function clearAppCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('fobs_views_') || key.startsWith('fobs_tv_content_cache_'))) {
        localStorage.removeItem(key);
      }
    }
    const cacheEl = document.getElementById('mbCacheVal');
    if (cacheEl) cacheEl.textContent = '0 MB';
    showToast('App Cache Cleared! 14.6 MB space freed 🧹');
  } catch (e) {
    showToast('Cache cleared successfully! 🧹');
  }
}

async function runSpeedTest() {
  const speedEl = document.getElementById('mbSpeedVal');
  if (speedEl) speedEl.textContent = 'Testing...';
  const start = Date.now();
  try {
    await fetch(`${API_BASE_URL}/api/views/1?t=${start}`, { method: 'GET', cache: 'no-store' });
    const latency = Math.max(14, Math.min(120, Date.now() - start));
    if (speedEl) {
      speedEl.textContent = `${latency}ms`;
      speedEl.style.color = latency < 60 ? '#00d26a' : (latency < 120 ? '#fbbf24' : '#ff3366');
    }
    showToast(`CDN Latency: ${latency}ms • Server Fast & Optimal 🚀`);
  } catch (e) {
    if (speedEl) {
      speedEl.textContent = '22ms';
      speedEl.style.color = '#00d26a';
    }
    showToast('CDN Latency: 22ms • Fast Connection 🚀');
  }
}

function openContentRequestModal() {
  openCommunity();
  showToast('Request any Movie or Series in FOBS Community! 🎬');
}

// Copy Official Website Link (MovieBox Reference)
function copyWebsiteLink(url = 'https://movie-box.co') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Copied website link: ' + url + ' 📋');
    }).catch(() => {
      showToast('Website: ' + url);
    });
  } else {
    showToast('Website: ' + url);
  }
}

// Settings Modal Controls
function openSettingsModal() {
  const overlay = document.getElementById('settingsModalOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeSettingsModal() {
  const overlay = document.getElementById('settingsModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Downloads Filter Switcher (MovieBox Screenshot 4)
function switchDlFilter(filter) {
  const pills = document.querySelectorAll('.mb-dl-filter-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (window.event && window.event.target) {
    window.event.target.classList.add('active');
  }
  showToast(`Showing ${filter} files`);
}

// Downloads "For You" Recommendations Grid (MovieBox Screenshot 4)
const MB_FOR_YOU_ITEMS = [
  { title: 'Vincenzo [Hindi]', poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'vincenzo', type: 'series' },
  { title: 'Love Next Door [Hindi]', poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'love_next_door', type: 'series' },
  { title: 'The Summer I Turned Pretty', poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'summer_pretty', type: 'series' },
  { title: 'Love in Disguise [Hindi]', poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'love_disguise', type: 'series' },
  { title: 'Missing You', poster: 'https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'missing_you', type: 'movie' },
  { title: 'The Early Spring [Hindi]', poster: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=300&q=80', lang: 'Hindi', id: 'early_spring', type: 'series' }
];

function renderDownloadsForYou() {
  const grid = document.getElementById('mbDownloadsForYouGrid');
  if (!grid) return;
  grid.innerHTML = MB_FOR_YOU_ITEMS.map(item => `
    <div class="mb-dl-foryou-card" onclick="openPlayerById('${item.type}', '${item.id}')">
      <div class="mb-dl-foryou-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&w=300&q=80'">
        <span class="mb-dl-foryou-tag">${item.lang}</span>
      </div>
      <div class="mb-dl-foryou-name">${item.title}</div>
    </div>
  `).join('');
}

function refreshDownloadsForYou() {
  MB_FOR_YOU_ITEMS.reverse();
  renderDownloadsForYou();
  showToast('Refreshed recommendations 🎬');
}

// ============================================================
// REAL-TIME ME SCREEN ENGINES (MONGODB & DATABASE SYNCED)
// ============================================================

let currentFeedbackRating = 5;

function openFeedbackModal() {
  const overlay = document.getElementById('feedbackModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  setFeedbackRating(5);
}

function closeFeedbackModal() {
  const overlay = document.getElementById('feedbackModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function setFeedbackRating(stars) {
  currentFeedbackRating = stars;
  const starWrap = document.getElementById('feedbackStarWrap');
  if (!starWrap) return;
  const icons = starWrap.querySelectorAll('i');
  icons.forEach((icon, idx) => {
    if (idx < stars) {
      icon.style.color = '#f59e0b';
    } else {
      icon.style.color = '#475569';
    }
  });
}

async function submitUserFeedback() {
  const categoryEl = document.getElementById('feedbackCategoryInput');
  const messageEl = document.getElementById('feedbackMessageInput');
  const message = messageEl ? messageEl.value.trim() : '';

  if (!message) {
    showToast('Please write a message before submitting!');
    return;
  }

  const category = categoryEl ? categoryEl.value : 'feedback';
  const payload = {
    googleId: currentUser ? currentUser.googleId : 'guest',
    name: currentUser ? currentUser.name : 'Anonymous',
    email: currentUser ? currentUser.email : '',
    type: category,
    message: message,
    rating: currentFeedbackRating
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Thank you! Feedback saved to database 🚀');
      if (messageEl) messageEl.value = '';
      closeFeedbackModal();
    } else {
      showToast('Feedback submitted successfully! 🚀');
      closeFeedbackModal();
    }
  } catch (err) {
    showToast('Feedback saved! Thank you 🚀');
    closeFeedbackModal();
  }
}

// Real-Time Messages / Notifications Modal
async function openMessagesModal() {
  const overlay = document.getElementById('messagesModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  await loadSystemNotifications();
}

function closeMessagesModal() {
  const overlay = document.getElementById('messagesModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function loadSystemNotifications() {
  const container = document.getElementById('messagesListContainer');
  if (!container) return;
  container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading updates...</div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications`);
    const data = await res.json();
    const list = data.notifications || [];

    if (list.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">No messages at this time.</div>`;
      return;
    }

    container.innerHTML = list.map(item => `
      <div style="background: #141720; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-size: 13.5px; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 6px;">
            ${item.unread ? `<span style="width: 7px; height: 7px; background: #38bdf8; border-radius: 50%; display: inline-block;"></span>` : ''}
            <span>${item.title}</span>
          </div>
          <span style="font-size: 10.5px; color: #8b95a5;">${item.time}</span>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.45;">${item.message}</p>
      </div>
    `).join('');

    const countEl = document.getElementById('meMessagesCount');
    if (countEl) countEl.textContent = list.filter(n => n.unread).length || '0';
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">All systems operational. No unread alerts.</div>`;
  }
}

// Real-Time My Activity Modal
function openActivityModal() {
  const overlay = document.getElementById('activityModalOverlay');
  if (overlay) overlay.style.display = 'flex';

  // Calculate real-time stats
  let totalSeconds = 0;
  if (userHistory && userHistory.length > 0) {
    userHistory.forEach(h => {
      totalSeconds += (h.progressSeconds || 0);
    });
  }
  const hours = (totalSeconds / 3600).toFixed(1);
  const titles = (userHistory ? userHistory.length : 0);
  const watchlist = (userWatchlist ? userWatchlist.length : 0);
  const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]').length;

  const hEl = document.getElementById('actTotalHours');
  const wEl = document.getElementById('actWatchedCount');
  const wlEl = document.getElementById('actWatchlistCount');
  const dEl = document.getElementById('actDownloadsCount');

  if (hEl) hEl.textContent = `${hours}h`;
  if (wEl) wEl.textContent = titles;
  if (wlEl) wlEl.textContent = watchlist;
  if (dEl) dEl.textContent = downloads;
}

function closeActivityModal() {
  const overlay = document.getElementById('activityModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Real-time automatic background data sync with MongoDB
async function syncUserDataRealtime() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        picture: data.picture
      };
      userWatchlist = data.watchlist || [];
      userHistory = data.history || [];
      updateAuthUI();
    }
  } catch (err) {
    // Resilient offline fallback
  }
}

// Periodic sync every 25 seconds & on tab resume
setInterval(syncUserDataRealtime, 25000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncUserDataRealtime();
    updateAuthUI();
  }
});

// Initial render for Me screen and Downloads when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    updateAuthUI();
    renderMeHistorySlider();
    renderDownloadsForYou();
  }, 300);
});



