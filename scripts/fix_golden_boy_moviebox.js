/**
 * FOBS TV - Robust Fetch & Verify for Golden Boy (Yalı Çapkını) Hindi Dubbed
 * - Subject ID: 2706073799983877168 (golden-boy-hindi-84Y8uLuQTd3)
 * - TMDB ID: 210865
 * - Total 371 Episodes:
 *   - Season 1: Episodes 1 - 118 (MovieBox ep 1 - 118)
 *   - Season 2: Episodes 1 - 127 (MovieBox ep 119 - 245)
 *   - Season 3: Episodes 1 - 126 (MovieBox ep 246 - 371)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '2706073799983877168';
const DETAIL_PATH = 'golden-boy-hindi-84Y8uLuQTd3';
const TMDB_ID = '210865';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
const CACHE_FILE = path.join(__dirname, '..', 'scratch', 'golden_boy_cache.json');

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
        // Try play endpoint as alternative
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

      // Sort by resolution descending (1080 -> 720 -> 480)
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
  console.log('Golden Boy [Hindi] Full MovieBox Check & Sync (371 EP)');
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

  // Also pre-seed cache from current content.json if valid direct links exist
  if (fs.existsSync(CONTENT_FILE)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
      const existingGb = existingData.series?.find(s => s.id === 'turkish-s-210865');
      if (existingGb && existingGb.seasons) {
        for (const sea of existingGb.seasons) {
          for (const ep of sea.episodes || []) {
            const overallEp = ep.overallEpisode;
            const u = ep.servers?.[0]?.url || '';
            if (overallEp && u.includes('hakunaymatata') && !cache[overallEp]) {
              cache[overallEp] = {
                ep: overallEp,
                resolution: 1080,
                url: u
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  const totalEpisodes = 371;
  console.log(`Pre-cached episodes: ${Object.keys(cache).length}/${totalEpisodes}`);

  // Fetch missing episodes sequentially with 350ms delay
  let newlyFetched = 0;
  for (let ep = 1; ep <= totalEpisodes; ep++) {
    if (cache[ep] && cache[ep].url && cache[ep].url.includes('http')) {
      continue;
    }

    process.stdout.write(`Fetching EP ${ep}/${totalEpisodes}... `);
    const item = await fetchEpisodeDownload(ep);
    if (item) {
      cache[ep] = item;
      newlyFetched++;
      process.stdout.write(`OK (${item.resolution}p)\n`);
    } else {
      process.stdout.write(`FAILED\n`);
    }

    // Save cache every 5 episodes or on each episode
    if (ep % 5 === 0 || ep === totalEpisodes) {
      const scratchDir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }

    await delay(350);
  }

  // Save final cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  console.log('\n====================================================');
  console.log('RESULTS & VERIFICATION');
  console.log('====================================================');
  const cachedEpisodes = Object.keys(cache).map(Number);
  console.log(`Total episodes target: ${totalEpisodes}`);
  console.log(`Total episodes fetched: ${cachedEpisodes.length}`);

  const missing = [];
  for (let i = 1; i <= totalEpisodes; i++) {
    if (!cache[i] || !cache[i].url) missing.push(i);
  }

  if (missing.length > 0) {
    console.log(`Missing episodes count: ${missing.length}`);
    console.log('Missing EP numbers:', missing.slice(0, 20), missing.length > 20 ? '...' : '');
  } else {
    console.log('ALL 371 EPISODES PRESENT AND RESOLVED!');
  }

  // Uniqueness and duplicates check
  const urlMap = new Map();
  let count1080 = 0;
  let otherRes = 0;

  for (let i = 1; i <= totalEpisodes; i++) {
    const item = cache[i];
    if (!item) continue;
    if (item.resolution === 1080) count1080++;
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
  console.log(`Unique video URLs: ${urlMap.size}/${cachedEpisodes.length}`);
  console.log(`Duplicate sets: ${dupes.length}`);

  if (dupes.length === 0) {
    console.log('SUCCESS: ZERO DUPLICATE VIDEOS! Every episode has a unique MovieBox stream.');
  } else {
    console.log('WARNING: Found duplicates:', JSON.stringify(dupes, null, 2));
  }

  // Write updates to all content files
  console.log('\n--- Writing updates to files ---');

  const seasonConfigs = [
    { seasonNumber: 1, name: 'Season 1 (118 Episodes)', startEp: 1, count: 118 },
    { seasonNumber: 2, name: 'Season 2 (127 Episodes)', startEp: 119, count: 127 },
    { seasonNumber: 3, name: 'Season 3 (126 Episodes)', startEp: 246, count: 126 }
  ];

  function updateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const series = (data.series || []).find(s => s.id === 'turkish-s-210865');
    if (!series) {
      console.log(`Series turkish-s-210865 not found in ${filePath}`);
      return;
    }

    series.subjectId = SUBJECT_ID;
    series.detailPath = DETAIL_PATH;
    series.movieboxDetailPath = DETAIL_PATH;
    series.language = 'Hindi';
    series.dubLanguage = 'Hindi';
    series.totalEpisodes = totalEpisodes;

    const seasons = [];
    for (const sCfg of seasonConfigs) {
      const episodes = [];
      for (let i = 1; i <= sCfg.count; i++) {
        const overallEp = sCfg.startEp + (i - 1);
        const epPad = i < 10 ? `0${i}` : `${i}`;
        const item = cache[overallEp];

        const directUrl = item ? item.url : `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${overallEp}`;
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
          season: sCfg.seasonNumber,
          overallEpisode: overallEp,
          title: `Episode ${i}`,
          duration: '45m-60m',
          overview: `Golden Boy (Yalı Çapkını) Hindi Dubbed Season ${sCfg.seasonNumber} Episode ${i} (Overall Ep ${overallEp}).`,
          still: 'https://image.tmdb.org/t/p/w500/vDqCoaMU5FUAuUs0EvL4OAUCxJk.jpg',
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
    console.log(`Saved: ${filePath}`);
  }

  updateFile(CONTENT_FILE);
  updateFile(PUBLIC_SEED);
  updateFile(ANDROID_SEED);

  console.log('\nGolden Boy check and update finished!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
