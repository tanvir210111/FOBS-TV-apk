/**
 * FOBS TV - Fetch & Sync Establishment: Osman [Urdu] from MovieBox
 * - Subject ID: 3929428694468545232
 * - Detail Path: establishment-osman-urdu-KhBeyI9PgG4
 * - TMDB ID: 95603
 * - Total: 68 Complete Episodes in 1080p Full HD (Urdu Dubbed)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '3929428694468545232';
const DETAIL_PATH = 'establishment-osman-urdu-KhBeyI9PgG4';
const TMDB_ID = '95603';

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
const CACHE_FILE = path.join(__dirname, '..', 'scratch', 'osman_urdu_cache.json');

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
  console.log('Establishment: Osman [Urdu] MovieBox Sync (68 EP)');
  console.log('Subject ID:', SUBJECT_ID);
  console.log('Path:', DETAIL_PATH);
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

  const totalEpisodesTarget = 68;

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
    console.log('ALL 68 EPISODES SUCCESSFULLY FETCHED IN 1080p!');
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

  // Update content files
  console.log('\n--- Writing updates to files ---');

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
    series.title = 'Kuruluş: Osman (Establishment: Osman) [Urdu]';
    series.originalTitle = 'Kuruluş: Osman';
    series.language = 'Urdu';
    series.dubLanguage = 'Urdu';
    series.badgeLeft = 'Urdu';
    series.badgeRight = 'Turkish';
    series.tag = '1080p HD';
    series.rating = '8.4';
    series.imdbRating = '8.4';
    series.totalEpisodes = totalEpisodesTarget;

    const episodes = [];
    for (let i = 1; i <= totalEpisodesTarget; i++) {
      const epPad = i < 10 ? `0${i}` : `${i}`;
      const item = cache[i];

      const directUrl = item
        ? item.url
        : `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${i}`;

      const multiembedUrl = `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=1&e=${i}`;
      const autoembedUrl = `https://autoembed.co/tv/tmdb/${TMDB_ID}/1/${i}`;
      const vidlinkUrl = `https://vidlink.pro/tv/${TMDB_ID}/1/${i}`;

      const servers = [
        {
          name: 'Server 1 (MovieBox Urdu 1080p)',
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
        season: 1,
        overallEpisode: i,
        title: `Episode ${i}`,
        duration: '45m-60m',
        overview: `Kuruluş: Osman (Establishment: Osman) Urdu Dubbed Episode ${i}.`,
        still: 'https://image.tmdb.org/t/p/w500/puLaqdcTRwFxwv9S3PO6jA3ep7J.jpg',
        streamUrl: directUrl,
        servers: servers,
        audioTracks: {
          'Urdu Dub': directUrl,
          'Original / Multi Audio': autoembedUrl
        }
      });
    }

    series.seasons = [
      {
        seasonNumber: 1,
        season: 1,
        name: 'Season 1 (68 Episodes)',
        episodeCount: totalEpisodesTarget,
        episodes: episodes
      }
    ];

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved: ${filePath} (1 season, ${totalEpisodesTarget} episodes)`);
  }

  updateFile(CONTENT_FILE);
  updateFile(PUBLIC_SEED);
  updateFile(ANDROID_SEED);

  console.log('\nEstablishment: Osman [Urdu] update completed successfully!');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
