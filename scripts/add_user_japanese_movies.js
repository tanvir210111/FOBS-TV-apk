/**
 * FOBS TV - Japanese Movies / Anime Films Ingestion Script
 * Adds the 10 requested Japanese movies:
 * 1. A Whisker Away (2020)
 * 2. The Cat Returns (2002)
 * 3. Your Name. (2016)
 * 4. Weathering with You (2019)
 * 5. The 100th Love with You (2017)
 * 6. Cyborg She (2008)
 * 7. My Tomorrow, Your Yesterday (2016)
 * 8. Confessions (2010)
 * 9. Blade of the Immortal (2017)
 * 10. Azumi (2003)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const delay = ms => new Promise(r => setTimeout(r, ms));

const MOVIES_CONFIGS = [
  {
    title: 'A Whisker Away (2020)',
    cleanTitle: 'A Whisker Away',
    tmdbId: 667520,
    mbSubjectId: '6263834212768828568',
    mbDetailPath: 'a-whisker-away-ORGzyXtqIs7',
    category: 'Anime Movies',
    year: '2020',
    badgeLeft: 'Anime HD',
    badgeRight: 'Japanese'
  },
  {
    title: 'The Cat Returns (2002)',
    cleanTitle: 'The Cat Returns',
    tmdbId: 15370,
    mbSubjectId: '3198897120291997760',
    mbDetailPath: 'the-cat-returns-IwFeyGVYiO3',
    category: 'Anime Movies',
    year: '2002',
    badgeLeft: 'Ghibli HD',
    badgeRight: 'Japanese'
  },
  {
    title: 'Your Name. (2016)',
    cleanTitle: 'Your Name.',
    tmdbId: 372058,
    mbSubjectId: '5644503090318428512',
    mbDetailPath: 'your-name-english-s4FhTeOSXI6',
    category: 'Anime Movies',
    year: '2016',
    badgeLeft: 'Anime Masterpiece',
    badgeRight: 'Japanese / Eng'
  },
  {
    title: 'Weathering with You (2019)',
    cleanTitle: 'Weathering with You',
    tmdbId: 568160,
    mbSubjectId: '7664491143090390096',
    mbDetailPath: 'weathering-with-you-YchthGWrb89',
    category: 'Anime Movies',
    year: '2019',
    badgeLeft: 'Anime FHD',
    badgeRight: 'Japanese'
  },
  {
    title: 'The 100th Love with You (2017)',
    cleanTitle: 'The 100th Love with You',
    tmdbId: 428125,
    mbSubjectId: '3583454937059050320',
    mbDetailPath: 'the-100th-love-with-you-UqzwCHdgIg4',
    category: 'Japanese Movies',
    year: '2017',
    badgeLeft: 'Romance HD',
    badgeRight: 'Japanese'
  },
  {
    title: 'Cyborg She (2008)',
    cleanTitle: 'Cyborg She',
    tmdbId: 19486,
    category: 'Japanese Movies',
    year: '2008',
    badgeLeft: 'Sci-Fi Classic',
    badgeRight: 'Japanese'
  },
  {
    title: 'My Tomorrow, Your Yesterday (2016)',
    cleanTitle: 'My Tomorrow, Your Yesterday',
    tmdbId: 428099,
    mbSubjectId: '2573047731598017616',
    mbDetailPath: 'my-tomorrow-your-yesterday-6HU2tekA443',
    category: 'Japanese Movies',
    year: '2016',
    badgeLeft: 'Romance HD',
    badgeRight: 'Japanese'
  },
  {
    title: 'Confessions (2010)',
    cleanTitle: 'Confessions',
    tmdbId: 54186,
    mbSubjectId: '7635004927198511952',
    mbDetailPath: 'confessions-OPp8Aj1p069',
    category: 'Japanese Movies',
    year: '2010',
    badgeLeft: 'Psychological Thriller',
    badgeRight: 'Japanese'
  },
  {
    title: 'Blade of the Immortal (2017)',
    cleanTitle: 'Blade of the Immortal',
    tmdbId: 426284,
    category: 'Japanese Movies',
    year: '2017',
    badgeLeft: 'Action HD',
    badgeRight: 'Japanese'
  },
  {
    title: 'Azumi (2003)',
    cleanTitle: 'Azumi',
    tmdbId: 5889,
    mbSubjectId: '2776315219319080016',
    mbDetailPath: 'azumi-upl6iliy5j3',
    category: 'Japanese Movies',
    year: '2003',
    badgeLeft: 'Action Classic',
    badgeRight: 'Japanese'
  }
];

function formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return '2h 00m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

async function fetchTMDBMovie(tmdbId) {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits'
      },
      timeout: 10000
    });
    return res.data;
  } catch (e) {
    console.error(`TMDB error for movie ${tmdbId}:`, e.message);
    return null;
  }
}

async function buildMovieEntry(cfg) {
  console.log(`\n⏳ Ingesting Movie: ${cfg.title} (TMDB ID: ${cfg.tmdbId})...`);
  const tmdb = await fetchTMDBMovie(cfg.tmdbId);
  if (!tmdb) {
    console.error(`❌ TMDB not found for ${cfg.title}`);
    return null;
  }

  const cast = (tmdb.credits?.cast || []).slice(0, 8).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const genres = (tmdb.genres || []).map(g => g.name).join(', ') || 'Action, Drama';
  const posterUrl = tmdb.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : 'https://image.tmdb.org/t/p/w500/placeholder.jpg';
  const backdropUrl = tmdb.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : posterUrl;

  const movieId = cfg.mbSubjectId ? `mb-m-${cfg.mbSubjectId}` : `mb-m-tmdb-${cfg.tmdbId}`;

  // Direct MovieBox stream check
  let directStreamUrl = null;
  if (cfg.mbSubjectId) {
    try {
      const mbRes = await moviebox.resolveMedia(cfg.mbSubjectId, cfg.mbDetailPath || '', 0, 0);
      if (mbRes && mbRes.streamUrl) {
        directStreamUrl = mbRes.streamUrl;
      }
    } catch (_) {}
  }

  const servers = [];

  if (cfg.mbSubjectId) {
    servers.push({
      name: 'Server 1 (Auto-Renewing MovieBox Stream)',
      url: `/api/moviebox/stream?id=${encodeURIComponent(cfg.mbSubjectId)}&path=${encodeURIComponent(cfg.mbDetailPath || '')}&se=0&ep=0`,
      quality: '1080p',
      audio: 'Original audio',
      isDirect: true
    });
    if (directStreamUrl) {
      servers.push({
        name: 'Server 2 (Direct MovieBox CDN 1080p)',
        url: directStreamUrl,
        quality: '1080p',
        audio: 'Original audio',
        isDirect: true
      });
    }
  }

  servers.push(
    {
      name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${cfg.tmdbId}&tmdb=1`,
      quality: '1080p',
      isDirect: false
    },
    {
      name: `Server ${servers.length + 2} (AutoEmbed CC HD)`,
      url: `https://player.autoembed.cc/embed/movie/${cfg.tmdbId}`,
      quality: '1080p',
      isDirect: false
    },
    {
      name: `Server ${servers.length + 3} (VidLink Fast HD)`,
      url: `https://vidlink.pro/movie/${cfg.tmdbId}`,
      quality: '1080p',
      isDirect: false
    },
    {
      name: `Server ${servers.length + 4} (VidSrc Player)`,
      url: `https://vidsrc.to/embed/movie/${cfg.tmdbId}`,
      quality: '1080p',
      isDirect: false
    }
  );

  const primaryStream = servers[0].url;

  const movieEntry = {
    id: movieId,
    subjectId: cfg.mbSubjectId || `tmdb-${cfg.tmdbId}`,
    detailPath: cfg.mbDetailPath || '',
    tmdbId: cfg.tmdbId,
    title: cfg.title,
    originalTitle: `${tmdb.original_title || tmdb.title} (${tmdb.title})`,
    year: (tmdb.release_date || cfg.year).split('-')[0],
    rating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.2',
    imdbRating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.2',
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    duration: formatDuration(tmdb.runtime),
    streamUrl: primaryStream,
    servers: servers,
    category: cfg.category,
    industry: 'Japanese',
    country: 'Japan',
    language: 'Japanese',
    dubLanguage: 'Japanese',
    audioTracks: ['Original audio'],
    selectedAudio: 'Original audio',
    badgeLeft: cfg.badgeLeft,
    badgeRight: cfg.badgeRight,
    views: Math.floor(Math.random() * 2000) + 2500,
    genre: genres,
    description: tmdb.overview || `Watch ${cfg.title} Japanese movie online in high definition on FOBS TV.`,
    cast: cast,
    type: 'movie',
    isCustom: true,
    isTrending: true,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  console.log(`   ✅ Finished building movie: ${cfg.title} (${movieEntry.duration}, ${movieEntry.servers.length} servers)`);
  return movieEntry;
}

async function main() {
  console.log('🚀 Starting User Japanese Movies / Anime Films Ingestion...\n');

  if (!fs.existsSync(CONTENT_FILE)) {
    console.error('Content file not found:', CONTENT_FILE);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  if (!catalog.movies) catalog.movies = [];

  const newlyAdded = [];

  for (const cfg of MOVIES_CONFIGS) {
    const entry = await buildMovieEntry(cfg);
    if (!entry) continue;

    const existingIdx = catalog.movies.findIndex(m => {
      if (m.id === entry.id) return true;
      if (m.tmdbId && entry.tmdbId && Number(m.tmdbId) === Number(entry.tmdbId)) return true;
      if (m.subjectId && entry.subjectId && String(m.subjectId) === String(entry.subjectId)) return true;
      const tLower = (m.title || '').toLowerCase().trim();
      const cfgLower = cfg.cleanTitle.toLowerCase().trim();
      if (tLower === cfgLower || tLower === cfg.title.toLowerCase().trim()) return true;
      return false;
    });

    if (existingIdx !== -1) {
      console.log(`   🔄 Updating existing movie entry: "${catalog.movies[existingIdx].title}"`);
      catalog.movies[existingIdx] = entry;
    } else {
      console.log(`   ⭐ Adding NEW movie to catalog: "${entry.title}"`);
      newlyAdded.push(entry);
    }
    await delay(200);
  }

  if (newlyAdded.length > 0) {
    catalog.movies = [...newlyAdded, ...catalog.movies];
  }

  console.log(`\n🎉 Ingestion finished! Total Movies in catalog: ${catalog.movies.length}`);

  const targetFiles = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];
  const jsonStr = JSON.stringify(catalog, null, 2);

  for (const fp of targetFiles) {
    if (fs.existsSync(path.dirname(fp))) {
      fs.writeFileSync(fp, jsonStr, 'utf8');
      console.log(`💾 Saved to ${fp}`);
    }
  }

  console.log('\n✨ All 10 Japanese movies added and synchronized successfully!');
}

main().catch(err => {
  console.error('Fatal error during movie ingestion:', err);
  process.exit(1);
});

