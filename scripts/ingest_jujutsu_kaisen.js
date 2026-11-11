/**
 * FOBS TV - Jujutsu Kaisen Dual Ingestion (Japanese Audio & Hindi Dub)
 * 1. Jujutsu Kaisen (Japanese Audio) - S1 (24 eps) + S2 (23 eps)
 *    MovieBox Subject ID: 2987045125743854656
 * 2. Jujutsu Kaisen [Hindi Dub] - S1 (24 eps) + S2 (23 eps)
 *    MovieBox Subject ID: 102175217904222864
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_ID = 95479;

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

async function fetchTMDB() {
  const detailsRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' },
    timeout: 10000
  });
  const s1Res = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_ID}/season/1`, {
    params: { api_key: TMDB_API_KEY },
    timeout: 10000
  });

  return {
    details: detailsRes.data,
    allEpisodes: s1Res.data?.episodes || []
  };
}

async function buildEntry(mode, tmdbData) {
  const isHindi = mode === 'hindi';
  const subjectId = isHindi ? '102175217904222864' : '2987045125743854656';
  const detailPath = isHindi ? 'jujutsu-kaisen-hindi-Gjrqz0KXx7' : 'jujutsu-kaisen-AgF7dwiHEy3';
  const title = isHindi ? 'Jujutsu Kaisen [Hindi Dub]' : 'Jujutsu Kaisen (Japanese Audio)';
  const originalTitle = isHindi ? '呪術廻戦 (Jujutsu Kaisen Hindi Dub)' : '呪術廻戦 (Jujutsu Kaisen Japanese Audio)';
  const badgeLeft = isHindi ? 'Hindi Dub' : 'Japanese Audio';
  const badgeRight = '47 Eps (S1-S2)';
  const audioTracks = isHindi ? ['Hindi dub', 'Japanese Original'] : ['Japanese Original', 'English Sub'];
  const selectedAudio = isHindi ? 'Hindi dub' : 'Japanese Original';

  console.log(`\n⏳ Building: ${title}...`);

  // Direct CDN links test for S1E1 and S2E1
  let s1Direct = null;
  let s2Direct = null;
  try {
    const r1 = await moviebox.resolveMedia(subjectId, detailPath, 1, 1);
    s1Direct = r1?.streamUrl || null;
    const r2 = await moviebox.resolveMedia(subjectId, detailPath, 2, 1);
    s2Direct = r2?.streamUrl || null;
  } catch (_) {}

  const tmdb = tmdbData.details;
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const posterUrl = tmdb.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : 'https://image.tmdb.org/t/p/w500/placeholder.jpg';
  const backdropUrl = tmdb.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : posterUrl;

  const seasonsArray = [];

  // Season 1 (24 episodes)
  const s1Episodes = [];
  for (let i = 1; i <= 24; i++) {
    const tmdbEp = tmdbData.allEpisodes[i - 1];
    const epNumStr = i.toString().padStart(2, '0');
    const epTitle = tmdbEp?.name ? `Episode ${i} - ${tmdbEp.name}` : `Episode ${i}`;
    const epStill = tmdbEp?.still_path ? `https://image.tmdb.org/t/p/original${tmdbEp.still_path}` : backdropUrl;
    const epOverview = tmdbEp?.overview || `Watch Jujutsu Kaisen Season 1 Episode ${i} in HD on FOBS TV.`;

    const autoUrl = `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${i}`;
    const directUrl = (i === 1 && s1Direct) ? s1Direct : autoUrl;

    const servers = [
      {
        name: isHindi ? 'Server 1 (MovieBox Hindi 1080p FHD)' : 'Server 1 (MovieBox Japanese 1080p FHD)',
        url: directUrl,
        isDirect: true,
        quality: '1080p',
        audio: isHindi ? 'Hindi dub' : 'Japanese'
      },
      {
        name: isHindi ? 'Server 2 (Auto-Renewing Hindi Stream)' : 'Server 2 (Auto-Renewing Japanese Stream)',
        url: autoUrl,
        isDirect: true,
        quality: '1080p',
        audio: isHindi ? 'Hindi dub' : 'Japanese'
      },
      {
        name: 'Server 3 (MultiEmbed HD Failover)',
        url: `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=1&e=${i}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 4 (AutoEmbed CC HD)',
        url: `https://player.autoembed.cc/embed/tv/${TMDB_ID}/1/${i}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 5 (VidLink Fast HD)',
        url: `https://vidlink.pro/tv/${TMDB_ID}/1/${i}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 6 (VidSrc Player)',
        url: `https://vidsrc.to/embed/tv/${TMDB_ID}/1/${i}`,
        isDirect: false,
        quality: '1080p'
      }
    ];

    s1Episodes.push({
      id: `mb-s-${subjectId}_s1_e${i}`,
      number: epNumStr,
      episode: i,
      season: 1,
      title: epTitle,
      duration: '24m',
      overview: epOverview,
      still: epStill,
      streamUrl: servers[0].url,
      servers: servers
    });
  }

  seasonsArray.push({
    season: 1,
    seasonNumber: 1,
    name: 'Season 1',
    title: 'Season 1 (24 Episodes)',
    year: '2020',
    episodesCount: 24,
    episodes: s1Episodes
  });

  // Season 2 (23 episodes) - Shibuya Incident
  const s2Episodes = [];
  for (let i = 1; i <= 23; i++) {
    const tmdbIndex = 24 + (i - 1);
    const tmdbEp = tmdbData.allEpisodes[tmdbIndex];
    const epNumStr = i.toString().padStart(2, '0');
    const epTitle = tmdbEp?.name ? `Episode ${i} - ${tmdbEp.name}` : `Episode ${i}`;
    const epStill = tmdbEp?.still_path ? `https://image.tmdb.org/t/p/original${tmdbEp.still_path}` : backdropUrl;
    const epOverview = tmdbEp?.overview || `Watch Jujutsu Kaisen Season 2 Episode ${i} in HD on FOBS TV.`;

    const autoUrl = `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=2&ep=${i}`;
    const directUrl = (i === 1 && s2Direct) ? s2Direct : autoUrl;

    const servers = [
      {
        name: isHindi ? 'Server 1 (MovieBox Hindi 1080p FHD)' : 'Server 1 (MovieBox Japanese 1080p FHD)',
        url: directUrl,
        isDirect: true,
        quality: '1080p',
        audio: isHindi ? 'Hindi dub' : 'Japanese'
      },
      {
        name: isHindi ? 'Server 2 (Auto-Renewing Hindi Stream)' : 'Server 2 (Auto-Renewing Japanese Stream)',
        url: autoUrl,
        isDirect: true,
        quality: '1080p',
        audio: isHindi ? 'Hindi dub' : 'Japanese'
      },
      {
        name: 'Server 3 (MultiEmbed HD Failover)',
        url: `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=1&e=${tmdbIndex + 1}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 4 (AutoEmbed CC HD)',
        url: `https://player.autoembed.cc/embed/tv/${TMDB_ID}/1/${tmdbIndex + 1}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 5 (VidLink Fast HD)',
        url: `https://vidlink.pro/tv/${TMDB_ID}/1/${tmdbIndex + 1}`,
        isDirect: false,
        quality: '1080p'
      },
      {
        name: 'Server 6 (VidSrc Player)',
        url: `https://vidsrc.to/embed/tv/${TMDB_ID}/1/${tmdbIndex + 1}`,
        isDirect: false,
        quality: '1080p'
      }
    ];

    s2Episodes.push({
      id: `mb-s-${subjectId}_s2_e${i}`,
      number: epNumStr,
      episode: i,
      season: 2,
      title: epTitle,
      duration: '24m',
      overview: epOverview,
      still: epStill,
      streamUrl: servers[0].url,
      servers: servers
    });
  }

  seasonsArray.push({
    season: 2,
    seasonNumber: 2,
    name: 'Season 2',
    title: 'Season 2 (Shibuya Incident - 23 Episodes)',
    year: '2023',
    episodesCount: 23,
    episodes: s2Episodes
  });

  const seriesEntry = {
    id: `mb-s-${subjectId}`,
    subjectId: subjectId,
    detailPath: detailPath,
    tmdbId: TMDB_ID,
    title: title,
    originalTitle: originalTitle,
    language: isHindi ? 'Hindi' : 'Japanese',
    dubLanguage: isHindi ? 'Hindi' : 'Japanese',
    badgeLeft: badgeLeft,
    badgeRight: badgeRight,
    tag: 'Full Series',
    isFullSeries: true,
    isTrending: true,
    status: 'Returning Series',
    industry: 'Japanese',
    country: 'Japan',
    category: 'Anime',
    genre: 'Animation, Action, Fantasy',
    year: '2020',
    duration: '47 Episodes',
    seasonsCount: 2,
    releasedEpisodes: 47,
    totalEpisodes: 47,
    episodesCount: 47,
    rating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.6',
    imdbRating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.6',
    poster: posterUrl,
    backdrop: backdropUrl,
    cover: backdropUrl,
    description: tmdb.overview || 'Yuji Itadori is a boy with tremendous physical strength, though he lives a completely ordinary high school life. One day, to save a classmate who has been attacked by curses, he eats the finger of Ryomen Sukuna, taking the curse into his own soul.',
    audioTracks: audioTracks,
    selectedAudio: selectedAudio,
    streamUrl: s1Episodes[0].streamUrl,
    servers: s1Episodes[0].servers,
    cast: cast,
    seasons: seasonsArray,
    episodes: s1Episodes,
    type: 'series',
    isCustom: true,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  console.log(`✅ Finished building ${title}: 2 Seasons, 47 Episodes.`);
  return seriesEntry;
}

async function main() {
  console.log('🚀 Starting Jujutsu Kaisen Dual Upload (Japanese & Hindi)...');

  const tmdbData = await fetchTMDB();
  const japEntry = await buildEntry('japanese', tmdbData);
  const hindiEntry = await buildEntry('hindi', tmdbData);

  const targets = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];

  for (const fp of targets) {
    if (!fs.existsSync(fp)) continue;
    const catalog = JSON.parse(fs.readFileSync(fp, 'utf8'));

    // Remove any previous duplicate or malformed Jujutsu Kaisen entries
    catalog.series = catalog.series.filter(s => {
      const t = (s.title || '').toLowerCase();
      if (t.includes('jujutsu kaisen')) return false;
      if (s.subjectId === '102175217904222864' || s.subjectId === '2987045125743854656') return false;
      return true;
    });

    // Add Japanese and Hindi entries right at the front
    catalog.series.unshift(japEntry, hindiEntry);

    fs.writeFileSync(fp, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`💾 Saved ${fp} (Total series: ${catalog.series.length})`);
  }

  console.log('\n🎉 Successfully added Jujutsu Kaisen (Japanese Audio) and Jujutsu Kaisen [Hindi Dub]!');
}

main().catch(console.error);
