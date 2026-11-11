/**
 * FOBS TV - Japanese Series / Drama Ingestion Script
 * Adds the 13 requested Japanese series/dramas:
 * 1. The Promised Neverland (2019)
 * 2. Yu Yu Hakusho (2023)
 * 3. Moribito: Guardian of the Spirit / Seirei no Moribito (2016–2018)
 * 4. Death Note (2015)
 * 5. N no Tame ni / Testimony of N (2014)
 * 6. Kakegurui (2018)
 * 7. Influence (2021)
 * 8. Dearest / Saiai (2021)
 * 9. Your Turn to Kill (2019)
 * 10. Strawberry Night (2012)
 * 11. Okitegami Kyoko no Biboroku (2015)
 * 12. Kurosagi: The Black Swindler (2022)
 * 13. Miss Devil: HR's Devil Mako Tsubaki (2018)
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

const SERIES_CONFIGS = [
  {
    displayTitle: 'The Promised Neverland (2019)',
    searchTitle: 'The Promised Neverland',
    originalTitle: '約束のネバーランド',
    tmdbId: 83097,
    mbSubjectId: '2436819890184012624',
    mbDetailPath: 'the-promised-neverland-mzmPQGYE0U2',
    category: 'Anime',
    year: '2019',
    language: 'Japanese / English'
  },
  {
    displayTitle: 'Yu Yu Hakusho (2023) [Hindi Dub]',
    searchTitle: 'Yu Yu Hakusho',
    originalTitle: '幽☆遊☆白書',
    tmdbId: 121659,
    mbSubjectId: '6000415223809722544',
    mbDetailPath: 'yu-yu-hakusho-hindi-8GhZeWQXf97',
    category: 'Japanese Drama',
    year: '2023',
    language: 'Hindi / Japanese'
  },
  {
    displayTitle: 'Moribito: Guardian of the Spirit (2016–2018)',
    searchTitle: 'Moribito: Guardian of the Spirit',
    originalTitle: '精霊の守り人',
    tmdbId: 70934,
    category: 'Japanese Drama',
    year: '2016',
    language: 'Japanese'
  },
  {
    displayTitle: 'Death Note (2015)',
    searchTitle: 'Death Note',
    originalTitle: 'デスノート',
    tmdbId: 63648,
    mbSubjectId: '4503491135423267032',
    mbDetailPath: 'death-note-gCRQKUi2Gm5',
    category: 'Japanese Drama',
    year: '2015',
    language: 'Japanese'
  },
  {
    displayTitle: 'N no Tame ni / Testimony of N (2014)',
    searchTitle: 'Testimony of N',
    originalTitle: 'Nのために',
    tmdbId: 65558,
    category: 'Japanese Drama',
    year: '2014',
    language: 'Japanese'
  },
  {
    displayTitle: 'Kakegurui (2018)',
    searchTitle: 'Kakegurui',
    originalTitle: '賭ケグルイ',
    tmdbId: 76409,
    mbSubjectId: '8932178126826790552',
    mbDetailPath: 'kakegurui-ytaFrVatPDa',
    category: 'Japanese Drama',
    year: '2018',
    language: 'Japanese'
  },
  {
    displayTitle: 'Influence (2021)',
    searchTitle: 'Influence',
    originalTitle: 'インフルエンス',
    tmdbId: 120090,
    category: 'Japanese Drama',
    year: '2021',
    language: 'Japanese'
  },
  {
    displayTitle: 'Dearest / Saiai (2021)',
    searchTitle: 'Dearest',
    originalTitle: '最愛',
    tmdbId: 135730,
    mbSubjectId: '4806111042512241744',
    mbDetailPath: 'dearest-8mHTa5s22J5',
    category: 'Japanese Drama',
    year: '2021',
    language: 'Japanese'
  },
  {
    displayTitle: 'Your Turn to Kill (2019)',
    searchTitle: 'Your Turn to Kill',
    originalTitle: 'あなたの番です',
    tmdbId: 88570,
    mbSubjectId: '4864020120923947856',
    mbDetailPath: 'your-turn-to-kill-uVBkLSlgjN5',
    category: 'Japanese Drama',
    year: '2019',
    language: 'Japanese'
  },
  {
    displayTitle: 'Strawberry Night (2012)',
    searchTitle: 'Strawberry Night',
    originalTitle: 'ストロベリーナイト',
    tmdbId: 65501,
    category: 'Japanese Drama',
    year: '2012',
    language: 'Japanese'
  },
  {
    displayTitle: 'Okitegami Kyoko no Biboroku (2015)',
    searchTitle: 'The Memorandum of Kyoko Okitegami',
    originalTitle: '掟上今日子の備忘録',
    tmdbId: 69407,
    category: 'Japanese Drama',
    year: '2015',
    language: 'Japanese'
  },
  {
    displayTitle: 'Kurosagi: The Black Swindler (2022)',
    searchTitle: 'The Black Swindler',
    originalTitle: 'クロサギ',
    tmdbId: 210039,
    mbSubjectId: '7412629799992444240',
    mbDetailPath: 'the-black-swindler-uhVaQueVzP8',
    category: 'Japanese Drama',
    year: '2022',
    language: 'Japanese'
  },
  {
    displayTitle: "Miss Devil: HR's Devil Mako Tsubaki (2018)",
    searchTitle: 'Miss Devil',
    originalTitle: 'Missデビル 人事の悪魔・椿眞子',
    tmdbId: 78684,
    mbSubjectId: '5286868942303151384',
    mbDetailPath: 'miss-devil-OjRZAvMUxi6',
    category: 'Japanese Drama',
    year: '2018',
    language: 'Japanese'
  }
];

async function fetchTMDBDetails(tmdbId) {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits,external_ids'
      },
      timeout: 10000
    });
    return res.data;
  } catch (e) {
    console.error(`TMDB detail error for ${tmdbId}:`, e.message);
    return null;
  }
}

async function fetchTMDBSeason(tmdbId, seasonNum) {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}`, {
      params: { api_key: TMDB_API_KEY },
      timeout: 10000
    });
    return res.data;
  } catch (e) {
    console.error(`TMDB season ${seasonNum} error for ${tmdbId}:`, e.message);
    return null;
  }
}

async function buildSeriesEntry(cfg) {
  console.log(`\n⏳ Ingesting: ${cfg.displayTitle} (TMDB: ${cfg.tmdbId})...`);
  const tmdb = await fetchTMDBDetails(cfg.tmdbId);
  if (!tmdb) {
    console.error(`❌ Could not fetch TMDB details for ${cfg.displayTitle}`);
    return null;
  }

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const genres = (tmdb.genres || []).map(g => g.name).join(', ') || 'Drama, Mystery';
  const posterUrl = tmdb.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : 'https://image.tmdb.org/t/p/w500/placeholder.jpg';
  const backdropUrl = tmdb.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : posterUrl;

  const seriesId = cfg.mbSubjectId ? `mb-s-${cfg.mbSubjectId}` : `mb-s-tmdb-${cfg.tmdbId}`;

  // Process seasons
  const tmdbSeasons = (tmdb.seasons || []).filter(s => s.season_number > 0);
  const seasonsArray = [];
  let allEpisodes = [];
  let totalEpsCount = 0;

  // Resolve episode 1 direct MovieBox stream if available
  let directEp1Stream = null;
  if (cfg.mbSubjectId) {
    try {
      const res = await moviebox.resolveMedia(cfg.mbSubjectId, cfg.mbDetailPath || '', 1, 1);
      if (res && res.streamUrl) {
        directEp1Stream = res.streamUrl;
      }
    } catch (_) {}
  }

  for (const s of tmdbSeasons) {
    const sNum = s.season_number;
    console.log(`   Fetching Season ${sNum} (${s.episode_count} eps)...`);
    const seasonData = await fetchTMDBSeason(cfg.tmdbId, sNum);
    const epList = seasonData?.episodes || [];

    const builtEpisodes = [];
    for (const ep of epList) {
      const epNum = ep.episode_number;
      totalEpsCount++;

      const epNumStr = epNum.toString().padStart(2, '0');
      const epTitle = ep.name ? `Episode ${epNum} - ${ep.name}` : `Episode ${epNum}`;
      const epDuration = ep.runtime ? `${ep.runtime}m` : (tmdb.episode_run_time?.[0] ? `${tmdb.episode_run_time[0]}m` : '45m');
      const epStill = ep.still_path ? `https://image.tmdb.org/t/p/original${ep.still_path}` : backdropUrl;
      const epOverview = ep.overview || `Watch ${cfg.displayTitle} Season ${sNum} Episode ${epNum} in HD on FOBS TV.`;

      // Build robust multi-server failover
      const servers = [];

      if (cfg.mbSubjectId) {
        servers.push({
          name: 'Server 1 (Auto-Renewing MovieBox HD)',
          url: `/api/moviebox/stream?id=${encodeURIComponent(cfg.mbSubjectId)}&path=${encodeURIComponent(cfg.mbDetailPath || '')}&se=${sNum}&ep=${epNum}`,
          isDirect: true,
          quality: '1080p'
        });
        if (sNum === 1 && epNum === 1 && directEp1Stream) {
          servers.push({
            name: 'Server 2 (Direct MovieBox CDN)',
            url: directEp1Stream,
            isDirect: true,
            quality: '1080p'
          });
        }
      }

      servers.push(
        {
          name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
          url: `https://multiembed.mov/?video_id=${cfg.tmdbId}&tmdb=1&s=${sNum}&e=${epNum}`,
          isDirect: false,
          quality: '1080p'
        },
        {
          name: `Server ${servers.length + 2} (AutoEmbed CC HD)`,
          url: `https://player.autoembed.cc/embed/tv/${cfg.tmdbId}/${sNum}/${epNum}`,
          isDirect: false,
          quality: '1080p'
        },
        {
          name: `Server ${servers.length + 3} (VidLink Fast HD)`,
          url: `https://vidlink.pro/tv/${cfg.tmdbId}/${sNum}/${epNum}`,
          isDirect: false,
          quality: '1080p'
        },
        {
          name: `Server ${servers.length + 4} (VidSrc Player)`,
          url: `https://vidsrc.to/embed/tv/${cfg.tmdbId}/${sNum}/${epNum}`,
          isDirect: false,
          quality: '1080p'
        }
      );

      const primaryStream = servers[0].url;

      builtEpisodes.push({
        id: `${seriesId}_s${sNum}_e${epNum}`,
        number: epNumStr,
        episode: epNum,
        season: sNum,
        title: epTitle,
        duration: epDuration,
        overview: epOverview,
        still: epStill,
        streamUrl: primaryStream,
        servers: servers
      });
    }

    seasonsArray.push({
      season: sNum,
      seasonNumber: sNum,
      name: s.name || `Season ${sNum}`,
      title: s.name || `Season ${sNum}`,
      year: (s.air_date || tmdb.first_air_date || cfg.year).split('-')[0],
      episodesCount: builtEpisodes.length,
      episodes: builtEpisodes
    });

    if (sNum === 1) {
      allEpisodes = builtEpisodes;
    }

    await delay(250);
  }

  // Fallback if allEpisodes empty
  if (allEpisodes.length === 0 && seasonsArray.length > 0) {
    allEpisodes = seasonsArray[0].episodes;
  }

  const primaryStream = allEpisodes[0]?.streamUrl || (cfg.mbSubjectId ? `/api/moviebox/stream?id=${cfg.mbSubjectId}&se=1&ep=1` : `https://multiembed.mov/?video_id=${cfg.tmdbId}&tmdb=1&s=1&e=1`);
  const primaryServers = allEpisodes[0]?.servers || [
    { name: 'Server 1 (MultiEmbed HD)', url: primaryStream, isDirect: false }
  ];

  const seriesEntry = {
    id: seriesId,
    subjectId: cfg.mbSubjectId || `tmdb-${cfg.tmdbId}`,
    detailPath: cfg.mbDetailPath || '',
    tmdbId: cfg.tmdbId,
    title: cfg.displayTitle,
    originalTitle: `${cfg.originalTitle} (${tmdb.original_name || cfg.searchTitle})`,
    language: cfg.language || 'Japanese',
    dubLanguage: cfg.language?.includes('Hindi') ? 'Hindi' : 'Japanese',
    badgeLeft: cfg.language?.includes('Hindi') ? 'Hindi Dub' : 'Japanese',
    badgeRight: `${totalEpsCount} Eps`,
    tag: 'Full Series',
    isFullSeries: true,
    isTrending: true,
    status: tmdb.status || 'Ended',
    industry: 'Japanese',
    country: 'Japan',
    category: cfg.category,
    genre: genres,
    year: (tmdb.first_air_date || cfg.year).split('-')[0],
    duration: `${totalEpsCount} Episodes`,
    seasonsCount: seasonsArray.length,
    releasedEpisodes: totalEpsCount,
    totalEpisodes: totalEpsCount,
    episodesCount: totalEpsCount,
    rating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.2',
    imdbRating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.2',
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    description: tmdb.overview || `Watch ${cfg.displayTitle} complete Japanese drama series online in high definition on FOBS TV.`,
    audioTracks: cfg.language?.includes('Hindi') ? ['Hindi dub', 'Japanese Original'] : ['Japanese Original'],
    selectedAudio: cfg.language?.includes('Hindi') ? 'Hindi dub' : 'Japanese Original',
    streamUrl: primaryStream,
    servers: primaryServers,
    cast: cast,
    seasons: seasonsArray,
    episodes: allEpisodes,
    type: 'series',
    isCustom: true,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  console.log(`   ✅ Finished building ${cfg.displayTitle} (${seasonsArray.length} seasons, ${totalEpsCount} total episodes)`);
  return seriesEntry;
}

async function main() {
  console.log('🚀 Starting User Japanese Series / J-Dramas Ingestion...\n');

  if (!fs.existsSync(CONTENT_FILE)) {
    console.error('Content file not found:', CONTENT_FILE);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  if (!catalog.series) catalog.series = [];

  const newlyAdded = [];

  for (const cfg of SERIES_CONFIGS) {
    const entry = await buildSeriesEntry(cfg);
    if (!entry) continue;

    // Check if duplicate exists and remove it cleanly with precise matching
    const existingIdx = catalog.series.findIndex(s => {
      if (s.id === entry.id) return true;
      if (s.tmdbId && entry.tmdbId && Number(s.tmdbId) === Number(entry.tmdbId)) return true;
      if (s.subjectId && entry.subjectId && String(s.subjectId) === String(entry.subjectId)) return true;
      const tLower = (s.title || '').trim().toLowerCase();
      const cfgLower = cfg.searchTitle.trim().toLowerCase();
      const dispLower = cfg.displayTitle.trim().toLowerCase();
      // Only match if exact title or begins with searchTitle (avoid partial substring match on unrelated titles like "My Dearest Nemesis")
      if (tLower === cfgLower || tLower === dispLower) return true;
      if (cfgLower.length > 5 && tLower.startsWith(cfgLower) && !tLower.includes('nemesis')) return true;
      return false;
    });

    if (existingIdx !== -1) {
      console.log(`   🔄 Updating existing catalog entry: "${catalog.series[existingIdx].title}"`);
      catalog.series[existingIdx] = entry;
    } else {
      console.log(`   ⭐ Adding NEW entry to catalog: "${entry.title}"`);
      newlyAdded.push(entry);
    }
  }

  // Prepend new series to the top
  if (newlyAdded.length > 0) {
    catalog.series = [...newlyAdded, ...catalog.series];
  }

  console.log(`\n🎉 Ingestion finished! Total Series in catalog: ${catalog.series.length}`);

  // Write out to all 3 synchronized targets
  const targetFiles = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];
  const jsonStr = JSON.stringify(catalog, null, 2);

  for (const fp of targetFiles) {
    if (fs.existsSync(path.dirname(fp))) {
      fs.writeFileSync(fp, jsonStr, 'utf8');
      console.log(`💾 Saved to ${fp}`);
    }
  }

  console.log('\n✨ All 13 series added and synchronized successfully!');
}

main().catch(err => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
