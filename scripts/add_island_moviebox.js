/**
 * FOBS TV - Island [Hindi] K-Drama Ingestion
 * - TMDB TV ID: 211747 (Island / 아일랜드, 2022)
 * - MovieBox Subject IDs:
 *     - 2154607436987001256 (island-hindi-ws8SXbK7az2) -> 12 Episodes in 720p HD Hindi
 *     - 5551081490894708744 (island-UgoeMAK04C6) -> 1080p Full HD alternate
 * - Total 12 Episodes
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 211747;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_HINDI = '2154607436987001256';
const DETAIL_PATH_HINDI = 'island-hindi-ws8SXbK7az2';

const SUBJECT_ID_1080P = '5551081490894708744';
const DETAIL_PATH_1080P = 'island-UgoeMAK04C6';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(subjectId, detailPath, se, ep, retries = 5) {
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
  console.log('Island [Hindi] - TMDB & MovieBox Ingestion');
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

  // 3. Build Season 1 Episodes (12 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (12 episodes)...');
  const episodes = [];

  for (let i = 0; i < 12; i++) {
    const epNum = i + 1;
    const tmdbEp = tmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of Island.`,
      still_path: null,
      runtime: 50
    };

    const mbHindi = await fetchEpisodeDownload(SUBJECT_ID_HINDI, DETAIL_PATH_HINDI, 1, epNum);
    const mb1080 = await fetchEpisodeDownload(SUBJECT_ID_1080P, DETAIL_PATH_1080P, 1, epNum);

    const servers = [];
    let primaryStreamUrl = '';

    if (mbHindi && mbHindi.best) {
      primaryStreamUrl = mbHindi.best.url;
      const sizeMB = Math.round(Number(mbHindi.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox ${mbHindi.best.resolution}p Hindi Direct - ${sizeMB}MB)`,
        url: mbHindi.best.url,
        isDirect: true,
        quality: `${mbHindi.best.resolution}p`
      });
      servers.push({
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_HINDI}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: `${mbHindi.best.resolution}p`
      });

      if (mb1080 && mb1080.best && mb1080.best.resolution >= 720) {
        const altSizeMB = Math.round(Number(mb1080.best.size || 0) / 1024 / 1024);
        servers.push({
          name: `Server 3 (MovieBox ${mb1080.best.resolution}p HD Multi - ${altSizeMB}MB)`,
          url: mb1080.best.url,
          isDirect: true,
          quality: `${mb1080.best.resolution}p`
        });
      }

      const lower = mbHindi.qualities.find(q => q.resolution < mbHindi.best.resolution);
      if (lower) {
        servers.push({
          name: `Server ${servers.length + 1} (MovieBox Fast SD - ${lower.resolution}p)`,
          url: lower.url,
          isDirect: true,
          quality: `${lower.resolution}p`
        });
      }
    } else if (mb1080 && mb1080.best) {
      primaryStreamUrl = mb1080.best.url;
      const sizeMB = Math.round(Number(mb1080.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox ${mb1080.best.resolution}p Direct - ${sizeMB}MB)`,
        url: mb1080.best.url,
        isDirect: true,
        quality: `${mb1080.best.resolution}p`
      });
      servers.push({
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_1080P}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: `${mb1080.best.resolution}p`
      });
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

    const captionList = (mb1080?.captions || mbHindi?.captions || []).map(c => ({
      label: c.lanName || c.lan,
      srclang: c.lan,
      src: c.url
    }));

    episodes.push({
      number: epNum,
      episode: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 50} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Island.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/vtdpgm0QR4RDB3tQFIdpYG4QE16.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi', 'Korean'],
      captions: captionList
    });

    const qualName = mbHindi?.best ? `${mbHindi.best.resolution}p` : (mb1080?.best ? `${mb1080.best.resolution}p` : 'embed');
    console.log(`   ✅ S1 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(200);
  }

  // Cast
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Kim Nam-gil, Lee Da-hee, Cha Eun-woo, Sung Joon, Heo Jung-hee, Goh Doo-shim';

  // 4. Construct Series Object
  const seriesObj = {
    id: `mb-s-${SUBJECT_ID_HINDI}`,
    subjectId: SUBJECT_ID_HINDI,
    tmdbId: TMDB_TV_ID,
    title: 'Island [Hindi]',
    originalTitle: tv.original_name || '아일랜드',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2022',
    releaseDate: tv.first_air_date || '2022-12-30',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.1'),
    votes: String(tv.vote_count || '150'),
    duration: '12 Episodes',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/bpoDjjcj6vE7k9xH14wb13UMYqi.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/vtdpgm0QR4RDB3tQFIdpYG4QE16.jpg',
    overview: tv.overview || 'Evil took its first step to destroy the world. On the mysterious island of Jeju Island, the gateway to this, Van, a mix of human and monster, Won Mi-ho, the one in the center of fate, and Johan, the one who exercises God’s power, come together.',
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Action & Adventure, Sci-Fi & Fantasy, Mystery, K-Drama',
    director: 'Bae Jong',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2022',
        episodesCount: episodes.length,
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/bpoDjjcj6vE7k9xH14wb13UMYqi.jpg',
        episodes
      }
    ]
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID_HINDI}` || s.id === `mb-s-${SUBJECT_ID_1080P}`;
      const titleMatch = s.title && s.title.toLowerCase() === 'island [hindi]';
      return !idMatch && !titleMatch;
    });

    content.series.unshift(seriesObj);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added Island [Hindi] with all 12 episodes!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
