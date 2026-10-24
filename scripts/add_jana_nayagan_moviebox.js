/**
 * FOBS TV - Jana Nayagan [Hindi] (2026) MovieBox & TMDB Ingestion
 * 
 * - Subject ID: 7667495250449297640
 * - Detail Path: jan-neta-hindi-KLK6XFZcp89
 * - TMDB Movie ID: 1235877 (Jana Nayagan / Jan Neta, 2026)
 * - Stars: Thalapathy Vijay, Pooja Hegde, Bobby Deol, Mamitha Baiju, Priyamani, Prakash Raj
 * - Quality: 1080p Full HD Hindi Dubbed (3138MB / 3.1GB) with multi-server playback
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_MOVIE_ID = 1235877;
const SUBJECT_ID = '7667495250449297640';
const DETAIL_PATH = 'jan-neta-hindi-KLK6XFZcp89';
const BASE_URL = 'https://h5.aoneroom.com';

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
  console.log('Jana Nayagan [Hindi] (2026) - Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB details
  console.log(`🎬 Fetching movie details from TMDB (ID: ${TMDB_MOVIE_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/${TMDB_MOVIE_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,images'
    }
  });
  const tmdb = tmdbRes.data;

  // Format runtime
  const runtime = tmdb.runtime || 183;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  // Format cast (array of objects with name, character, photo)
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // Format genres
  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Action, Drama, Thriller';

  // 2. Fetch MovieBox streams
  console.log(`📥 Fetching stream resolutions from MovieBox (Subject ID: ${SUBJECT_ID})...`);
  const mbRes = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
    params: {
      subjectId: SUBJECT_ID,
      se: 0,
      ep: 0
    },
    headers: HEADERS,
    timeout: 12000
  });

  const mbData = mbRes.data?.data;
  if (!mbData || !mbData.downloads || mbData.downloads.length === 0) {
    throw new Error('No streams found on MovieBox for Jana Nayagan / Jan Neta');
  }

  const sortedDownloads = [...mbData.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
  const best = sortedDownloads[0];
  console.log(`   Found ${sortedDownloads.length} stream qualities. Best: ${best.resolution}p (${Math.round(best.size / 1024 / 1024)}MB)`);

  const primaryStream = best.url;

  // Multi-server setup
  let serverIndex = 1;
  const servers = [
    {
      name: `Server ${serverIndex++} (MovieBox ${best.resolution}p Hindi Direct - ${Math.round(best.size / 1024 / 1024)}MB)`,
      url: primaryStream,
      isDirect: true,
      quality: `${best.resolution}p`
    },
    {
      name: `Server ${serverIndex++} (Auto-Renewing MovieBox Stream)`,
      url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=0&ep=0`,
      isDirect: true,
      quality: `${best.resolution}p`
    }
  ];

  sortedDownloads.slice(1).forEach((d) => {
    servers.push({
      name: `Server ${serverIndex++} (MovieBox ${d.resolution}p - ${Math.round(d.size / 1024 / 1024)}MB)`,
      url: d.url,
      isDirect: true,
      quality: `${d.resolution}p`
    });
  });

  // Failover multi-embeds
  servers.push(
    {
      name: `Server ${serverIndex++} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_MOVIE_ID}&tmdb=1`,
      isDirect: false,
      quality: '1080p'
    },
    {
      name: `Server ${serverIndex++} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/movie/${TMDB_MOVIE_ID}`,
      isDirect: false,
      quality: '1080p'
    },
    {
      name: `Server ${serverIndex++} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/movie/${TMDB_MOVIE_ID}`,
      isDirect: false,
      quality: '1080p'
    }
  );

  const backdropUrl = tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/v3lNH2gCojWYXVuXcT9FZLBxcSq.jpg';
  const posterUrl = tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : 'https://image.tmdb.org/t/p/w500/jt8pfSIdi47YpFMMWVRr8w5u2S0.jpg';

  // 3. Construct Movie Object
  const movieObj = {
    id: `mb-m-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_MOVIE_ID,
    title: 'Jana Nayagan [Hindi]',
    originalTitle: tmdb.original_title ? `${tmdb.original_title} (Jan Neta)` : 'ஜன நாயகன் (Jan Neta)',
    language: 'Tamil',
    dubLanguage: 'Hindi',
    badgeLeft: 'Thalapathy Vijay',
    badgeRight: '1080p Full HD',
    industry: 'South Indian',
    country: 'India',
    category: 'South (Dubbed) Movies',
    genre: genresStr,
    year: tmdb.release_date ? tmdb.release_date.substring(0, 4) : '2026',
    releaseDate: tmdb.release_date || '2026-07-22',
    duration: durationStr,
    rating: String(tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.6'),
    imdbRating: String(tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.6'),
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    description: tmdb.overview || "A clash of ideologies. One stands for the people, the other feeds on control. Their paths collided once before. Years later, a child’s silent fear ignites the past, drawing a former police officer into a battle far bigger than personal revenge.",
    audioTracks: ['Hindi dub', 'Tamil (Original)'],
    selectedAudio: 'Hindi dub',
    streamUrl: primaryStream,
    servers: servers,
    cast: cast,
    type: 'movie'
  };

  // 4. Update catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Remove if already exists
    content.movies = (content.movies || []).filter(m => {
      const idMatch = m.id === `mb-m-${SUBJECT_ID}` || m.tmdbId === TMDB_MOVIE_ID;
      const titleMatch = m.title && (m.title.toLowerCase().includes('jana nayagan') || m.title.toLowerCase().includes('jan neta'));
      return !idMatch && !titleMatch;
    });

    // Place at index 0 of movies
    content.movies.unshift(movieObj);

    // Also update featured spotlight to Jana Nayagan with TMDB 4K cover
    content.featured = movieObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`💾 Updated entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added Jana Nayagan [Hindi] (2026) with 1080p (3.1GB) streams and TMDB 4K cover!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
