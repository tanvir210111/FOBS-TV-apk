/**
 * FOBS TV - VisionQuest [Hindi] (2026) MovieBox & TMDB Ingestion
 * 
 * - TMDB TV ID: 213375 (VisionQuest, 2026)
 * - MovieBox Subject ID: 3908280950886646112
 * - MovieBox Detail Path: visionquest-hindi-0qVaGP1YHE4
 * - 1080p Full HD Hindi Dubbed Episodes with Multi-Server Failover
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 213375;
const SUBJECT_ID = '3908280950886646112';
const DETAIL_PATH = 'visionquest-hindi-0qVaGP1YHE4';
const BASE_URL = 'https://h5.aoneroom.com';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(subjectId, detailPath, se, ep, retries = 4) {
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
        timeout: 12000
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
        await delay(800 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('VisionQuest [Hindi] (2026) - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching VisionQuest from TMDB (TV ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits,images' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 metadata from TMDB...');
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = s1Res.data.episodes || [];
  console.log(`   Found ${tmdbEpisodes.length} episodes on TMDB.`);

  // 3. Resolve MovieBox streams
  console.log('\n📥 Resolving MovieBox stream servers for episodes...');
  const episodesList = [];

  for (let epNum = 1; epNum <= 8; epNum++) {
    const mb = await fetchEpisodeDownload(SUBJECT_ID, DETAIL_PATH, 1, epNum);
    if (!mb || !mb.best?.url) {
      console.log(`   Episode ${epNum}: No more episodes available on MovieBox (total ready: ${episodesList.length}).`);
      break;
    }

    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === epNum);
    const epTitle = tmdbEp?.name ? tmdbEp.name : `Episode ${epNum}`;
    const epOverview = tmdbEp?.overview || `Watch VisionQuest Episode ${epNum} in 1080p Full HD Hindi Dubbed.`;
    const epDuration = tmdbEp?.runtime ? `${tmdbEp.runtime} min` : '50 min';
    const epStill = tmdbEp?.still_path
      ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}`
      : (tv.backdrop_path ? `https://image.tmdb.org/t/p/w500${tv.backdrop_path}` : 'https://image.tmdb.org/t/p/w500/uoXXbN2PrOxH6UKyP7kYwmGpAAP.jpg');

    const primaryStream = mb.best.url;
    const mbSizeMb = mb.best.size ? Math.round(mb.best.size / 1024 / 1024) : null;
    const sizeStr = mbSizeMb ? ` - ${mbSizeMb}MB` : '';

    const servers = [
      {
        name: `Server 1 (MovieBox ${mb.best.resolution}p Hindi Direct${sizeStr})`,
        url: primaryStream,
        isDirect: true,
        quality: `${mb.best.resolution}p`
      },
      {
        name: 'Server 2 (Auto-Renewing MovieBox Stream)',
        url: `/api/moviebox/stream?id=${SUBJECT_ID}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: `${mb.best.resolution}p`
      }
    ];

    if (mb.qualities.length > 1) {
      const secondBest = mb.qualities[1];
      const secondMb = secondBest.size ? Math.round(secondBest.size / 1024 / 1024) : null;
      servers.push({
        name: `Server 3 (MovieBox SD - ${secondBest.resolution}p${secondMb ? ` - ${secondMb}MB` : ''})`,
        url: secondBest.url,
        isDirect: true,
        quality: `${secondBest.resolution}p`
      });
    }

    // Failover multi-embeds
    servers.push(
      {
        name: 'Server 4 (MultiEmbed HD Failover)',
        url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 5 (AutoEmbed HD)',
        url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID}/1/${epNum}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 6 (Vidlink Fast HD)',
        url: `https://vidlink.pro/tv/${TMDB_TV_ID}/1/${epNum}`,
        isDirect: false,
        quality: '1080p'
      }
    );

    const captions = (mb.captions || []).map(c => ({
      language: c.language || c.lan || 'en',
      url: c.url
    }));

    episodesList.push({
      number: epNum,
      episode: epNum,
      season: 1,
      title: epTitle,
      duration: epDuration,
      overview: epOverview,
      still: epStill,
      streamUrl: primaryStream,
      servers,
      audioTracks: ['Hindi'],
      captions
    });

    console.log(`   ✅ S1 E${epNum}: ${mb.best.resolution}p (${servers.length} stream servers configured)`);
    await delay(120);
  }

  // Cast
  const castList = (tv.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'Paul Bettany, James Spader, Ruaridh Mollica, Todd Stashwick, Lauren Morais, Orla Brady';

  // TMDB high-res backdrop/cover
  const backdropUrl = tv.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/uoXXbN2PrOxH6UKyP7kYwmGpAAP.jpg';
  const posterUrl = tv.poster_path
    ? `https://image.tmdb.org/t/p/w500${tv.poster_path}`
    : 'https://image.tmdb.org/t/p/w500/xK27l5uwaVyZSlENWnmLlWwDQNS.jpg';

  // 4. Construct VisionQuest Series Object
  const seriesObj = {
    id: `mb-s-${SUBJECT_ID}`,
    subjectId: SUBJECT_ID,
    tmdbId: TMDB_TV_ID,
    title: 'VisionQuest [Hindi]',
    originalTitle: tv.original_name || 'VisionQuest',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2026',
    releaseDate: tv.first_air_date || '2026-10-13',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '8.8'),
    votes: String(tv.vote_count || '168'),
    duration: `1 Season (${episodesList.length} Episodes)`,
    category: 'Hollywood (Dubbed) Series',
    industry: 'Hollywood',
    country: 'United States',
    badgeLeft: 'Marvel',
    badgeRight: 'Hindi Dub',
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    overview: tv.overview || "With a bounty on his head, Vision must confront his nature and resist Ultron's influence as he searches for a new purpose in the world.",
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Sci-Fi & Fantasy, Action, Drama',
    director: 'Terry Matalas',
    cast: castList,
    isOngoing: true,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2026',
        episodesCount: episodesList.length,
        poster: posterUrl,
        episodes: episodesList
      }
    ]
  };

  // 5. Update across catalog files
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) continue;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Remove if already present
    content.series = (content.series || []).filter(s => {
      const idMatch = s.id === `mb-s-${SUBJECT_ID}` || s.tmdbId === TMDB_TV_ID;
      const titleMatch = s.title && s.title.toLowerCase().includes('visionquest');
      return !idMatch && !titleMatch;
    });

    // Unshift to the very top (index 0)
    content.series.unshift(seriesObj);

    // Also update featured spotlight to VisionQuest with 4K TMDB cover photo
    content.featured = seriesObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`💾 Updated entry in: ${filePath}`);
  }

  console.log(`\n🎉 Successfully added VisionQuest [Hindi] (2026) with ${episodesList.length} full episodes and TMDB 4K cover photo!`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
