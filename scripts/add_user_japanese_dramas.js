const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

async function fetchTMDB(cleanTitle, type = 'tv') {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/search/${type}`, {
      params: { api_key: TMDB_API_KEY, query: cleanTitle },
      timeout: 7000
    });
    const match = res.data?.results?.[0];
    if (!match) return null;

    const detailsRes = await axios.get(`https://api.themoviedb.org/3/${type}/${match.id}`, {
      params: { api_key: TMDB_API_KEY, append_to_response: 'credits' },
      timeout: 7000
    });
    const d = detailsRes.data;
    const cast = (d.credits?.cast || []).slice(0, 8).map(c => ({
      name: c.name,
      character: c.character || 'Cast',
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));

    return {
      title: (type === 'tv' ? d.name : d.title) || cleanTitle,
      overview: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      rating: d.vote_average ? d.vote_average.toFixed(1) : '8.2',
      year: ((type === 'tv' ? d.first_air_date : d.release_date) || '').split('-')[0] || '2024',
      genres: (d.genres || []).map(g => g.name).join(', '),
      cast
    };
  } catch (e) {
    return null;
  }
}

async function buildSingleTrackSeries(item) {
  const sId = item.id;
  const dPath = item.path;
  const internalId = `mb-s-${sId}`;
  const detail = await moviebox.getDetail(sId, dPath);
  const tmdb = await fetchTMDB(item.tmdbQuery || item.title, 'tv');

  const poster = tmdb?.poster || detail?.poster || '';
  const backdrop = tmdb?.backdrop || detail?.backdrop || poster;
  const isHindi = item.audioLabel === 'Hindi dub';
  const audioLabel = isHindi ? 'Hindi dub' : 'Original audio';
  const serverTag = isHindi ? 'Hindi Dub' : 'Original Japanese';

  // Use explicit seasons to ensure exact episode count is never cut short by API jitter
  const rawSeasons = item.explicitSeasons || (detail?.seasons && detail.seasons.length > 0 ? detail.seasons : [{ se: 1, maxEp: 1 }]);
  const seasons = [];
  const allEpisodes = [];

  for (let sIdx = 0; sIdx < rawSeasons.length; sIdx++) {
    const rawSeason = rawSeasons[sIdx];
    const seNum = rawSeason.se || (sIdx + 1);
    const maxEp = rawSeason.maxEp || (Array.isArray(rawSeason.episodes) ? rawSeason.episodes.length : 1);
    const seasonEpisodes = [];

    for (let ep = 1; ep <= maxEp; ep++) {
      const streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}`;
      const epServers = [
        {
          name: `Server 1 (${serverTag} - Auto-Renewing 720p)`,
          url: streamUrl,
          quality: '720p',
          audio: audioLabel,
          isDirect: true
        },
        {
          name: `Server 2 (Auto Failover 480p)`,
          url: `${streamUrl}&q=480`,
          quality: '480p',
          audio: audioLabel,
          isDirect: true
        }
      ];

      const epObj = {
        id: `${internalId}_s${seNum}_e${ep}`,
        episode: ep,
        episodeNumber: ep,
        season: seNum,
        seasonNumber: seNum,
        title: `Episode ${ep}`,
        name: `Episode ${ep}`,
        duration: '45m',
        still: poster,
        stillPath: poster,
        streamUrl: streamUrl,
        audioTracks: [audioLabel],
        selectedAudio: audioLabel,
        servers: epServers
      };
      seasonEpisodes.push(epObj);
      allEpisodes.push(epObj);
    }

    seasons.push({
      season: seNum,
      seasonNumber: seNum,
      name: `Season ${seNum}`,
      title: `Season ${seNum}`,
      year: tmdb?.year || detail?.year || '2024',
      episodesCount: seasonEpisodes.length,
      episodes: seasonEpisodes
    });
  }

  const mainServers = [
    {
      name: `Server 1 (${serverTag} - Auto-Renewing 720p)`,
      url: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
      quality: '720p',
      audio: audioLabel,
      isDirect: true
    },
    {
      name: `Server 2 (Auto Failover 480p)`,
      url: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1&q=480`,
      quality: '480p',
      audio: audioLabel,
      isDirect: true
    }
  ];

  return {
    id: internalId,
    subjectId: sId,
    detailPath: dPath,
    title: item.title,
    originalTitle: item.originalTitle || item.title,
    year: String(tmdb?.year || detail?.year || item.year || '2024'),
    rating: String(tmdb?.rating || detail?.rating || '8.2'),
    imdbRating: String(tmdb?.rating || detail?.rating || '8.2'),
    poster: poster,
    backdrop: backdrop,
    cover: backdrop,
    duration: `${allEpisodes.length} Episodes`,
    streamUrl: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
    servers: mainServers,
    episodesCount: allEpisodes.length,
    category: isHindi ? 'Japanese (Dubbed) Series' : 'Japanese Drama',
    industry: 'Japanese',
    country: 'Japan',
    language: isHindi ? 'Hindi' : 'Japanese',
    dubLanguage: isHindi ? 'Hindi' : 'Japanese',
    audioTracks: [audioLabel],
    selectedAudio: audioLabel,
    seasonsCount: seasons.length,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: `${tmdb?.year || detail?.year || item.year || '2024'}-01-01`,
    originalReleaseDate: `${tmdb?.year || detail?.year || item.year || '2024'}-01-01`,
    badgeLeft: isHindi ? 'Hindi' : 'HD',
    badgeRight: 'Japanese',
    views: isHindi ? 3200 : 2500,
    genre: tmdb?.genres || 'Drama, Mystery, Thriller',
    seasons: seasons,
    episodes: allEpisodes,
    description: tmdb?.overview || detail?.description || `${item.title} streaming in HD on FOBS TV.`,
    cast: tmdb?.cast || [],
    type: 'series'
  };
}

async function main() {
  console.log('🚀 Ingesting Japanese Dramas as 2 SEPARATE Independent Files (Hindi File & Japanese File)...');

  const contentFile = path.join(__dirname, '../data/content.json');
  const backupFile = path.join(__dirname, '../data/content.backup.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  content.series = content.series || [];
  content.movies = content.movies || [];

  const seriesList = [
    // --- 1. TOKYO SWINDLERS (2 SEPARATE FILES) ---
    // File A: Hindi Dubbed
    {
      id: '1866743088148874256',
      path: 'tokyo-swindlers-hindi-qLjxXTAHTd2',
      title: 'Tokyo Swindlers [Hindi]',
      originalTitle: 'Tokyo Swindlers (地面師たち) [Hindi]',
      tmdbQuery: 'Tokyo Swindlers',
      year: '2024',
      audioLabel: 'Hindi dub',
      explicitSeasons: [{ se: 1, maxEp: 7 }]
    },
    // File B: Original Japanese
    {
      id: '5107354711083157136',
      path: 'tokyo-swindlers-kAbLDNNJh56',
      title: 'Tokyo Swindlers (Japanese)',
      originalTitle: 'Tokyo Swindlers (地面師たち)',
      tmdbQuery: 'Tokyo Swindlers',
      year: '2024',
      audioLabel: 'Original audio',
      explicitSeasons: [{ se: 1, maxEp: 7 }]
    },

    // --- 2. HOUSE OF NINJAS (2 SEPARATE FILES) ---
    // File A: Hindi Dubbed
    {
      id: '5374509463669983144',
      path: 'house-of-ninjas-hindi-K3Wtc2fj1p6',
      title: 'House of Ninjas [Hindi]',
      originalTitle: 'House of Ninjas (忍びの家) [Hindi]',
      tmdbQuery: 'House of Ninjas',
      year: '2024',
      audioLabel: 'Hindi dub',
      explicitSeasons: [{ se: 1, maxEp: 8 }]
    },
    // File B: Original Japanese
    {
      id: '4217661549353338168',
      path: 'house-of-ninjas-yRM6pLWVy15',
      title: 'House of Ninjas (Japanese)',
      originalTitle: 'House of Ninjas (忍びの家)',
      tmdbQuery: 'House of Ninjas',
      year: '2024',
      audioLabel: 'Original audio',
      explicitSeasons: [{ se: 1, maxEp: 8 }]
    },

    // --- 3. ALICE IN BORDERLAND (2 SEPARATE FILES) ---
    // File A: Hindi Dubbed
    {
      id: '1372737044979613864',
      path: 'alice-in-borderland-hindi-EQwrWtj9pD1',
      title: 'Alice in Borderland [Hindi]',
      originalTitle: 'Alice in Borderland (今際の国のアリス) [Hindi]',
      tmdbQuery: 'Alice in Borderland',
      year: '2020',
      audioLabel: 'Hindi dub',
      explicitSeasons: [
        { se: 1, maxEp: 8 },
        { se: 2, maxEp: 8 },
        { se: 3, maxEp: 6 }
      ]
    },
    // File B: Original Japanese
    {
      id: '4873167462814077984',
      path: 'alice-in-borderland-axeQWXP9ZN5',
      title: 'Alice in Borderland (Japanese)',
      originalTitle: 'Alice in Borderland (今際の国のアリス)',
      tmdbQuery: 'Alice in Borderland',
      year: '2020',
      audioLabel: 'Original audio',
      explicitSeasons: [
        { se: 1, maxEp: 8 },
        { se: 2, maxEp: 8 },
        { se: 3, maxEp: 6 }
      ]
    },

    // --- 4. FIRST LOVE: HATSUKOI (HINDI FILE) ---
    {
      id: '3038612373557889200',
      path: 'first-love-hindi-EYwQMPmSsC3',
      title: 'First Love: Hatsukoi [Hindi]',
      originalTitle: 'First Love: Hatsukoi (初恋) [Hindi]',
      tmdbQuery: 'First Love',
      year: '2022',
      audioLabel: 'Hindi dub',
      explicitSeasons: [{ se: 1, maxEp: 9 }]
    },

    // --- 5. VIVANT (2023) (JAPANESE FILE) ---
    {
      id: '2723239920440591184',
      path: 'vivant-GftSsWZsaf3',
      title: 'Vivant (2023)',
      tmdbQuery: 'Vivant',
      year: '2023',
      audioLabel: 'Original audio',
      explicitSeasons: [{ se: 1, maxEp: 14 }]
    },

    // --- 6. GANNIBAL (2022) (JAPANESE FILE) ---
    {
      id: '7087255722031205080',
      path: 'gannibal-ka0bfoNHxr8',
      title: 'Gannibal (2022)',
      tmdbQuery: 'Gannibal',
      year: '2022',
      audioLabel: 'Original audio',
      explicitSeasons: [
        { se: 1, maxEp: 7 },
        { se: 2, maxEp: 8 }
      ]
    },

    // --- 7. AN INCURABLE CASE OF LOVE (2020) (JAPANESE FILE) ---
    {
      id: '6536416339434061776',
      path: 'an-incurable-case-of-love-8mTLT95RQM7',
      title: 'An Incurable Case of Love (2020)',
      tmdbQuery: 'An Incurable Case of Love',
      year: '2020',
      audioLabel: 'Original audio',
      explicitSeasons: [{ se: 1, maxEp: 10 }]
    },

    // --- 8. RUROUNI KENSHIN (SERIES) (JAPANESE FILE) ---
    {
      id: '8676306869654277928',
      path: 'rurouni-kenshin-Kna6hXNzVka',
      title: 'Rurouni Kenshin (Series)',
      tmdbQuery: 'Rurouni Kenshin',
      year: '2023',
      audioLabel: 'Original audio',
      explicitSeasons: [{ se: 1, maxEp: 95 }]
    }
  ];

  for (const it of seriesList) {
    console.log(`Processing single-track file: ${it.title}...`);
    try {
      const record = await buildSingleTrackSeries(it);
      const exIdx = content.series.findIndex(s => s.id === record.id || s.subjectId === it.id);
      if (exIdx !== -1) {
        content.series[exIdx] = record;
        console.log(`  🔄 Updated: ${record.title} (${record.episodesCount} eps, ${record.audioTracks.join(', ')})`);
      } else {
        content.series.unshift(record);
        console.log(`  ✨ Added: ${record.title} (${record.episodesCount} eps, ${record.audioTracks.join(', ')})`);
      }
    } catch (e) {
      console.error(`  ❌ Error processing ${it.title}:`, e.message);
    }
  }

  // --- 9. RUROUNI KENSHIN LIVE ACTION MOVIES (JAPANESE FILES) ---
  const kenshinMovies = [
    {
      id: 'mb-m-5464301025991477936',
      subjectId: '5464301025991477936',
      detailPath: 'rurouni-kenshin-final-chapter-part-i-the-final-CJf1jQvyEv6',
      title: 'Rurouni Kenshin: The Final (2021)',
      tmdbQuery: 'Rurouni Kenshin: The Final',
      year: '2021'
    },
    {
      id: 'mb-m-2792737851409056592',
      subjectId: '2792737851409056592',
      detailPath: 'rurouni-kenshin-the-legend-ends-aDTVqZFLik3',
      title: 'Rurouni Kenshin: The Legend Ends (2014)',
      tmdbQuery: 'Rurouni Kenshin: The Legend Ends',
      year: '2014'
    }
  ];

  for (const km of kenshinMovies) {
    console.log(`Processing movie: ${km.title}...`);
    try {
      const tmdb = await fetchTMDB(km.tmdbQuery, 'movie');
      const detail = await moviebox.getDetail(km.subjectId, km.detailPath);
      const poster = tmdb?.poster || detail?.poster || '';
      const backdrop = tmdb?.backdrop || detail?.backdrop || poster;
      const movieRecord = {
        id: km.id,
        subjectId: km.subjectId,
        detailPath: km.detailPath,
        title: km.title,
        originalTitle: km.title,
        year: String(tmdb?.year || km.year),
        rating: String(tmdb?.rating || '8.1'),
        imdbRating: String(tmdb?.rating || '8.1'),
        poster: poster,
        backdrop: backdrop,
        cover: backdrop,
        duration: '2h 18m',
        streamUrl: `/api/moviebox/stream?id=${km.subjectId}&path=${encodeURIComponent(km.detailPath)}&se=0&ep=0`,
        servers: [
          {
            name: 'Server 1 (Original Japanese - 1080p FHD)',
            url: `/api/moviebox/stream?id=${km.subjectId}&path=${encodeURIComponent(km.detailPath)}&se=0&ep=0`,
            quality: '1080p',
            audio: 'Original audio',
            isDirect: true
          },
          {
            name: 'Server 2 (Auto Failover 480p)',
            url: `/api/moviebox/stream?id=${km.subjectId}&path=${encodeURIComponent(km.detailPath)}&se=0&ep=0&q=480`,
            quality: '480p',
            audio: 'Original audio',
            isDirect: true
          }
        ],
        category: 'Japanese Movies',
        industry: 'Japanese',
        country: 'Japan',
        language: 'Japanese',
        dubLanguage: 'Japanese',
        audioTracks: ['Original audio'],
        selectedAudio: 'Original audio',
        badgeLeft: 'HD',
        badgeRight: 'Japanese',
        views: 3100,
        genre: tmdb?.genres || 'Action, Adventure, Drama',
        description: tmdb?.overview || detail?.description || `${km.title} streaming in Full HD on FOBS TV.`,
        cast: tmdb?.cast || [],
        type: 'movie'
      };

      const exIdx = content.movies.findIndex(m => m.id === km.id || m.subjectId === km.subjectId);
      if (exIdx !== -1) {
        content.movies[exIdx] = movieRecord;
        console.log(`  🔄 Updated Movie: ${movieRecord.title}`);
      } else {
        content.movies.unshift(movieRecord);
        console.log(`  ✨ Added Movie: ${movieRecord.title}`);
      }
    } catch (e) {
      console.error(`  ❌ Error processing movie ${km.title}:`, e.message);
    }
  }

  // Save to content.json and backup
  console.log('\nWriting to content.json & content.backup.json...');
  fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
  fs.writeFileSync(backupFile, JSON.stringify(content, null, 2));

  // Sync to public seed and android assets seed
  const seedFiles = [
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];

  for (const sf of seedFiles) {
    if (fs.existsSync(sf)) {
      console.log(`Syncing to ${sf}...`);
      const seed = JSON.parse(fs.readFileSync(sf, 'utf8'));
      seed.series = seed.series || [];
      seed.movies = seed.movies || [];

      // sync series
      for (const it of seriesList) {
        const full = content.series.find(s => s.subjectId === it.id);
        if (full) {
          const idx = seed.series.findIndex(s => s.id === full.id || s.subjectId === full.subjectId);
          if (idx !== -1) seed.series[idx] = full;
          else seed.series.unshift(full);
        }
      }

      // sync movies
      for (const km of kenshinMovies) {
        const full = content.movies.find(m => m.subjectId === km.subjectId);
        if (full) {
          const idx = seed.movies.findIndex(m => m.id === full.id || m.subjectId === full.subjectId);
          if (idx !== -1) seed.movies[idx] = full;
          else seed.movies.unshift(full);
        }
      }

      fs.writeFileSync(sf, JSON.stringify(seed));
      console.log(`  Updated ${sf} successfully!`);
    }
  }

  console.log('🎉 Done saving 2 separate files (Hindi & Japanese) for all titles!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
