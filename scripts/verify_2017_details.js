const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const target2017Keywords = [
  "bong soon", "do bong soon", "bong-soon", "while you were sleeping", "fight for my way",
  "weightlifting fairy", "because this is my first life", "suspicious partner", "i'm not a robot",
  "i am not a robot", "save me", "voice", "tunnel", "duel", "lookout", "mad dog", "black",
  "stranger", "forest of secrets", "king in love", "my secret romance", "reunited worlds",
  "hospital ship", "school 2017", "chicago typewriter", "bride of habaek", "bride of the water god",
  "live up to your name", "go back couple", "two cops", "revolutionary love", "ruler: master of the mask",
  "defendant", "whisper", "chief kim", "good manager", "father is strange", "temperature of love",
  "witch at court", "circle", "introverted boss", "my shy boss", "the liar and his lover",
  "jugglers", "just between lovers", "rain or shine", "prison playbook", "hwarang", "goblin",
  "legend of the blue sea", "a korean odyssey", "criminal minds", "judge vs. judge", "black knight",
  // Movies
  "taxi driver", "along with the gods", "midnight runners", "outlaws", "battleship island",
  "1987", "confidential assignment", "villainess", "swindlers", "steel rain", "real",
  "the king", "fabricated city", "memoir of a murderer", "vip", "anarchist from colony",
  "fortress", "forgotten", "heart blackened", "new trial", "i can speak", "the merciless",
  "master", "one line", "the chase", "the prison"
];

async function run() {
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2017_matched_candidates.json'), 'utf8'));
  console.log(`Analyzing ${candidates.length} candidate items...`);

  const koreanItems = [];
  const seenIds = new Set();
  const seenKeys = new Set();

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const titleLow = (item.matchedTitle || '').toLowerCase();

    // Fast skip non-Korean indicators
    if (
      titleLow.includes('fukrey') || titleLow.includes('mummy') || titleLow.includes('superman') ||
      titleLow.includes('black adam') || titleLow.includes('clover') || titleLow.includes('silent voice') ||
      titleLow.includes('jurassic') || titleLow.includes('hanuman') || titleLow.includes('indian idol') ||
      titleLow.includes('duel on mount hua') || titleLow.includes('broken voices') || titleLow.includes('sathyanathan')
    ) {
      continue;
    }

    try {
      const d = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (!d) continue;

      const isKorean = d.industry === 'Korean' ||
                       d.category.toLowerCase().includes('korean') ||
                       (d.genre && d.genre.toLowerCase().includes('korean')) ||
                       target2017Keywords.some(kw => d.title.toLowerCase().includes(kw) && d.industry !== 'Bollywood' && d.industry !== 'Hollywood');

      if (!isKorean) continue;
      if (d.industry === 'Bollywood' || d.industry === 'Turkish' || d.industry === 'Hollywood') {
        if (!target2017Keywords.some(kw => d.title.toLowerCase().includes(kw))) {
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
  console.log(`Total Verified 2017 Korean Hindi items: ${koreanItems.length}`);
  const sCount = koreanItems.filter(x => x.type === 'series').length;
  const mCount = koreanItems.filter(x => x.type === 'movie').length;
  console.log(`- Series: ${sCount}`);
  console.log(`- Movies: ${mCount}`);
  console.log(`============================================================\n`);

  fs.writeFileSync(path.join(__dirname, '../scratch/2017_verified_korean_hindi.json'), JSON.stringify(koreanItems, null, 2), 'utf8');
}

run();
