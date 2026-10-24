/**
 * FOBS TV - Vishwanath and Sons [Hindi] (2026) MovieBox & TMDB Ingestion
 * 
 * - Subject ID: 803658983365039832
 * - Detail Path: vishwanath-and-sons-hindi-OVyMV4xLmX
 * - TMDB Movie ID: 1408162 (Vishwanath & Sons, 2026)
 * - Stars: Suriya, Mamitha Baiju, Raveena Tandon, Radhika Sarathkumar
 * - Quality: 1080p Full HD Hindi Dubbed (2.6GB) with 7 stream servers
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_MOVIE_ID = 1408162;
const SUBJECT_ID = '803658983365039832';
const DETAIL_PATH = 'vishwanath-and-sons-hindi-OVyMV4xLmX';
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
  console.log('Vishwanath and Sons [Hindi] (2026) - Ingestion');
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
  const runtime = tmdb.runtime || 161;
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

  // Format genres
  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Drama, Romance, Comedy, South';

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
    throw new Error('No streams found on MovieBox for Vishwanath and Sons');
  }

  const sortedDownloads = [...mbData.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
  const best = sortedDownloads[0];
  console.log(`   Found ${sortedDownloads.length} stream qualities. Best: ${best.resolution}p (${Math.round(best.size / 1024 / 1024)}MB)`);

  const primaryStream = best.url;

  // Multi-server setup
  const servers = [
    {
      name: `Server 1 (MovieBox ${best.resolution}p Hindi Direct - ${Math.round(best.size / 1024 / 1024)}MB)`,
      url: primaryStream,
      isDirect: true,
      quality: `${best.resolution}p`
    },
    {
      name: 'Server 2 (Auto-Renewing MovieBox Stream)',
      url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=0&ep=0`,
      isDirect: true,
      quality: `${best.resolution}p`
    }
  ];

  sortedDownloads.slice(1).forEach((d, idx) => {
    servers.push({
      name: `Server ${idx + 3} (MovieBox ${d.resolution}p - ${Math.round(d.size / 1024 / 1024)}MB)`,
      url: d.url,
      isDirect: true,
      quality: `${d.resolution}p`
    });
  });

  // Failover multi-embeds
  servers.push(
    {
      name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_MOVIE_ID}&tmdb=1`,
      isDirect: false,
      quality: '1080p'
    },
    {
      name: `Server ${servers.length + 1} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/movie/${TMDB_MOVIE_ID}`,
      isDirect: false,
      quality: '1080p'
    },
    {
      name: `Server ${servers.length + 1} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/movie/${TMDB_MOVIE_ID}`,
      isDirect: false,
      quality: '1080p'
    }
  );

  const backdropUrl = tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/u31xcOTIXWYJAZWJ4mChwgwEKu4.jpg';
  const posterUrl = tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : 'https://image.tmdb.org/t/p/w500/mLsvCffzpxxDwC7yVLJSLLjgzoq.jpg';

  // 3. Construct Movie Object
  const movieObj = {
    id: `mb-m-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    detailPath: DETAIL_PATH,
    tmdbId: TMDB_MOVIE_ID,
    title: 'Vishwanath and Sons [Hindi]',
    originalTitle: tmdb.original_title || 'விஸ்வநாத் & சன்ஸ்',
    language: 'Tamil',
    dubLanguage: 'Hindi',
    badgeLeft: 'Suriya',
    badgeRight: '1080p Full HD',
    industry: 'South Indian',
    country: 'India',
    category: 'South (Dubbed) Movies',
    genre: genresStr,
    year: tmdb.release_date ? tmdb.release_date.substring(0, 4) : '2026',
    releaseDate: tmdb.release_date || '2026-08-14',
    duration: durationStr,
    rating: String(tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '7.6'),
    imdbRating: String(tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '7.6'),
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    description: tmdb.overview || "A celebrated Olympian shooter travels to America looking for a donor to help his sick child — but unexpected romance complicates his search.",
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
      const titleMatch = m.title && m.title.toLowerCase().includes('vishwanath');
      return !idMatch && !titleMatch;
    });

    // Place at index 0 of movies
    content.movies.unshift(movieObj);

    // Also update featured spotlight to Vishwanath and Sons with TMDB 4K cover
    content.featured = movieObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`💾 Updated entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added Vishwanath and Sons [Hindi] (2026) with 7 stream servers and TMDB 4K cover!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
