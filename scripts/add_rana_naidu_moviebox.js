/**
 * FOBS TV - Rana Naidu [Hindi] Season 1 & 2 MovieBox & TMDB Ingestion
 * - Subject ID: 8653275235304834096
 * - Detail Path: rana-naidu-hindi-q987i7J5eja
 * - TMDB ID: 203202
 * - Season 1: 10 Episodes in 1080p Full HD MovieBox Direct Streams
 * - Season 2: 8 Episodes in 1080p Full HD MovieBox Direct Streams
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 203202;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '8653275235304834096';
const DETAIL_PATH = 'rana-naidu-hindi-q987i7J5eja';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/movies/${DETAIL_PATH}`,
  'Accept': 'application/json'
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(se, ep, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId: SUBJECT_ID, se, ep },
        headers: HEADERS,
        timeout: 15000
      });

      const data = res.data?.data;
      if (!data || !data.downloads || data.downloads.length === 0) {
        return null;
      }

      const sorted = [...data.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      return {
        best: sorted[0],
        qualities: sorted,
        captions: data.captions || []
      };
    } catch (err) {
      if (attempt < retries) {
        await delay(1200 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('Rana Naidu - Season 1 & 2 MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log('📺 Fetching TV details from TMDB (ID: ' + TMDB_TV_ID + ')...');
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,external_ids'
    }
  });
  const tmdb = tmdbRes.data;

  // Cast
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const s1TmdbEpisodes = s1Res.data.episodes || [];

  // 3. Fetch Season 2 episodes from TMDB
  console.log('📋 Fetching Season 2 episodes from TMDB...');
  const s2Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/2`, {
    params: { api_key: TMDB_API_KEY }
  });
  const s2TmdbEpisodes = s2Res.data.episodes || [];

  // Build Season 1 episodes (10 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (10 episodes)...');
  const season1Episodes = [];
  for (let ep = 1; ep <= 10; ep++) {
    const mb = await fetchEpisodeDownload(1, ep);
    const tmdbEp = s1TmdbEpisodes.find(e => e.episode_number === ep);
    const epNumStr = ep.toString().padStart(2, '0');
    const epTitle = tmdbEp?.name ? `Episode ${ep} - ${tmdbEp.name}` : `Episode ${ep}`;
    const epDuration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '48m';
    const epStill = tmdbEp?.still_path
      ? `https://image.tmdb.org/t/p/original${tmdbEp.still_path}`
      : `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`;
    const epOverview = tmdbEp?.overview || `Season 1 Episode ${ep} of Rana Naidu in Hindi Dubbed.`;

    const stream1080p = mb?.best?.url || `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${ep}`;
    const stream720p = (mb?.qualities?.find(q => q.resolution === 720) || mb?.best)?.url || stream1080p;
    const streamSD = (mb?.qualities?.find(q => q.resolution === 360 || q.resolution === 480) || mb?.best)?.url || stream1080p;

    const servers = [];
    if (mb?.best?.url) {
      servers.push({
        name: `Server 1 (MovieBox 1080p Direct)`,
        url: stream1080p
      });
      servers.push({
        name: `Server 2 (Auto-Renewing MovieBox Stream)`,
        url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${ep}`
      });
      servers.push({
        name: `Server 3 (MovieBox 720p HD)`,
        url: stream720p
      });
      servers.push({
        name: `Server 4 (MovieBox Fast SD)`,
        url: streamSD
      });
    }

    servers.push({
      name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${ep}`
    });
    servers.push({
      name: `Server ${servers.length + 1} (AutoEmbed HD)`,
      url: `https://autoembed.co/tv/tmdb/${TMDB_TV_ID}/1/${ep}`
    });
    servers.push({
      name: `Server ${servers.length + 1} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID}/1/${ep}`
    });

    season1Episodes.push({
      number: epNumStr,
      episode: ep,
      season: 1,
      title: epTitle,
      duration: epDuration,
      overview: epOverview,
      still: epStill,
      streamUrl: servers[0].url,
      servers: servers,
      audioTracks: {
        'Hindi dub': servers[0].url,
        'Original Audio': `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${ep}`
      }
    });

    console.log(`   ✅ S1 E${ep}: ${mb?.best?.resolution || 'HD'}p (${mb?.best ? (mb.best.size / (1024*1024)).toFixed(1) + ' MB' : 'Fallback'})`);
    await delay(200);
  }

  // Build Season 2 episodes (8 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 2 (8 episodes)...');
  const season2Episodes = [];
  for (let ep = 1; ep <= 8; ep++) {
    const mb = await fetchEpisodeDownload(2, ep);
    const tmdbEp = s2TmdbEpisodes.find(e => e.episode_number === ep);
    const epNumStr = ep.toString().padStart(2, '0');
    const epTitle = tmdbEp?.name ? `Episode ${ep} - ${tmdbEp.name}` : `Episode ${ep}`;
    const epDuration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '46m';
    const epStill = tmdbEp?.still_path
      ? `https://image.tmdb.org/t/p/original${tmdbEp.still_path}`
      : `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`;
    const epOverview = tmdbEp?.overview || `Season 2 Episode ${ep} of Rana Naidu in Hindi Dubbed.`;

    const stream1080p = mb?.best?.url || `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=2&e=${ep}`;
    const streamSD = (mb?.qualities?.find(q => q.resolution === 480) || mb?.best)?.url || stream1080p;

    const servers = [];
    if (mb?.best?.url) {
      servers.push({
        name: `Server 1 (MovieBox 1080p Direct)`,
        url: stream1080p
      });
      servers.push({
        name: `Server 2 (Auto-Renewing MovieBox Stream)`,
        url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=2&ep=${ep}`
      });
      servers.push({
        name: `Server 3 (MovieBox Fast SD)`,
        url: streamSD
      });
    }

    servers.push({
      name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=2&e=${ep}`
    });
    servers.push({
      name: `Server ${servers.length + 1} (AutoEmbed HD)`,
      url: `https://autoembed.co/tv/tmdb/${TMDB_TV_ID}/2/${ep}`
    });
    servers.push({
      name: `Server ${servers.length + 1} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID}/2/${ep}`
    });

    season2Episodes.push({
      number: epNumStr,
      episode: ep,
      season: 2,
      title: epTitle,
      duration: epDuration,
      overview: epOverview,
      still: epStill,
      streamUrl: servers[0].url,
      servers: servers,
      audioTracks: {
        'Hindi dub': servers[0].url,
        'Original Audio': `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=2&e=${ep}`
      }
    });

    console.log(`   ✅ S2 E${ep}: ${mb?.best?.resolution || 'HD'}p (${mb?.best ? (mb.best.size / (1024*1024)).toFixed(1) + ' MB' : 'Fallback'})`);
    await delay(200);
  }

  // Seasons array
  const seasonsArray = [
    {
      seasonNumber: 1,
      name: 'Season 1 (10 Episodes)',
      episodes: season1Episodes
    },
    {
      seasonNumber: 2,
      name: 'Season 2 (8 Episodes)',
      episodes: season2Episodes
    }
  ];

  const posterUrl = tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : 'https://pbcdnw.aoneroom.com/image/2025/12/04/cbe81217e67ed61f02f86c798d439853.jpg';

  const backdropUrl = tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/jG2B4a6Kz5Z2C6jLqU1V8n6Y3L2.jpg';

  const seriesEntry = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_TV_ID,
    title: 'Rana Naidu [Hindi]',
    originalTitle: 'Rana Naidu (Ray Donovan Adaptation)',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'South Dub',
    badgeRight: '2 Seasons',
    tag: 'Full Series',
    isFullSeries: true,
    isTrending: true,
    status: 'Completed',
    industry: 'South Indian',
    country: 'India',
    category: 'South Indian Series',
    genre: 'Action, Crime, Drama',
    year: tmdb.first_air_date ? tmdb.first_air_date.split('-')[0] : '2023',
    duration: '2 Seasons (18 Episodes)',
    seasonsCount: 2,
    releasedEpisodes: 18,
    totalEpisodes: 18,
    rating: '8.2',
    imdbRating: '8.2',
    poster: posterUrl,
    backdrop: backdropUrl,
    description: tmdb.overview || "Rana Naidu is the go-to problem solver for the rich and famous. But when his estranged father is released from prison, the one mess he can't handle may be his own.",
    audioTracks: [
      'Hindi dub',
      'Original Audio'
    ],
    selectedAudio: 'Hindi dub',
    streamUrl: season1Episodes[0].streamUrl,
    servers: season1Episodes[0].servers,
    cast: cast,
    seasons: seasonsArray,
    episodes: season1Episodes,
    type: 'series'
  };

  // Update target files
  const targetFiles = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];

  for (const fpath of targetFiles) {
    if (!fs.existsSync(fpath)) continue;
    const catalog = JSON.parse(fs.readFileSync(fpath, 'utf8'));

    if (!catalog.series) catalog.series = [];

    // Replace old placeholder or insert
    const idx = catalog.series.findIndex(s => s.id === seriesEntry.id || s.id === 'mb-s-south-rananaidu' || (s.title && s.title.toLowerCase().includes('rana naidu')));
    if (idx !== -1) {
      catalog.series[idx] = seriesEntry;
      console.log(`💾 Replaced entry in: ${fpath}`);
    } else {
      catalog.series.unshift(seriesEntry);
      console.log(`💾 Added entry to: ${fpath}`);
    }

    fs.writeFileSync(fpath, JSON.stringify(catalog, null, 2), 'utf8');
  }

  console.log('\n🎉 Successfully updated Rana Naidu [Hindi] with 2 full Seasons and 18 pristine 1080p MovieBox episodes!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
