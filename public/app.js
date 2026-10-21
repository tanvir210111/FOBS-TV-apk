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

const CACHE_KEY = 'fobs_tv_content_cache';
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
  
  // Combine all movies and series for hero slider
  heroItems = [...movies, ...series];

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
          <span class="card-badge-left">Hindi</span>
          <span class="card-badge-right">${item.language || 'Korean'}</span>
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
            <span class="card-badge-left">Hindi</span>
            <span class="card-badge-right">${item.language || 'Korean'}</span>
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

  // 2. Coming Soon - The Remarried Empress (2026 Korean TV Series)
  const upcomingContainer = document.getElementById('upcomingList');
  if (upcomingContainer) {
    const upcomingItems = (appState.content.upcoming && appState.content.upcoming.length > 0)
      ? appState.content.upcoming
      : [
          {
            id: 'upcoming-remarried-empress-2026',
            title: 'The Remarried Empress',
            language: 'Korean',
            year: '2026',
            releaseMonth: 'Nov',
            releaseDay: '04',
            booked: '0',
            rating: '8.9',
            imdbRating: '8.9',
            poster: 'https://thumb.wikimedia.org/wikipedia/en/thumb/a/a7/The_Remarried_Empress.jpg/250px-The_Remarried_Empress.jpg',
            streamUrl: 'https://kmdl.eu.org/download.aspx?file=xPNWgqNHLkAytmDTGDm4GwYeWwcDY1W6CuG4iWEJnr5f4ErO%2BuuJqEr%2FsO0eehR5&expiry=mOFG9s9rePeaGm0KT6XmdQ%3D%3D&mac=14bb0fe204da1e71cf1de664a37b2a4926fcff9e8bb2fbdb6f40ce79d5beda07',
            type: 'series'
          }
        ];

    upcomingContainer.innerHTML = upcomingItems.map(item => {
      const month = item.releaseMonth || 'Nov';
      const day = item.releaseDay || '04';
      const booked = item.booked !== undefined ? item.booked : '0';
      return `
        <div class="coming-card" onclick='openPlayerById("upcoming", "${item.id}")'>
          <div class="coming-poster-wrap">
            <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
            <span class="card-badge-right">${item.language || 'Korean'}</span>
            <div class="coming-date-badge">${month}<span>${day}</span></div>
            <div class="coming-booked-tag">${booked} booked</div>
          </div>
          <div class="coming-info-box">
            <div class="coming-title" title="${item.title}">${item.title}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Movies
  const homeMoviesContainer = document.getElementById('homeMoviesList');
  if (homeMoviesContainer) {
    homeMoviesContainer.innerHTML = movies.map(item => `
      <div class="media-card" onclick='openPlayerById("movie", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-left">Hindi</span>
          <span class="card-badge-right">${item.language || 'Korean'}</span>
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
          <span class="card-badge-right">${item.language || 'Korean'}</span>
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
  }
}

// Render All Movies Tab
function renderAllMovies() {
  const movies = appState.content.movies || [];
  const filtered = filterContentByGenre(movies);

  document.getElementById('movieCountBadge').innerText = `${filtered.length} Movies`;
  const grid = document.getElementById('allMoviesGrid');
  grid.innerHTML = filtered.map(item => `
    <div class="media-card" onclick='openPlayerById("movie", "${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
        <span class="card-badge-left">Hindi</span>
        <span class="card-badge-right">${item.language || 'Korean'}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.1'} • ${item.year || '2023'}</div>
    </div>
  `).join('');
}

// Render All Series Tab
function renderAllSeries() {
  const series = appState.content.series || [];
  const filtered = filterContentByGenre(series);

  document.getElementById('seriesCountBadge').innerText = `${filtered.length} Shows`;
  const grid = document.getElementById('allSeriesGrid');
  grid.innerHTML = filtered.map(item => `
    <div class="media-card" onclick='openPlayerById("series", "${item.id}")'>
      <div class="card-poster-wrap">
        <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
        <span class="card-badge-left">Hindi</span>
        <span class="card-badge-right">${item.language || 'Korean'}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.imdbRating || item.rating || '8.2'} • ${item.seasonsCount || 1} Seasons</div>
    </div>
  `).join('');
}

// Render Live TV Tab
function renderLiveTv() {
  const liveTv = appState.content.liveTv || [];
  const grid = document.getElementById('liveTvGrid');
  grid.innerHTML = liveTv.map(item => `
    <div class="live-channel-card" onclick='openLiveTvPlayer("${item.id}")'>
      <span class="live-tag-pill">● LIVE</span>
      <img src="${item.logo}" alt="${item.title}" class="channel-logo-img">
      <div class="channel-title">${item.title}</div>
      <div class="channel-sub">${item.category} • ${item.language}</div>
    </div>
  `).join('');
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
    if (!item && id === 'upcoming-remarried-empress-2026') {
      item = {
        id: 'upcoming-remarried-empress-2026',
        title: 'The Remarried Empress',
        originalTitle: '재혼 황후',
        language: 'Korean',
        year: '2026',
        country: 'Korea',
        genre: 'Romance, Historical, Drama, Fantasy',
        rating: '8.9',
        imdbRating: '8.9',
        releaseDate: 'Nov 04, 2026',
        booked: '0',
        poster: 'https://thumb.wikimedia.org/wikipedia/en/thumb/a/a7/The_Remarried_Empress.jpg/250px-The_Remarried_Empress.jpg',
        streamUrl: 'https://kmdl.eu.org/download.aspx?file=xPNWgqNHLkAytmDTGDm4GwYeWwcDY1W6CuG4iWEJnr5f4ErO%2BuuJqEr%2FsO0eehR5&expiry=mOFG9s9rePeaGm0KT6XmdQ%3D%3D&mac=14bb0fe204da1e71cf1de664a37b2a4926fcff9e8bb2fbdb6f40ce79d5beda07',
        description: "Set in an opulent imperial court, Empress Navier's life is upended when her husband, Emperor Sovieshu, demands a divorce to make a runaway slave his new empress. Refusing to be cast aside or broken by betrayal, Navier agrees under one condition: approval to immediately remarry Prince Heinrey of the rival Western Kingdom, igniting a high-stakes battle to reclaim her throne and destiny.",
        cast: [
          { name: "Shin Min-a", character: "Empress Navier", photo: "https://image.tmdb.org/t/p/w185/6CjxjYvZBuvbAQTcuoPb8EeVrUI.jpg" },
          { name: "Ju Ji-hoon", character: "Emperor Sovieshu", photo: "https://image.tmdb.org/t/p/w185/tI0ANQSwcOBfQUeHgfcwn7VmHRO.jpg" },
          { name: "Lee Jong-suk", character: "Prince Heinrey", photo: "https://image.tmdb.org/t/p/w185/v8N9oQpC115G7kEa3nIq6v0o5U6.jpg" },
          { name: "Lee Se-young", character: "Rashta", photo: "https://image.tmdb.org/t/p/w185/hKF1uh0iEfuZlBE79CXPw415qyn.jpg" }
        ],
        type: 'series'
      };
    }
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

  // Set Details matching Screenshot 1: "12.12: The Day [Korean][HD] Info >"
  const titleText = `${media.title} [${media.language || 'Korean'}][${media.tag || 'HD'}]`;
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

  // Dub/Audio dropdown text (Always Hindi dub as requested)
  appState.currentAudioTrack = 'Hindi dub';
  document.getElementById('currentDubText').innerText = 'Hindi dub';

  // Handle Series vs Movie UI (Green movie resource button removed completely)
  const seriesEpisodesWrapper = document.getElementById('seriesEpisodesWrapper');

  if (isSeries && media.episodes && media.episodes.length > 0) {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'block';

    appState.currentEpisode = media.episodes[episodeIndex] || media.episodes[0];
    renderEpisodePills(media.episodes, episodeIndex);
    playStreamUrl(appState.currentEpisode ? appState.currentEpisode.streamUrl : null);
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
  appState.currentEpisode = appState.currentMedia.episodes[idx];
  renderEpisodePills(appState.currentMedia.episodes, idx);
  playStreamUrl(appState.currentEpisode.streamUrl);
}

// Start Stream Playback via Backend Google Drive Proxy
function playStreamUrl(url) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const loader = document.getElementById('videoLoader');

  if (!url) {
    console.warn('No stream URL provided for media');
    if (loader) loader.classList.remove('active');
    return;
  }

  const loaderText = loader ? loader.querySelector('.loader-text') : null;
  if (loaderText) loaderText.innerText = 'Loading...';
  if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
  window.videoStreamColdStartTimer = setTimeout(() => {
    if (loader && loader.classList.contains('active') && loaderText) {
      loaderText.innerText = 'Connecting to stream server...';
    }
  }, 3500);

  // Proxy through backend with range seeking support
  const streamApiUrl = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(url)}`;
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

function enterFullscreenMode(options = {}) {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const playerOverlay = document.getElementById('playerOverlay');
  const fsBtn = document.getElementById('playerFullscreenToggleBtn');

  document.body.classList.add('is-fullscreen');
  if (playerOverlay) playerOverlay.classList.add('is-fullscreen');
  if (videoContainer) videoContainer.classList.add('is-fullscreen');

  if (fsBtn) {
    fsBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    fsBtn.title = 'Exit Fullscreen';
  }

  if (!options.skipRotate) {
    setVideoOrientationLandscape();
  }

  // Fallback for non-Android standard desktop browsers only
  if (!window.AndroidApp && !document.fullscreenElement && !document.webkitFullscreenElement) {
    const target = videoContainer || videoPlayer;
    if (target && target.requestFullscreen) {
      target.requestFullscreen().catch(() => {});
    }
  }

  resetPlayerControlsTimer();
}

function exitFullscreenMode(options = {}) {
  const videoContainer = document.getElementById('videoContainer');
  const playerOverlay = document.getElementById('playerOverlay');
  const fsBtn = document.getElementById('playerFullscreenToggleBtn');
  const topHeader = document.getElementById('playerTopHeader');

  document.body.classList.remove('is-fullscreen');
  if (playerOverlay) playerOverlay.classList.remove('is-fullscreen');
  if (videoContainer) videoContainer.classList.remove('is-fullscreen');

  if (fsBtn) {
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fsBtn.title = 'Fullscreen';
  }

  if (topHeader) {
    topHeader.classList.remove('controls-hidden');
  }
  if (playerControlsTimer) {
    clearTimeout(playerControlsTimer);
    playerControlsTimer = null;
  }

  if (!options.skipRotate) {
    setVideoOrientationPortrait();
  }

  // Fallback for non-Android standard desktop browsers only
  if (!window.AndroidApp && (document.fullscreenElement || document.webkitFullscreenElement)) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
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
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const scaleBtn = document.getElementById('playerScaleToggleBtn');
  if (!videoPlayer) return;

  const isContain = videoPlayer.classList.toggle('fit-contain');
  if (scaleBtn) {
    scaleBtn.innerHTML = isContain ? '<i class="fa-solid fa-expand"></i>' : '<i class="fa-solid fa-maximize"></i>';
  }
  showToast(isContain ? 'Aspect Ratio: Fit to Screen' : 'Aspect Ratio: Zoom to Fill (Edge-to-Edge)');
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

// Setup Video Event Listeners
function setupVideoListeners() {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const videoContainer = document.getElementById('videoContainer');
  const loader = document.getElementById('videoLoader');
  if (!videoPlayer) return;

  if (videoContainer) {
    videoContainer.addEventListener('click', () => {
      resetPlayerControlsTimer();
    });
    videoContainer.addEventListener('mousemove', resetPlayerControlsTimer);
    videoContainer.addEventListener('touchstart', resetPlayerControlsTimer, { passive: true });
  }

  videoPlayer.addEventListener('playing', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
    resetPlayerControlsTimer();
  });

  videoPlayer.addEventListener('waiting', () => {
    if (loader) loader.classList.add('active');
  });

  videoPlayer.addEventListener('canplay', () => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    if (loader) loader.classList.remove('active');
  });

  videoPlayer.addEventListener('pause', () => {
    resetPlayerControlsTimer();
  });

  videoPlayer.addEventListener('error', (e) => {
    if (window.videoStreamColdStartTimer) clearTimeout(window.videoStreamColdStartTimer);
    console.error('Video load error, attempting fallback:', e);
    if (loader) loader.classList.remove('active');

    const directUrl = appState.currentEpisode?.streamUrl || appState.currentMedia?.streamUrl || appState.currentMedia?.driveUrl;
    if (directUrl && videoPlayer.src && videoPlayer.src.includes('/api/stream')) {
      console.log('Retrying with direct stream URL...');
      showToast('Retrying stream via direct link...');
      videoPlayer.src = directUrl;
      videoPlayer.load();
      videoPlayer.play().catch(() => {});
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

  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = '';
  }
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
        <span class="card-badge-left">Hindi</span>
        <span class="card-badge-right">${item.language || 'Korean'}</span>
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

// Language / Dubbing Bottom Sheet Modal (Screenshot 2 & 5)
function openLanguageSheet() {
  document.getElementById('languageSheetOverlay').classList.add('open');
}

function closeLanguageSheet(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.sheet-close-btn')) return;
  document.getElementById('languageSheetOverlay').classList.remove('open');
}

function selectLanguage(lang) {
  appState.currentAudioTrack = lang;
  document.getElementById('currentDubText').innerText = lang;

  document.querySelectorAll('.sheet-option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.innerText.trim() === lang);
  });

  document.getElementById('languageSheetOverlay').classList.remove('open');
  showToast(`Switched to: ${lang}`);
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
          <span class="card-badge-left">Hindi</span>
          <span class="card-badge-right">${item.language || 'Korean'}</span>
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
  if (player && player.classList.contains('open')) {
    closePlayer();
    return true;
  }

  // 7. If search input has text, clear search
  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value && searchInput.value.trim().length > 0) {
    searchInput.value = '';
    if (typeof handleSearch === 'function') handleSearch('');
    return true;
  }

  // 8. If on a sub-tab, return to home
  if (appState && appState.currentTab && appState.currentTab !== 'home') {
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


