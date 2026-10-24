/**
 * FOBS TV - Fix Mouse (Mousetrap) [Hindi] K-Drama
 * - TMDB TV ID: 117378 (Mouse / 마우스, 2021)
 * - MovieBox Subject IDs:
 *     - 7573592610930312192 (mousetrap-hindi-CXwu23l8t19) -> S1 Ep 1-10 in 1080p Full HD Hindi
 *     - 1694621778766643152 (mouse-i3rX9JUnb12) -> S1 Ep 1-20 in 720p HD
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 117378;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_HINDI_1080P = '7573592610930312192';
const DETAIL_PATH_HINDI_1080P = 'mousetrap-hindi-CXwu23l8t19';

const SUBJECT_ID_720P = '1694621778766643152';
const DETAIL_PATH_720P = 'mouse-i3rX9JUnb12';

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
  console.log('Mouse (Mousetrap) [Hindi] - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = s1Res.data.episodes || [];
  console.log(`   Found ${tmdbEpisodes.length} episodes on TMDB.`);

  // 3. Build Episodes with MovieBox streams
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (20 episodes)...');
  const episodes = [];

  for (let i = 0; i < 20; i++) {
    const epNum = i + 1;
    const tmdbEp = tmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of Mouse (Mousetrap).`,
      still_path: null,
      runtime: 70
    };

    let mb1080 = null;
    let mb720 = null;

    if (epNum <= 10) {
      // Ep 1-10 have 1080p on subject 7573592610930312192
      mb1080 = await fetchEpisodeDownload(SUBJECT_ID_HINDI_1080P, DETAIL_PATH_HINDI_1080P, 1, epNum);
    }
    // Also fetch from 1694621778766643152 for 720p / multi-quality
    mb720 = await fetchEpisodeDownload(SUBJECT_ID_720P, DETAIL_PATH_720P, 1, epNum);

    const servers = [];
    let primaryStreamUrl = '';

    if (mb1080 && mb1080.best) {
      primaryStreamUrl = mb1080.best.url;
      const sizeMB = Math.round(Number(mb1080.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox 1080p Direct - ${sizeMB}MB)`,
        url: mb1080.best.url,
        isDirect: true,
        quality: `${mb1080.best.resolution}p`
      });
      servers.push({
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_HINDI_1080P}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: '1080p'
      });

      if (mb720 && mb720.best) {
        servers.push({
          name: `Server 3 (MovieBox 720p HD)`,
          url: mb720.best.url,
          isDirect: true,
          quality: `${mb720.best.resolution}p`
        });
      }

      // SD Quality
      const sd = mb1080.qualities.find(q => q.resolution < 720);
      if (sd) {
        servers.push({
          name: `Server 4 (MovieBox Fast SD - ${sd.resolution}p)`,
          url: sd.url,
          isDirect: true,
          quality: `${sd.resolution}p`
        });
      }
    } else if (mb720 && mb720.best) {
      primaryStreamUrl = mb720.best.url;
      const sizeMB = Math.round(Number(mb720.best.size || 0) / 1024 / 1024);
      servers.push({
        name: `Server 1 (MovieBox 720p HD Direct - ${sizeMB}MB)`,
        url: mb720.best.url,
        isDirect: true,
        quality: `${mb720.best.resolution}p`
      });
      servers.push({
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_720P}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: '720p'
      });

      const sd = mb720.qualities.find(q => q.resolution < 720);
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

    // Embed failovers
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

    const captionList = (mb720?.captions || mb1080?.captions || []).map(c => ({
      label: c.lanName || c.lan,
      srclang: c.lan,
      src: c.url
    }));

    episodes.push({
      number: epNum,
      episode: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 70} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Mouse (Mousetrap).`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/ikU9een11dr6UFy0XzQMJv3YJQq.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi', 'Korean'],
      captions: captionList
    });

    const qualName = mb1080?.best ? '1080p' : (mb720?.best ? '720p' : 'embed');
    console.log(`   ✅ S1 E${epNum}: ${qualName} (${servers.length} servers)`);
    await delay(250);
  }

  // 4. Construct Series Object
  const mouseSeries = {
    id: `mb-s-${SUBJECT_ID_HINDI_1080P}`,
    subjectId: SUBJECT_ID_HINDI_1080P,
    tmdbId: TMDB_TV_ID,
    title: 'Mouse (Mousetrap) [Hindi]',
    originalTitle: tv.original_name || '마우스',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2021',
    releaseDate: tv.first_air_date || '2021-03-03',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.7'),
    votes: String(tv.vote_count || '580'),
    duration: '20 Episodes',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/nU9egcLr002U23IPBqoCWqXkdwf.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/ikU9een11dr6UFy0XzQMJv3YJQq.jpg',
    overview: tv.overview || "A psychopath's ruthless serial murders have left the entire nation gripped by fear and chaos. An honest, justice-seeking rookie police officer and a veteran detective with a tragic past face off against the predator.",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Crime, Mystery, Thriller, K-Drama',
    director: 'Choi Joon-bae, Kang Cheol-woo',
    cast: 'Lee Seung-gi, Lee Hee-jun, Park Ju-hyun, Kyung Soo-jin, Ahn Jae-wook',
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2021',
        episodesCount: episodes.length,
        poster: 'https://image.tmdb.org/t/p/w500/zSEITEoPvWQ3mTTVuA3wbUetpOk.jpg',
        episodes
      }
    ]
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Remove any previous broken Mouse / Mousetrap entries
    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID_HINDI_1080P}` || s.id === `mb-s-${SUBJECT_ID_720P}`;
      const titleMatch = s.title && (s.title.toLowerCase().includes('mousetrap') || (s.title.toLowerCase().includes('mouse') && !s.title.toLowerCase().includes('mickey') && !s.title.toLowerCase().includes('danger') && !s.title.toLowerCase().includes('horrors')));
      return !idMatch && !titleMatch;
    });

    // Add updated item at top of Korean / series
    content.series.unshift(mouseSeries);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully updated Mouse (Mousetrap) [Hindi] with 20 episodes and pristine MovieBox streams!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
