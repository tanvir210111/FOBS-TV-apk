const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const target2018Keywords = [
  "secretary kim", "mr. sunshine", "gangnam beauty", "something in the rain", "pretty noona",
  "memories of the alhambra", "are you human", "smile has left your eyes", "lawless lawyer",
  "beauty inside", "terius behind me", "my secret terrius", "welcome to waikiki", "waikiki",
  "life on mars", "still 17", "thirty but seventeen", "100 days my prince", "return", "live",
  "my mister", "misty", "encounter", "last empress", "korean odyssey", "hwayugi", "suits",
  "come and hug me", "radio romance", "great seducer", "tempted", "familiar wife", "the player",
  "where stars land", "fox bride star", "children of nobody", "partners for justice", "investigation couple",
  "ghost detective", "sky castle", "room no. 9", "room no 9", "mother", "cross", "grand prince",
  "less than evil", "feel good to die", "rich man", "about time", "twelve nights", "devilish charm",
  "clean with passion", "my strange hero", "the guest", "voice 2", "sketch", "undateables",
  "your honor", "bad papa", "third charm", "mistress",
  // Movies
  "the witch: part 1", "the witch part 1", "along with the gods", "great battle", "believer",
  "on your wedding day", "burning", "spy gone north", "rampant", "intimate strangers",
  "unstoppable", "negotiation", "gonjiam", "be with you", "keys to the heart", "champion",
  "accidental detective 2", "drug king", "default", "swing kids", "fengshui", "monstrum",
  "high society", "golden slumber", "detective k", "matchmaker", "seven years of night",
  "psychokinesis", "illang", "door lock"
];

async function run() {
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2018_matched_candidates.json'), 'utf8'));
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
      titleLow.includes('ragini') || titleLow.includes('silent hill') || titleLow.includes('jurassic') ||
      titleLow.includes('hanuman') || titleLow.includes('indian idol') || titleLow.includes('teresa')
    ) {
      continue;
    }

    try {
      const d = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (!d) continue;

      const isKorean = d.industry === 'Korean' ||
                       d.category.toLowerCase().includes('korean') ||
                       (d.genre && d.genre.toLowerCase().includes('korean')) ||
                       target2018Keywords.some(kw => d.title.toLowerCase().includes(kw) && d.industry !== 'Bollywood' && d.industry !== 'Hollywood');

      if (!isKorean) continue;
      if (d.industry === 'Bollywood' || d.industry === 'Turkish' || d.industry === 'Hollywood') {
        // Double check if it's genuinely Korean
        if (!target2018Keywords.some(kw => d.title.toLowerCase().includes(kw))) {
          continue;
        }
      }

      // Check key
      const key = d.title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
      if (seenKeys.has(key) || seenIds.has(d.subjectId)) continue;
      seenKeys.add(key);
      seenIds.add(d.subjectId);

      console.log(`✅ [${d.type.toUpperCase()}] "${d.title}" | Year: ${d.year} | Category: ${d.category} | Eps: ${d.totalEpisodes}`);
      koreanItems.push(d);
    } catch (e) {}
  }

  console.log(`\n============================================================`);
  console.log(`Total Verified 2018 Korean Hindi items: ${koreanItems.length}`);
  const sCount = koreanItems.filter(x => x.type === 'series').length;
  const mCount = koreanItems.filter(x => x.type === 'movie').length;
  console.log(`- Series: ${sCount}`);
  console.log(`- Movies: ${mCount}`);
  console.log(`============================================================\n`);

  fs.writeFileSync(path.join(__dirname, '../scratch/2018_verified_korean_hindi.json'), JSON.stringify(koreanItems, null, 2), 'utf8');
}

run();
