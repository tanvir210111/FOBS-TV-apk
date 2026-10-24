/**
 * FOBS TV - Musafir Cafe [Hindi] (2026) MovieBox & TMDB Ingestion
 * 
 * - TMDB TV ID: 313101 (Musafir Cafe, 2026)
 * - MovieBox Subject ID: 4720961996777219576
 * - MovieBox Detail Path: musafir-cafe-hindi-MStiLnt3KC5
 * - All 8 Episodes with 1080p Full HD Hindi Dubbed / Original Streams & Multi-Server Failover
 * - Stars: Vikrant Massey, Vedika Pinto, Mahima Makwana, Rajeev Siddhartha, Anubha Fatehpuria
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 313101;
const SUBJECT_ID = '4720961996777219576';
const DETAIL_PATH = 'musafir-cafe-hindi-MStiLnt3KC5';
const BASE_URL = 'https://h5.aoneroom.com';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(subjectId, detailPath, se, ep, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/movies/${detailPath}`,
    'Accept': 'application/json'
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId, se, ep },
        headers,
        timeout: 12000
      });

      const data = res.data?.data;
      if (!data || !data.downloads || data.downloads.length === 0) {
        return null;
      }

      const sorted = [...data.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      return {
        subjectId,
        detailPath,
        best: sorted[0],
        qualities: sorted,
        captions: data.captions || []
      };
    } catch (err) {
      if (attempt < retries) {
        await delay(600 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('Musafir Cafe [Hindi] (2026) - MovieBox & TMDB Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV Series Details
  console.log(`🎬 Fetching series details from TMDB (TV ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,images'
    }
  });
  const tv = tmdbRes.data;

  // 2. Fetch TMDB Season 1 Details
  console.log(`📅 Fetching Season 1 episode details from TMDB...`);
  let tmdbEpisodes = [];
  try {
    const sRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
      params: { api_key: TMDB_API_KEY }
    });
    tmdbEpisodes = sRes.data?.episodes || [];
    console.log(`   Found ${tmdbEpisodes.length} episodes on TMDB Season 1.`);
  } catch (err) {
    console.warn('   Could not fetch TMDB season 1:', err.message);
  }

  // 3. Ingest all 8 episodes from MovieBox
  console.log('\n📥 Ingesting episode download streams from MovieBox...');
  const episodes = [];
  const TOTAL_EPISODES = 8;

  for (let epNum = 1; epNum <= TOTAL_EPISODES; epNum++) {
    const mb = await fetchEpisodeDownload(SUBJECT_ID, DETAIL_PATH, 1, epNum);
    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === epNum) || {};

    const servers = [];

    // Server 1: Direct CDN 1080p stream
    let primaryStreamUrl = '';
    if (mb?.best?.url) {
      primaryStreamUrl = mb.best.url;
      servers.push({
        name: `Server 1 (MovieBox ${mb.best.resolution}p Direct - ${Math.round((mb.best.size || 0) / (1024 * 1024))}MB)`,
        url: mb.best.url,
        isDirect: true,
        quality: `${mb.best.resolution}p`
      });
    }

    // Server 2: Auto-renewing MovieBox API proxy stream
    servers.push({
      name: `Server 2 (Auto-Renewing MovieBox Stream)`,
      url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${epNum}`,
      isDirect: true,
      quality: '1080p'
    });

    // Lower qualities if available
    if (mb?.qualities) {
      const lower = mb.qualities.find(q => q.resolution < (mb.best?.resolution || 1080));
      if (lower?.url) {
        servers.push({
          name: `Server 3 (MovieBox ${lower.resolution}p - ${Math.round((lower.size || 0) / (1024 * 1024))}MB)`,
          url: lower.url,
          isDirect: true,
          quality: `${lower.resolution}p`
        });
      }
    }

    if (!primaryStreamUrl) {
      primaryStreamUrl = `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${epNum}`;
    }

    const srvOffset = servers.length + 1;
    servers.push({
      name: `Server ${srvOffset} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 1} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 2} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });

    episodes.push({
      number: epNum,
      episode: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 30} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Musafir Cafe.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/3amZOUtoKygHuyJHwrxddKA4puH.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi'],
      captions: []
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : 'embed';
    console.log(`   ✅ E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(150);
  }

  // 4. Extract Cast
  const castList = (tv.credits?.cast || []).slice(0, 8).map(c => c.name).join(', ') || 'Vikrant Massey, Vedika Pinto, Mahima Makwana, Rajeev Siddhartha, Anubha Fatehpuria';
  const cast = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // 5. Construct Series Object
  const nowIso = new Date().toISOString();
  const seriesObj = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_TV_ID,
    title: 'Musafir Cafe [Hindi]',
    originalTitle: tv.original_name || 'Musafir Cafe',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2026',
    releaseDate: nowIso,
    originalReleaseDate: tv.first_air_date || '2026-07-24',
    addedAt: nowIso,
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '7.5'),
    imdbRating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '7.5'),
    votes: String(tv.vote_count || '150'),
    duration: '1 Season (8 Episodes)',
    category: 'Trending Series',
    industry: 'Bollywood',
    country: 'India',
    badgeLeft: 'Hindi',
    badgeRight: '1080p Full HD',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://pbcdnw.aoneroom.com/image/2026/10/19/217558cc08c0803badcffc7d015d4779.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/w500/3amZOUtoKygHuyJHwrxddKA4puH.jpg',
    cover: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/w500/3amZOUtoKygHuyJHwrxddKA4puH.jpg',
    description: tv.overview || "Three travelers lives unexpectedly intertwine. Chander feels an undeniable connection with Sudha. Years later, he builds a new life in the hills with Preeti, but memories of the past linger. Which love endures through time, and life's journey?",
    overview: tv.overview || "Three travelers lives unexpectedly intertwine. Chander feels an undeniable connection with Sudha. Years later, he builds a new life in the hills with Preeti, but memories of the past linger. Which love endures through time, and life's journey?",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Drama, Romance',
    genre: (tv.genres || []).map(g => g.name).join(', ') || 'Drama, Romance',
    director: 'Imtiaz Ali',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2026',
        episodesCount: episodes.length,
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/3amZOUtoKygHuyJHwrxddKA4puH.jpg',
        episodes
      }
    ],
    episodes,
    type: 'series'
  };

  // 6. Update catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID}`;
      const titleMatch = s.title && s.title.toLowerCase().includes('musafir cafe');
      return !idMatch && !titleMatch;
    });

    // Unshift to the very top (index 0) of series
    content.series.unshift(seriesObj);

    // Also update featured spotlight to Musafir Cafe
    content.featured = seriesObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Saved entry to: ${filePath}`);
  }

  console.log('\n🎉 Successfully added Musafir Cafe [Hindi] (8 Episodes) from MovieBox!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
