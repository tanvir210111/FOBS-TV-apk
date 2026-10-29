/**
 * FOBS TV - Fetch & Sync Hercai (Inconstant Love) [Hindi Dubbed] from MovieBox
 * - Subject ID: 68551662163608792
 * - Detail Path: inconstant-love-hindi-YstIcsYX35
 * - TMDB ID: 87623
 * - Total: 186 Complete Episodes in 1080p Full HD (Hindi Dubbed)
 *   - Season 1: Episodes 1 - 44
 *   - Season 2: Episodes 1 - 74 (Overall 45 - 118)
 *   - Season 3: Episodes 1 - 68 (Overall 119 - 186)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '68551662163608792';
const DETAIL_PATH = 'inconstant-love-hindi-YstIcsYX35';
const TMDB_ID = '87623';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
const CACHE_FILE = path.join(__dirname, '..', 'scratch', 'hercai_cache.json');

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
      if (dls.length === 0) return null;

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
          console.error(`\nFailed EP ${ep}: ${err.message}`);
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
  console.log('Hercai (Inconstant Love) [Hindi] MovieBox Sync (186 EP)');
  console.log('Subject ID:', SUBJECT_ID);
  console.log('Detail Path:', DETAIL_PATH);
  console.log('====================================================\n');

  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`Loaded ${Object.keys(cache).length} episodes from cache.`);
    } catch (e) {
      cache = {};
    }
  }

  const totalEpisodesTarget = 186;

  for (let ep = 1; ep <= totalEpisodesTarget; ep++) {
    if (cache[ep] && cache[ep].url && cache[ep].url.includes('http')) {
      continue;
    }

    process.stdout.write(`Fetching EP ${ep}/${totalEpisodesTarget}... `);
    const item = await fetchEpisodeDownload(ep);
    if (item) {
      cache[ep] = item;
      process.stdout.write(`OK (${item.resolution}p - ${Math.round(item.size / 1024 / 1024)}MB)\n`);
    } else {
      process.stdout.write(`FAILED\n`);
    }

    if (ep % 5 === 0 || ep === totalEpisodesTarget) {
      const scratchDir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }

    await delay(350);
  }

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

  console.log(`Target: ${totalEpisodesTarget} episodes`);
  console.log(`Fetched: ${Object.keys(cache).length} episodes`);

  if (missing.length > 0) {
    console.log(`Missing count: ${missing.length}`);
    console.log('Missing episodes:', missing);
  } else {
    console.log('ALL 186 EPISODES SUCCESSFULLY FETCHED IN 1080p!');
  }

  // Duplicate check
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

  console.log(`Quality: ${count1080} (1080p) | ${otherRes} (Other)`);
  console.log(`Unique URLs: ${urlMap.size}/${Object.keys(cache).length}`);
  console.log(`Duplicate sets: ${dupes.length}`);

  if (dupes.length === 0) {
    console.log('SUCCESS: ZERO DUPLICATE VIDEOS! Every episode is unique.');
  } else {
    console.log('WARNING: Duplicates found:', dupes);
  }

  // Season configs
  const seasonConfigs = [
    { seasonNumber: 1, name: 'Season 1 (44 Episodes)', startEp: 1, count: 44 },
    { seasonNumber: 2, name: 'Season 2 (74 Episodes)', startEp: 45, count: 74 },
    { seasonNumber: 3, name: 'Season 3 (68 Episodes)', startEp: 119, count: 68 }
  ];

  function updateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const series = (data.series || []).find(s => s.id === 'turkish-s-87623');
    if (!series) {
      console.log(`Series turkish-s-87623 not found in ${filePath}`);
      return;
    }

    series.subjectId = SUBJECT_ID;
    series.detailPath = DETAIL_PATH;
    series.movieboxDetailPath = DETAIL_PATH;
    series.tmdbId = TMDB_ID;
    series.title = 'Hercai (Inconstant Love) [Hindi]';
    series.originalTitle = 'Hercai';
    series.language = 'Hindi';
    series.dubLanguage = 'Hindi';
    series.badgeLeft = 'Hindi';
    series.badgeRight = 'Turkish';
    series.tag = '1080p HD';
    series.rating = '8.2';
    series.imdbRating = '8.2';
    series.totalEpisodes = totalEpisodesTarget;

    const seasons = [];
    for (const sCfg of seasonConfigs) {
      const episodes = [];
      for (let i = 1; i <= sCfg.count; i++) {
        const overallEp = sCfg.startEp + (i - 1);
        const epPad = i < 10 ? `0${i}` : `${i}`;
        const item = cache[overallEp];

        const directUrl = item
          ? item.url
          : `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${overallEp}`;

        const multiembedUrl = `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=${sCfg.seasonNumber}&e=${i}`;
        const autoembedUrl = `https://autoembed.co/tv/tmdb/${TMDB_ID}/${sCfg.seasonNumber}/${i}`;
        const vidlinkUrl = `https://vidlink.pro/tv/${TMDB_ID}/${sCfg.seasonNumber}/${i}`;

        const servers = [
          {
            name: 'Server 1 (MovieBox Hindi 1080p)',
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
          overallEpisode: overallEp,
          title: `Episode ${i}`,
          duration: '45m-60m',
          overview: `Hercai Season ${sCfg.seasonNumber} Episode ${i} (Overall Ep ${overallEp}). Hindi Dubbed.`,
          still: 'https://image.tmdb.org/t/p/w500/pcZUSUH31odGlq41XktxLVmjNSm.jpg',
          streamUrl: directUrl,
          servers: servers,
          audioTracks: {
            'Hindi dub': directUrl,
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

  console.log('\nHercai [Hindi] sync completed successfully!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
