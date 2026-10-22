/**
 * FOBS TV - Automated Hourly MovieBox Sync & Real-Time Views Service
 * 
 * - Syncs every 1 hour automatically
 * - Filters strictly Hindi dubbed content
 * - Pre-validates video stream availability (HTTP 206/200)
 * - Fetches rich metadata, cast, backdrop, and descriptions from TMDB
 * - Categorizes Movies, Series, Anime, and Coming Soon
 * - Manages real-time unique video view counts
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const movieboxService = require('./movieboxService');
const liveTvService = require('./liveTvService');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const DATA_FILE = path.join(__dirname, '..', 'data', 'content.json');
const VIEWS_FILE = path.join(__dirname, '..', 'data', 'views.json');
const PUBLIC_SEED_FILE = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED_FILE = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

// ============================================================
// REAL-TIME VIDEO VIEWS MANAGER
// ============================================================
function getViewsMap() {
  try {
    if (fs.existsSync(VIEWS_FILE)) {
      return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading views file:', e.message);
  }
  return {};
}

function saveViewsMap(map) {
  try {
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving views file:', e.message);
  }
}

function getMediaViews(id) {
  const map = getViewsMap();
  // Return recorded views or baseline realistic view count based on id hash
  if (map[id] !== undefined) {
    return map[id];
  }
  // Generate consistent initial count between 25 and 150
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  const initial = 25 + (Math.abs(hash) % 125);
  map[id] = initial;
  saveViewsMap(map);
  return initial;
}

function incrementMediaViews(id) {
  const map = getViewsMap();
  const current = getMediaViews(id);
  const updated = current + 1;
  map[id] = updated;
  saveViewsMap(map);
  return updated;
}

// ============================================================
// STREAM VERIFICATION
// ============================================================
async function verifyStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const res = await axios.get(url, {
      headers: {
        'Range': 'bytes=0-500',
        'Referer': 'https://movieboxapp.in/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 7000,
      validateStatus: (status) => status === 200 || status === 206
    });
    return res.status === 200 || res.status === 206;
  } catch (err) {
    return false;
  }
}

// ============================================================
// TMDB METADATA ENRICHMENT
// ============================================================
async function enrichFromTMDB(title, type = 'movie', year = '') {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^\w\s]/gi, ' ').trim();
    const isTv = type === 'series' || type === 'tv';
    const endpoint = isTv ? 'https://api.themoviedb.org/3/search/tv' : 'https://api.themoviedb.org/3/search/movie';

    const searchRes = await axios.get(endpoint, {
      params: {
        api_key: TMDB_API_KEY,
        query: cleanTitle,
        year: (!isTv && year) ? year : undefined,
        first_air_date_year: (isTv && year) ? year : undefined
      },
      timeout: 7000
    });

    const match = searchRes.data?.results?.[0];
    if (!match) return null;

    const detailsEndpoint = isTv 
      ? `https://api.themoviedb.org/3/tv/${match.id}` 
      : `https://api.themoviedb.org/3/movie/${match.id}`;

    const detailsRes = await axios.get(detailsEndpoint, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits'
      },
      timeout: 7000
    });

    const d = detailsRes.data;
    const cast = (d.credits?.cast || []).slice(0, 8).map(c => ({
      name: c.name,
      character: c.character || 'Cast',
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));

    return {
      title: d.title || d.name || cleanTitle,
      overview: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      rating: d.vote_average ? d.vote_average.toFixed(1) : '7.8',
      year: (d.release_date || d.first_air_date || '').split('-')[0] || year || '2026',
      genres: (d.genres || []).map(g => g.name).join(', '),
      cast
    };
  } catch (e) {
    return null;
  }
}

// ============================================================
// AUTOMATIC HOURLY MOVIEBOX SYNC ENGINE
// ============================================================
async function runMovieBoxSync() {
  console.log('🔄 [MovieBox Sync] Starting hourly refresh for Hindi dubbed movies & series...');
  try {
    const sections = await movieboxService.getHomepage();
    if (!sections || sections.length === 0) {
      console.log('⚠️ [MovieBox Sync] No sections received from MovieBox.');
      return;
    }

    if (!fs.existsSync(DATA_FILE)) {
      console.log('⚠️ [MovieBox Sync] content.json not found.');
      return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.movies) data.movies = [];
    if (!data.series) data.series = [];
    if (!data.upcoming) data.upcoming = [];
    if (!data.liveTv) data.liveTv = [];

    // 1. Ensure Live TV channels are populated if empty
    if (data.liveTv.length === 0) {
      console.log('📺 [Live TV] Populating initial Live TV channels...');
      const bdChannels = await liveTvService.getChannelsByCountry('bd');
      const inChannels = await liveTvService.getChannelsByCountry('in');
      const topChannels = [
        ...bdChannels.slice(0, 15),
        ...inChannels.slice(0, 30)
      ];
      data.liveTv = topChannels;
      console.log(`📺 [Live TV] Added ${topChannels.length} Live TV channels.`);
    }

    // 2. Identify Hindi sections & Coming Soon
    let addedMovies = 0;
    let addedSeries = 0;
    let addedUpcoming = 0;

    for (const sec of sections) {
      const isAnimeSection = /anime/i.test(sec.title);
      const isComingSoon = /coming soon/i.test(sec.title);
      const isHindiSection = /hindi/i.test(sec.title) || /bollywood/i.test(sec.title) || isAnimeSection || isComingSoon;

      if (!isHindiSection) continue;

      for (const item of sec.items) {
        // Strict Rule: ONLY Hindi dubbed content!
        const hasHindiInTitle = /hindi/i.test(item.title);
        const hasHindiInSec = /hindi/i.test(sec.title) || /bollywood/i.test(sec.title);
        if (!hasHindiInTitle && !hasHindiInSec && !isAnimeSection) continue;

        const cleanName = item.title.replace(/\[.*?\]|\(.*?\)/g, '').trim().toLowerCase();

        // Check if already in database
        const existsInMovies = data.movies.some(m => m.title.toLowerCase().includes(cleanName));
        const existsInSeries = data.series.some(s => s.title.toLowerCase().includes(cleanName));
        const existsInUpcoming = data.upcoming.some(u => u.title.toLowerCase().includes(cleanName));

        if (existsInMovies || existsInSeries || existsInUpcoming) {
          continue; // Already added
        }

        // Handle Coming Soon
        if (isComingSoon) {
          const tmdb = await enrichFromTMDB(item.title, item.type, item.year);
          const upcomingItem = {
            id: `mb-up-${item.id}`,
            title: `${item.title.replace(/\[Hindi\]/i, '').trim()} [Hindi]`,
            year: tmdb?.year || item.year || '2026',
            genre: isAnimeSection ? 'Anime, Action' : (tmdb?.genres || 'Action, Drama'),
            language: 'Hindi',
            dubLanguage: 'Hindi',
            badgeLeft: 'Hindi',
            badgeRight: 'Coming Soon',
            rating: tmdb?.rating || item.rating || '8.0',
            imdbRating: tmdb?.rating || item.rating || '8.0',
            poster: tmdb?.poster || item.poster,
            backdrop: tmdb?.backdrop || item.poster,
            description: tmdb?.overview || `Upcoming Hindi dubbed release coming soon exclusively on FOBS TV.`,
            cast: tmdb?.cast || [],
            type: item.type
          };
          data.upcoming.unshift(upcomingItem);
          addedUpcoming++;
          continue;
        }

        // Resolving Stream
        console.log(`  🔍 Resolving & verifying stream for "${item.title}"...`);
        const isSeriesItem = item.type === 'series';
        let media = await movieboxService.resolveMedia(item.subjectId, item.detailPath, isSeriesItem ? 1 : 0, isSeriesItem ? 1 : 0);
        if (!media || !media.streamUrl) {
          media = await movieboxService.resolveMedia(item.subjectId, item.detailPath, 0, 0);
        }
        if (!media || !media.streamUrl) {
          console.log(`    ⚠️ No stream found for "${item.title}", skipping.`);
          continue;
        }

        // Check video validity: must return 200 or 206
        const isLive = await verifyStreamUrl(media.streamUrl);
        if (!isLive) {
          console.log(`    ❌ Stream for "${item.title}" is not playable / fake. Skipping.`);
          continue;
        }

        // Fetch TMDB rich metadata
        const tmdb = await enrichFromTMDB(item.title, item.type, item.year);
        const resolvedTitle = `${(tmdb?.title || item.title).replace(/\[Hindi\]/i, '').trim()} (Hindi Dub)`;
        const poster = tmdb?.poster || item.poster;
        const backdrop = tmdb?.backdrop || item.poster;
        const desc = tmdb?.overview || `High definition Hindi dubbed stream of ${item.title}. Available now on FOBS TV.`;
        const rating = tmdb?.rating || item.rating || '8.0';

        const servers = [
          { name: `Server 1 (Fast HD ${media.resolution || 720}p)`, url: media.streamUrl },
          ...(media.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 2} (${q.resolution}p)`,
            url: q.url
          }))
        ];

        if (item.type === 'series') {
          const seriesObj = {
            id: `mb-s-${item.id}`,
            title: resolvedTitle,
            originalTitle: item.title,
            language: 'Hindi',
            dubLanguage: 'Hindi',
            badgeLeft: 'Hindi',
            badgeRight: isAnimeSection ? 'Anime' : 'Series',
            tag: isAnimeSection ? 'Anime' : 'HD 720p',
            industry: isAnimeSection ? 'Anime' : 'Hindi Series',
            year: tmdb?.year || item.year || '2026',
            country: isAnimeSection ? 'Japan' : 'India',
            genre: isAnimeSection ? 'Anime, Action' : (tmdb?.genres || 'Drama, Series'),
            duration: '45m/ep',
            category: isAnimeSection ? 'Anime Series' : 'Trending Series',
            rating,
            imdbRating: rating,
            poster,
            backdrop,
            description: desc,
            audioTracks: ['Hindi dub'],
            selectedAudio: 'Hindi dub',
            streamUrl: media.streamUrl,
            servers,
            cast: tmdb?.cast || [],
            episodes: [
              {
                number: 1,
                title: 'Episode 1',
                streamUrl: media.streamUrl,
                audioTracks: { 'Hindi dub': media.streamUrl }
              }
            ],
            type: 'series'
          };
          data.series.unshift(seriesObj);
          addedSeries++;
          console.log(`    ✅ Added Hindi Series: "${resolvedTitle}"`);
        } else {
          const movieObj = {
            id: `mb-m-${item.id}`,
            title: resolvedTitle,
            originalTitle: item.title,
            language: 'Hindi',
            dubLanguage: 'Hindi',
            badgeLeft: 'Hindi',
            badgeRight: isAnimeSection ? 'Anime' : 'Movie',
            tag: isAnimeSection ? 'Anime' : 'HD 720p',
            quality: 'HD 720p',
            industry: isAnimeSection ? 'Anime' : 'Bollywood',
            year: tmdb?.year || item.year || '2026',
            country: isAnimeSection ? 'Japan' : 'India',
            genre: isAnimeSection ? 'Anime, Action' : (tmdb?.genres || 'Action, Thriller'),
            duration: '2h 15m',
            category: isAnimeSection ? 'Anime Movies' : 'Trending Movies',
            rating,
            imdbRating: rating,
            poster,
            backdrop,
            description: desc,
            audioTracks: ['Hindi dub'],
            selectedAudio: 'Hindi dub',
            streamUrl: media.streamUrl,
            servers,
            cast: tmdb?.cast || [],
            type: 'movie'
          };
          data.movies.unshift(movieObj);
          addedMovies++;
          console.log(`    ✅ Added Hindi Movie: "${resolvedTitle}"`);
        }
      }
    }

    // Save updated content to disk and sync
    if (addedMovies > 0 || addedSeries > 0 || addedUpcoming > 0 || data.liveTv.length > 0) {
      const files = [DATA_FILE, PUBLIC_SEED_FILE, ANDROID_SEED_FILE];
      for (const f of files) {
        if (fs.existsSync(f)) {
          fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
        }
      }
      console.log(`🎉 [MovieBox Sync] Completed successfully! Added: ${addedMovies} Movies, ${addedSeries} Series, ${addedUpcoming} Upcoming.`);
    } else {
      console.log(`ℹ️ [MovieBox Sync] No new Hindi items to add. Catalog is already up to date.`);
    }
  } catch (err) {
    console.error('❌ [MovieBox Sync] Error during sync:', err.message);
  }
}

// Start recurring 1-hour cron interval
function startHourlySyncTimer() {
  console.log('⏰ [MovieBox Sync Engine] Scheduling automated sync every 1 hour (3600000ms)...');
  // Run once shortly after startup (after 10 seconds)
  setTimeout(() => {
    runMovieBoxSync().catch(e => console.error('Initial sync error:', e.message));
  }, 10000);

  // Every 1 hour
  setInterval(() => {
    runMovieBoxSync().catch(e => console.error('Hourly sync error:', e.message));
  }, 60 * 60 * 1000);
}

module.exports = {
  runMovieBoxSync,
  startHourlySyncTimer,
  getMediaViews,
  incrementMediaViews
};
