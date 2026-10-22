const fs = require('fs');
const path = require('path');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'content.json'), 'utf8'));

console.log('=== VERIFYING DATABASE INTEGRITY ===');
console.log(`Movies count: ${content.movies.length}`);
console.log(`Series count: ${content.series.length}`);
console.log(`Live TV channels count: ${content.liveTv.length}`);

// 1. Check Series & Episodes
let totalSeries = content.series.length;
let duplicateStreamIssues = 0;
let singleEpisodeIssues = 0;
let multiSeasonCount = 0;

content.series.forEach((s) => {
  const eps = s.episodes || [];
  if (eps.length <= 1) {
    console.warn(`[WARNING] Series with <= 1 episode: "${s.title}" (episodes: ${eps.length})`);
    singleEpisodeIssues++;
  }

  if (s.seasons && s.seasons.length > 1) {
    multiSeasonCount++;
  }

  // Check duplicate URLs
  const seenUrls = new Set();
  let dupCount = 0;
  eps.forEach((ep) => {
    const url = ep.streamUrl;
    if (url) {
      if (seenUrls.has(url)) {
        dupCount++;
      } else {
        seenUrls.add(url);
      }
    }
  });

  if (dupCount > 0) {
    console.error(`[DUPLICATE STREAM ERROR] Series "${s.title}" has ${dupCount} repeated episode stream URLs!`);
    duplicateStreamIssues++;
  }
});

console.log(`\nSeries Integrity Check:`);
console.log(`- Single episode issues: ${singleEpisodeIssues}`);
console.log(`- Duplicate stream URL issues: ${duplicateStreamIssues}`);
console.log(`- Multi-season series count: ${multiSeasonCount}`);

// 2. Check Live TV Categories & Sports
const categories = {};
content.liveTv.forEach(ch => {
  const cat = ch.category || 'Uncategorized';
  categories[cat] = (categories[cat] || 0) + 1;
});
console.log(`\nLive TV Categories:`, categories);

// 3. Check Industries in Movies & Series
const movieIndustries = {};
content.movies.forEach(m => {
  movieIndustries[m.industry || 'Unknown'] = (movieIndustries[m.industry || 'Unknown'] || 0) + 1;
});
console.log(`\nMovie Industries:`, movieIndustries);

const seriesIndustries = {};
content.series.forEach(s => {
  seriesIndustries[s.industry || 'Unknown'] = (seriesIndustries[s.industry || 'Unknown'] || 0) + 1;
});
console.log(`\nSeries Industries:`, seriesIndustries);
