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

const CACHE_KEY = 'fobs_tv_content_cache_v25';
const SYNC_KEY = 'fobs_tv_last_sync_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
let isSyncing = false;

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
  currentAudioTrack: 'Hindi dub'
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

  // Step 1: Immediate local render from localStorage cache (0ms delay)
  const hasCache = loadCachedContent();
  if (hasCache) {
    renderAllViews();
    // Non-blocking background sync if cache is older than 5 minutes
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 2: Immediate local render from bundled APK seed content (local asset fetch)
  const hasSeed = await loadSeedContent();
  if (hasSeed) {
    renderAllViews();
    syncContentWithBackend({ isBackground: true });
    return;
  }

  // Step 3: Cold start without any local cache (first run) - show branded FOBS TV loading overlay
  await syncContentWithBackend({ isInitial: true, force: true });
}

// Normalize content data structures
function normalizeContentData(data) {
  if (!data) return;
  if (data.movies) data.movies.forEach(m => m.type = 'movie');
  if (data.series) data.series.forEach(s => s.type = 'series');
  if (data.liveTv) data.liveTv.forEach(t => t.type = 'liveTv');
  if (data.upcoming) data.upcoming.forEach(u => u.type = u.type || 'series');
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
  const textEl = document.getElementById('serverStatusText');
  const retryBtn = document.getElementById('serverRetryBtn');
  if (!bar || !textEl) return;

  bar.className = `server-status-bar ${state}`;
  textEl.innerText = text;

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

// Touch & Swipe Gestures to close player (Slide back horizontally or swipe down)
function setupPlayerSwipeToClose() {
  const player = document.getElementById('playerOverlay');
  if (!player) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let isTouching = false;

  player.addEventListener('touchstart', (e) => {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    if (e.target.tagName === 'INPUT' || e.target.closest('input')) return;
    if (e.target.tagName === 'VIDEO' || e.target.closest('video') || e.target.closest('.video-container')) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    deltaX = 0;
    deltaY = 0;
    isTouching = true;
  }, { passive: true });

  player.addEventListener('touchmove', (e) => {
    if (!isTouching) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;
  }, { passive: true });

  player.addEventListener('touchend', () => {
    if (!isTouching) return;
    isTouching = false;

    // 1. Slide from left to right (Edge or screen swipe back)
    if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      closePlayer();
      return;
    }

    // 2. Slide from right edge to left (Android right-edge back gesture on screen)
    if (startX > window.innerWidth - 65 && deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      closePlayer();
      return;
    }

    // 3. Swipe down to dismiss (when scrolled at top, like YouTube)
    const scrollContainer = player.querySelector('.player-content-scroll');
    const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 5;
    if (deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2 && isAtTop) {
      closePlayer();
      return;
    }
  }, { passive: true });
}

// Render Home Carousels
function renderHomeFeeds() {
  const movies = appState.content.movies || [];
  const series = appState.content.series || [];
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
          <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : 'Hindi'}</span>
          <span class="card-badge-right">${item.year || (isSeries ? 'Series' : 'Movie')}</span>
          ${idx < 3 ? `<div class="card-rank-number">${idx + 1}</div>` : ''}
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${isSeries ? (item.seasonsCount ? item.seasonsCount + ' Seasons' : 'Series') : (item.year || '2023')}</div>
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
            <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : 'Hindi'}</span>
            <span class="card-badge-right">${item.year || (isSeries ? 'Series' : 'Movie')}</span>
            <div class="card-play-hover">
              <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
            </div>
          </div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${item.year || '2023'}</div>
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
        const booked = item.booked !== undefined ? item.booked : '0';
        return `
          <div class="coming-card" onclick='openPlayerById("upcoming", "${item.id}")'>
            <div class="coming-poster-wrap">
              <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
              <span class="card-badge-right">${item.year || 'Upcoming'}</span>
              <div class="coming-date-badge">${month}<span>${day}</span></div>
              <div class="coming-booked-tag">${booked} booked</div>
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
          <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : 'Hindi'}</span>
          <span class="card-badge-right">${item.year || 'Movie'}</span>
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
          <span class="card-badge-left">Hindi</span>
          <span class="card-badge-right">${item.year || 'Series'}</span>
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.seasonsCount || 1} Seasons</div>
      </div>
    `).join('');
  }

  // 5. Live TV
  const homeLiveTvContainer = document.getElementById('homeLiveTvList');
  if (homeLiveTvContainer) {
    if (liveTv.length > 0) {
      homeLiveTvContainer.innerHTML = liveTv.map(item => `
        <div class="media-card" onclick='openLiveTvPlayer("${item.id}")'>
          <div class="card-poster-wrap" style="height: 120px; display: flex; align-items: center; justify-content: center; background: #1c1d27;">
            <img src="${item.logo}" alt="${item.title}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
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
        <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : (item.dubLanguage || 'Hindi')}</span>
        <span class="card-badge-right">${item.year || 'Movie'}</span>
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

// Render All Movies Tab with Hero Banner & Categorized Horizontal Strips
function renderAllMovies() {
  const movies = appState.content.movies || [];

  // 1. Render Hero Banner for Movies
  renderMovieHeroBanner();

  // Categorization helpers
  const isBollywood = m => (
    (m.industry && m.industry.toLowerCase().includes('bollywood')) ||
    (m.language && m.language.toLowerCase() === 'hindi' && !m.country?.includes('Korea') && !m.country?.includes('USA'))
  );

  const isSouth = m => (
    (m.industry && m.industry.toLowerCase().includes('south')) ||
    (m.language && ['telugu', 'tamil', 'kannada', 'malayalam'].includes(m.language.toLowerCase()))
  );

  const isHollywood = m => (
    (m.industry && m.industry.toLowerCase().includes('hollywood')) ||
    (m.language && m.language.toLowerCase() === 'english') ||
    (m.country && (m.country.toLowerCase().includes('usa') || m.country.toLowerCase().includes('united states')))
  );

  const isKorean = m => (
    (m.industry && m.industry.toLowerCase().includes('korean')) ||
    (m.language && m.language.toLowerCase() === 'korean') ||
    (m.country && m.country.toLowerCase().includes('korea'))
  );

  const isChinese = m => (
    (m.industry && m.industry.toLowerCase().includes('chinese')) ||
    (m.language && m.language.toLowerCase() === 'chinese') ||
    (m.country && (m.country.toLowerCase().includes('china') || m.country.toLowerCase().includes('taiwan') || m.country.toLowerCase().includes('hong kong')))
  );

  const isJapanese = m => (
    (m.industry && m.industry.toLowerCase().includes('japanese')) ||
    (m.language && m.language.toLowerCase() === 'japanese') ||
    (m.country && m.country.toLowerCase().includes('japan'))
  );

  const isOthers = m => (
    !isBollywood(m) && !isSouth(m) && !isHollywood(m) && !isKorean(m) && !isChinese(m) && !isJapanese(m)
  );

  // A. Trending Movies
  const trendingMovies = movies.filter(m => m.category === 'Trending Movies' || parseFloat(m.imdbRating || m.rating || 0) >= 7.8);
  renderCategoryList('movieTrendingList', trendingMovies.length > 0 ? trendingMovies : movies, true);

  // B. Recently Added
  const recentMovies = movies.filter(m => m.category === 'Recently Added' || m.category === 'Trending Movies');
  renderCategoryList('movieRecentList', recentMovies.length > 0 ? recentMovies : movies);

  // C. Bollywood
  const bollywoodMovies = movies.filter(isBollywood);
  renderCategoryList('movieBollywoodList', bollywoodMovies);

  // D. South (Dubbed)
  const southMovies = movies.filter(isSouth);
  renderCategoryList('movieSouthList', southMovies);

  // E. Hollywood (Dubbed)
  const hollywoodMovies = movies.filter(isHollywood);
  renderCategoryList('movieHollywoodList', hollywoodMovies);

  // F. Korean (Dubbed)
  const koreanMovies = movies.filter(isKorean);
  renderCategoryList('movieKoreanList', koreanMovies.length > 0 ? koreanMovies : (movies.filter(m => m.country === 'Korea')));

  // G. Chinese (Dubbed)
  const chineseMovies = movies.filter(isChinese);
  renderCategoryList('movieChineseList', chineseMovies);

  // H. Japanese (Dubbed)
  const japaneseMovies = movies.filter(isJapanese);
  renderCategoryList('movieJapaneseList', japaneseMovies);

  // I. Others (Dubbed)
  const othersMovies = movies.filter(isOthers);
  renderCategoryList('movieOthersList', othersMovies);
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
        <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : (item.dubLanguage || 'Hindi')}</span>
        <span class="card-badge-right">${item.year || 'Series'}</span>
        ${rank ? `<div class="card-rank-number">${rank}</div>` : ''}
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.seasonsCount ? item.seasonsCount + ' Seasons' : (item.year || 'Series')}</div>
    </div>
  `;
}

// Categorization Predicates for Sections & Dedicated Pages
const isBollywoodMedia = m => (
  (m.industry && m.industry.toLowerCase().includes('bollywood')) ||
  (m.language && m.language.toLowerCase() === 'hindi' && !m.country?.includes('Korea') && !m.country?.includes('USA'))
);

const isSouthMedia = m => (
  (m.industry && m.industry.toLowerCase().includes('south')) ||
  (m.language && ['telugu', 'tamil', 'kannada', 'malayalam'].includes(m.language.toLowerCase()))
);

const isHollywoodMedia = x => (
  (x.industry && x.industry.toLowerCase().includes('hollywood')) ||
  (x.language && x.language.toLowerCase() === 'english') ||
  (x.country && (x.country.toLowerCase().includes('usa') || x.country.toLowerCase().includes('united states')))
);

const isKoreanMedia = x => (
  (x.industry && x.industry.toLowerCase().includes('korean')) ||
  (x.language && x.language.toLowerCase() === 'korean') ||
  (x.country && x.country.toLowerCase().includes('korea'))
);

const isChineseMedia = x => (
  (x.industry && x.industry.toLowerCase().includes('chinese')) ||
  (x.language && x.language.toLowerCase() === 'chinese') ||
  (x.country && (x.country.toLowerCase().includes('china') || x.country.toLowerCase().includes('taiwan') || x.country.toLowerCase().includes('hong kong')))
);

const isJapaneseMedia = x => (
  (x.industry && x.industry.toLowerCase().includes('japanese')) ||
  (x.language && x.language.toLowerCase() === 'japanese') ||
  (x.country && (x.country.toLowerCase().includes('japan')))
);

const isOthersMovieMedia = m => (
  !isBollywoodMedia(m) && !isSouthMedia(m) && !isHollywoodMedia(m) && !isKoreanMedia(m) && !isChineseMedia(m) && !isJapaneseMedia(m)
);

const isOthersSeriesMedia = s => (
  !isHollywoodMedia(s) && !isKoreanMedia(s) && !isChineseMedia(s) && !isJapaneseMedia(s)
);

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

    default:
      items = [...movies, ...series];
  }

  // Update item count badge
  if (countEl) {
    countEl.innerText = `${items.length} ${items.length === 1 ? 'Title' : 'Titles'}`;
  }

  // Render cards vertically inside the 3-column grid
  if (items.length > 0) {
    if (sectionKey === 'upcoming') {
      gridEl.innerHTML = items.map(item => `
        <div class="coming-card" style="width: 100%; max-width: 100%; margin-bottom: 8px;" onclick='openPlayerById("upcoming", "${item.id}")'>
          <div class="coming-poster-wrap" style="width: 100%; height: 175px;">
            <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
            <span class="card-badge-right">${item.year || 'Upcoming'}</span>
            <div class="coming-date-badge">${item.releaseMonth || 'Nov'}<span>${item.releaseDay || '04'}</span></div>
            <div class="coming-booked-tag">${item.booked || '0'} booked</div>
          </div>
          <div class="coming-info-box">
            <div class="coming-title" title="${item.title}">${item.title}</div>
          </div>
        </div>
      `).join('');
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

// Render All Series Tab with Hero Banner & Categorized Horizontal Strips (Bollywood & South excluded)
function renderAllSeries() {
  const series = appState.content.series || [];

  // 1. Render Hero Banner for Series
  renderSeriesHeroBanner();

  // Categorization helpers
  const isHollywood = s => (
    (s.industry && s.industry.toLowerCase().includes('hollywood')) ||
    (s.language && s.language.toLowerCase() === 'english') ||
    (s.country && (s.country.toLowerCase().includes('usa') || s.country.toLowerCase().includes('united states')))
  );

  const isKorean = s => (
    (s.industry && s.industry.toLowerCase().includes('korean')) ||
    (s.language && s.language.toLowerCase() === 'korean') ||
    (s.country && s.country.toLowerCase().includes('korea'))
  );

  const isChinese = s => (
    (s.industry && s.industry.toLowerCase().includes('chinese')) ||
    (s.language && s.language.toLowerCase() === 'chinese') ||
    (s.country && (s.country.toLowerCase().includes('china') || s.country.toLowerCase().includes('taiwan') || s.country.toLowerCase().includes('hong kong')))
  );

  const isJapanese = s => (
    (s.industry && s.industry.toLowerCase().includes('japanese')) ||
    (s.language && s.language.toLowerCase() === 'japanese') ||
    (s.country && s.country.toLowerCase().includes('japan'))
  );

  const isOthers = s => (
    !isHollywood(s) && !isKorean(s) && !isChinese(s) && !isJapanese(s)
  );

  // A. Trending Series
  const trendingSeries = series.filter(s => s.category === 'Trending Series' || parseFloat(s.imdbRating || s.rating || 0) >= 7.8);
  renderCategoryList('seriesTrendingList', trendingSeries.length > 0 ? trendingSeries : series, true, true);

  // B. Recently Added
  const recentSeries = series.filter(s => s.category === 'Recently Added' || s.category === 'Trending Series');
  renderCategoryList('seriesRecentList', recentSeries.length > 0 ? recentSeries : series, false, true);

  // C. Hollywood (Dubbed)
  const hollywoodSeries = series.filter(isHollywood);
  renderCategoryList('seriesHollywoodList', hollywoodSeries, false, true);

  // D. Korean (Dubbed)
  const koreanSeries = series.filter(isKorean);
  renderCategoryList('seriesKoreanList', koreanSeries.length > 0 ? koreanSeries : (series.filter(s => s.country === 'Korea')), false, true);

  // E. Chinese (Dubbed)
  const chineseSeries = series.filter(isChinese);
  renderCategoryList('seriesChineseList', chineseSeries, false, true);

  // F. Japanese (Dubbed)
  const japaneseSeries = series.filter(isJapanese);
  renderCategoryList('seriesJapaneseList', japaneseSeries, false, true);

  // G. Others (Dubbed)
  const othersSeries = series.filter(isOthers);
  renderCategoryList('seriesOthersList', othersSeries, false, true);
}

// Render Live TV Tab
function renderLiveTv() {
  const liveTv = appState.content.liveTv || [];
  const grid = document.getElementById('liveTvGrid');
  if (!grid) return;

  if (liveTv.length > 0) {
    grid.innerHTML = liveTv.map(item => `
      <div class="live-channel-card" onclick='openLiveTvPlayer("${item.id}")'>
        <span class="live-tag-pill">● LIVE</span>
        <img src="${item.logo}" alt="${item.title}" class="channel-logo-img">
        <div class="channel-title">${item.title}</div>
        <div class="channel-sub">${item.category} • ${item.language}</div>
      </div>
    `).join('');
  } else {
    grid.innerHTML = `
      <div class="live-tv-coming-soon-card">
        <div class="ltv-cs-glow-circle">
          <i class="fa-solid fa-satellite-dish fa-beat"></i>
        </div>
        <div class="ltv-cs-badge">COMING SOON</div>
        <h3 class="ltv-cs-title">Live TV Channels</h3>
        <p class="ltv-cs-desc">We are actively preparing 500+ premium live sports, breaking news, music, and entertainment channels directly inside FOBS TV. Stay tuned for the upcoming launch!</p>
        <div class="ltv-cs-features">
          <div class="ltv-cs-feat-pill"><i class="fa-solid fa-bolt"></i> Ultra-Fast HD Streaming</div>
          <div class="ltv-cs-feat-pill"><i class="fa-solid fa-tv"></i> Live Sports & News</div>
          <div class="ltv-cs-feat-pill"><i class="fa-solid fa-globe"></i> Global & Local Channels</div>
        </div>
      </div>
    `;
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
  }

  if (item) {
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
  appState.currentMedia = media;
  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = null;
  applyPlayerBrightness(1.0);
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

  const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.id && media.id.startsWith('kmdl-s-'));

  // Set Details: "[Fan Dubbed]" if Fan Dubbed, otherwise "[Hindi]"
  const dubTag = (media.dubLanguage && media.dubLanguage.includes('Fan')) ? '[Fan Dubbed]' : '[Hindi]';
  const titleText = `${media.title} ${dubTag}`;
  document.getElementById('playerMediaTitle').innerText = titleText;
  
  const seasonText = isSeries ? `${media.seasonsCount || 1} seasons` : (media.duration || '2h 21m');
  const ratingText = media.imdbRating || media.rating || '8.1';

  document.getElementById('playerMediaMeta').innerHTML = `
    <i class="fa-solid fa-tv"></i>
    <span class="star-rating"><i class="fa-solid fa-star"></i> ${ratingText}</span>
    <span>${media.year || '2023'}</span>
    <span>${media.country || 'Korea'}</span>
    <span>${media.genre ? media.genre.split(',')[0].trim() : 'Drama'}</span>
    <span id="playerSeasonTag">${seasonText}</span>
  `;

  // Dub/Audio dropdown & tracks setup dynamically based on content
  renderAudioTrackOptions(media);

  // Handle Series vs Movie UI (Green movie resource button removed completely)
  const seriesEpisodesWrapper = document.getElementById('seriesEpisodesWrapper');

  if (isSeries && media.episodes && media.episodes.length > 0) {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'block';

    appState.currentEpisode = media.episodes[episodeIndex] || media.episodes[0];
    renderEpisodePills(media.episodes, episodeIndex);
    const activeEpStream = (appState.currentEpisode.audioTracks && appState.currentEpisode.audioTracks[appState.currentAudioTrack])
      || appState.currentEpisode.streamUrl;
    playStreamUrl(activeEpStream);
  } else {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'none';
    appState.currentEpisode = null;
    playStreamUrl(media.streamUrl || media.driveUrl);
  }

  // Populate "For You" recommendations
  renderForYouRecommendations();
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
  if (!appState.currentMedia || !appState.currentMedia.episodes) return;
  appState.streamSeekOffset = 0;
  appState.pendingSeekTime = null;
  appState.currentEpisode = appState.currentMedia.episodes[idx];
  renderEpisodePills(appState.currentMedia.episodes, idx);
  const activeEpStream = (appState.currentEpisode.audioTracks && appState.currentEpisode.audioTracks[appState.currentAudioTrack])
    || appState.currentEpisode.streamUrl;
  playStreamUrl(activeEpStream);
}

// Start Stream Playback via Direct Stream Resolution or Backend Proxy
async function playStreamUrl(url, audioIndex = null, seekTime = null) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const loader = document.getElementById('videoLoader');

  if (!url) {
    console.warn('No stream URL provided for media');
    if (loader) loader.classList.remove('active');
    return;
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

  // Pre-warm URL in backend resolver cache in background (non-blocking)
  fetch(`${API_BASE_URL}/api/resolve?url=${encodeURIComponent(url)}`).catch(() => {});

  // Determine active audio index
  const activeAudio = (audioIndex !== null && audioIndex !== undefined)
    ? audioIndex 
    : (appState.selectedAudioIndex !== undefined ? appState.selectedAudioIndex : (appState.currentAudioTrack?.toLowerCase().includes('english') ? 1 : 0));

  // Direct play ONLY for standard MP4s that already have browser-supported AAC audio
  if (url.includes('kmdl.eu.org') && !url.includes('googleusercontent.com') && audioIndex === null) {
    videoPlayer.src = url;
    videoPlayer.load();
    videoPlayer.play().catch(() => {});
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
  let streamApiUrl = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(url)}&audio=${activeAudio}`;
  if (seekTime && seekTime > 0) {
    streamApiUrl += `&t=${seekTime}`;
  }

  videoPlayer.src = streamApiUrl;
  videoPlayer.load();
  videoPlayer.play().catch(err => {
    console.log('Autoplay deferred until user taps video controls:', err.message);
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
  const topHeader = document.getElementById('playerTopHeader');
  if (!topHeader) return;

  topHeader.classList.remove('controls-hidden');
  if (playerControlsTimer) clearTimeout(playerControlsTimer);

  const videoPlayer = document.getElementById('mainVideoPlayer');
  const isFs = document.body.classList.contains('is-fullscreen');
  if (isFs && videoPlayer && !videoPlayer.paused) {
    playerControlsTimer = setTimeout(() => {
      topHeader.classList.add('controls-hidden');
    }, 3500);
  }
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
  if (!lsUi) return;

  lsUi.classList.remove('controls-hidden');
  if (lsControlsTimer) clearTimeout(lsControlsTimer);

  const video = document.getElementById('mainVideoPlayer');
  if (video && !video.paused && !isPlayerLocked) {
    lsControlsTimer = setTimeout(() => {
      lsUi.classList.add('controls-hidden');
    }, 3800);
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
  if (video.paused) {
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
  const relTime = target - streamOffset;

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

  const isStreamProxy = video.src && video.src.includes('/api/stream');

  // Case 1: Direct MP4 (non-proxy, supports native HTTP 206 range requests)
  if (!isStreamProxy) {
    appState.pendingSeekTime = null;
    try {
      video.currentTime = target;
    } catch (e) {}
    updateLandscapeProgress();
    syncPlayPauseIcons();
    return;
  }

  // Case 2: In /api/stream proxy AND target time is already within the downloaded buffer
  if (relTime >= 0 && isTimeBuffered(video, relTime)) {
    appState.pendingSeekTime = null;
    try {
      video.currentTime = relTime;
    } catch (e) {}
    updateLandscapeProgress();
    syncPlayPauseIcons();
    return;
  }

  // Case 3: In /api/stream proxy AND target is OUTSIDE buffer (or backwards into past stream segment)
  // Debounce multiple fast clicks (+10 +10 -> +20s) by 280ms
  if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    const finalTarget = appState.pendingSeekTime !== null ? appState.pendingSeekTime : target;
    appState.pendingSeekTime = null;
    seekToAbsoluteTime(finalTarget);
  }, 280);
}

function seekToAbsoluteTime(targetSeconds) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return;

  const duration = getMediaTotalDurationSeconds();
  const safeTarget = Math.max(0, Math.min(duration, Math.floor(targetSeconds)));
  const streamOffset = appState.streamSeekOffset || 0;
  const relTime = safeTarget - streamOffset;

  const isStreamProxy = video.src && video.src.includes('/api/stream');

  // Direct MP4 (non-proxy)
  if (!isStreamProxy) {
    try {
      video.currentTime = safeTarget;
      updateLandscapeProgress();
      return;
    } catch (e) {}
  }

  // Stream proxy and already buffered
  if (relTime >= 0 && isTimeBuffered(video, relTime)) {
    try {
      video.currentTime = relTime;
      updateLandscapeProgress();
      return;
    } catch (e) {}
  }

  // Outside buffer on stream proxy: request backend stream starting at safeTarget
  const curEp = appState.currentEpisode;
  const rawUrl = (curEp?.audioTracks && curEp.audioTracks[appState.currentAudioTrack]) 
    || curEp?.streamUrl 
    || appState.currentMedia?.streamUrl 
    || appState.currentMedia?.driveUrl;

  if (rawUrl) {
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

  const isContain = video.classList.toggle('fit-contain');
  if (fitLabel) {
    fitLabel.innerText = isContain ? 'Fill' : 'Fit';
  }
  showToast(isContain ? 'Aspect Ratio: Fit to Screen' : 'Aspect Ratio: Zoom to Fill (Edge-to-Edge)');
  resetLandscapeControlsTimer();
}

function toggleLandscapeDrawer(drawerName) {
  const drawers = {
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
    if (lsControlsTimer) clearTimeout(lsControlsTimer);
  } else {
    resetLandscapeControlsTimer();
  }
}

function closeLandscapeDrawers() {
  document.querySelectorAll('.ls-side-drawer').forEach(d => d.classList.remove('open'));
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
    const epNum = appState.currentEpisode?.number || appState.currentEpisode?.episodeNumber || '01';
    const dubTag = (media.dubLanguage && media.dubLanguage.includes('Fan')) ? '[Fan Dubbed]' : '[Hindi]';
    titleEl.innerText = isSeries 
      ? `${media.title} ${dubTag} S01 E${epNum}` 
      : `${media.title} ${dubTag}`;
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
  if (document.body.classList.contains('is-fullscreen')) {
    exitFullscreenMode();
  } else {
    closePlayer();
  }
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
  
  // 2. Only override Android window brightness if actively dimmed below 100%
  // When at normal (1.0), restore default system brightness so screen doesn't get stuck at max brightness
  try {
    if (window.AndroidApp) {
      if (playerBrightness < 0.98 && typeof window.AndroidApp.setWindowBrightness === 'function') {
        window.AndroidApp.setWindowBrightness(playerBrightness);
      } else if (typeof window.AndroidApp.resetWindowBrightness === 'function') {
        window.AndroidApp.resetWindowBrightness();
      } else if (typeof window.AndroidApp.setWindowBrightness === 'function') {
        window.AndroidApp.setWindowBrightness(-1);
      }
    }
  } catch (e) {}

  return playerBrightness;
}

function applyPlayerVolume(val) {
  const video = document.getElementById('mainVideoPlayer');
  if (!video) return 1.0;
  
  const safeVol = Math.max(0, Math.min(1.0, Number(val)));
  video.volume = safeVol;
  if (safeVol > 0 && video.muted) {
    video.muted = false;
  }
  return safeVol;
}

function showGestureHud(type, value) {
  const hud = document.getElementById('playerGestureHud');
  const icon = document.getElementById('gestureHudIcon');
  const fill = document.getElementById('gestureHudBarFill');
  const valText = document.getElementById('gestureHudVal');
  if (!hud || !icon || !fill || !valText) return;

  const pct = Math.round(value * 100);

  if (type === 'brightness') {
    icon.innerHTML = '<i class="fa-solid fa-sun"></i>';
    fill.style.width = `${pct}%`;
    valText.innerText = `${pct}%`;
  } else if (type === 'volume') {
    let iconClass = 'fa-volume-high';
    if (value <= 0.001) iconClass = 'fa-volume-xmark';
    else if (value < 0.5) iconClass = 'fa-volume-low';
    icon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    fill.style.width = `${pct}%`;
    valText.innerText = `${pct}%`;
  }

  hud.classList.add('visible');

  if (gestureHudTimer) clearTimeout(gestureHudTimer);
  gestureHudTimer = setTimeout(() => {
    hud.classList.remove('visible');
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
  if (!lsUi) return;
  if (isPlayerLocked) {
    lsUi.classList.remove('controls-hidden');
    resetLandscapeControlsTimer();
    return;
  }
  closeLandscapeDrawers();
  const isHidden = lsUi.classList.toggle('controls-hidden');
  if (!isHidden) resetLandscapeControlsTimer();
}

function setupPlayerGestures() {
  const tapDetector = document.getElementById('lsTapDetector');
  if (!tapDetector) return;

  let isPointerDown = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let activeSide = null; // 'left' or 'right'
  let startBrightness = 1.0;
  let startVolume = 1.0;

  tapDetector.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const rect = tapDetector.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    isPointerDown = true;
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const relX = startX - rect.left;
    activeSide = relX < (rect.width / 2) ? 'left' : 'right';

    startBrightness = playerBrightness;
    const video = document.getElementById('mainVideoPlayer');
    startVolume = video ? (video.muted ? 0 : video.volume) : 1.0;

    try {
      tapDetector.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  tapDetector.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;
    if (isPlayerLocked) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // Detect intentional vertical drag
    if (!isDragging) {
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        isDragging = true;
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
      }
    }

    if (isDragging) {
      const rect = tapDetector.getBoundingClientRect();
      const sensitivityRange = rect.height * 0.65;
      const deltaRatio = -deltaY / sensitivityRange;

      if (activeSide === 'left') {
        // Left side swipe: Brightness (Up = brighter, Down = dimmer)
        const newBrightness = applyPlayerBrightness(startBrightness + deltaRatio);
        showGestureHud('brightness', newBrightness);
      } else {
        // Right side swipe: Volume / Sound (Up = louder, Down = quieter)
        const newVolume = applyPlayerVolume(startVolume + deltaRatio);
        showGestureHud('volume', newVolume);
      }
    }
  });

  const onPointerEnd = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      tapDetector.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (isDragging) {
      isDragging = false;
      if (gestureHudTimer) clearTimeout(gestureHudTimer);
      gestureHudTimer = setTimeout(() => {
        const hud = document.getElementById('playerGestureHud');
        if (hud) hud.classList.remove('visible');
      }, 700);
      return;
    }

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
      }, 260);
    }
  };

  tapDetector.addEventListener('pointerup', onPointerEnd);
  tapDetector.addEventListener('pointercancel', onPointerEnd);
}

// Setup Video Event Listeners
function setupVideoListeners() {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const loader = document.getElementById('videoLoader');
  if (!videoPlayer) return;

  // Initialize Gesture Engine on the tap detector
  setupPlayerGestures();

  setupLandscapeProgressScrubbing();

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
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('timeupdate', () => {
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('progress', () => {
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('playing', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    syncPlayPauseIcons();
    resetLandscapeControlsTimer();
  });

  videoPlayer.addEventListener('waiting', () => {
    if (loader) loader.classList.add('active');
  });

  videoPlayer.addEventListener('canplay', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    updateLandscapeProgress();
  });

  videoPlayer.addEventListener('pause', () => {
    syncPlayPauseIcons();
    resetLandscapeControlsTimer();
  });

  videoPlayer.addEventListener('error', (e) => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);

    // If player is closing or no active media, DO NOT attempt fallback retry!
    if (videoPlayer._isClosing || !appState.currentMedia) {
      return;
    }

    console.error('Video load error, attempting fallback:', e);

    const curEp = appState.currentEpisode;
    const rawUrl = (curEp?.audioTracks && curEp.audioTracks[appState.currentAudioTrack]) || curEp?.streamUrl || appState.currentMedia?.streamUrl || appState.currentMedia?.driveUrl;

    if (!videoPlayer._retryCount) videoPlayer._retryCount = 0;
    if (videoPlayer._retryCount < 2 && rawUrl) {
      videoPlayer._retryCount++;
      if (!videoPlayer.src.includes('/api/stream')) {
        console.log('Retrying stream via proxy...');
        videoPlayer.src = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(rawUrl)}`;
        videoPlayer.load();
        videoPlayer.play().catch(() => {});
        return;
      }
    }

    if (loader) loader.classList.remove('active');
  });

  videoPlayer.addEventListener('canplay', () => {
    videoPlayer._retryCount = 0;
    if (loader) loader.classList.remove('active');
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

  exitFullscreenMode();
  document.body.classList.remove('player-open');

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

  if (videoPlayer) {
    videoPlayer._isClosing = true;
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
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
        <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : (item.dubLanguage || 'Hindi')}</span>
        <span class="card-badge-right">${item.year || (item.type === 'series' ? 'Series' : 'Movie')}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'}</div>
    </div>
  `).join('');
}

// Sub-tabs (For you vs Comments)
function switchSubTab(subTab) {
  document.getElementById('forYouTabBtn').classList.toggle('active', subTab === 'foryou');
  document.getElementById('commentsTabBtn').classList.toggle('active', subTab === 'comments');

  document.getElementById('forYouView').classList.toggle('active', subTab === 'foryou');
  document.getElementById('commentsView').classList.toggle('active', subTab === 'comments');
}

// Trigger Video Download
function triggerDownload() {
  if (!appState.currentMedia) return;

  const url = appState.currentEpisode ? appState.currentEpisode.streamUrl : (appState.currentMedia.streamUrl || appState.currentMedia.driveUrl);
  const title = appState.currentEpisode ? `${appState.currentMedia.title} - ${appState.currentEpisode.title}` : appState.currentMedia.title;

  downloadMedia(url, title);
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
  const tracks = (media && media.audioTracks && media.audioTracks.length > 0)
    ? media.audioTracks
    : ['Hindi dub', 'English dub'];

  if (!appState.currentAudioTrack || !tracks.includes(appState.currentAudioTrack)) {
    appState.currentAudioTrack = media?.selectedAudio || tracks[0] || 'Hindi dub';
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

// Search Handler
function handleSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) {
    renderAllViews();
    return;
  }

  // Switch to movie tab to show results
  switchMainTab('movie');

  const allItems = [...(appState.content.movies || []), ...(appState.content.series || [])];
  const filtered = allItems.filter(m => 
    m.title.toLowerCase().includes(query) ||
    (m.genre && m.genre.toLowerCase().includes(query)) ||
    (m.language && m.language.toLowerCase().includes(query))
  );

  document.getElementById('movieCountBadge').innerText = `${filtered.length} Results`;
  const grid = document.getElementById('allMoviesGrid');
  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px 10px; color: var(--text-muted);">No movies or series found matching "${query}".</div>`;
  } else {
    grid.innerHTML = filtered.map(item => `
      <div class="media-card" onclick='openPlayerById("${item.type || 'movie'}", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">${(item.dubLanguage && item.dubLanguage.includes('Fan')) ? 'Fan Dub' : (item.dubLanguage || 'Hindi')}</span>
          <span class="card-badge-right">${item.year || (item.type === 'series' ? 'Series' : 'Movie')}</span>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'}</div>
      </div>
    `).join('');
  }
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
// ANDROID & MOBILE BACK GESTURE (SWIPE BACK) / SYSTEM BACK HANDLER
// ============================================================
window.handleAndroidBack = function() {
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


