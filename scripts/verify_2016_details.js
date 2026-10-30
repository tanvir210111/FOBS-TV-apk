const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const target2016Keywords = [
  "descendants of the sun", "uncontrollably fond", "doctors", "dr. romantic", "dr romantic",
  "romantic doctor", "the k2", "k2", "shopping king louie", "shopping king louis",
  "jealousy incarnate", "don't dare to dream", "another miss oh", "another oh hae young",
  "age of youth", "hello my twenties", "remember: war of the son", "remember war of the son",
  "let's fight ghost", "bring it on, ghost", "bring it on ghost", "beautiful gong shim",
  "lucky romance", "goodbye mr black", "goodbye mr. black", "come back mister",
  "drinking solo", "sweet stranger and me", "the man living in our house", "solomon's perjury",
  "madame antoine", "night light", "fantastic", "squad 38", "38 task force",
  // Movies
  "train to busan", "the wailing", "the age of shadows", "asura", "violent prosecutor",
  "the last princess", "luck-key", "luck key", "annoying brother", "operation chromite",
  "time renegades", "derailed", "canola", "vanishing time", "the handmaiden"
];

async function run() {
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2016_matched_candidates.json'), 'utf8'));

  // Also manually add The Wailing [Hindi]
  candidates.push({
    matchedTitle: 'The Wailing [Hindi]',
    subjectId: '5190144011054580432',
    detailPath: 'the-wailing-hindi-zZl01oP92i6',
    subjectType: 1
  });

  console.log(`Analyzing ${candidates.length} candidate items...`);

  const koreanItems = [];
  const seenIds = new Set();
  const seenKeys = new Set();

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const titleLow = (item.matchedTitle || '').toLowerCase();

    // Fast skip non-Korean indicators
    if (
      titleLow.includes('fantastic four') || titleLow.includes('godzilla') || titleLow.includes('master of dragon') ||
      titleLow.includes('traffic signal') || titleLow.includes('jailer') || titleLow.includes('signs [hindi]') ||
      titleLow.includes('lady chatterley') || titleLow.includes('shinchan') || titleLow.includes('cinderella chef') ||
      titleLow.includes('broken voices') || titleLow.includes('sathyanathan') || titleLow.includes('masterplan')
    ) {
      continue;
    }

    try {
      const d = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (!d) continue;

      const isKorean = d.industry === 'Korean' ||
                       d.category.toLowerCase().includes('korean') ||
                       (d.genre && d.genre.toLowerCase().includes('korean')) ||
                       target2016Keywords.some(kw => d.title.toLowerCase().includes(kw) && d.industry !== 'Bollywood' && d.industry !== 'Hollywood');

      if (!isKorean) continue;
      if (d.industry === 'Bollywood' || d.industry === 'Turkish' || d.industry === 'Hollywood') {
        if (!target2016Keywords.some(kw => d.title.toLowerCase().includes(kw))) {
          continue;
        }
      }

      const key = d.title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
      if (seenKeys.has(key) || seenIds.has(d.subjectId)) continue;
      seenKeys.add(key);
      seenIds.add(d.subjectId);

      console.log(`✅ [${d.type.toUpperCase()}] "${d.title}" | Year: ${d.year} | Category: ${d.category} | Eps: ${d.totalEpisodes}`);
      koreanItems.push(d);
    } catch (e) {}
  }

  console.log(`\n============================================================`);
  console.log(`Total Verified 2016 Korean Hindi items: ${koreanItems.length}`);
  const sCount = koreanItems.filter(x => x.type === 'series').length;
  const mCount = koreanItems.filter(x => x.type === 'movie').length;
  console.log(`- Series: ${sCount}`);
  console.log(`- Movies: ${mCount}`);
  console.log(`============================================================\n`);

  fs.writeFileSync(path.join(__dirname, '../scratch/2016_verified_korean_hindi.json'), JSON.stringify(koreanItems, null, 2), 'utf8');
}

run();
