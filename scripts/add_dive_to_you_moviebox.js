/**
 * FOBS TV - Dive into You / Dive to You K-Drama Ingestion
 * - TMDB TV ID: 316197 (Dive into You / 너에게 다이브, 2026)
 * - MovieBox Subject IDs:
 *     - 3870036899930730728 (dive-to-you-G56UVRdOSB4) -> Ep 1-8 Full 1080p/720p HD Original Korean Audio
 *     - 1932866268428649968 (dive-to-you-hindi-mHK7tzYxMi2) -> Ep 1 Hindi Dub
 * - Features:
 *     - Dual Audio Tracks: 'Original audio' (Korean 1080p HD) & 'Hindi dub'
 *     - Auto-Renewing MovieBox streaming proxy endpoints
 *     - Multi-server failover
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 316197;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_HINDI = '1932866268428649968';
const DETAIL_PATH_HINDI = 'dive-to-you-hindi-mHK7tzYxMi2';

const SUBJECT_ID_FULL = '3870036899930730728';
const DETAIL_PATH_FULL = 'dive-to-you-G56UVRdOSB4';

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
  console.log('Dive into You / Dive to You - Original Audio & Hindi Dub Ingestion');
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

  // 3. Build Episodes for Season 1 (8 episodes released)
  console.log('\n⚡ Fetching MovieBox streams for Season 1 (8 episodes)...');
  const episodes = [];

  for (let i = 0; i < 8; i++) {
    const epNum = i + 1;
    const tmdbEp = tmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of Dive into You.`,
      still_path: null,
      runtime: 60
    };

    // Download from full HD subject (Original Audio - Korean 1080p/720p)
    const mb = await fetchEpisodeDownload(SUBJECT_ID_FULL, DETAIL_PATH_FULL, 1, epNum);
    // If ep 1, also check dedicated Hindi subject
    let mbHindi = null;
    if (epNum === 1) {
      mbHindi = await fetchEpisodeDownload(SUBJECT_ID_HINDI, DETAIL_PATH_HINDI, 1, 1);
    }

    const servers = [];
    const autoRenewingOrig = `/api/moviebox/stream?id=${SUBJECT_ID_FULL}&se=1&ep=${epNum}`;
    const autoRenewingHindi = `/api/moviebox/stream?id=${SUBJECT_ID_HINDI}&se=1&ep=${epNum}`;
    const primaryStreamUrl = autoRenewingOrig;

    if (epNum === 1) {
      // Ep 1: Both Original Audio and Hindi Dub available
      servers.push({
        name: 'Server 1 (Original Audio - Auto-Renewing 1080p HD)',
        url: autoRenewingOrig,
        isDirect: true,
        quality: '1080p',
        audio: 'Original audio'
      });

      servers.push({
        name: 'Server 2 (Hindi Dub - Auto-Renewing 480p SD)',
        url: autoRenewingHindi,
        isDirect: true,
        quality: '480p',
        audio: 'Hindi dub'
      });

      if (mb?.best?.url) {
        servers.push({
          name: 'Server 3 (Original Audio - Direct CDN)',
          url: mb.best.url,
          isDirect: true,
          quality: '1080p',
          audio: 'Original audio'
        });
      }

      if (mbHindi?.best?.url) {
        servers.push({
          name: 'Server 4 (Hindi Dub - Direct CDN)',
          url: mbHindi.best.url,
          isDirect: true,
          quality: '480p',
          audio: 'Hindi dub'
        });
      }

      if (mb?.qualities) {
        const lower = mb.qualities.find(q => q.resolution < mb.best.resolution);
        if (lower) {
          servers.push({
            name: `Server 5 (MovieBox Fast SD - ${lower.resolution}p)`,
            url: lower.url,
            isDirect: true,
            quality: `${lower.resolution}p`,
            audio: 'Original audio'
          });
        }
      }
    } else {
      // Ep 2 to 8: Original Audio (Korean 1080p/720p Direct)
      const origSizeMB = mb?.best ? Math.round(Number(mb.best.size || 0) / 1024 / 1024) : 800;
      const res = mb?.best?.resolution || 1080;

      servers.push({
        name: `Server 1 (Original Audio - Auto-Renewing ${res}p HD)`,
        url: autoRenewingOrig,
        isDirect: true,
        quality: `${res}p`,
        audio: 'Original audio'
      });

      if (mb?.best?.url) {
        servers.push({
          name: `Server 2 (Original Audio - Direct CDN - ${origSizeMB}MB)`,
          url: mb.best.url,
          isDirect: true,
          quality: `${res}p`,
          audio: 'Original audio'
        });
      }

      if (mb?.qualities) {
        const lower = mb.qualities.find(q => q.resolution < mb.best.resolution);
        if (lower) {
          servers.push({
            name: `Server 3 (MovieBox Fast SD - ${lower.resolution}p)`,
            url: lower.url,
            isDirect: true,
            quality: `${lower.resolution}p`,
            audio: 'Original audio'
          });
        }
      }
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

    const audioTracksMap = {
      'Original audio': autoRenewingOrig,
      'Original Audio': autoRenewingOrig,
      'Korean': autoRenewingOrig,
      'Hindi dub': autoRenewingHindi,
      'Hindi Dub': autoRenewingHindi
    };

    episodes.push({
      number: String(epNum).padStart(2, '0'),
      episode: epNum,
      episodeNumber: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: `${tmdbEp.runtime || 60} min`,
      overview: tmdbEp.overview || `Episode ${epNum} of Dive into You.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/jseW3HucgNjN2CwJa3MiOlF4xMO.jpg',
      stillPath: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : 'https://image.tmdb.org/t/p/w500/jseW3HucgNjN2CwJa3MiOlF4xMO.jpg',
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: audioTracksMap,
      captions: captionList
    });

    const qualName = mb?.best ? `${mb.best.resolution}p` : '1080p';
    console.log(`   ✅ S1 E${epNum}: Original Audio Korean ${qualName} (${servers.length} servers)`);
    await delay(200);
  }

  // Cast
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Lee Jae-wook, Choi Sung-eun, Hong Kyung';

  // 4. Construct Two Series Objects: One for Hindi Dub and One for Original Korean Audio
  const hindiEpisodes = episodes.map(ep => ({
    ...ep,
    streamUrl: `/api/moviebox/stream?id=${SUBJECT_ID_HINDI}&se=1&ep=${ep.number}`,
    servers: [
      {
        name: 'Server 1 (Hindi Dub - Auto-Renewing 480p SD)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_HINDI}&se=1&ep=${ep.number}`,
        isDirect: true,
        quality: '480p',
        audio: 'Hindi dub'
      },
      {
        name: 'Server 2 (Original Audio - Auto-Renewing 1080p HD)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_FULL}&se=1&ep=${ep.number}`,
        isDirect: true,
        quality: '1080p',
        audio: 'Original audio'
      },
      ...(ep.servers ? ep.servers.filter(s => !s.name.includes('Server 1') && !s.name.includes('Server 2')) : [])
    ]
  }));

  const seriesObjHindi = {
    id: `mb-s-${SUBJECT_ID_HINDI}`,
    subjectId: SUBJECT_ID_HINDI,
    hindiSubjectId: SUBJECT_ID_HINDI,
    tmdbId: TMDB_TV_ID,
    title: 'Dive into You [Hindi]',
    altTitle: 'Dive to You [Hindi Dub]',
    originalTitle: '너에게 다이브 (Dive to You - Hindi Dub)',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2026',
    releaseDate: tv.first_air_date || '2026-09-26',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.4'),
    imdbRating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.4'),
    votes: String(tv.vote_count || '95'),
    duration: '8 Episodes',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'Hindi Dubbed',
    badgeRight: 'K-Drama',
    tag: 'Hindi Dub',
    dubLanguage: 'Hindi Dubbed (Dual Audio)',
    audioTracks: ['Hindi dub', 'Original audio'],
    selectedAudio: 'Hindi dub',
    streamUrl: hindiEpisodes[0].streamUrl,
    servers: hindiEpisodes[0].servers,
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/6OAuQOGqjYY1JXbkTlWz4Mm2Kmi.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/jseW3HucgNjN2CwJa3MiOlF4xMO.jpg',
    overview: tv.overview || "An actress and her twin brother slip through time – and swap bodies – to save their friend's life.",
    description: tv.overview || "An actress and her twin brother slip through time – and swap bodies – to save their friend's life.",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Sci-Fi & Fantasy, K-Drama',
    director: 'Kim Jin-min',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2026',
        episodesCount: hindiEpisodes.length,
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/6OAuQOGqjYY1JXbkTlWz4Mm2Kmi.jpg',
        episodes: hindiEpisodes
      }
    ],
    episodes: hindiEpisodes,
    type: 'series',
    addedAt: new Date().toISOString()
  };

  const origEpisodes = episodes.map(ep => ({
    ...ep,
    streamUrl: `/api/moviebox/stream?id=${SUBJECT_ID_FULL}&se=1&ep=${ep.number}`,
    servers: [
      {
        name: 'Server 1 (Original Audio - Auto-Renewing 1080p HD)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_FULL}&se=1&ep=${ep.number}`,
        isDirect: true,
        quality: '1080p',
        audio: 'Original audio'
      },
      {
        name: 'Server 2 (Hindi Dub - Auto-Renewing 480p SD)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID_HINDI}&se=1&ep=${ep.number}`,
        isDirect: true,
        quality: '480p',
        audio: 'Hindi dub'
      },
      ...(ep.servers ? ep.servers.filter(s => !s.name.includes('Server 1') && !s.name.includes('Server 2')) : [])
    ]
  }));

  const seriesObjOriginal = {
    id: `mb-s-${SUBJECT_ID_FULL}`,
    subjectId: SUBJECT_ID_FULL,
    hindiSubjectId: SUBJECT_ID_HINDI,
    tmdbId: TMDB_TV_ID,
    title: 'Dive into You [Original Audio]',
    altTitle: 'Dive to You [Korean]',
    originalTitle: '너에게 다이브 (Dive to You - Original)',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2026',
    releaseDate: tv.first_air_date || '2026-09-26',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.4'),
    imdbRating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.4'),
    votes: String(tv.vote_count || '95'),
    duration: '8 Episodes',
    category: 'Korean Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'Original Audio',
    badgeRight: 'Korean HD',
    tag: 'Original Audio',
    dubLanguage: 'Original Korean Audio (Dual Audio)',
    audioTracks: ['Original audio', 'Hindi dub'],
    selectedAudio: 'Original audio',
    streamUrl: origEpisodes[0].streamUrl,
    servers: origEpisodes[0].servers,
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/6OAuQOGqjYY1JXbkTlWz4Mm2Kmi.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/original/jseW3HucgNjN2CwJa3MiOlF4xMO.jpg',
    overview: tv.overview || "An actress and her twin brother slip through time – and swap bodies – to save their friend's life.",
    description: tv.overview || "An actress and her twin brother slip through time – and swap bodies – to save their friend's life.",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Sci-Fi & Fantasy, K-Drama',
    director: 'Kim Jin-min',
    cast: castList,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2026',
        episodesCount: origEpisodes.length,
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/6OAuQOGqjYY1JXbkTlWz4Mm2Kmi.jpg',
        episodes: origEpisodes
      }
    ],
    episodes: origEpisodes,
    type: 'series',
    addedAt: new Date().toISOString()
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    content.series = content.series.filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID_HINDI}` || s.id === `mb-s-${SUBJECT_ID_FULL}`;
      const titleMatch = s.title && (s.title.toLowerCase().includes('dive to you') || s.title.toLowerCase().includes('dive into you'));
      const origMatch = s.originalTitle && s.originalTitle.includes('너에게 다이브');
      return !idMatch && !titleMatch && !origMatch;
    });

    content.series.unshift(seriesObjOriginal);
    content.series.unshift(seriesObjHindi);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`💾 Replaced entry in: ${filePath}`);
  }

  console.log('\n🎉 Successfully updated Dive into You with both Hindi Dubbed and Original Audio versions!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
