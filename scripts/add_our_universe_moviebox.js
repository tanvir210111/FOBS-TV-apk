/**
 * FOBS TV - Our Universe [Hindi] (2026) MovieBox & TMDB Ingestion
 * 
 * - TMDB TV ID: 297424 (Our Universe / 우주를 줄게, 2026)
 * - MovieBox Subject ID: 4332534660363340496
 * - MovieBox Detail Path: our-universe-hindi-ez8xLio33a5
 * - Fallback Subject ID: 6415467904841960144 (our-universe-I87DR8uUUD7)
 * - 12 Episodes with 1080p/720p Full HD Hindi Dubbed Streams & Multi-Server Failover
 * - Stars: Bae In-hyuk, Roh Jeong-eui, Park Seo-ham, Ku Sung-hwan, Choi Gyu-ri
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 297424;
const PRIMARY_SUBJECT_ID = '4332534660363340496';
const PRIMARY_DETAIL_PATH = 'our-universe-hindi-ez8xLio33a5';
const FALLBACK_SUBJECT_ID = '6415467904841960144';
const FALLBACK_DETAIL_PATH = 'our-universe-I87DR8uUUD7';
const BASE_URL = 'https://h5.aoneroom.com';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(subjectId, detailPath, se, ep, retries = 3) {
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
        subjectId,
        detailPath,
        best: sorted[0],
        qualities: sorted,
        captions: data.captions || []
      };
    } catch (err) {
      if (attempt < retries) {
        await delay(600 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('Our Universe [Hindi] (2026) - MovieBox & TMDB Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV Series Details
  console.log(`🎬 Fetching series details from TMDB (TV ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits,images'
    }
  });
  const tv = tmdbRes.data;

  // 2. Fetch TMDB Season 1 Details
  console.log(`📅 Fetching Season 1 episode details from TMDB...`);
  let tmdbEpisodes = [];
  try {
    const sRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
      params: { api_key: TMDB_API_KEY }
    });
    tmdbEpisodes = sRes.data?.episodes || [];
    console.log(`   Found ${tmdbEpisodes.length} episodes on TMDB Season 1.`);
  } catch (err) {
    console.warn('   Could not fetch TMDB season 1:', err.message);
  }

  // 3. Ingest all 12 episodes from MovieBox
  console.log('\n📥 Ingesting episode download streams from MovieBox...');
  const episodesList = [];
  const TOTAL_EPISODES = 12;

  for (let epNum = 1; epNum <= TOTAL_EPISODES; epNum++) {
    // Try primary Hindi stream
    let mb = await fetchEpisodeDownload(PRIMARY_SUBJECT_ID, PRIMARY_DETAIL_PATH, 1, epNum);

    // If missing (like Ep 8), try fallback subject
    if (!mb) {
      console.log(`   Ep ${epNum}: Primary Hindi missing, falling back to secondary stream...`);
      mb = await fetchEpisodeDownload(FALLBACK_SUBJECT_ID, FALLBACK_DETAIL_PATH, 1, epNum);
    }

    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === epNum) || {};
    const epTitle = tmdbEp.name || `Episode ${epNum}`;
    const epOverview = tmdbEp.overview || tv.overview || `Episode ${epNum} of Our Universe.`;
    const epStill = tmdbEp.still_path
      ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}`
      : (tv.backdrop_path ? `https://image.tmdb.org/t/p/w500${tv.backdrop_path}` : '');
    const epDuration = tmdbEp.runtime ? `${tmdbEp.runtime}m` : '60m';

    let primaryStream = '';
    const servers = [];

    if (mb && mb.best) {
      primaryStream = mb.best.url;
      const sizeMb = mb.best.size ? Math.round(mb.best.size / 1024 / 1024) : null;
      let sIdx = 1;

      servers.push(
        {
          name: `Server ${sIdx++} (MovieBox ${mb.best.resolution}p Direct${sizeMb ? ` - ${sizeMb}MB` : ''})`,
          url: primaryStream,
          isDirect: true,
          quality: `${mb.best.resolution}p`
        },
        {
          name: `Server ${sIdx++} (Auto-Renewing MovieBox Stream)`,
          url: `/api/moviebox/stream?id=${mb.subjectId}&path=${mb.detailPath}&se=1&ep=${epNum}`,
          isDirect: true,
          quality: `${mb.best.resolution}p`
        }
      );

      if (mb.qualities.length > 1) {
        const secondBest = mb.qualities[1];
        const secondMb = secondBest.size ? Math.round(secondBest.size / 1024 / 1024) : null;
        servers.push({
          name: `Server ${sIdx++} (MovieBox SD - ${secondBest.resolution}p${secondMb ? ` - ${secondMb}MB` : ''})`,
          url: secondBest.url,
          isDirect: true,
          quality: `${secondBest.resolution}p`
        });
      }
    } else {
      primaryStream = `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`;
    }

    // Failover multi-embeds
    const currentCount = servers.length;
    servers.push(
      {
        name: `Server ${currentCount + 1} (MultiEmbed HD Failover)`,
        url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: `Server ${currentCount + 2} (AutoEmbed HD)`,
        url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID}/1/${epNum}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: `Server ${currentCount + 3} (Vidlink Fast HD)`,
        url: `https://vidlink.pro/tv/${TMDB_TV_ID}/1/${epNum}`,
        isDirect: false,
        quality: '1080p'
      }
    );

    const captions = ((mb && mb.captions) || []).map(c => ({
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

    console.log(`   ✅ S1 E${epNum}: ${mb ? `${mb.best.resolution}p` : 'Embed'} (${servers.length} servers configured)`);
    await delay(150);
  }

  // Cast array of rich objects
  const castList = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  // TMDB high-res backdrop/cover
  const backdropUrl = tv.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}`
    : 'https://image.tmdb.org/t/p/original/bHv9tTPd0dxpV2OD3WeDoZOFzPQ.jpg';
  const posterUrl = tv.poster_path
    ? `https://image.tmdb.org/t/p/w500${tv.poster_path}`
    : 'https://image.tmdb.org/t/p/w500/d0ZW2r5L8Ma50gvkvSY7BZSE6fb.jpg';

  // 4. Construct Our Universe Series Object
  const seriesObj = {
    id: `mb-s-${PRIMARY_SUBJECT_ID}`,
    subjectId: PRIMARY_SUBJECT_ID,
    detailPath: PRIMARY_DETAIL_PATH,
    tmdbId: TMDB_TV_ID,
    title: 'Our Universe [Hindi]',
    originalTitle: tv.original_name || '우주를 줄게',
    year: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '2026',
    releaseDate: tv.first_air_date || '2026-02-04',
    rating: String(tv.vote_average ? tv.vote_average.toFixed(1) : '7.8'),
    votes: String(tv.vote_count || '120'),
    duration: `1 Season (${episodesList.length} Episodes)`,
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'South Korea',
    badgeLeft: 'Bae In-hyuk',
    badgeRight: '1080p Hindi Dub',
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    description: tv.overview || "Two in-laws forced to raise their orphaned nephew together slowly overcome their misunderstandings, finding personal growth and an unexpected romance through co-parenting under one roof.",
    overview: tv.overview || "Two in-laws forced to raise their orphaned nephew together slowly overcome their misunderstandings, finding personal growth and an unexpected romance through co-parenting under one roof.",
    genre: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Romance',
    genres: (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Romance',
    cast: castList,
    isOngoing: false,
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
      const idMatch = s.id === `mb-s-${PRIMARY_SUBJECT_ID}` || s.tmdbId === TMDB_TV_ID;
      const titleMatch = s.title && s.title.toLowerCase().includes('our universe');
      return !idMatch && !titleMatch;
    });

    // Unshift to the very top (index 0) of series
    content.series.unshift(seriesObj);

    // Also update featured spotlight to Our Universe with TMDB 4K cover
    content.featured = seriesObj;

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    console.log(`💾 Updated entry in: ${filePath}`);
  }

  console.log(`\n🎉 Successfully added Our Universe [Hindi] (2026) with all ${episodesList.length} full episodes, cast details, and TMDB 4K cover!`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
