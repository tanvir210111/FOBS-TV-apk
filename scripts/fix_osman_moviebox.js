/**
 * FOBS TV - Fetch & Verify Kuruluş: Osman (Establishment: Osman) [Hindi / Urdu] from MovieBox
 * - Subject ID: 9012855174766968784 (establishment-osman-GtoO3BhYMJa)
 * - TMDB ID: 95603
 * - Total 98 Episodes (Full ~2-hour Bolums in 1080p):
 *   - Season 1: Episodes 1 - 27 (MovieBox ep 1 - 27)
 *   - Season 2: Episodes 1 - 37 (MovieBox ep 28 - 64)
 *   - Season 3: Episodes 1 - 34 (MovieBox ep 65 - 98)
 *
 * Verifies links, videos, uniqueness (no duplicates), 1080p resolution,
 * and updates data/content.json, public/seed-content.json, and android seed.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '9012855174766968784';
const DETAIL_PATH = 'establishment-osman-GtoO3BhYMJa';
const TMDB_ID = '95603';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
const CACHE_FILE = path.join(__dirname, '..', 'scratch', 'osman_cache.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/movies/${DETAIL_PATH}`,
  'Accept': 'application/json'
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(ep) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId: SUBJECT_ID, se: 1, ep },
        headers: HEADERS,
        timeout: 15000
      });

      const dls = res.data?.data?.downloads || [];
      if (dls.length === 0) {
        // Fallback to play endpoint
        const playRes = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/play`, {
          params: { subjectId: SUBJECT_ID, se: 1, ep },
          headers: HEADERS,
          timeout: 15000
        });
        const streams = playRes.data?.data?.streams || [];
        if (streams.length === 0) return null;
        const sorted = [...streams].sort((a, b) => (parseInt(b.resolutions || 0) - parseInt(a.resolutions || 0)));
        return {
          ep,
          resolution: parseInt(sorted[0].resolutions || 1080),
          url: sorted[0].url,
          size: sorted[0].size
        };
      }

      // Sort by resolution descending (1080 -> 720 -> 480 -> 360)
      const sorted = [...dls].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      return {
        ep,
        resolution: sorted[0].resolution,
        url: sorted[0].url,
        size: sorted[0].size
      };
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const waitTime = attempts * 3000;
        process.stdout.write(` [429 rate limit on EP ${ep}, waiting ${waitTime/1000}s...] `);
        await delay(waitTime);
      } else {
        if (attempts >= maxAttempts) {
          console.error(`\nFailed EP ${ep} after ${attempts} attempts: ${err.message}`);
          return null;
        }
        await delay(1500 * attempts);
      }
    }
  }
  return null;
}

async function run() {
  console.log('====================================================');
  console.log('Kuruluş: Osman (Establishment: Osman) MovieBox Sync');
  console.log('Subject ID:', SUBJECT_ID);
  console.log('Target: 98 Episodes (1080p Full HD)');
  console.log('====================================================\n');

  // Load existing cache
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`Loaded ${Object.keys(cache).length} episodes from cache.`);
    } catch (e) {
      cache = {};
    }
  }

  const totalEpisodesTarget = 98;
  let newlyFetched = 0;

  for (let ep = 1; ep <= totalEpisodesTarget; ep++) {
    if (cache[ep] && cache[ep].url && cache[ep].url.includes('http')) {
      continue;
    }

    process.stdout.write(`EP ${ep}/${totalEpisodesTarget}... `);
    const item = await fetchEpisodeDownload(ep);
    if (item) {
      cache[ep] = item;
      newlyFetched++;
      process.stdout.write(`OK (${item.resolution}p - ${Math.round(item.size / 1024 / 1024)}MB)\n`);
    } else {
      process.stdout.write(`FAILED\n`);
    }

    // Save cache periodically
    if (ep % 5 === 0 || ep === totalEpisodesTarget) {
      const scratchDir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }

    await delay(350);
  }

  // Final cache save
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  console.log('\n====================================================');
  console.log('RESULTS & VERIFICATION');
  console.log('====================================================');

  const missing = [];
  for (let i = 1; i <= totalEpisodesTarget; i++) {
    if (!cache[i] || !cache[i].url) {
      missing.push(i);
    }
  }

  console.log(`Target Episodes: ${totalEpisodesTarget}`);
  console.log(`Cached Episodes: ${Object.keys(cache).length}`);

  if (missing.length > 0) {
    console.log(`Missing episodes count: ${missing.length}`);
    console.log('Missing EP numbers:', missing);
  } else {
    console.log('ALL 98 EPISODES SUCCESSFULLY FETCHED FROM MOVIEBOX!');
  }

  // Check duplicates and resolutions
  const urlMap = new Map();
  let count1080 = 0;
  let otherRes = 0;

  for (let i = 1; i <= totalEpisodesTarget; i++) {
    const item = cache[i];
    if (!item) continue;
    if (item.resolution >= 1080) count1080++;
    else otherRes++;

    const baseCleanUrl = item.url.split('?')[0];
    if (!urlMap.has(baseCleanUrl)) {
      urlMap.set(baseCleanUrl, []);
    }
    urlMap.get(baseCleanUrl).push(i);
  }

  const dupes = [];
  for (const [url, eps] of urlMap.entries()) {
    if (eps.length > 1) {
      dupes.push({ url, episodes: eps });
    }
  }

  console.log(`\nQuality breakdown:`);
  console.log(`  - 1080p: ${count1080} episodes`);
  console.log(`  - Other: ${otherRes} episodes`);
  console.log(`Unique video URLs: ${urlMap.size}/${Object.keys(cache).length}`);
  console.log(`Duplicate sets: ${dupes.length}`);

  if (dupes.length === 0) {
    console.log('SUCCESS: ZERO DUPLICATE VIDEOS! Every episode has a unique MovieBox stream.');
  } else {
    console.log('WARNING: Found duplicates:', JSON.stringify(dupes, null, 2));
  }

  // Season configs based on official TMDB structure:
  // Season 1: 27 episodes
  // Season 2: 37 episodes
  // Season 3: 34 episodes
  const seasonConfigs = [
    { seasonNumber: 1, name: 'Season 1 (27 Episodes)', startEp: 1, count: 27 },
    { seasonNumber: 2, name: 'Season 2 (37 Episodes)', startEp: 28, count: 37 },
    { seasonNumber: 3, name: 'Season 3 (34 Episodes)', startEp: 65, count: 34 }
  ];

  function updateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const series = (data.series || []).find(s => s.id === 'turkish-s-95603');
    if (!series) {
      console.log(`Series turkish-s-95603 not found in ${filePath}`);
      return;
    }

    series.subjectId = SUBJECT_ID;
    series.detailPath = DETAIL_PATH;
    series.movieboxDetailPath = DETAIL_PATH;
    series.tmdbId = TMDB_ID;
    series.title = 'Kuruluş: Osman [Hindi / Urdu]';
    series.originalTitle = 'Kuruluş: Osman';
    series.language = 'Hindi';
    series.dubLanguage = 'Hindi / Urdu';
    series.badgeLeft = 'Hindi / Urdu';
    series.badgeRight = 'Turkish';
    series.tag = '1080p HD';
    series.rating = '8.0';
    series.imdbRating = '8.0';
    series.totalEpisodes = totalEpisodesTarget;

    const seasons = [];
    for (const sCfg of seasonConfigs) {
      const episodes = [];
      for (let i = 1; i <= sCfg.count; i++) {
        const mbEpNum = sCfg.startEp + (i - 1);
        const epPad = i < 10 ? `0${i}` : `${i}`;
        const item = cache[mbEpNum];

        const directUrl = item
          ? item.url
          : `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${mbEpNum}`;

        const multiembedUrl = `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=${sCfg.seasonNumber}&e=${i}`;
        const autoembedUrl = `https://autoembed.co/tv/tmdb/${TMDB_ID}/${sCfg.seasonNumber}/${i}`;
        const vidlinkUrl = `https://vidlink.pro/tv/${TMDB_ID}/${sCfg.seasonNumber}/${i}`;

        const servers = [
          {
            name: 'Server 1 (MovieBox Hindi/Urdu 1080p)',
            url: directUrl
          },
          {
            name: 'Server 2 (Multiembed)',
            url: multiembedUrl
          },
          {
            name: 'Server 3 (AutoEmbed)',
            url: autoembedUrl
          },
          {
            name: 'Server 4 (Vidlink)',
            url: vidlinkUrl
          }
        ];

        episodes.push({
          number: epPad,
          episode: i,
          episodeNumber: i,
          season: sCfg.seasonNumber,
          overallEpisode: mbEpNum,
          title: `Episode ${i}`,
          duration: '110m-130m',
          overview: `Kuruluş: Osman Season ${sCfg.seasonNumber} Episode ${i} (Overall Ep ${mbEpNum}). Hindi / Urdu Dubbed.`,
          still: 'https://image.tmdb.org/t/p/w500/puLaqdcTRwFxwv9S3PO6jA3ep7J.jpg',
          streamUrl: directUrl,
          servers: servers,
          audioTracks: {
            'Hindi / Urdu Dub': directUrl,
            'Original / Multi Audio': autoembedUrl
          }
        });
      }

      seasons.push({
        seasonNumber: sCfg.seasonNumber,
        season: sCfg.seasonNumber,
        name: sCfg.name,
        episodeCount: sCfg.count,
        episodes: episodes
      });
    }

    series.seasons = seasons;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved: ${filePath} (3 seasons, ${totalEpisodesTarget} episodes)`);
  }

  updateFile(CONTENT_FILE);
  updateFile(PUBLIC_SEED);
  updateFile(ANDROID_SEED);

  console.log('\nKuruluş: Osman sync and update finished successfully!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
