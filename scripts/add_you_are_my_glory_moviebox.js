/**
 * FOBS TV - You Are My Glory [Hindi] Chinese Drama Ingestion
 * - TMDB TV ID: 127493 (You Are My Glory / 你是我的荣耀, 2021)
 * - MovieBox Subject ID: 7384944248602723992
 * - MovieBox Detail Path: you-are-my-glory-hindi-IIrH3QC7xN8
 * - Total 32 Episodes in 720p HD MovieBox Direct Streams
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 127493;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '7384944248602723992';
const DETAIL_PATH = 'you-are-my-glory-hindi-IIrH3QC7xN8';

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
        await delay(1000 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('You Are My Glory [Hindi] - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = s1Res.data.episodes || [];
  console.log(`   Found ${tmdbEpisodes.length} episodes on TMDB.`);

  // 3. Build Season 1 Episodes (32 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (32 episodes)...');
  const episodes = [];

  for (let i = 0; i < 32; i++) {
    const epNum = i + 1;
    const tmdbEp = tmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of You Are My Glory.`,
      still_path: null,
      runtime: 35
    };

    const mb = await fetchEpisodeDownload(1, epNum);
    const servers = [];
    let primaryStreamUrl = '';

    if (mb && mb.best) {
      primaryStreamUrl = mb.best.url;
      const sizeMB = Math.round(Number(mb.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox ${mb.best.resolution}p Direct - ${sizeMB}MB)`,
        url: mb.best.url,
        isDirect: true,
        quality: `${mb.best.resolution}p`
      });
      servers.push({
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: `${mb.best.resolution}p`
      });

      // Lower quality
      const sd = mb.qualities.find(q => q.resolution < mb.best.resolution);
      if (sd) {
        servers.push({
          name: `Server 3 (MovieBox Fast SD - ${sd.resolution}p)`,
          url: sd.url,
          isDirect: true,
          quality: `${sd.resolution}p`
        });
      }
    } else {
      primaryStreamUrl = `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`;
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

    const captionList = (mb?.captions || []).map(c => ({
      label: c.lanName || c.lan,
      srclang: c.lan,
      src: c.url
    }));

    episodes.push({
      number: String(epNum).padStart(2, '0'),
      episode: epNum,
      episodeNumber: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 35} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of You Are My Glory.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/vuzbhOIQ1Y2wCB0HmhD2Hq5VxkE.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi'],
      captions: captionList
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : 'embed';
    console.log(`   ✅ S1 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(200);
  }

  // Cast extraction
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Yang Yang, Dilraba Dilmurat, Pan Yueming, Hu Ke, Ian Wang, Zheng He Hui Zi';

  // 4. Construct Series Object
  const glorySeries = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    tmdbId: TMDB_TV_ID,
    title: 'You Are My Glory [Hindi]',
    originalTitle: tv.original_name || '你是我的荣耀',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2021',
    releaseDate: tv.first_air_date || '2021-07-26',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.5'),
    votes: String(tv.vote_count || '120'),
    duration: '32 Episodes',
    category: 'Chinese (Dubbed) Series',
    industry: 'Chinese',
    country: 'China',
    badgeLeft: 'C-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/oL1FhXHsDs7yFPEnlooY9fGgaNA.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/vuzbhOIQ1Y2wCB0HmhD2Hq5VxkE.jpg',
    overview: tv.overview || 'A famous celebrity is about to lose her lucrative video game brand deal. Will her former crush help her become a gaming champion – and might this lead to romance?',
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Romance',
    director: 'Wang Zhi',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2021',
        episodesCount: episodes.length,
        poster: 'https://image.tmdb.org/t/p/w500/oL1FhXHsDs7yFPEnlooY9fGgaNA.jpg',
        episodes
      }
    ]
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Remove any previous matching entry
    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID}`;
      const titleMatch = s.title && s.title.toLowerCase().includes('you are my glory');
      return !idMatch && !titleMatch;
    });

    // Add at beginning of series list
    content.series.unshift(glorySeries);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added You Are My Glory [Hindi] with all 32 episodes!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
