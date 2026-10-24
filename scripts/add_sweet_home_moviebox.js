/**
 * FOBS TV - Sweet Home [Hindi] (Seasons 1-3) K-Drama Ingestion
 * - TMDB TV ID: 96648 (Sweet Home / 스위트홈)
 * - Season 1: 10 Episodes (2020)
 * - Season 2: 8 Episodes (2023)
 * - Season 3: 8 Episodes (2024)
 * - Total: 3 Seasons (26 Episodes) - 1080p Full HD Hindi Dubbed
 * - Primary MovieBox Subject: 8445472975083767584 (sweet-home-hindi-QYdKgN3mS3a)
 * - Secondary MovieBox Subject: 6640253389706330592 (sweet-home-hindi-IumHTEIqwU7)
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 96648;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_PRIMARY = '8445472975083767584';
const DETAIL_PATH_PRIMARY = 'sweet-home-hindi-QYdKgN3mS3a';

const SUBJECT_ID_SECONDARY = '6640253389706330592';
const DETAIL_PATH_SECONDARY = 'sweet-home-hindi-IumHTEIqwU7';

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
  console.log('Sweet Home [Hindi] (S1-S3) - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1, 2, 3 episodes from TMDB
  const seasonsMetadata = [
    { seasonNumber: 1, count: 10, name: 'Season 1', year: '2020' },
    { seasonNumber: 2, count: 8, name: 'Season 2', year: '2023' },
    { seasonNumber: 3, count: 8, name: 'Season 3', year: '2024' }
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
        overview: `Episode ${epNum} of Sweet Home Season ${sNum}.`,
        still_path: null,
        runtime: 55
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
        duration: tmdbEp.runtime ? `${tmdbEp.runtime} min` : '55 min',
        overview: tmdbEp.overview || `Episode ${epNum} of Sweet Home Season ${sNum}.`,
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
      poster: sNum === 1 ? 'https://image.tmdb.org/t/p/w500/2hnEMvi6NTzRSGzzurKfyKv7Tgu.jpg' :
              (sNum === 2 ? 'https://image.tmdb.org/t/p/w500/Ad0OWnM1c1sY0JOqzOVgzBus7Qd.jpg' :
                            'https://image.tmdb.org/t/p/w500/53rYlKn8sC7k36qZuNqJjRdTQZg.jpg'),
      episodes: seasonEpisodes
    });
  }

  // Cast
  const cast = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character,
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : ''
  }));

  const directors = (tv.created_by || []).map(c => c.name).join(', ') || 'Lee Eung-bok, Jang Young-woo, Park So-hyun';
  const genres = (tv.genres || []).map(g => g.name).join(', ') || 'Sci-Fi & Fantasy, Drama, Mystery';

  const now = new Date().toISOString();

  const sweetHomeSeries = {
    id: `mb-s-${SUBJECT_ID_PRIMARY}`,
    subjectId: SUBJECT_ID_PRIMARY,
    tmdbId: TMDB_TV_ID,
    title: 'Sweet Home [Hindi]',
    originalTitle: tv.original_name || '스위트홈',
    year: '2020',
    releaseDate: now,
    originalReleaseDate: tv.first_air_date || '2020-12-18',
    addedAt: now,
    rating: (tv.vote_average ? tv.vote_average.toFixed(1) : '8.2'),
    votes: String(tv.vote_count || '1250'),
    duration: '3 Seasons (26 Episodes)',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/2hnEMvi6NTzRSGzzurKfyKv7Tgu.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : '',
    cover: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : (tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : ''),
    overview: tv.overview || "As humans turn into savage monsters and the world plunges into terror, a handful of survivors fight to stay alive — and to hold on to their humanity.",
    description: tv.overview || "As humans turn into savage monsters and the world plunges into terror, a handful of survivors fight to stay alive — and to hold on to their humanity.",
    genres: genres,
    genre: genres,
    director: directors,
    cast: cast,
    seasonsCount: 3,
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

    // Remove any previous Sweet Home entry if present
    content.series = (content.series || []).filter(s =>
      s.id !== sweetHomeSeries.id &&
      !s.title.toLowerCase().includes('sweet home')
    );

    // Add to the very top (index 0)
    content.series.unshift(sweetHomeSeries);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`   ✓ Saved to ${path.relative(path.join(__dirname, '..'), filePath)}`);
  }

  console.log('\n🎉 Successfully ingested Sweet Home [Hindi] (Seasons 1-3, 26 Episodes)!');
}

run().catch(err => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
