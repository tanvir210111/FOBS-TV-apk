/**
 * FOBS TV - Ingestion script for Demon City (2025) [Hindi] from MovieBox
 * - Subject ID: 8768845011485083816
 * - Detail Path: demon-city-hindi-i5IiSPZoLra
 * - Country: Japan (Japanese Live-Action Crime Action Movie)
 * - TMDB ID: 1405338
 * - Quality: 1080p Full HD Hindi Dub
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_MOVIE_ID = 1405338;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '8768845011485083816';
const DETAIL_PATH = 'demon-city-hindi-i5IiSPZoLra';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/movies/${DETAIL_PATH}`,
  'Accept': 'application/json'
};

async function run() {
  console.log('====================================================');
  console.log('Demon City (2025) [Hindi] MovieBox & TMDB Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB details
  console.log('🎬 Fetching movie details from TMDB (ID: ' + TMDB_MOVIE_ID + ')...');
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/${TMDB_MOVIE_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,external_ids'
    }
  });
  const tmdb = tmdbRes.data;

  // Format runtime (e.g. 106 mins -> 1h 46m)
  const runtime = tmdb.runtime || 106;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  // Format cast
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // 2. Fetch MovieBox streams
  console.log('⚡ Fetching high-speed MovieBox CDN streams...');
  const mbRes = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
    params: { subjectId: SUBJECT_ID, se: 0, ep: 0 },
    headers: HEADERS,
    timeout: 15000
  });

  const dls = mbRes.data?.data?.downloads || [];
  if (dls.length === 0) {
    throw new Error('No download streams returned from MovieBox');
  }

  const sortedDls = [...dls].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
  const bestDl = sortedDls[0];
  const sdDl = sortedDls.find(q => q.resolution === 480) || bestDl;

  console.log(`   ✅ Best stream: ${bestDl.resolution}p (${(bestDl.size / (1024*1024)).toFixed(1)} MB)`);

  // Build servers
  const servers = [
    {
      name: 'Server 1 (MovieBox 1080p Direct)',
      url: bestDl.url
    },
    {
      name: 'Server 2 (Auto-Renewing MovieBox Stream)',
      url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=0&ep=0`
    },
    {
      name: 'Server 3 (MovieBox Fast SD)',
      url: sdDl.url
    },
    {
      name: 'Server 4 (MultiEmbed HD Failover)',
      url: `https://multiembed.mov/?video_id=${TMDB_MOVIE_ID}&tmdb=1`
    },
    {
      name: 'Server 5 (AutoEmbed HD)',
      url: `https://autoembed.co/movie/tmdb/${TMDB_MOVIE_ID}`
    },
    {
      name: 'Server 6 (Vidlink Fast HD)',
      url: `https://vidlink.pro/movie/${TMDB_MOVIE_ID}`
    }
  ];

  const posterUrl = tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : 'https://pbcdnw.aoneroom.com/image/2026/01/26/fc233c748bf800c64da55ff6193dd41f.jpg';

  const backdropUrl = tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/hD2SN5bbqxk0kcRmsATJkXObgnZ.jpg';

  const movieEntry = {
    id: `mb-m-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_MOVIE_ID,
    title: 'Demon City (2025) [Hindi]',
    originalTitle: 'Demon City 鬼ゴロシ (Onigoroshi)',
    language: 'Japanese',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi Dub',
    badgeRight: '1080p Full HD',
    industry: 'Japanese',
    country: 'Japan',
    category: 'Japanese Movies',
    genre: 'Action, Crime, Thriller, Martial Arts',
    year: tmdb.release_date ? tmdb.release_date.split('-')[0] : '2025',
    duration: durationStr,
    rating: '7.5',
    imdbRating: '7.5',
    poster: posterUrl,
    backdrop: backdropUrl,
    description: tmdb.overview || "Framed for his family's murder and left for dead, an ex-hitman will stop at nothing to exact revenge on the masked \"demons\" who have taken over his city.",
    audioTracks: [
      'Hindi dub',
      'Original Audio'
    ],
    selectedAudio: 'Hindi dub',
    streamUrl: bestDl.url,
    servers: servers,
    cast: cast,
    type: 'movie'
  };

  // 3. Update target files
  const targetFiles = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];

  for (const fpath of targetFiles) {
    if (!fs.existsSync(fpath)) continue;
    const catalog = JSON.parse(fs.readFileSync(fpath, 'utf8'));

    if (!catalog.movies) catalog.movies = [];

    // Remove any older duplicate entry of Demon City
    catalog.movies = catalog.movies.filter(m => {
      if (m.id === movieEntry.id) return false;
      if (m.title && m.title.toLowerCase().includes('demon city')) return false;
      return true;
    });

    // Add to the front so it appears in recent and trending
    catalog.movies.unshift(movieEntry);

    fs.writeFileSync(fpath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`💾 Successfully updated: ${fpath}`);
  }

  console.log('\n🎉 Successfully added Demon City (2025) [Hindi] Japanese Movie in 1080p Full HD!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
