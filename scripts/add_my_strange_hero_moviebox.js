/**
 * FOBS TV - My Strange Hero [Hindi] K-Drama Ingestion
 * - TMDB TV ID: 84464 (My Strange Hero / 복수가 돌아왔다, 2018)
 * - MovieBox Subject ID: 1395930250630021944
 * - MovieBox Detail Path: my-strange-hero-hindi-MsGxeSgn7F1
 * - Total 16 Episodes in 720p HD MovieBox Direct Streams
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 84464;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '1395930250630021944';
const DETAIL_PATH = 'my-strange-hero-hindi-MsGxeSgn7F1';

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
  console.log('My Strange Hero [Hindi] - TMDB & MovieBox Ingestion');
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
  console.log(`   Found ${tmdbEpisodes.length} half-hour episodes on TMDB (maps to 16 full episodes).`);

  // 3. Build Season 1 Episodes (16 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (16 episodes)...');
  const episodes = [];

  for (let i = 0; i < 16; i++) {
    const epNum = i + 1;
    // Map to TMDB 2-part index
    const tmdbIdx = (epNum - 1) * 2;
    const tmdbEp = tmdbEpisodes[tmdbIdx] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of My Strange Hero.`,
      still_path: null,
      runtime: 60
    };

    const mb = await fetchEpisodeDownload(1, epNum);
    const servers = [];
    let primaryStreamUrl = '';

    if (mb && mb.best) {
      primaryStreamUrl = mb.best.url;
      const sizeMB = Math.round(Number(mb.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox ${mb.best.resolution}p Hindi Direct - ${sizeMB}MB)`,
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
      title: tmdbEp.name && !tmdbEp.name.startsWith('Episode') ? tmdbEp.name : `Episode ${epNum}`,
      duration: '60 min',
      overview: tmdbEp.overview || `Episode ${epNum} of My Strange Hero.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/mjMkTMbWxma8A2Z9OFhTbvetOLO.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi'],
      captions: captionList
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : 'embed';
    console.log(`   ✅ S1 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(200);
  }

  // Cast
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Yoo Seung-ho, Cho Bo-ah, Kwak Dong-yeon, Kim Dong-young, Park Ah-in, Cheon Ho-jin';

  // 4. Construct Series Object
  const seriesObj = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    tmdbId: TMDB_TV_ID,
    title: 'My Strange Hero [Hindi]',
    originalTitle: tv.original_name || '복수가 돌아왔다',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2018',
    releaseDate: tv.first_air_date || '2018-12-10',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '7.8'),
    votes: String(tv.vote_count || '120'),
    duration: '16 Episodes',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/ld6bkaFwnYsm7emwZnhsjPXYbo4.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/mjMkTMbWxma8A2Z9OFhTbvetOLO.jpg',
    overview: tv.overview || 'When Kang Bok-soo was a high school student, he was falsely accused of committing violence and kicked out of school. Years later as an adult, he returns to the high school to get revenge, but gets entangled in unexpected situations.',
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Romance, K-Drama',
    director: 'Ham Joon-ho',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2018',
        episodesCount: episodes.length,
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/ld6bkaFwnYsm7emwZnhsjPXYbo4.jpg',
        episodes
      }
    ]
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID}`;
      const titleMatch = s.title && s.title.toLowerCase().includes('strange hero');
      return !idMatch && !titleMatch;
    });

    content.series.unshift(seriesObj);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added My Strange Hero [Hindi] with all 16 episodes!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
