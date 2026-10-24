/**
 * FOBS TV - Gyeongseong Creature [Hindi] (Seasons 1 & 2) K-Drama Ingestion
 * - TMDB TV ID: 135238 (Gyeongseong Creature / 경성크리처)
 * - Season 1: 10 Episodes (2023)
 * - Season 2: 7 Episodes (2024)
 * - Total: 2 Seasons (17 Episodes) - 1080p Full HD Hindi Dubbed
 * - Primary MovieBox Subject: 341274161781817952 (gyeongseong-creature-hindi-cwXnUZq2dp)
 * - Secondary MovieBox Subject: 8749727399622889296 (gyeongseong-creature-2nf2FylQlqa)
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 135238;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_PRIMARY = '341274161781817952';
const DETAIL_PATH_PRIMARY = 'gyeongseong-creature-hindi-cwXnUZq2dp';

const SUBJECT_ID_SECONDARY = '8749727399622889296';
const DETAIL_PATH_SECONDARY = 'gyeongseong-creature-2nf2FylQlqa';

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
  console.log('Gyeongseong Creature [Hindi] (S1-S2) - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 & 2 episodes from TMDB
  const seasonsMetadata = [
    { seasonNumber: 1, count: 10, name: 'Season 1', year: '2023' },
    { seasonNumber: 2, count: 7, name: 'Season 2', year: '2024' }
  ];

  const builtSeasons = [];
  let allFlattenedEpisodes = [];

  for (const sMeta of seasonsMetadata) {
    const sNum = sMeta.seasonNumber;
    console.log(`\n📋 Fetching Season ${sNum} episodes from TMDB...`);
    let tmdbEpisodes = [];
    try {
      const sRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/${sNum}`, {
        params: { api_key: TMDB_API_KEY }
      });
      tmdbEpisodes = sRes.data.episodes || [];
    } catch (e) {
      console.log(`   Season ${sNum} TMDB fetch warning:`, e.message);
    }

    console.log(`⚡ Fetching MovieBox streams for Season ${sNum} (${sMeta.count} episodes)...`);
    const seasonEpisodes = [];

    for (let i = 0; i < sMeta.count; i++) {
      const epNum = i + 1;
      const tmdbEp = tmdbEpisodes[i] || {
        name: `Episode ${epNum}`,
        overview: `Episode ${epNum} of Gyeongseong Creature Season ${sNum}.`,
        still_path: null,
        runtime: 65
      };

      // Fetch primary and secondary downloads
      const [mbPrimary, mbSecondary] = await Promise.all([
        fetchEpisodeDownload(SUBJECT_ID_PRIMARY, DETAIL_PATH_PRIMARY, sNum, epNum),
        fetchEpisodeDownload(SUBJECT_ID_SECONDARY, DETAIL_PATH_SECONDARY, sNum, epNum)
      ]);

      const servers = [];
      let primaryStreamUrl = '';

      if (mbPrimary && mbPrimary.best) {
        primaryStreamUrl = mbPrimary.best.url;
        const sizeMB = Math.round(Number(mbPrimary.best.size || 0) / 1024 / 1024);
        servers.push({
          name: `Server 1 (MovieBox ${mbPrimary.best.resolution}p Hindi Direct - ${sizeMB}MB)`,
          url: mbPrimary.best.url,
          isDirect: true,
          quality: `${mbPrimary.best.resolution}p`
        });
        servers.push({
          name: 'Server 2 (Auto-Renewing MovieBox Stream)',
          url: `/api/moviebox/stream?id=${SUBJECT_ID_PRIMARY}&se=${sNum}&ep=${epNum}`,
          isDirect: true,
          quality: `${mbPrimary.best.resolution}p`
        });

        const sd = mbPrimary.qualities.find(q => q.resolution < mbPrimary.best.resolution);
        if (sd) {
          const sdMB = Math.round(Number(sd.size || 0) / 1024 / 1024);
          servers.push({
            name: `Server 3 (MovieBox Fast SD - ${sd.resolution}p - ${sdMB}MB)`,
            url: sd.url,
            isDirect: true,
            quality: `${sd.resolution}p`
          });
        }
      }

      if (mbSecondary && mbSecondary.best) {
        if (!primaryStreamUrl) primaryStreamUrl = mbSecondary.best.url;
        const sizeMB = Math.round(Number(mbSecondary.best.size || 0) / 1024 / 1024);
        servers.push({
          name: `Server ${servers.length + 1} (MovieBox Backup ${mbSecondary.best.resolution}p - ${sizeMB}MB)`,
          url: mbSecondary.best.url,
          isDirect: true,
          quality: `${mbSecondary.best.resolution}p`
        });
        servers.push({
          name: `Server ${servers.length + 1} (Auto-Renewing Backup Stream)`,
          url: `/api/moviebox/stream?id=${SUBJECT_ID_SECONDARY}&se=${sNum}&ep=${epNum}`,
          isDirect: true,
          quality: `${mbSecondary.best.resolution}p`
        });
      }

      if (!primaryStreamUrl) {
        primaryStreamUrl = `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=${sNum}&e=${epNum}`;
      }

      servers.push({
        name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
        url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=${sNum}&e=${epNum}`,
        isDirect: false,
        quality: '1080p'
      });
      servers.push({
        name: `Server ${servers.length + 1} (AutoEmbed HD)`,
        url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID}/${sNum}/${epNum}`,
        isDirect: false,
        quality: '1080p'
      });
      servers.push({
        name: `Server ${servers.length + 1} (Vidlink Fast HD)`,
        url: `https://vidlink.pro/tv/${TMDB_TV_ID}/${sNum}/${epNum}`,
        isDirect: false,
        quality: '1080p'
      });

      const epObj = {
        number: epNum,
        episode: epNum,
        season: sNum,
        title: tmdbEp.name || `Episode ${epNum}`,
        duration: tmdbEp.runtime ? `${tmdbEp.runtime} min` : '65 min',
        overview: tmdbEp.overview || `Episode ${epNum} of Gyeongseong Creature Season ${sNum}.`,
        still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : (tv.backdrop_path ? `https://image.tmdb.org/t/p/w500${tv.backdrop_path}` : ''),
        streamUrl: primaryStreamUrl,
        servers,
        audioTracks: ['Hindi'],
        captions: (mbPrimary && mbPrimary.captions) || []
      };

      seasonEpisodes.push(epObj);
      allFlattenedEpisodes.push(epObj);
      console.log(`   ✓ S${sNum}E${epNum}: "${epObj.title}" -> ${servers.length} servers (Primary: ${mbPrimary?.best ? mbPrimary.best.resolution + 'p' : 'Fallback'})`);
      await delay(150);
    }

    builtSeasons.push({
      seasonNumber: sNum,
      title: `Season ${sNum}`,
      name: `Season ${sNum}`,
      year: sMeta.year,
      poster: sNum === 1 ? 'https://image.tmdb.org/t/p/w500/1qxRfQq9BI9dZ1nOztEtTkqNgea.jpg' :
                           'https://image.tmdb.org/t/p/w500/9i7c3TYwJpjlWF3uoLMA09BrrDS.jpg',
      episodes: seasonEpisodes
    });
  }

  // Cast
  const cast = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character,
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : ''
  }));

  const directors = (tv.created_by || []).map(c => c.name).join(', ') || 'Chung Dong-yoon, Roh Young-sub';
  const genres = (tv.genres || []).map(g => g.name).join(', ') || 'Action & Adventure, Sci-Fi & Fantasy, Mystery, Drama';

  const now = new Date().toISOString();

  const gyeongseongSeries = {
    id: `mb-s-${SUBJECT_ID_PRIMARY}`,
    subjectId: SUBJECT_ID_PRIMARY,
    tmdbId: TMDB_TV_ID,
    title: 'Gyeongseong Creature [Hindi]',
    originalTitle: tv.original_name || '경성크리처',
    year: '2023',
    releaseDate: now,
    originalReleaseDate: tv.first_air_date || '2023-12-22',
    addedAt: now,
    rating: (tv.vote_average ? tv.vote_average.toFixed(1) : '8.0'),
    votes: String(tv.vote_count || '480'),
    duration: '2 Seasons (17 Episodes)',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/1qxRfQq9BI9dZ1nOztEtTkqNgea.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : '',
    cover: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : (tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : ''),
    overview: tv.overview || "Gyeongseong, 1945. In Seoul's grim era under colonial rule, an entrepreneur and a sleuth fight for survival and face a monster born from human greed.",
    description: tv.overview || "Gyeongseong, 1945. In Seoul's grim era under colonial rule, an entrepreneur and a sleuth fight for survival and face a monster born from human greed.",
    genres: genres,
    genre: genres,
    director: directors,
    cast: cast,
    seasonsCount: 2,
    seasons: builtSeasons,
    episodes: builtSeasons[0].episodes // Season 1 episodes fallback for legacy screens
  };

  console.log('\n💾 Updating content databases...');
  for (const filePath of [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED]) {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ Warning: File not found: ${filePath}`);
      continue;
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Remove any previous entry if present
    content.series = (content.series || []).filter(s =>
      s.id !== gyeongseongSeries.id &&
      !s.title.toLowerCase().includes('gyeongseong creature')
    );

    // Add to the very top (index 0)
    content.series.unshift(gyeongseongSeries);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`   ✓ Saved to ${path.relative(path.join(__dirname, '..'), filePath)}`);
  }

  console.log('\n🎉 Successfully ingested Gyeongseong Creature [Hindi] (Seasons 1-2, 17 Episodes)!');
}

run().catch(err => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
