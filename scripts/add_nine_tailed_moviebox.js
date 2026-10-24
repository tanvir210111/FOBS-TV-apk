/**
 * FOBS TV - Tale of the Nine Tailed [Hindi] K-Drama Ingestion
 * - TMDB TV ID S1: 108284 (Tale of the Nine Tailed / 구미호뎐, 2020) - 16 Episodes
 * - TMDB TV ID S2: 201019 (Tale of the Nine Tailed 1938, 2023) - 12 Episodes
 * - MovieBox S1 Subject: 637731293849080088 (tale-of-the-nine-tailed-hindi-GfVHu3BO6L) -> 1080p Full HD Hindi
 * - MovieBox S2 Subject: 3104610972405746824 (tale-of-the-nine-tailed-S9Jo5bn9lH3)
 * - Total 2 Seasons (28 Episodes)
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID_S1 = 108284;
const TMDB_TV_ID_S2 = 201019;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_S1 = '637731293849080088';
const DETAIL_PATH_S1 = 'tale-of-the-nine-tailed-hindi-GfVHu3BO6L';

const SUBJECT_ID_S2 = '3104610972405746824';
const DETAIL_PATH_S2 = 'tale-of-the-nine-tailed-S9Jo5bn9lH3';

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
  console.log('Tale of the Nine Tailed [Hindi] - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID_S1})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID_S1}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID_S1}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const s1TmdbEpisodes = s1Res.data.episodes || [];
  console.log(`   Found ${s1TmdbEpisodes.length} episodes for Season 1 on TMDB.`);

  // 3. Fetch Season 2 episodes from TMDB
  console.log('📋 Fetching Season 2 (1938) episodes from TMDB...');
  let s2TmdbEpisodes = [];
  try {
    const s2Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID_S2}/season/1`, {
      params: { api_key: TMDB_API_KEY }
    });
    s2TmdbEpisodes = s2Res.data.episodes || [];
    console.log(`   Found ${s2TmdbEpisodes.length} episodes for Season 2 on TMDB.`);
  } catch(e) {
    console.log('   Season 2 TMDB error:', e.message);
  }

  // 4. Build Season 1 Episodes (16 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (16 episodes)...');
  const s1Episodes = [];

  for (let i = 0; i < 16; i++) {
    const epNum = i + 1;
    const tmdbEp = s1TmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of Tale of the Nine Tailed.`,
      still_path: null,
      runtime: 70
    };

    const mb = await fetchEpisodeDownload(SUBJECT_ID_S1, DETAIL_PATH_S1, 1, epNum);
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
        url: `/api/moviebox/stream?id=${SUBJECT_ID_S1}&se=1&ep=${epNum}`,
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
      primaryStreamUrl = `https://multiembed.mov/?video_id=${TMDB_TV_ID_S1}&s=1&e=${epNum}`;
    }

    const srvOffset = servers.length + 1;
    servers.push({
      name: `Server ${srvOffset} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID_S1}&s=1&e=${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 1} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID_S1}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 2} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID_S1}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });

    s1Episodes.push({
      number: epNum,
      episode: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 70} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Tale of the Nine Tailed.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/oPJQvS8Xyg7chAX0jQoC2smqMxv.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi'],
      captions: []
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : 'embed';
    console.log(`   ✅ S1 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(150);
  }

  // 5. Build Season 2 Episodes (12 episodes)
  console.log('\n⚡ Fetching MovieBox streams for Season 2 (12 episodes)...');
  const s2Episodes = [];

  for (let i = 0; i < 12; i++) {
    const epNum = i + 1;
    const tmdbEp = s2TmdbEpisodes[i] || {
      name: `Chapter ${epNum}`,
      overview: `Episode ${epNum} of Tale of the Nine Tailed 1938.`,
      still_path: null,
      runtime: 70
    };

    const mb = await fetchEpisodeDownload(SUBJECT_ID_S2, DETAIL_PATH_S2, 2, epNum);
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
        url: `/api/moviebox/stream?id=${SUBJECT_ID_S2}&se=2&ep=${epNum}`,
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
      primaryStreamUrl = `https://multiembed.mov/?video_id=${TMDB_TV_ID_S2}&s=1&e=${epNum}`;
    }

    const srvOffset = servers.length + 1;
    servers.push({
      name: `Server ${srvOffset} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID_S2}&s=1&e=${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 1} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID_S2}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${srvOffset + 2} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID_S2}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });

    s2Episodes.push({
      number: epNum,
      episode: epNum,
      season: 2,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 70} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Tale of the Nine Tailed 1938.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/oPJQvS8Xyg7chAX0jQoC2smqMxv.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi', 'Korean'],
      captions: []
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : 'embed';
    console.log(`   ✅ S2 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(150);
  }

  // Cast
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Lee Dong-wook, Cho Bo-ah, Kim Bum, Kim Yong-ji, Hwang Hee, Kim Jung-nan';

  // 6. Construct Series Object
  const seriesObj = {
    id: `mb-s-${SUBJECT_ID_S1}`,
    subjectId: SUBJECT_ID_S1,
    tmdbId: TMDB_TV_ID_S1,
    title: 'Tale of the Nine Tailed [Hindi]',
    originalTitle: tv.original_name || '구미호뎐',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2020',
    releaseDate: tv.first_air_date || '2020-10-07',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.4'),
    votes: String(tv.vote_count || '210'),
    duration: '2 Seasons (28 Episodes)',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/v7VEIX1yOcFWY17eUprNhAS9xEp.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/oPJQvS8Xyg7chAX0jQoC2smqMxv.jpg',
    cover: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/oPJQvS8Xyg7chAX0jQoC2smqMxv.jpg',
    overview: tv.overview || "A TV producer discovers a secret supernatural world as she becomes entangled with a former mountain deity who's spent centuries searching for the reincarnation of his lost first love.",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Drama, Fantasy, Romance, K-Drama',
    director: 'Kang Shin-hyo, Jo Nam-hyung',
    cast: castList,
    seasonsCount: 2,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2020',
        episodesCount: s1Episodes.length,
        poster: 'https://image.tmdb.org/t/p/w500/qtv8q4D31szm3Iw8eUF3VFda0Sc.jpg',
        episodes: s1Episodes
      },
      {
        seasonNumber: 2,
        title: 'Season 2 (1938)',
        name: 'Season 2 (1938)',
        year: '2023',
        episodesCount: s2Episodes.length,
        poster: 'https://image.tmdb.org/t/p/w500/v7VEIX1yOcFWY17eUprNhAS9xEp.jpg',
        episodes: s2Episodes
      }
    ]
  };

  // 7. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID_S1}` || s.id === `mb-s-${SUBJECT_ID_S2}`;
      const titleMatch = s.title && s.title.toLowerCase().includes('nine tailed');
      return !idMatch && !titleMatch;
    });

    content.series.unshift(seriesObj);

    // Also update featured spotlight to Tale of the Nine Tailed with TMDB cover photo
    content.featured = seriesObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully added Tale of the Nine Tailed [Hindi] with 2 full seasons (28 episodes)!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
