const fs = require('fs');
const path = require('path');

async function run() {
  const verified = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2018_verified_korean_hindi.json'), 'utf8'));

  // Blacklist by title pattern or id
  const excludedTitlePatterns = [
    'turning mecard',
    '24 hours to live',
    'the terror live',
    'mission: cross',
    'believer 2',
    'live on',
    'high school return',
    'the third charm',
    'my strange hero',
    'clean with passion',
    'the beauty inside [hindi]', // if movie
    'bts: the return',
    'spider-man',
    'legend of the fist',
    'white olive tree',
    'the judge returns',
    'unstoppable'
  ];

  const cleanList = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of verified) {
    const titleLow = item.title.toLowerCase();

    // Check exclusion
    if (excludedTitlePatterns.some(p => titleLow.includes(p))) {
      // Check if it's the 2018 Beauty Inside drama series (which should be kept!)
      if (titleLow.includes('beauty inside') && item.type === 'series') {
        // keep drama series!
      } else {
        continue;
      }
    }

    if (item.category.includes('Hollywood') || item.category.includes('Bollywood') || item.category.includes('Turkish') || item.category.includes('Chinese') || item.category.includes('Anime')) continue;

    const key = item.title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(key) || seenIds.has(item.subjectId)) continue;
    seenTitles.add(key);
    seenIds.add(item.subjectId);

    let title = item.title;
    if (!title.includes('[Hindi]')) {
      title = `${title} [Hindi]`;
    }

    cleanList.push({
      id: item.subjectId,
      title: title,
      type: item.type,
      year: '2018',
      rating: item.rating || '8.2',
      genres: item.genre || (item.type === 'series' ? 'Korean Drama, Hindi Dubbed' : 'Korean Movie, Drama, Hindi Dubbed'),
      poster: item.poster,
      backdrop: item.cover || item.poster,
      description: item.description,
      detailPath: item.detailPath,
      seasons: item.seasons || [{ seasonNumber: 1, maxEp: item.totalEpisodes || 16 }]
    });
  }

  console.log(`\nFiltered Final 2018 Korean Manifest Count: ${cleanList.length}`);
  const sList = cleanList.filter(x => x.type === 'series');
  const mList = cleanList.filter(x => x.type === 'movie');
  console.log(`- 2018 K-Dramas (Series): ${sList.length}`);
  sList.forEach((s, idx) => console.log(`   ${idx + 1}. ${s.title} - Eps: ${s.seasons[0]?.maxEp || 16}`));
  console.log(`- 2018 K-Movies: ${mList.length}`);
  mList.forEach((m, idx) => console.log(`   ${idx + 1}. ${m.title}`));

  fs.writeFileSync(path.join(__dirname, '../scratch/2018_final_manifest.json'), JSON.stringify(cleanList, null, 2), 'utf8');
}

run();
