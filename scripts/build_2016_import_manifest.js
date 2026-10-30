const fs = require('fs');
const path = require('path');

async function run() {
  const verified = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2016_verified_korean_hindi.json'), 'utf8'));

  const excludedIds = new Set([
    '3357381327615050832',
    '3672807683645656880'
  ]);

  const cleanList = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of verified) {
    if (excludedIds.has(String(item.subjectId))) continue;
    if (item.title.toLowerCase().includes('doll master')) continue;

    // Special title formatting
    let title = item.title;
    if (title === 'W [Hindi]') {
      title = 'W - Two Worlds Apart [Hindi]';
    }

    const key = title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(key) || seenIds.has(item.subjectId)) continue;
    seenTitles.add(key);
    seenIds.add(item.subjectId);

    if (!title.includes('[Hindi]')) {
      title = `${title} [Hindi]`;
    }

    cleanList.push({
      id: item.subjectId,
      title: title,
      type: item.type,
      year: '2016',
      rating: item.rating || '8.2',
      genres: item.genre || (item.type === 'series' ? 'Korean Drama, Hindi Dubbed' : 'Korean Movie, Drama, Hindi Dubbed'),
      poster: item.poster,
      backdrop: item.cover || item.poster,
      description: item.description,
      detailPath: item.detailPath,
      seasons: item.seasons || [{ seasonNumber: 1, maxEp: item.totalEpisodes || 16 }]
    });
  }

  console.log(`\nFiltered Final 2016 Korean Manifest Count: ${cleanList.length}`);
  const sList = cleanList.filter(x => x.type === 'series');
  const mList = cleanList.filter(x => x.type === 'movie');
  console.log(`- 2016 K-Dramas (Series): ${sList.length}`);
  sList.forEach((s, idx) => console.log(`   ${idx + 1}. ${s.title} - Eps: ${s.seasons[0]?.maxEp || 16}`));
  console.log(`- 2016 K-Movies: ${mList.length}`);
  mList.forEach((m, idx) => console.log(`   ${idx + 1}. ${m.title}`));

  fs.writeFileSync(path.join(__dirname, '../scratch/2016_final_manifest.json'), JSON.stringify(cleanList, null, 2), 'utf8');
}

run();
