const fs = require('fs');
const path = require('path');

async function run() {
  const verified = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2017_verified_korean_hindi.json'), 'utf8'));

  const excludedTitlePatterns = [
    'doctor stranger',
    'a korean odyssey',
    'love me, love my voice',
    'the many sides of voice',
    'black butler',
    'black knight',
    'officer black belt',
    'the king: eternal monarch',
    'master of dragon descendants',
    'dragon master',
    'the doll master',
    'salmokji',
    'the blue whisper',
    'goblin slayer',
    'kiss goblin',
    'along with the gods: the last 49 days',
    'confidential assignment 2',
    'real: time: love',
    'be a real hero',
    'forgotten island',
    'suspicious partner | hindi mix',
    'sentenced to be a hero',
    'stranger kim'
  ];

  const cleanList = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of verified) {
    const titleLow = item.title.toLowerCase();

    // Check exclusion
    if (excludedTitlePatterns.some(p => titleLow.includes(p))) {
      continue;
    }

    // Exclude 2021 series Taxi Driver, but KEEP 2017 movie "A Taxi Driver"
    if (item.type === 'series' && titleLow === 'taxi driver [hindi]') {
      continue;
    }

    if (item.category.includes('Hollywood') || item.category.includes('Bollywood') || item.category.includes('Turkish') || item.category.includes('Anime')) continue;

    let title = item.title;
    if (title.toLowerCase().includes('soosanghan pateuneo')) {
      title = 'Suspicious Partner [Hindi]';
    } else if (title.toLowerCase().includes('the emperor: owner of the mask')) {
      title = 'Ruler: Master of the Mask [Hindi]';
    } else if (title.toLowerCase().includes('the king loves')) {
      title = 'The King in Love [Hindi]';
    } else if (title.toLowerCase().includes('witch\'s court')) {
      title = 'Witch at Court [Hindi]';
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
      year: '2017',
      rating: item.rating || '8.2',
      genres: item.genre || (item.type === 'series' ? 'Korean Drama, Hindi Dubbed' : 'Korean Movie, Drama, Hindi Dubbed'),
      poster: item.poster,
      backdrop: item.cover || item.poster,
      description: item.description,
      detailPath: item.detailPath,
      seasons: item.seasons || [{ seasonNumber: 1, maxEp: item.totalEpisodes || 16 }]
    });
  }

  console.log(`\nFiltered Final 2017 Korean Manifest Count: ${cleanList.length}`);
  const sList = cleanList.filter(x => x.type === 'series');
  const mList = cleanList.filter(x => x.type === 'movie');
  console.log(`- 2017 K-Dramas (Series): ${sList.length}`);
  sList.forEach((s, idx) => console.log(`   ${idx + 1}. ${s.title} - Eps: ${s.seasons[0]?.maxEp || 16}`));
  console.log(`- 2017 K-Movies: ${mList.length}`);
  mList.forEach((m, idx) => console.log(`   ${idx + 1}. ${m.title}`));

  fs.writeFileSync(path.join(__dirname, '../scratch/2017_final_manifest.json'), JSON.stringify(cleanList, null, 2), 'utf8');
}

run();
