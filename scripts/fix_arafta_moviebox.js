/**
 * FOBS TV - Fetch & Verify Arafta [Hindi] from MovieBox
 * - Subject ID: 7818895120744824984 (arafta-hindi-0y70kiBCAj9)
 * - TMDB ID: 306118
 * - Total 126 Episodes:
 *   - Season 1: Episodes 1 - 100
 *   - Season 2: Episodes 1 - 26
 *
 * Verifies links, videos, uniqueness (no duplicates), resolution,
 * and updates data/content.json, public/seed-content.json, and android seed.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '7818895120744824984';
const DETAIL_PATH = 'arafta-hindi-0y70kiBCAj9';
const TMDB_ID = '306118';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
const CACHE_FILE = path.join(__dirname, '..', 'scratch', 'arafta_cache.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/movies/${DETAIL_PATH}`,
  'Accept': 'application/json'
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchEpisodeDownload(se, ep) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId: SUBJECT_ID, se, ep },
        headers: HEADERS,
        timeout: 15000
      });

      const dls = res.data?.data?.downloads || [];
      if (dls.length === 0) {
        // Try play endpoint as fallback
        const playRes = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/play`, {
          params: { subjectId: SUBJECT_ID, se, ep },
          headers: HEADERS,
          timeout: 15000
        });
        const streams = playRes.data?.data?.streams || [];
        if (streams.length === 0) return null;
        const sorted = [...streams].sort((a, b) => (parseInt(b.resolutions || 0) - parseInt(a.resolutions || 0)));
        return {
          se,
          ep,
          resolution: parseInt(sorted[0].resolutions || 720),
          url: sorted[0].url,
          size: sorted[0].size
        };
      }

      // Sort by resolution descending (1080 -> 720 -> 480 -> 360)
      const sorted = [...dls].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      return {
        se,
        ep,
        resolution: sorted[0].resolution,
        url: sorted[0].url,
        size: sorted[0].size
      };
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const waitTime = attempts * 3000;
        process.stdout.write(` [429 rate limit S${se}E${ep}, waiting ${waitTime/1000}s...] `);
        await delay(waitTime);
      } else {
        if (attempts >= maxAttempts) {
          console.error(`\nFailed S${se}E${ep} after ${attempts} attempts: ${err.message}`);
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
  console.log('Arafta [Hindi] MovieBox Check & Sync (126 Episodes)');
  console.log('Subject ID:', SUBJECT_ID);
  console.log('====================================================\n');

  // Load existing cache
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`Loaded ${Object.keys(cache).length} episodes from existing cache.`);
    } catch (e) {
      cache = {};
    }
  }

  const seasonPlan = [
    { seasonNumber: 1, name: 'Season 1 (100 Episodes)', count: 100 },
    { seasonNumber: 2, name: 'Season 2 (26 Episodes)', count: 26 }
  ];

  const totalEpisodesTarget = 126;
  let newlyFetched = 0;

  for (const sCfg of seasonPlan) {
    const se = sCfg.seasonNumber;
    console.log(`\n--- Fetching Season ${se} (${sCfg.count} Episodes) ---`);

    for (let ep = 1; ep <= sCfg.count; ep++) {
      const key = `s${se}_e${ep}`;
      if (cache[key] && cache[key].url && cache[key].url.includes('http')) {
        continue;
      }

      process.stdout.write(`S${se}E${ep}/${sCfg.count}... `);
      const item = await fetchEpisodeDownload(se, ep);
      if (item) {
        cache[key] = item;
        newlyFetched++;
        process.stdout.write(`OK (${item.resolution}p)\n`);
      } else {
        process.stdout.write(`FAILED\n`);
      }

      // Save cache periodically
      if (ep % 5 === 0 || ep === sCfg.count) {
        const scratchDir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
      }

      await delay(350);
    }
  }

  // Final cache save
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  console.log('\n====================================================');
  console.log('RESULTS & VERIFICATION');
  console.log('====================================================');

  const missing = [];
  for (const sCfg of seasonPlan) {
    const se = sCfg.seasonNumber;
    for (let ep = 1; ep <= sCfg.count; ep++) {
      const key = `s${se}_e${ep}`;
      if (!cache[key] || !cache[key].url) {
        missing.push(key);
      }
    }
  }

  console.log(`Target Episodes: ${totalEpisodesTarget}`);
  console.log(`Cached Episodes: ${Object.keys(cache).length}`);
  if (missing.length > 0) {
    console.log(`Missing episodes (${missing.length}):`, missing);
  } else {
    console.log('ALL 126 EPISODES SUCCESSFULLY FETCHED FROM MOVIEBOX!');
  }

  // Uniqueness and duplicates check
  const urlMap = new Map();
  let count1080 = 0;
  let count720 = 0;
  let count480 = 0;
  let count360 = 0;

  for (const [key, item] of Object.entries(cache)) {
    if (!item || !item.url) continue;
    if (item.resolution >= 1080) count1080++;
    else if (item.resolution >= 720) count720++;
    else if (item.resolution >= 480) count480++;
    else count360++;

    const baseCleanUrl = item.url.split('?')[0];
    if (!urlMap.has(baseCleanUrl)) {
      urlMap.set(baseCleanUrl, []);
    }
    urlMap.get(baseCleanUrl).push(key);
  }

  const dupes = [];
  for (const [url, eps] of urlMap.entries()) {
    if (eps.length > 1) {
      dupes.push({ url, episodes: eps });
    }
  }

  console.log(`\nQuality breakdown:`);
  console.log(`  - 1080p: ${count1080} episodes`);
  console.log(`  - 720p:  ${count720} episodes`);
  console.log(`  - 480p:  ${count480} episodes`);
  console.log(`  - 360p:  ${count360} episodes`);
  console.log(`Unique video URLs: ${urlMap.size}/${Object.keys(cache).length}`);
  console.log(`Duplicate sets: ${dupes.length}`);

  if (dupes.length === 0) {
    console.log('SUCCESS: ZERO DUPLICATE VIDEOS! Every episode has a unique MovieBox stream.');
  } else {
    console.log('WARNING: Found duplicates:', JSON.stringify(dupes, null, 2));
  }

  // Write updates to all content files
  console.log('\n--- Writing updates to files ---');

  function updateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const series = (data.series || []).find(s => s.id === 'turkish-s-306118');
    if (!series) {
      console.log(`Series turkish-s-306118 not found in ${filePath}`);
      return;
    }

    series.subjectId = SUBJECT_ID;
    series.detailPath = DETAIL_PATH;
    series.movieboxDetailPath = DETAIL_PATH;
    series.tmdbId = TMDB_ID;
    series.language = 'Hindi';
    series.dubLanguage = 'Hindi';
    series.badgeLeft = 'Hindi';
    series.badgeRight = 'Turkish';
    series.tag = 'HD';
    series.rating = '7.8';
    series.imdbRating = '7.8';
    series.totalEpisodes = totalEpisodesTarget;

    const seasons = [];
    let overallEpCounter = 0;

    for (const sCfg of seasonPlan) {
      const se = sCfg.seasonNumber;
      const episodes = [];

      for (let ep = 1; ep <= sCfg.count; ep++) {
        overallEpCounter++;
        const epPad = ep < 10 ? `0${ep}` : `${ep}`;
        const key = `s${se}_e${ep}`;
        const item = cache[key];

        const directUrl = item
          ? item.url
          : `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=${se}&ep=${ep}`;

        const multiembedUrl = `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=${se}&e=${ep}`;
        const autoembedUrl = `https://autoembed.co/tv/tmdb/${TMDB_ID}/${se}/${ep}`;
        const vidlinkUrl = `https://vidlink.pro/tv/${TMDB_ID}/${se}/${ep}`;

        const servers = [
          {
            name: 'Server 1 (MovieBox Hindi HD)',
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
          episode: ep,
          episodeNumber: ep,
          season: se,
          overallEpisode: overallEpCounter,
          title: `Episode ${ep}`,
          duration: '45m-60m',
          overview: `Arafta Hindi Dubbed Season ${se} Episode ${ep} (Overall Ep ${overallEpCounter}).`,
          still: 'https://image.tmdb.org/t/p/w500/wuHqvkUVc5jVbeVnTw37Oe8ikC7.jpg',
          streamUrl: directUrl,
          servers: servers,
          audioTracks: {
            'Hindi dub': directUrl,
            'Original / Multi Audio': autoembedUrl
          }
        });
      }

      seasons.push({
        seasonNumber: se,
        season: se,
        name: sCfg.name,
        episodeCount: sCfg.count,
        episodes: episodes
      });
    }

    series.seasons = seasons;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved: ${filePath} (2 seasons, ${totalEpisodesTarget} episodes)`);
  }

  updateFile(CONTENT_FILE);
  updateFile(PUBLIC_SEED);
  updateFile(ANDROID_SEED);

  console.log('\nArafta check and update finished!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
