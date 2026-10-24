/**
 * FOBS TV - High School Return of a Gangster [Hindi] K-Drama Ingestion
 * - TMDB TV ID: 224030 (High School Return of a Gangster / 조폭인 내가 고등학생이 되었습니다, 2024) - 8 Episodes
 * - Primary MovieBox Subject: 3622255521824228456 (high-school-return-of-a-gangster-hindi-GFI0WK3Yzj4) -> Hindi Dub 1080p
 * - Secondary MovieBox Subject: 6930023915360583800 (high-school-return-of-a-gangster-8ydAeg9AVf8) -> 1080p Full HD
 * - Total: 1 Season (8 Episodes)
 * - Syncs across:
 *     - data/content.json
 *     - public/seed-content.json
 *     - android/app/src/main/assets/public/seed-content.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_TV_ID = 224030;

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID_PRIMARY = '3622255521824228456';
const DETAIL_PATH_PRIMARY = 'high-school-return-of-a-gangster-hindi-GFI0WK3Yzj4';

const SUBJECT_ID_SECONDARY = '6930023915360583800';
const DETAIL_PATH_SECONDARY = 'high-school-return-of-a-gangster-8ydAeg9AVf8';

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
  console.log('High School Return of a Gangster [Hindi] - TMDB & MovieBox Ingestion');
  console.log('====================================================\n');

  // 1. Fetch TMDB TV details
  console.log(`📺 Fetching TV details from TMDB (ID: ${TMDB_TV_ID})...`);
  const tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tv = tmdbRes.data;

  // 2. Fetch Season 1 episodes from TMDB
  console.log('📋 Fetching Season 1 episodes from TMDB...');
  let tmdbEpisodes = [];
  try {
    const sRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_TV_ID}/season/1`, {
      params: { api_key: TMDB_API_KEY }
    });
    tmdbEpisodes = sRes.data.episodes || [];
  } catch (e) {
    console.log('   TMDB fetch warning:', e.message);
  }

  // 3. Build episodes (8 episodes)
  console.log('\n⚡ Fetching MovieBox streams for 8 episodes...');
  const episodes = [];

  for (let i = 0; i < 8; i++) {
    const epNum = i + 1;
    const tmdbEp = tmdbEpisodes[i] || {
      name: `Episode ${epNum}`,
      overview: `Episode ${epNum} of High School Return of a Gangster.`,
      still_path: null,
      runtime: 65
    };

    // Fetch primary (Hindi Dub 1080p) and secondary (1080p)
    const [mbPrimary, mbSecondary] = await Promise.all([
      fetchEpisodeDownload(SUBJECT_ID_PRIMARY, DETAIL_PATH_PRIMARY, 1, epNum),
      fetchEpisodeDownload(SUBJECT_ID_SECONDARY, DETAIL_PATH_SECONDARY, 1, epNum)
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
        url: `/api/moviebox/stream?id=${SUBJECT_ID_PRIMARY}&se=1&ep=${epNum}`,
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
        name: `Server ${servers.length + 1} (MovieBox Full HD Backup ${mbSecondary.best.resolution}p - ${sizeMB}MB)`,
        url: mbSecondary.best.url,
        isDirect: true,
        quality: `${mbSecondary.best.resolution}p`
      });
      servers.push({
        name: `Server ${servers.length + 1} (Auto-Renewing Backup Stream)`,
        url: `/api/moviebox/stream?id=${SUBJECT_ID_SECONDARY}&se=1&ep=${epNum}`,
        isDirect: true,
        quality: `${mbSecondary.best.resolution}p`
      });
    }

    if (!primaryStreamUrl) {
      primaryStreamUrl = `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`;
    }

    servers.push({
      name: `Server ${servers.length + 1} (MultiEmbed HD Failover)`,
      url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&s=1&e=${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${servers.length + 1} (AutoEmbed HD)`,
      url: `https://player.autoembed.cc/embed/tv/${TMDB_TV_ID}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });
    servers.push({
      name: `Server ${servers.length + 1} (Vidlink Fast HD)`,
      url: `https://vidlink.pro/tv/${TMDB_TV_ID}/1/${epNum}`,
      isDirect: false,
      quality: '1080p'
    });

    const epObj = {
      number: epNum,
      episode: epNum,
      season: 1,
      title: tmdbEp.name || `Episode ${epNum}`,
      duration: tmdbEp.runtime ? `${tmdbEp.runtime} min` : '65 min',
      overview: tmdbEp.overview || `Episode ${epNum} of High School Return of a Gangster.`,
      still: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : (tv.backdrop_path ? `https://image.tmdb.org/t/p/w500${tv.backdrop_path}` : ''),
      streamUrl: primaryStreamUrl,
      servers,
      audioTracks: ['Hindi'],
      captions: (mbPrimary && mbPrimary.captions) || []
    };

    episodes.push(epObj);
    console.log(`   ✓ Ep ${epNum}: "${epObj.title}" -> ${servers.length} servers (Primary: ${mbPrimary?.best ? mbPrimary.best.resolution + 'p' : 'Fallback'})`);
    await delay(150);
  }

  // Cast
  const cast = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character,
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : ''
  }));

  const directors = (tv.created_by || []).map(c => c.name).join(', ') || 'Lee Sung-taek, Jung Da-hee';
  const genres = (tv.genres || []).map(g => g.name).join(', ') || 'Action & Adventure, Sci-Fi & Fantasy, Drama';

  const now = new Date().toISOString();

  const gangsterSeries = {
    id: `mb-s-${SUBJECT_ID_PRIMARY}`,
    subjectId: SUBJECT_ID_PRIMARY,
    tmdbId: TMDB_TV_ID,
    title: 'High School Return of a Gangster [Hindi]',
    originalTitle: tv.original_name || '조폭인 내가 고등학생이 되었습니다',
    year: '2024',
    releaseDate: now,
    originalReleaseDate: tv.first_air_date || '2024-05-29',
    addedAt: now,
    rating: (tv.vote_average ? tv.vote_average.toFixed(1) : '8.5'),
    votes: String(tv.vote_count || '180'),
    duration: '1 Season (8 Episodes)',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    badgeLeft: 'K-Drama',
    badgeRight: 'Hindi Dub',
    poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/g2gizkmoPVP80RxjSpUHQxl8MZb.jpg',
    backdrop: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : '',
    cover: tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : (tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : ''),
    overview: tv.overview || "A 47-year-old gangster whose soul unexpectedly possesses the body of an 18-year-old high school student who was driven to despair by severe school bullying.",
    description: tv.overview || "A 47-year-old gangster whose soul unexpectedly possesses the body of an 18-year-old high school student who was driven to despair by severe school bullying.",
    genres: genres,
    genre: genres,
    director: directors,
    cast: cast,
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2024',
        poster: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : 'https://image.tmdb.org/t/p/w500/g2gizkmoPVP80RxjSpUHQxl8MZb.jpg',
        episodes: episodes
      }
    ],
    episodes: episodes
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
      s.id !== gangsterSeries.id &&
      !s.title.toLowerCase().includes('return of a gangster')
    );

    // Add to the very top (index 0)
    content.series.unshift(gangsterSeries);

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    console.log(`   ✓ Saved to ${path.relative(path.join(__dirname, '..'), filePath)}`);
  }

  console.log('\n🎉 Successfully ingested High School Return of a Gangster [Hindi] (8 Episodes)!');
}

run().catch(err => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
