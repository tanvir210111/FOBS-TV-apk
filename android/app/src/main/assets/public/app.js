// FOBS TV Mobile Application Client Logic

const BACKEND_URL = 'https://fobs-tv-apk.onrender.com';

// Dynamically determine the backend API base URL
// - If running on localhost with a custom port (e.g. node dev server localhost:3000), use ''
// - If running on remote render server in a web browser, use ''
// - If running inside Capacitor APK on mobile (origin is localhost without port, or capacitor://), point to Render backend
const API_BASE_URL = (() => {
  const isCustomLocalPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                            window.location.port && 
                            window.location.port !== '80' && 
                            window.location.port !== '443';
  if (isCustomLocalPort || window.location.hostname.includes('onrender.com')) {
    return '';
  }
  return BACKEND_URL;
})();

const CACHE_KEY = 'fobs_tv_content_cache_v55';
const SYNC_KEY = 'fobs_tv_last_sync_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
let isSyncing = false;

// App Versioning & In-App Force Update Configuration
const CURRENT_APP_VERSION_CODE = 7;
const CURRENT_APP_VERSION_NAME = '1.6.0';
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

  // Step 1: Immediate local render from localStorage cache (0ms delay)
  const hasCache = loadCachedContent();
  if (hasCache) {
    renderAllViews();
    checkAppUpdate(appState.content);
    // Non-blocking background sync if cache is older than 5 minutes
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 2: Immediate local render from bundled APK seed content (local asset fetch)
  const hasSeed = await loadSeedContent();
  if (hasSeed) {
    renderAllViews();
    checkAppUpdate(appState.content);
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 3: Cold start without any local cache (first run) - show branded FOBS TV loading overlay
  await syncContentWithBackend({ isInitial: true, force: true });
  checkAppUpdate(appState.content);
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
      // Verify response is valid JSON and not a Render proxy HTML spin-up page
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }

      // If status indicates server waking (502, 503, 504) or HTML was returned, retry
      if (attempt <= maxRetries) {
        console.warn(`Server waking up (status ${res.status}). Retrying attempt ${attempt}/${maxRetries}...`);
        updateServerStatus('Waking up server, please wait...', 'waking');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Server returned status ${res.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt <= maxRetries) {
        console.warn(`Fetch error (${err.message}). Retrying in ${delay / 1000}s...`);
        updateServerStatus('Waking up server, please wait...', 'waking');
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
      updateFobsLoadingMsg('Starting instance & waking up server...');
    }, 3000);
  } else if (isBackground) {
    slowWarningTimer = setTimeout(() => {
      updateServerStatus('Server waking up...', 'waking');
    }, 2500);
  } else {
    updateServerStatus('Connecting to server...', 'waking');
  }

  try {
    const data = await fetchApiWithRetry('/api/content', {}, {
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

    if (!isInitial) {
      updateServerStatus('Connected to FOBS TV', 'success');
    }
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
  const dot = document.getElementById('serverStatusDot');
  const ptrIcon = document.getElementById('ptrIcon');
  const textEl = document.getElementById('serverStatusText');
  const retryBtn = document.getElementById('serverRetryBtn');
  if (!bar || !textEl) return;

  bar.className = `server-status-bar ${state}`;
  textEl.innerText = text;

  if (ptrIcon) ptrIcon.style.display = 'none';
  if (dot) dot.style.display = 'inline-block';

  bar.style.maxHeight = '';
  bar.style.opacity = '';
  bar.style.transition = '';

  if (state === 'error' || state === 'offline') {
    if (retryBtn) retryBtn.classList.remove('hidden');
  } else {
    if (retryBtn) retryBtn.classList.add('hidden');
  }

  bar.classList.remove('hidden');

  if (state === 'success') {
    setTimeout(() => {
      bar.classList.add('hidden');
    }, 2500);
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
        bar.className = 'server-status-bar success';
        if (textEl) textEl.innerText = 'Connected to FOBS TV';
        if (ptrIcon) ptrIcon.style.display = 'none';
        if (dot) dot.style.display = 'inline-block';
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
  
  // Home hero: 2 most recent movies + 3 most recent series (always latest uploads)
  const recentMovies = movies.slice(0, 2);
  const recentSeries = series.slice(0, 3);
  heroItems = [...recentMovies, ...recentSeries];

  if (heroItems.length === 0) return;

  // Add clone for infinite peek slider if more than 1 item
  loopCardsList = heroItems.length > 1 ? [...heroItems, heroItems[0]] : [...heroItems];

  const backdropTrack = document.getElementById('heroBackdropTrack');
  const cardsTrack = document.getElementById('heroCardsTrack');

  if (backdropTrack) {
    backdropTrack.innerHTML = heroItems.map((slide, idx) => {
      const bgUrl = slide.backdrop || slide.poster;
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
      const bgUrl = slide.backdrop || slide.poster;
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
      const bgUrl = slide.backdrop || slide.poster;
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

// Card Badge Helpers for Ongoing, Language & Year
function getCardBadgeLeft(item) {
  if (item.badgeLeft) return item.badgeLeft;
  if (item.dubLanguage && item.dubLanguage.includes('Fan')) return 'Fan Dub';
  return item.dubLanguage || 'Hindi';
}

function getCardBadgeRightHtml(item, fallback = '') {
  if (item.badgeRight === 'ONGOING' || item.isOngoing || item.status === 'Ongoing') {
    return `<span class="card-badge-right badge-ongoing">ONGOING</span>`;
  }
  if (item.badgeRight === 'Hallprint' || item.tag === 'Hallprint') {
    return `<span class="card-badge-right badge-hallprint">Hallprint</span>`;
  }
  const text = item.badgeRight || item.year || fallback;
  return `<span class="card-badge-right">${text}</span>`;
}

// Render Home Carousels
function renderHomeFeeds() {
  const movies = sortByReleaseDateDesc(appState.content.movies || []);
  const series = sortByReleaseDateDesc(appState.content.series || []);
  const liveTv = appState.content.liveTv || [];

  // Trending Movies & Series with Rank Numbers (1, 2, 3)
  const trendingContainer = document.getElementById('trendingList');
  const combinedTrending = [
    ...(movies.slice(0, 3)),
    ...(series.slice(0, 3))
  ];
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

  // 1. Latest Movies & Series
  const latestContainer = document.getElementById('latestList');
  if (latestContainer) {
    const latestItems = [...movies.slice(0, 6), ...series.slice(0, 4)];
    latestContainer.innerHTML = latestItems.map(item => {
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

// Release Date Descending Sorter (Latest Releases Strictly First)
function sortByReleaseDateDesc(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const dateA = a.releaseDate || (a.year ? `${a.year}-01-01` : '2000-01-01');
    const dateB = b.releaseDate || (b.year ? `${b.year}-01-01` : '2000-01-01');
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

  // A. Trending Movies
  const trendingMovies = movies.filter(m => m.category === 'Trending Movies' || parseFloat(m.imdbRating || m.rating || 0) >= 7.8);
  renderCategoryList('movieTrendingList', sortByReleaseDateDesc(trendingMovies.length > 0 ? trendingMovies : movies), true);

  // B. Recently Added
  const recentMovies = movies.filter(m => m.category === 'Recently Added' || m.category === 'Trending Movies');
  renderCategoryList('movieRecentList', sortByReleaseDateDesc(recentMovies.length > 0 ? recentMovies : movies));

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
      items = [
        ...(movies.filter(m => m.category === 'Trending Movies' || parseFloat(m.imdbRating || m.rating || 0) >= 7.8)),
        ...(series.filter(s => s.category === 'Trending Series' || parseFloat(s.imdbRating || s.rating || 0) >= 7.8))
      ];
      if (items.length === 0) items = [...movies, ...series];
      break;

    case 'latest':
      items = [...movies, ...series];
      break;

    case 'upcoming':
      items = upcoming;
      break;

    // Movie Sections
    case 'movie-trending':
      items = movies.filter(m => m.category === 'Trending Movies' || parseFloat(m.imdbRating || m.rating || 0) >= 7.8);
      if (items.length === 0) items = movies;
      break;

    case 'movie-recent':
      items = movies.filter(m => m.category === 'Recently Added' || m.category === 'Trending Movies');
      if (items.length === 0) items = movies;
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
      items = series.filter(s => s.category === 'Trending Series' || parseFloat(s.imdbRating || s.rating || 0) >= 7.8);
      if (items.length === 0) items = series;
      break;

    case 'series-recent':
      isOnlySeries = true;
      items = series.filter(s => s.category === 'Recently Added' || s.category === 'Trending Series');
      if (items.length === 0) items = series;
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

  // Strictly sort newest releases first by TMDB release date
  if (sectionKey !== 'upcoming') {
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

  // A. Trending Series
  const trendingSeries = series.filter(s => s.category === 'Trending Series' || parseFloat(s.imdbRating || s.rating || 0) >= 7.8);
  renderCategoryList('seriesTrendingList', sortByReleaseDateDesc(trendingSeries.length > 0 ? trendingSeries : series), true, true);

  // B. Recently Added
  const recentSeries = series.filter(s => s.category === 'Recently Added' || s.category === 'Trending Series');
  renderCategoryList('seriesRecentList', sortByReleaseDateDesc(recentSeries.length > 0 ? recentSeries : series), false, true);

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
  }, 10000);
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

// Render Season Dropdown next to Dub dropdown
function renderSeasonDropdown(media) {
  const container = document.getElementById('seasonSelectorContainer');
  const textEl = document.getElementById('currentSeasonText');
  const menu = document.getElementById('seasonDropdownMenu');
  if (!container || !textEl || !menu) return;

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

  menu.innerHTML = seasonsList.map(s => {
    const sNum = s.seasonNumber || 1;
    const isActive = sNum === appState.currentSeason;
    const epCountText = s.episodes ? ` (${s.episodes.length} Eps)` : '';
    return `
      <div class="season-dropdown-item ${isActive ? 'active' : ''}" onclick="switchSeason(${sNum})">
        <span>${s.name || `Season ${sNum}`}${epCountText}</span>
        ${isActive ? '<i class="fa-solid fa-check" style="color: #00f2fe; font-size: 11px;"></i>' : ''}
      </div>
    `;
  }).join('');
}

// Toggle Season Dropdown open/close
function toggleSeasonDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('seasonDropdownMenu');
  if (!menu) return;
  const isHidden = menu.style.display === 'none' || !menu.style.display;
  menu.style.display = isHidden ? 'block' : 'none';
}

// Switch Active Season (Season 1 / Season 2)
function switchSeason(seasonNumber) {
  appState.currentSeason = seasonNumber;
  const menu = document.getElementById('seasonDropdownMenu');
  if (menu) menu.style.display = 'none';

  if (!appState.currentMedia) return;
  renderSeasonDropdown(appState.currentMedia);

  const episodes = getActiveSeasonEpisodes(appState.currentMedia);
  appState.currentEpisode = episodes[0] || null;
  appState.activeServerIndex = 0;
  renderEpisodePills(episodes, 0);
  renderServerPills(appState.currentMedia);

  if (appState.currentEpisode) {
    const activeEpStream = (appState.currentEpisode.servers && appState.currentEpisode.servers.length > 0)
      ? appState.currentEpisode.servers[0].url
      : ((appState.currentEpisode.audioTracks && appState.currentEpisode.audioTracks[appState.currentAudioTrack])
        || appState.currentEpisode.streamUrl);
    playStreamUrl(activeEpStream);
  }
}

// Global click listener to close season dropdown when clicking outside
document.addEventListener('click', (e) => {
  const container = document.getElementById('seasonSelectorContainer');
  const menu = document.getElementById('seasonDropdownMenu');
  if (menu && container && !container.contains(e.target)) {
    menu.style.display = 'none';
  }
});

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
  applyPlayerBrightness(1.0);

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
    const activeEpStream = (appState.currentEpisode.servers && appState.currentEpisode.servers.length > 0)
      ? appState.currentEpisode.servers[0].url
      : ((appState.currentEpisode.audioTracks && appState.currentEpisode.audioTracks[appState.currentAudioTrack])
        || appState.currentEpisode.streamUrl);
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
  const activeEpStream = (appState.currentEpisode.servers && appState.currentEpisode.servers.length > 0)
    ? appState.currentEpisode.servers[0].url
    : ((appState.currentEpisode.audioTracks && appState.currentEpisode.audioTracks[appState.currentAudioTrack])
      || appState.currentEpisode.streamUrl);
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

  // MovieBox dynamic stream redirect handler
  if (playableUrl.includes('/api/moviebox/stream')) {
    const fullUrl = playableUrl.startsWith('http') ? playableUrl : `${API_BASE_URL}${playableUrl}`;
    videoPlayer.src = fullUrl;
    videoPlayer.load();
    if (seekTime && seekTime > 0) {
      const applySeek = () => { try { videoPlayer.currentTime = seekTime; } catch(e) {} };
      if (videoPlayer.readyState >= 1) applySeek();
      else {
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

  // Direct play for sources that provide CORS headers and fast direct CDN edge delivery without IP restrictions
  const isDirectMp4Source = (
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
  if (isDirectMp4Source && !playableUrl.includes('googleusercontent.com') && audioIndex === null) {
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

  if (lsUi) lsUi.classList.remove('controls-hidden');
  if (topHeader) topHeader.classList.remove('controls-hidden');

  if (lsControlsTimer) clearTimeout(lsControlsTimer);
  if (playerControlsTimer) clearTimeout(playerControlsTimer);

  const video = document.getElementById('mainVideoPlayer');
  if (video && !video.paused) {
    // When locked, auto-hide lock indicator quickly after 2.5s; otherwise normal 3.5s
    const delay = isPlayerLocked ? 2500 : 3500;
    lsControlsTimer = setTimeout(() => {
      if (lsUi) lsUi.classList.add('controls-hidden');
      if (topHeader) topHeader.classList.add('controls-hidden');
    }, delay);
  }
}

function togglePlayerLock() {
  const lsUi = document.getElementById('landscapePlayerUI');
  const lockIcon = document.getElementById('lsLockIcon');
  const lockText = document.getElementById('lsLockText');
  const lockBtn = document.getElementById('lsLockBtn');
  if (!lsUi) return;

  isPlayerLocked = !isPlayerLocked;
  lsUi.classList.toggle('is-locked', isPlayerLocked);

  if (isPlayerLocked) {
    if (lockIcon) lockIcon.className = 'fa-solid fa-lock';
    if (lockText) lockText.innerText = 'Tap to Unlock';
    if (lockBtn) lockBtn.classList.add('locked');
    closeLandscapeDrawers();
    showToast('Screen locked');
  } else {
    if (lockIcon) lockIcon.className = 'fa-solid fa-lock-open';
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
  if (!video) return;

  const isPaused = video.paused;
  if (centerIcon) {
    centerIcon.className = isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  }
  if (bottomIcon) {
    bottomIcon.className = isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  }
}

function getMediaTotalDurationSeconds() {
  const video = document.getElementById('mainVideoPlayer');
  const duration = video?.duration || 0;
  const epDur = appState.currentEpisode?.duration || appState.currentMedia?.duration;
  let parsedSec = 0;
  if (epDur && typeof epDur === 'string') {
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


  // If native video.duration reports an artificially small chunked value (< 180s), return the actual media runtime
  if (parsedSec > 0 && (!duration || duration < 180)) {
    return parsedSec;
  }
  return duration > 0 ? duration : (parsedSec > 0 ? parsedSec : 3600);
}

function updateLandscapeProgress() {
  if (isScrubbingProgress) return;
  if (appState.pendingSeekTime !== null && appState.pendingSeekTime !== undefined) return;

  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const streamOffset = appState.streamSeekOffset || 0;
  const current = (video.currentTime || 0) + streamOffset;
  const duration = getMediaTotalDurationSeconds();

  const curEl = document.getElementById('lsCurrentTime');
  const durEl = document.getElementById('lsTotalDuration');
  const filledEl = document.getElementById('lsProgressFilled');
  const thumbEl = document.getElementById('lsProgressThumb');
  const bufEl = document.getElementById('lsProgressBuffered');

  if (curEl) curEl.innerText = formatPlayerTime(current);
  if (durEl) durEl.innerText = formatPlayerTime(duration);

  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (current / duration) * 100));
    if (filledEl) filledEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;

    if (bufEl && video.buffered && video.buffered.length > 0) {
      try {
        const bufEnd = video.buffered.end(video.buffered.length - 1) + streamOffset;
        const bufPct = Math.min(100, Math.max(0, (bufEnd / duration) * 100));
        bufEl.style.width = `${bufPct}%`;
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
  if (curEl) curEl.innerText = formatPlayerTime(target);
  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (target / duration) * 100));
    if (filledEl) filledEl.style.width = `${pct}%`;
    if (thumbEl) thumbEl.style.left = `${pct}%`;
  }

  showToast(offsetSeconds > 0 ? '+10s' : '-10s');
  resetLandscapeControlsTimer();

  if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    const finalTarget = appState.pendingSeekTime !== null ? appState.pendingSeekTime : target;
    seekToAbsoluteTime(finalTarget);
  }, 220);
}

function seekToAbsoluteTime(targetSeconds) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const duration = getMediaTotalDurationSeconds();
  const safeTarget = Math.max(0, Math.min(duration, Math.floor(targetSeconds)));

  const curEp = appState.currentEpisode;
  const rawUrl = (curEp?.audioTracks && curEp.audioTracks[appState.currentAudioTrack]) 
    || curEp?.streamUrl 
    || appState.currentMedia?.streamUrl 
    || appState.currentMedia?.driveUrl;

  const isServerStream = video.src && (
    video.src.includes('/api/stream') ||
    video.src.includes('/api/resolve')
  );

  const isTranscodedStream = isServerStream || (rawUrl && (
    rawUrl.includes('.mkv') ||
    rawUrl.includes('vcloud.you') ||
    rawUrl.includes('fast-dl') ||
    rawUrl.includes('hindidrama.net') ||
    rawUrl.includes('luluvido') ||
    rawUrl.includes('upbolt') ||
    rawUrl.includes('it2k1jyiil2q') ||
    rawUrl.includes('.m3u8')
  ));

  // Native MP4 & direct CDN streams: direct HTML5 byte-range seek
  if (!isTranscodedStream) {
    appState.streamSeekOffset = 0;
    appState.pendingSeekTime = safeTarget;

    // Only show loader if seek takes longer than 350ms to prevent visual freezes
    if (window.seekLoaderTimeout) clearTimeout(window.seekLoaderTimeout);
    window.seekLoaderTimeout = setTimeout(() => {
      if (appState.pendingSeekTime !== null) {
        const loader = document.getElementById('videoLoader');
        if (loader) loader.classList.add('active');
      }
    }, 350);

    try {
      video.currentTime = safeTarget;
      video.play().catch(() => {});
    } catch (e) {
      console.warn('Native seek error:', e);
      appState.pendingSeekTime = null;
    }
    updateLandscapeProgress();
    return;
  }

  // Server-proxied or transcoded stream:
  // Check if target falls inside currently buffered chunk
  const streamOffset = appState.streamSeekOffset || 0;
  const relTime = safeTarget - streamOffset;

  if (relTime >= 0 && isTimeBuffered(video, relTime)) {
    appState.pendingSeekTime = safeTarget;
    try {
      video.currentTime = relTime;
      video.play().catch(() => {});
    } catch (e) {
      appState.pendingSeekTime = null;
    }
    updateLandscapeProgress();
    return;
  }

  // Target outside buffered chunk: request server stream starting at safeTarget
  if (rawUrl) {
    appState.pendingSeekTime = safeTarget;
    appState.streamSeekOffset = safeTarget;
    playStreamUrl(rawUrl, appState.selectedAudioIndex, safeTarget);
  }
}

function setupLandscapeProgressScrubbing() {
  const wrapper = document.getElementById('lsProgressWrapper');
  const video = document.getElementById('mainVideoPlayer');
  if (!wrapper || !video) return;

  const handleScrub = (clientX) => {
    const rect = wrapper.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = getMediaTotalDurationSeconds();
    if (duration > 0) {
      const targetTime = Math.floor(pos * duration);
      const percent = pos * 100;
      const filledEl = document.getElementById('lsProgressFilled');
      const thumbEl = document.getElementById('lsProgressThumb');
      const curTimeEl = document.getElementById('lsCurrentTime');
      if (filledEl) filledEl.style.width = `${percent}%`;
      if (thumbEl) thumbEl.style.left = `${percent}%`;
      if (curTimeEl) curTimeEl.innerText = formatPlayerTime(targetTime);
    }
  };

  wrapper.addEventListener('pointerdown', (e) => {
    isScrubbingProgress = true;
    wrapper.setPointerCapture(e.pointerId);
    handleScrub(e.clientX);
    resetLandscapeControlsTimer();
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (isScrubbingProgress) {
      handleScrub(e.clientX);
      resetLandscapeControlsTimer();
    }
  });

  const onPointerUp = (e) => {
    if (isScrubbingProgress) {
      isScrubbingProgress = false;
      try { wrapper.releasePointerCapture(e.pointerId); } catch (err) {}
      const rect = wrapper.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const duration = getMediaTotalDurationSeconds();
      const targetTime = Math.floor(pos * duration);
      seekToAbsoluteTime(targetTime);
      resetLandscapeControlsTimer();
    }
  };

  wrapper.addEventListener('pointerup', onPointerUp);
  wrapper.addEventListener('pointercancel', onPointerUp);
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
    lsUi.classList.remove('controls-hidden');
  }
  const container = document.getElementById('videoContainer');
  if (container) {
    container.classList.remove('has-drawer-open');
  }
  const topHeader = document.getElementById('playerTopHeader');
  if (topHeader) {
    topHeader.classList.remove('controls-hidden');
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
    btn.classList.toggle('active', btn.dataset.quality === quality || btn.innerText.toLowerCase().includes(quality.toLowerCase()));
  });

  const media = appState.currentMedia;
  if (media && media.servers && media.servers.length > 1) {
    const matched = media.servers.find(s => s.name.toLowerCase().includes(quality.toLowerCase())) || media.servers[0];
    if (matched && matched.url) {
      const video = document.getElementById('mainVideoPlayer');
      const currentPos = video ? video.currentTime : 0;
      playStreamUrl(matched.url, null, currentPos);
    }
  }
  showToast(`Quality: ${quality.toUpperCase()}`);
  closeLandscapeDrawers();
  resetLandscapeControlsTimer();
}

function updateQualityPillsForMedia(media) {
  const qualityList = document.getElementById('lsQualityOptionsList');
  if (!qualityList) return;

  const servers = (appState.currentEpisode && appState.currentEpisode.servers) 
    ? appState.currentEpisode.servers 
    : (media.servers || []);

  if (servers.length > 1) {
    qualityList.innerHTML = servers.map((s, idx) => {
      const qName = s.name.replace(/Server\s*\d+\s*\(/i, '').replace(/\)/g, '').trim();
      return `
        <button class="ls-speed-option ${idx === 0 ? 'active' : ''}" onclick="setLandscapeQuality('${qName}')">
          ${qName.toUpperCase()}
        </button>
      `;
    }).join('');
  }
}

function setupSubtitlesForMedia(media) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  // Clear existing tracks
  while (video.querySelector('track')) {
    video.querySelector('track').remove();
  }

  const subtitleContainer = document.getElementById('lsSubtitleOptionsList');
  if (subtitleContainer) {
    subtitleContainer.innerHTML = `
      <div class="ls-lang-item active" onclick="showToast('Subtitles feature is Coming Soon!')" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
        <span style="display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-clock-rotate-left" style="color: #f59e0b;"></i> Coming Soon
        </span>
        <span style="font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 999px;">In Progress</span>
      </div>
    `;
  }

  const subToggle = document.getElementById('lsSubtitleToggle');
  if (subToggle) {
    subToggle.checked = false;
    subToggle.onchange = () => {
      subToggle.checked = false;
      showToast('Subtitles feature is Coming Soon in next update!');
    };
  }
}

function selectSubtitleTrack(index, label) {
  const video = document.getElementById('mainVideoPlayer');
  if (video && video.textTracks) {
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = (i === index) ? 'showing' : 'hidden';
    }
  }
  document.querySelectorAll('#lsSubtitleOptionsList .ls-lang-item').forEach((item, idx) => {
    item.classList.toggle('active', idx === index);
    const check = item.querySelector('.ls-check-icon');
    if (check) check.classList.toggle('hidden', idx !== index);
  });
  showToast(`Subtitle: ${label}`);
  closeLandscapeDrawers();
  resetLandscapeControlsTimer();
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
  if (!lsUi && !topHeader) return;

  const openDrawer = document.querySelector('.ls-side-drawer.open');
  if (openDrawer) {
    closeLandscapeDrawers();
    resetLandscapeControlsTimer();
    return;
  }

  if (isPlayerLocked) {
    if (lsUi) lsUi.classList.remove('controls-hidden');
    if (topHeader) topHeader.classList.remove('controls-hidden');
    resetLandscapeControlsTimer();
    return;
  }

  closeLandscapeDrawers();

  const isCurrentlyHidden = (lsUi && lsUi.classList.contains('controls-hidden')) ||
                            (topHeader && topHeader.classList.contains('controls-hidden'));

  if (isCurrentlyHidden) {
    // Reveal buttons
    if (lsUi) lsUi.classList.remove('controls-hidden');
    if (topHeader) topHeader.classList.remove('controls-hidden');
    resetLandscapeControlsTimer();
  } else {
    // Minimize / hide buttons
    if (lsUi) lsUi.classList.add('controls-hidden');
    if (topHeader) topHeader.classList.add('controls-hidden');
    if (lsControlsTimer) clearTimeout(lsControlsTimer);
    if (playerControlsTimer) clearTimeout(playerControlsTimer);
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
}

function hideSeekGestureHud() {
  const hud = document.getElementById('playerSeekHud');
  if (!hud) return;
  if (seekHudTimer) clearTimeout(seekHudTimer);
  seekHudTimer = setTimeout(() => {
    hud.classList.remove('visible');
    setTimeout(() => {
      if (!hud.classList.contains('visible')) hud.style.display = 'none';
    }, 200);
  }, 350);
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

function setupPlayerGestures() {
  const tapDetector = document.getElementById('lsTapDetector');
  if (!tapDetector) return;

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

  tapDetector.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (document.querySelector('.ls-side-drawer.open')) {
      closeLandscapeDrawers();
      resetLandscapeControlsTimer();
      return;
    }

    const rect = tapDetector.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

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
  });

  tapDetector.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;
    if (isPlayerLocked) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const isFullscreen = document.body.classList.contains('is-fullscreen');

    if (!isDragging) {
      // In landscape/fullscreen, allow horizontal seek (>28px) or vertical drag (>28px)
      // In portrait, only allow horizontal seek if movement is deliberate (>36px)
      const hThreshold = isFullscreen ? 28 : 36;
      if (Math.abs(deltaX) > hThreshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        isDragging = true;
        dragType = 'horizontal-seek';
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
      } else if (isFullscreen && Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
        isDragging = true;
        dragType = 'vertical';
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
      }
    }

    if (isDragging) {
      const rect = tapDetector.getBoundingClientRect();

      if (dragType === 'horizontal-seek') {
        const video = document.getElementById('mainVideoPlayer');
        if (video) {
          const duration = video.duration || 3600;
          const pixelsPerTenSeconds = 20;
          let stepCount = Math.trunc(deltaX / pixelsPerTenSeconds);
          if (stepCount === 0) {
            stepCount = deltaX > 0 ? 1 : (deltaX < 0 ? -1 : 0);
          }
          const seekDelta = stepCount * 10;
          targetSeekTime = Math.max(0, Math.min(duration, startVideoTime + seekDelta));
          showSeekGestureHud(seekDelta, targetSeekTime, duration);
        }
      } else if (dragType === 'vertical') {
        const sensitivityRange = rect.height * 0.65;
        const deltaRatio = -deltaY / sensitivityRange;

        if (activeSide === 'left') {
          const newBrightness = applyPlayerBrightness(startBrightness + deltaRatio);
          showGestureHud('brightness', newBrightness);
        } else {
          const newVolume = applyPlayerVolume(startVolume + deltaRatio * 1.6);
          showGestureHud('volume', newVolume);
        }
      }
    }
  });

  const onPointerEnd = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);

    if (isDragging && moveDist > 22) {
      if (dragType === 'horizontal-seek') {
        const video = document.getElementById('mainVideoPlayer');
        if (video && !isNaN(targetSeekTime)) {
          seekToAbsoluteTime(targetSeekTime);
          video.play().catch(() => {});
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

    isDragging = false;
    dragType = null;

    // --- Tap / Double-Tap detection ---
    if (isPlayerLocked) {
      handleSinglePlayerTap();
      return;
    }

    const rect = tapDetector.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    const relX = clickX - rect.left;
    const currentSide = relX < (rect.width / 2) ? 'left' : 'right';
    const now = Date.now();

    const timeDiff = now - lastTapInfo.time;
    const distDiff = Math.hypot(clickX - lastTapInfo.x, clickY - lastTapInfo.y);

    if (timeDiff < 320 && distDiff < 60 && lastTapInfo.side === currentSide) {
      // DOUBLE TAP!
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
      lastTapInfo.time = 0; // reset

      if (currentSide === 'left') {
        triggerDoubleTapSeek(-10);
      } else {
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
      }, 240);
    }
  };

  tapDetector.addEventListener('pointerup', onPointerEnd);
  tapDetector.addEventListener('pointercancel', onPointerEnd);

  // Direct click fallback for devices where pointerup is swallowed
  tapDetector.addEventListener('click', (e) => {
    if (Date.now() - lastTapInfo.time > 350 && !isDragging) {
      handleSinglePlayerTap();
    }
  });
}

// Setup Video Event Listeners
function setupVideoListeners() {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const loader = document.getElementById('videoLoader');
  const embedFrame = document.getElementById('mainEmbedPlayer');
  if (!videoPlayer) return;

  // Portrait mode tap: clicking anywhere on videoContainer shows/hides controls
  if (videoContainer) {
    videoContainer.addEventListener('click', (e) => {
      // Only handle if not clicking a control button or embed frame
      const embedFrame = document.getElementById('mainEmbedPlayer');
      if (embedFrame && embedFrame.style.display === 'block') return;
      if (e.target.closest('button, .ls-action-pill, .ls-side-drawer, #lsTapDetector')) return;
      handleSinglePlayerTap();
    });
  }

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
    if (appState.pendingSeekTime !== null && appState.pendingSeekTime !== undefined) {
      const streamOffset = appState.streamSeekOffset || 0;
      const current = (videoPlayer.currentTime || 0) + streamOffset;
      if (Math.abs(current - appState.pendingSeekTime) <= 2) {
        appState.pendingSeekTime = null;
      }
    }
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('progress', () => {
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('playing', () => {
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
  });

  videoPlayer.addEventListener('waiting', () => {
    if (loader) loader.classList.add('active');
  });

  let seekingLoaderTimer = null;
  videoPlayer.addEventListener('seeking', () => {
    if (seekingLoaderTimer) clearTimeout(seekingLoaderTimer);
    seekingLoaderTimer = setTimeout(() => {
      if (loader && videoPlayer.seeking) loader.classList.add('active');
    }, 350);
  });

  videoPlayer.addEventListener('seeked', () => {
    if (seekingLoaderTimer) clearTimeout(seekingLoaderTimer);
    if (window.seekLoaderTimeout) clearTimeout(window.seekLoaderTimeout);
    appState.pendingSeekTime = null;
    if (loader) loader.classList.remove('active');
    updateLandscapeProgress();
    syncPlayPauseIcons();
  });

  videoPlayer.addEventListener('canplay', () => {
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

  const cast = (media.cast && media.cast.length > 0) ? media.cast : defaultCast;
  const rating = media.imdbRating || media.rating || '8.1';
  const genre = media.genre ? media.genre.split(',')[0].trim() : 'Drama';
  const country = media.country || 'Korea';
  const year = media.year || '2023';

  content.innerHTML = `
    <div class="details-media-head">
      <div class="details-poster-wrap">
        <img src="${media.poster}" alt="${media.title}" class="details-media-poster">
        <div class="poster-zoom-btn"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
      </div>
      <div class="details-media-meta-wrap">
        <div class="details-media-title">${media.title} [Hindi]</div>
        <div class="details-meta-line">
          <i class="fa-solid fa-film"></i>
          <span class="star-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
          <span>${year}</span>
          <span>${country}</span>
          <span>${genre}</span>
        </div>
        <button class="details-sheet-play-btn" onclick="closeDetailsSheet(); openPlayer(appState.currentMedia);"><i class="fa-solid fa-play"></i> Watch Now</button>
      </div>
    </div>

    <div class="details-section-label">Info</div>
    <div class="details-overview-text">
      ${media.description || 'Full movie & TV series details fetched from TMDB database.'}
    </div>

    <div class="details-section-label">Starring (${cast.length})</div>
    <div class="starring-scroll-row">
      ${cast.map(c => `
        <div class="cast-card">
          <div class="cast-photo-wrap">
            <img src="${c.photo}" alt="${c.name}" class="cast-photo-img" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'">
          </div>
          <div class="cast-actor-name">${c.name}</div>
          <div class="cast-character-name">${c.character || 'Extra'}</div>
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
}

// Trigger Video Download Popup
function triggerDownload() {
  showComingSoonModal('Download Video', 'Offline video download feature is coming soon in the upcoming update!');
}

function showComingSoonModal(title = 'Coming Soon', message = 'This feature will be available in the upcoming update.') {
  let modal = document.getElementById('fobsComingSoonModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'fobsComingSoonModal';
    modal.className = 'fobs-coming-modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="fobs-coming-modal-box">
      <div class="fobs-coming-modal-icon">
        <i class="fa-solid fa-clock-rotate-left"></i>
      </div>
      <h3 class="fobs-coming-modal-title">${title}</h3>
      <p class="fobs-coming-modal-msg">${message}</p>
      <button class="fobs-coming-modal-btn" onclick="closeComingSoonModal()">Got It</button>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeComingSoonModal() {
  const modal = document.getElementById('fobsComingSoonModal');
  if (modal) modal.style.display = 'none';
}

function downloadMedia(url, title) {
  if (!url) return;
  showToast(`Starting download: ${title}...`);

  try {
    const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
    downloads.unshift({
      title,
      url,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    });
    localStorage.setItem('fobs_downloads', JSON.stringify(downloads.slice(0, 25)));
  } catch (e) {}

  const downloadUrl = `${API_BASE_URL}/api/download?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', `${title}.mp4`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Downloads View Management
function openDownloadsView() {
  const overlay = document.getElementById('downloadsOverlay');
  const container = document.getElementById('downloadsListContainer');
  const subText = document.getElementById('downloadsSubText');

  const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');

  if (downloads.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
        <i class="fa-solid fa-cloud-arrow-down" style="font-size: 38px; color: #4facfe; margin-bottom: 12px; display: block;"></i>
        <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px;">No Downloads Yet</div>
        <p style="font-size: 12px; line-height: 1.5; color: #9ea3b5; max-width: 260px; margin: 0 auto;">
          Click the "Download" button on any movie or episode to save it directly to your phone storage!
        </p>
      </div>
    `;
    subText.innerText = '0 saved files';
  } else {
    subText.innerText = `${downloads.length} saved file${downloads.length > 1 ? 's' : ''}`;
    container.innerHTML = downloads.map((item, idx) => `
      <div class="community-card" style="align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="comm-icon-box" style="background: rgba(0, 242, 254, 0.15); color: #00f2fe;">
            <i class="fa-solid fa-file-video"></i>
          </div>
          <div class="comm-info">
            <div class="comm-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">${item.title}</div>
            <div class="comm-desc">Downloaded on ${item.date}</div>
          </div>
        </div>
        <button class="comm-action-btn" onclick="downloadMedia('${item.url}', '${item.title}')" style="cursor: pointer;">
          <i class="fa-solid fa-download"></i>
        </button>
      </div>
    `).join('');
  }

  if (overlay) overlay.classList.add('open');
}

function closeDownloadsView(e) {
  if (e && e.target !== document.getElementById('downloadsOverlay') && !e.target.closest('.sheet-close-btn')) {
    return;
  }
  const overlay = document.getElementById('downloadsOverlay');
  if (overlay) overlay.classList.remove('open');
}

// Render Dynamic Audio Tracks for Active Media
function renderAudioTrackOptions(media) {
  let rawTracks = (media && media.audioTracks && media.audioTracks.length > 0)
    ? media.audioTracks
    : ['Hindi dub'];

  // Strict Rule: ONLY Hindi dubbing in video player, hide other languages
  let tracks = rawTracks.filter(t => /hindi/i.test(t));
  if (tracks.length === 0) {
    tracks = ['Hindi dub'];
  }

  appState.currentAudioTrack = tracks[0];

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

  const isEnglishOrOriginal = lang.toLowerCase().includes('english') || lang.toLowerCase().includes('eng') || lang.toLowerCase().includes('korean') || lang.toLowerCase().includes('orig');
  const targetAudioIndex = isEnglishOrOriginal ? 1 : 0;
  appState.selectedAudioIndex = targetAudioIndex;

  const currentEp = appState.currentEpisode;
  const rawUrl = (currentEp?.audioTracks && currentEp.audioTracks[lang]) 
    || currentEp?.streamUrl 
    || appState.currentMedia?.streamUrl 
    || appState.currentMedia?.driveUrl;

  if (rawUrl && videoPlayer) {
    const curTime = (videoPlayer.currentTime || 0) + (appState.streamSeekOffset || 0);
    const isPlaying = !videoPlayer.paused;
    playStreamUrl(rawUrl, targetAudioIndex, curTime);
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

// Add to list action
function toggleAddToList() {
  showToast('Saved to My Watchlist! ❤️');
}

// Share action
function shareMedia() {
  if (navigator.share && appState.currentMedia) {
    navigator.share({
      title: appState.currentMedia.title,
      text: `Watch ${appState.currentMedia.title} on FOBS TV`,
      url: window.location.href
    }).catch(() => {});
  } else {
    showToast('Share link copied to clipboard!');
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

  if (poster) poster.src = item.poster || item.cover || 'assets/fobs_logo.png';
  if (title) title.innerText = item.title || 'Coming Soon';
  if (year) year.innerText = item.year || '2026';
  if (dub) dub.innerText = item.dubLanguage || 'Hindi Dubbed';
  if (genre) genre.innerText = item.genre || 'Action, Thriller';
  if (rating) rating.innerText = item.imdbRating || item.rating || '8.5';
  if (overview) overview.innerText = item.description || item.overview || 'Upcoming exclusive release coming soon on FOBS TV in Hindi audio.';

  // Initial booking count starts strictly at 0
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
      currentCount = res.bookings;
      localStorage.setItem(localBookedCountKey, currentCount.toString());
      if (countEl) countEl.innerText = `${currentCount}`;
    }
  } catch (e) {}

  // Real-time polling while modal is open
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
        currentCount = Math.max(currentCount, res.bookings);
        localStorage.setItem(localBookedCountKey, currentCount.toString());
        if (countEl) countEl.innerText = `${currentCount}`;
      }
    } catch (e) {}
  }, 6000);
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

  showToast('🎉 Pre-booked successfully! Notification set for release.');

  // Notify backend real-time counter
  try {
    const res = await fetchApiWithRetry(`/api/bookings/${encodeURIComponent(item.id)}/increment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FOBS-Client': 'FOBS-TV-App'
      }
    }, { timeout: 3500, maxRetries: 1 });
    if (res && res.bookings !== undefined) {
      currentCount = Math.max(currentCount, res.bookings);
      localStorage.setItem(localBookedCountKey, currentCount.toString());
      if (countEl) countEl.innerText = `${currentCount}`;
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

  let apkUrl = currentAppUpdateConfig?.downloadUrl || 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk';
  if (!apkUrl.startsWith('http')) {
    apkUrl = `${API_BASE_URL}${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`;
  }

  showToast('Opening browser to download latest FOBS TV APK (15.4 MB)...');

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



