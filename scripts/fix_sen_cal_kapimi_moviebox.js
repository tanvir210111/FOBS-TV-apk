/**
 * Fix Sen Cal Kapimi - Fetch proper per-episode MovieBox streams
 *
 * Problem: 108 out of 140 episodes had the SAME URL (EP1's URL repeated)
 * Fix: Re-fetch each episode individually from MovieBox using correct subjectId
 *
 * Correct MovieBox subjectId: 5652213277632382032 (Love Is in the Air S1-S2)
 * detailPath: love-is-in-the-air-AY18wpccxJ6
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://h5.aoneroom.com';
const SUBJECT_ID = '5652213277632382032';
const DETAIL_PATH = 'love-is-in-the-air-AY18wpccxJ6';
const TMDB_ID = 104877;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/movies/${DETAIL_PATH}`,
  'Accept': 'application/json'
};

const CONTENT_FILE = path.join(__dirname, '../data/content.json');
const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * Fetch MovieBox stream URL for a specific season/episode
 * Returns { url, resolution } or null if not available
 */
async function fetchEpisodeUrl(se, ep, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId: SUBJECT_ID, se, ep },
        headers: HEADERS,
        timeout: 15000
      });

      const data = res.data && res.data.data;
      if (!data || !data.downloads || data.downloads.length === 0) {
        return null;
      }

      const sorted = [...data.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      const best = sorted[0];

      return {
        url: best.url,
        resolution: best.resolution
      };
    } catch (e) {
      if (attempt < retries) {
        await delay(2000 * attempt);
      } else {
        return null;
      }
    }
  }
  return null;
}

/**
 * Build servers array: MovieBox as #1, embed fallbacks as #2-4
 */
function buildServers(movieboxUrl, se, ep) {
  const servers = [];

  if (movieboxUrl) {
    servers.push({
      name: 'Server 1 (MovieBox HD)',
      url: movieboxUrl
    });
  }

  servers.push({
    name: 'Server 2 (Multiembed)',
    url: `https://multiembed.mov/?video_id=${TMDB_ID}&tmdb=1&s=${se}&e=${ep}`
  });
  servers.push({
    name: 'Server 3 (AutoEmbed)',
    url: `https://autoembed.co/tv/tmdb/${TMDB_ID}/${se}/${ep}`
  });
  servers.push({
    name: 'Server 4 (Vidlink)',
    url: `https://vidlink.pro/tv/${TMDB_ID}/${se}/${ep}`
  });

  return servers;
}

async function main() {
  console.log('=== Fix Sen Cal Kapimi - MovieBox Episode Streams ===\n');

  const raw = fs.readFileSync(CONTENT_FILE, 'utf-8');
  const contentData = JSON.parse(raw);

  const seriesIndex = (contentData.series || []).findIndex(
    s => s.title && s.title.includes('Sen') && s.title.includes('al')
  );

  if (seriesIndex === -1) {
    console.error('ERROR: Series not found in content.json!');
    process.exit(1);
  }

  const series = contentData.series[seriesIndex];
  console.log('Found: "' + series.title + '"');
  console.log('Total seasons:', series.seasons ? series.seasons.length : 0);
  console.log('Old subjectId:', series.subjectId);
  console.log('New subjectId:', SUBJECT_ID, '\n');

  // Update subjectId
  series.subjectId = SUBJECT_ID;
  series.movieboxDetailPath = DETAIL_PATH;

  let totalFetched = 0;
  let totalFailed = 0;
  let duplicatesBefore = 0;

  // Count duplicates before fix
  const allUrlsBefore = [];
  (series.seasons || []).forEach(season => {
    (season.episodes || []).forEach(ep => {
      const srv1 = ep.servers && ep.servers[0];
      if (srv1 && srv1.url) allUrlsBefore.push(srv1.url.split('?')[0]);
    });
  });
  const uniqueBefore = new Set(allUrlsBefore);
  duplicatesBefore = allUrlsBefore.length - uniqueBefore.size;
  console.log('URLs before fix:', allUrlsBefore.length, '| Unique:', uniqueBefore.size, '| Duplicates:', duplicatesBefore);
  console.log('');

  // Process each season and episode
  for (let si = 0; si < (series.seasons || []).length; si++) {
    const season = series.seasons[si];
    const seNum = season.season || (si + 1);
    const episodes = season.episodes || [];

    console.log('\n--- Season ' + seNum + ' (' + episodes.length + ' episodes) ---');

    for (let ei = 0; ei < episodes.length; ei++) {
      const ep = episodes[ei];
      const epNum = ep.episode || (ei + 1);

      process.stdout.write('  S' + seNum + 'E' + String(epNum).padStart(3, '0') + ': ');

      const result = await fetchEpisodeUrl(seNum, epNum);

      if (!result) {
        process.stdout.write('NOT FOUND - using embeds only\n');
        ep.servers = buildServers(null, seNum, epNum);
        totalFailed++;
      } else {
        process.stdout.write('OK (' + result.resolution + 'p) - ' + result.url.substring(0, 65) + '...\n');
        ep.servers = buildServers(result.url, seNum, epNum);
        delete ep.streamUrl;
        totalFetched++;
      }

      // 500ms delay between requests to avoid rate limiting
      await delay(500);

      // Save progress every 10 episodes
      if ((ei + 1) % 10 === 0) {
        contentData.series[seriesIndex] = series;
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(contentData, null, 2));
        console.log('  [Saved progress - ' + (ei + 1) + '/' + episodes.length + ']');
      }
    }
  }

  // Final save
  contentData.series[seriesIndex] = series;
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(contentData, null, 2));

  console.log('\n=== DONE ===');
  console.log('Fetched from MovieBox:', totalFetched, 'episodes');
  console.log('Not on MovieBox (embed-only):', totalFailed, 'episodes');

  // Verify uniqueness
  console.log('\n--- Verifying uniqueness ---');
  const allUrlsAfter = [];
  (series.seasons || []).forEach(season => {
    (season.episodes || []).forEach(ep => {
      const srv1 = ep.servers && ep.servers[0];
      if (srv1 && srv1.url && srv1.url.includes('hakunaymatata')) {
        allUrlsAfter.push(srv1.url.split('?')[0]);
      }
    });
  });
  const uniqueAfter = new Set(allUrlsAfter);
  const dupesAfter = allUrlsAfter.length - uniqueAfter.size;

  console.log('MovieBox URLs after fix:', allUrlsAfter.length);
  console.log('Unique URLs:', uniqueAfter.size);
  if (dupesAfter === 0) {
    console.log('No duplicates! All episodes have unique URLs.');
  } else {
    console.log('WARNING:', dupesAfter, 'duplicate URLs still found - check manually');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
