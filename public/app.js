// CineBox Mobile Application Client Logic

let appState = {
  activeTab: 'home',
  activeGenre: 'All',
  content: {
    featured: null,
    movies: [],
    series: [],
    liveTv: []
  },
  currentMedia: null,
  currentEpisode: null,
  currentAudioTrack: 'Hindi dub'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await fetchAppContent();
  setupVideoListeners();
  setupHeroSwipeGestures();
}

// Fetch Content from Backend
async function fetchAppContent() {
  try {
    const res = await fetch('/api/content');
    const data = await res.json();
    if (data.movies) data.movies.forEach(m => m.type = 'movie');
    if (data.series) data.series.forEach(s => s.type = 'series');
    if (data.liveTv) data.liveTv.forEach(t => t.type = 'liveTv');
    appState.content = data;
    renderAllViews();
  } catch (err) {
    console.error('Failed to load content:', err);
    showToast('Failed to connect to backend server');
  }
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
          <span class="card-badge-top">${item.language || 'Hindi'}</span>
          ${idx < 3 ? `<div class="card-rank-number">${idx + 1}</div>` : ''}
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.rating || '7.5'} • ${isSeries ? (item.seasonsCount ? item.seasonsCount + ' Seasons' : 'Series') : (item.year || '2025')}</div>
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
            <span class="card-badge-top">${item.language || 'Hindi'}</span>
            <div class="card-play-hover">
              <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
            </div>
          </div>
          <div class="card-title">${item.title}</div>
          <div class="card-meta">⭐ ${item.rating || '7.5'} • ${item.year || '2025'}</div>
        </div>
      `;
    }).join('');
  }

  // 2. Coming Soon (Matching Screenshot 2)
  const upcomingContainer = document.getElementById('upcomingList');
  if (upcomingContainer) {
    const upcomingItems = [
      ...movies.filter(m => m.year >= '2025'),
      ...series.filter(s => s.year >= '2025')
    ];
    const displayUpcoming = upcomingItems.length ? upcomingItems : [...movies.slice().reverse()];
    
    // Realistic release dates & booked counts matching Screenshot 2
    const sampleDates = [
      { month: 'Oct', day: '21', booked: '351' },
      { month: 'Oct', day: '21', booked: '1,327' },
      { month: 'Oct', day: '22', booked: '39' },
      { month: 'Oct', day: '25', booked: '842' },
      { month: 'Nov', day: '04', booked: '1,890' }
    ];

    upcomingContainer.innerHTML = displayUpcoming.map((item, idx) => {
      const isSeries = !!item.episodes || item.type === 'series';
      const meta = sampleDates[idx % sampleDates.length];
      return `
        <div class="coming-card" onclick='openPlayerById("${isSeries ? 'series' : 'movie'}", "${item.id}")'>
          <div class="coming-poster-wrap">
            <img src="${item.poster}" alt="${item.title}" class="coming-poster-img" loading="lazy">
            <div class="coming-date-badge">${meta.month}<span>${meta.day}</span></div>
            <div class="coming-bell-btn" onclick="event.stopPropagation(); showToast('Reminder set for ${item.title}!')">
              <i class="fa-regular fa-bell"></i>
            </div>
            <div class="coming-booked-tag">${meta.booked} booked</div>
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
          <span class="card-badge-top">${item.language || 'Hindi'}</span>
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${item.genre}</div>
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
          <span class="card-badge-top">${item.language || 'Hindi'}</span>
          <div class="card-play-hover">
            <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
          </div>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${item.seasonsCount || 1} Seasons • ${item.episodes ? item.episodes.length : 0} Eps</div>
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
        <span class="card-badge-top">${item.language || 'Hindi'}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">⭐ ${item.rating || '7.5'} • ${item.year || '2025'}</div>
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
        <span class="card-badge-top">${item.language || 'Hindi'}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-meta">${item.seasonsCount || 1} Seasons • ${item.episodes ? item.episodes.length : 0} Eps</div>
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
    streamUrl: channel.streamUrl,
    poster: channel.logo,
    audioTracks: ['Original Audio']
  };

  openPlayer(mockMedia);
}

// Open Player & Details Overlay
function openPlayer(media, episodeIndex = 0) {
  if (!media) return;
  appState.currentMedia = media;
  const overlay = document.getElementById('playerOverlay');
  overlay.classList.add('open');

  const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.id && media.id.startsWith('kmdl-s-'));

  // Set Details
  const titleText = `${media.title} [${media.language || 'Hindi'}][${media.tag || 'HD'}]`;
  document.getElementById('playerMediaTitle').innerText = titleText;
  
  const seasonText = isSeries ? `${media.seasonsCount || 1} seasons` : (media.duration || '2h 15m');

  document.getElementById('playerMediaMeta').innerHTML = `
    <i class="fa-solid fa-tv"></i>
    <span class="star-rating"><i class="fa-solid fa-star"></i> ${media.rating || '7.5'}</span>
    <span>${media.year || '2026'}</span>
    <span>${media.country || 'India'}</span>
    <span>${media.genre || 'Action'}</span>
    <span id="playerSeasonTag">${seasonText}</span>
  `;

  // Dub/Audio dropdown text
  const dubText = (media.audioTracks && media.audioTracks[0]) || 'Hindi dub';
  appState.currentAudioTrack = dubText;
  document.getElementById('currentDubText').innerText = dubText;

  // Handle Series vs Movie UI
  const seriesEpisodesWrapper = document.getElementById('seriesEpisodesWrapper');
  const movieResourceRow = document.getElementById('movieResourceRow');

  if (isSeries && media.episodes && media.episodes.length > 0) {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'block';
    if (movieResourceRow) movieResourceRow.style.display = 'none';

    appState.currentEpisode = media.episodes[episodeIndex] || media.episodes[0];
    renderEpisodePills(media.episodes, episodeIndex);
    playStreamUrl(appState.currentEpisode ? appState.currentEpisode.streamUrl : null);
  } else {
    if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'none';
    if (movieResourceRow) movieResourceRow.style.display = 'block';
    const movieTitleEl = document.getElementById('movieResourceTitle');
    if (movieTitleEl) movieTitleEl.innerText = titleText;
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

  if (loader) loader.classList.add('active');

  // Proxy through backend with range seeking support
  const streamApiUrl = `/api/stream?url=${encodeURIComponent(url)}`;
  videoPlayer.src = streamApiUrl;

  videoPlayer.load();
  videoPlayer.play().catch(err => {
    console.log('Autoplay deferred until user taps video controls:', err.message);
  });
}

// Setup Video Event Listeners
function setupVideoListeners() {
  const videoPlayer = document.getElementById('mainVideoPlayer');
  const loader = document.getElementById('videoLoader');
  if (!videoPlayer) return;

  videoPlayer.addEventListener('playing', () => {
    if (loader) loader.classList.remove('active');
  });

  videoPlayer.addEventListener('waiting', () => {
    if (loader) loader.classList.add('active');
  });

  videoPlayer.addEventListener('canplay', () => {
    if (loader) loader.classList.remove('active');
  });

  videoPlayer.addEventListener('error', (e) => {
    console.error('Video load error, attempting fallback:', e);
    if (loader) loader.classList.remove('active');

    const directUrl = appState.currentEpisode?.streamUrl || appState.currentMedia?.streamUrl || appState.currentMedia?.driveUrl;
    if (directUrl && videoPlayer.src && videoPlayer.src.includes('/api/stream')) {
      console.log('Retrying with direct stream URL...');
      videoPlayer.src = directUrl;
      videoPlayer.load();
      videoPlayer.play().catch(() => {});
    }
  });
}

// Close Video Player Overlay
function closePlayer() {
  const overlay = document.getElementById('playerOverlay');
  const videoPlayer = document.getElementById('mainVideoPlayer');
  videoPlayer.pause();
  videoPlayer.src = '';
  overlay.classList.remove('open');
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
        <span class="card-badge-top">${item.language || 'Hindi'}</span>
        <div class="card-play-hover">
          <div class="card-play-circle"><i class="fa-solid fa-play"></i></div>
        </div>
      </div>
      <div class="card-title">${item.title}</div>
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

  const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  
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

  const filteredMovies = (appState.content.movies || []).filter(m => 
    m.title.toLowerCase().includes(query) ||
    (m.genre && m.genre.toLowerCase().includes(query)) ||
    (m.language && m.language.toLowerCase().includes(query))
  );

  document.getElementById('movieCountBadge').innerText = `${filteredMovies.length} Results`;
  const grid = document.getElementById('allMoviesGrid');
  if (filteredMovies.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px 10px; color: var(--text-muted);">No movies or series found matching "${query}".</div>`;
  } else {
    grid.innerHTML = filteredMovies.map(item => `
      <div class="media-card" onclick='openPlayerById("movie", "${item.id}")'>
        <div class="card-poster-wrap">
          <img src="${item.poster}" alt="${item.title}" class="card-poster-img" loading="lazy">
          <span class="card-badge-top">${item.language || 'Hindi'}</span>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">⭐ ${item.rating || '7.5'}</div>
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
    const res = await fetch('/api/content', {
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
    const res = await fetch('/api/sync-kmdl', {
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

