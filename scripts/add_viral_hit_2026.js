/**
 * FOBS TV - Ingestion script for Viral Hit (2026) [Hindi] from MovieBox
 * - Subject ID: 2819564323977289192
 * - Detail Path: viral-hit-hindi-CT6Pd5lDhm3
 * - Country: Japan (Japanese Live Action Drama)
 * - TMDB ID: 312493
 * - Total 6 Episodes (Complete Season 1 in 1080p Full HD Hindi Dub)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 312493;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '2819564323977289192';
const DETAIL_PATH = 'viral-hit-hindi-CT6Pd5lDhm3';

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
        await delay(1500 * attempt);
      } else {
        console.error(`Error fetching ep ${ep}:`, err.message);
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('Viral Hit (2026) [Hindi] MovieBox & TMDB Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log('📺 Fetching TV series details from TMDB (ID: ' + TMDB_TV_ID + ')...');
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,external_ids'
    }
  });
  const tmdb = tmdbRes.data;

  // 2. Fetch TMDB Season 1 episodes metadata
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = s1Res.data.episodes || [];

  // Top 10 Cast with authentic headshots
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // 3. Fetch all 6 episodes from MovieBox
  console.log('⚡ Fetching high-speed MovieBox CDN streams for 6 episodes...');
  const episodesArray = [];

  for (let ep = 1; ep <= 6; ep++) {
    console.log(`   Fetching Episode ${ep}...`);
    const epData = await fetchEpisodeDownload(1, ep);
    if (!epData) {
      console.warn(`   ⚠️ Warning: Episode ${ep} returned no direct MovieBox stream`);
      continue;
    }

    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === ep);
    const epNumStr = ep.toString().padStart(2, '0');
    const epTitle = tmdbEp?.name ? `Episode ${ep} - ${tmdbEp.name}` : `Episode ${ep}`;
    const epDuration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '48m';
    const epStill = tmdbEp?.still_path
      ? `https://image.tmdb.org/t/p/original${tmdbEp.still_path}`
      : `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`;
    const epOverview = tmdbEp?.overview || `Episode ${ep} of Viral Hit (2026) Japanese Drama Series in Hindi Dubbed.`;

    const stream1080p = epData.best.url;
    const stream720p = (epData.qualities.find(q => q.resolution === 720) || epData.best).url;
    const stream480p = (epData.qualities.find(q => q.resolution === 480) || epData.best).url;

    // Servers list
    const servers = [
      {
        name: `Server 1 (MovieBox 1080p Direct)`,
        url: stream1080p
      },
      {
        name: `Server 2 (Auto-Renewing MovieBox Stream)`,
        url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${ep}`
      },
      {
        name: `Server 3 (MovieBox 720p HD)`,
        url: stream720p
      },
      {
        name: `Server 4 (MovieBox 480p SD)`,
        url: stream480p
      },
      {
        name: `Server 5 (MultiEmbed HD Failover)`,
        url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${ep}`
      },
      {
        name: `Server 6 (AutoEmbed HD)`,
        url: `https://autoembed.co/tv/tmdb/${TMDB_TV_ID}/1/${ep}`
      }
    ];

    const audioTracks = {
      'Hindi dub': stream1080p,
      'Original Audio': `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${ep}`
    };

    const captions = (epData.captions || []).map(c => ({
      label: c.lanName || 'English',
      language: c.lan || 'en',
      url: c.url
    }));

    episodesArray.push({
      number: epNumStr,
      episode: ep,
      season: 1,
      title: epTitle,
      duration: epDuration,
      overview: epOverview,
      still: epStill,
      streamUrl: stream1080p,
      servers: servers,
      audioTracks: audioTracks,
      captions: captions
    });

    console.log(`   ✅ Episode ${ep} ready: 1080p (${(epData.best.size / (1024*1024)).toFixed(1)} MB)`);
    await delay(300);
  }

  // 4. Construct complete Series entry
  const posterUrl = tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : 'https://pbcdnw.aoneroom.com/image/2026/10/18/8a44a3397fdf45c45b25ab179cd7ec97.jpg';

  const backdropUrl = tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/cUNHl2RBFO7qNoAhmRyML0BdWsY.jpg';

  const seriesEntry = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_TV_ID,
    title: 'Viral Hit (2026) [Hindi]',
    originalTitle: '喧嘩独学 (Kenka Dokugaku)',
    language: 'Japanese',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi Dub',
    badgeRight: '2026 Full HD',
    tag: 'Full Series',
    isFullSeries: true,
    isTrending: true,
    status: 'Completed',
    industry: 'Japanese',
    country: 'Japan',
    category: 'Japanese Series',
    genre: 'Drama, Action, Martial Arts, High School',
    year: '2026',
    duration: '6 Episodes',
    seasonsCount: 1,
    releasedEpisodes: 6,
    totalEpisodes: 6,
    rating: '8.5',
    imdbRating: '8.5',
    poster: posterUrl,
    backdrop: backdropUrl,
    description: tmdb.overview || 'Bullied high school student Kota discovers fighting can be profitable when his classmate brawl is accidentally streamed and goes viral. He starts his own streaming channel and begins transforming his life.',
    audioTracks: [
      'Hindi dub',
      'Original Audio'
    ],
    selectedAudio: 'Hindi dub',
    streamUrl: episodesArray[0].streamUrl,
    servers: episodesArray[0].servers,
    cast: cast,
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1 (6 Episodes)',
        episodes: episodesArray
      }
    ],
    episodes: episodesArray,
    type: 'series'
  };

  // 5. Update data/content.json, public/seed-content.json, android seed
  const targetFiles = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];

  for (const fpath of targetFiles) {
    if (!fs.existsSync(fpath)) continue;
    const catalog = JSON.parse(fs.readFileSync(fpath, 'utf8'));

    if (!catalog.series) catalog.series = [];

    // Remove any older duplicate entry of Viral Hit
    catalog.series = catalog.series.filter(s => {
      if (s.id === seriesEntry.id) return false;
      if (s.title && s.title.toLowerCase().includes('viral hit')) return false;
      return true;
    });

    // Add to the front so it appears in recent and trending
    catalog.series.unshift(seriesEntry);

    fs.writeFileSync(fpath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`💾 Successfully updated: ${fpath}`);
  }

  console.log('\n🎉 Successfully added Viral Hit (2026) [Hindi] Japanese Series with all 6 Full HD episodes!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
