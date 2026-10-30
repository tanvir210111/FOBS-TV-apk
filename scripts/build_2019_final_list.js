const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const target2019Keywords = [
  'hotel del luna', 'vagabond', 'extraordinary you', 'arthdal chronicles', 'touch your heart',
  'he is psychometric', 'her private life', 'abyss', 'search: www', 'search www', "angel's last mission",
  'angels last mission', 'rookie historian', 'at eighteen', 'moment at eighteen', 'moment of eighteen',
  'when the camellia blooms', 'my country: the new age', 'the tale of nokdu', 'tale of nokdu',
  'catch the ghost', 'vip', 'psychopath diary', 'kingdom', 'romance is a bonus book',
  'the fiery priest', 'fiery priest', 'doctor john', 'watcher', 'strangers from hell',
  'leverage', 'beautiful world', 'my first first love', 'love alarm', 'class of lies',
  'kill it', 'item', 'haechi', 'possessed', 'the crowned clown', 'crowned clown',
  'graceful family', 'pegasus market', 'melting me softly', 'clean with passion for now',
  'welcome 2 life', 'doctor prisoner', 'partners for justice', 'investigation couple',
  'be melodramatic', 'melloga chejil', 'the great show', 'woman of 9.9 billion',
  'diary of a prosecutor', 'my absolute boyfriend', 'confession', 'level up', 'chocolate',
  'crash landing on you', 'a korean odyssey',
  // Movies
  'parasite', 'extreme job', 'exit', 'ashfall', 'the gangster, the cop', 'the gangster the cop',
  'the divine fury', 'divine fury', 'tazza: one eyed', 'bad guys: reign of chaos',
  'the bad guys: reign of chaos', 'kim ji-young', 'kim ji young', 'tune in for love',
  'inseparable bros', 'metamorphosis', 'svaha', 'the battle: roar to victory',
  'the beast', 'long live the king', 'juror 8', 'innocent witness', 'miss & mrs. cops',
  'girl cops', 'mal-mo-e', 'no mercy', 'the culprit', 'the dude in me', 'cheer up mr. lee',
  'hit-and-run squad', 'jo pil-ho', 'bring me home', 'crazy romance', 'black money',
  'man of men', 'money'
];

async function run() {
  const allCandidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_all_hindi_candidates.json'), 'utf8'));

  const candidatePool = new Map();

  for (const c of allCandidates) {
    if (!c.title || c.title.includes('Disabled')) continue;
    const titleLow = c.title.toLowerCase();
    const is2019Date = c.releaseDate && c.releaseDate.startsWith('2019');
    const matchesKeyword = target2019Keywords.some(kw => titleLow.includes(kw));

    if (is2019Date || matchesKeyword) {
      candidatePool.set(c.subjectId, c);
    }
  }

  // Also include explicitly verified ones like Melloga Chejil and Money
  candidatePool.set('1936301664055559080', { subjectId: '1936301664055559080', title: 'Melloga Chejil [Hindi]', detailPath: '' });
  candidatePool.set('5246929706410198008', { subjectId: '5246929706410198008', title: 'Money [Hindi]', detailPath: '' });

  console.log(`Candidate pool size: ${candidatePool.size}`);

  const verifiedKorean = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const [id, item] of candidatePool.entries()) {
    try {
      const d = await movieboxService.getDetail(id, item.detailPath);
      if (!d) continue;

      // Filter: must be Korean or marked as Korean drama/movie
      const isKorean = d.industry === 'Korean' ||
                       d.category.toLowerCase().includes('korean') ||
                       d.description.toLowerCase().includes('korea') ||
                       d.genre?.toLowerCase().includes('k-drama') ||
                       target2019Keywords.some(kw => d.title.toLowerCase().includes(kw));

      // Exclude obvious non-Korean (e.g. Naruto, anime, Bollywood, Hollywood)
      const isDefinitelyOther = d.industry === 'Bollywood' ||
                                d.industry === 'Turkish' ||
                                (d.industry === 'Anime' && !d.title.toLowerCase().includes('kingdom')) ||
                                (d.industry === 'Hollywood' && !target2019Keywords.some(kw => d.title.toLowerCase().includes(kw)));

      if (!isKorean || isDefinitelyOther) {
        continue;
      }

      const cleanKey = d.title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
      if (seenTitles.has(cleanKey) || seenIds.has(d.subjectId)) {
        continue;
      }
      seenTitles.add(cleanKey);
      seenIds.add(d.subjectId);

      console.log(`✅ [${d.type.toUpperCase()}] "${d.title}" | Year: ${d.year} | Category: ${d.category} | Episodes: ${d.totalEpisodes}`);
      verifiedKorean.push(d);
    } catch (e) {
      console.error(`Error on ${item.title}: ${e.message}`);
    }
  }

  console.log(`\n============================================================`);
  console.log(`Total Verified 2019 Korean Hindi items: ${verifiedKorean.length}`);
  const sCount = verifiedKorean.filter(x => x.type === 'series').length;
  const mCount = verifiedKorean.filter(x => x.type === 'movie').length;
  console.log(`- Series: ${sCount}`);
  console.log(`- Movies: ${mCount}`);
  console.log(`============================================================\n`);

  fs.writeFileSync(path.join(__dirname, '../scratch/2019_verified_korean_hindi_list.json'), JSON.stringify(verifiedKorean, null, 2), 'utf8');
}

run();
