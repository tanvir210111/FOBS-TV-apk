const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function search(kw) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: kw,
      page: 1,
      perPage: 30,
      subjectType: 0
    }, { headers, timeout: 5000 });
    return res.data?.data?.items || [];
  } catch(e) {
    return [];
  }
}

async function run() {
  const queries = [
    // 2020 major K-Dramas
    'Crash Landing on You', 'Itaewon Class', 'It\'s Okay to Not Be Okay', 'The King: Eternal Monarch',
    'Flower of Evil', 'Start-Up', 'Hospital Playlist', 'Extracurricular', 'The World of the Married',
    'True Beauty', 'Mr. Queen', 'The Penthouse', 'Record of Youth', 'Mystic Pop-up Bar',
    'Memorist', 'Do Do Sol Sol La La Sol', 'Backstreet Rookie', 'When My Love Blooms',
    'Find Me in Your Memory', 'Dinner Mate', 'Zombie Detective', 'Kairos', 'Run On',
    'Sweet Home', 'Tale of the Nine Tailed', 'Alice', '18 Again', 'Search',
    'The Uncanny Counter', 'A Love So Beautiful', 'More Than Friends', 'Live On',
    'Love Revolution', 'Tell Me What You Saw', 'The Game: Towards Zero', 'Born Again',
    'The Spies Who Loved Me', 'Awaken', 'Birthcare Center', 'Chip In', 'Missing: The Other Side',
    'Meow, the Secret Boy', 'Fix You', 'Train', 'Forest', 'Hyena', 'Nobody Knows',

    // 2020 major K-Movies
    'Peninsula', 'Train to Busan 2', '#Alive', 'Alive', 'The Call', 'Space Sweepers',
    'Time to Hunt', 'Ashfall', 'Steel Rain 2', 'Deliver Us from Evil', 'The Man Standing Next',
    'Samjin Company English Class', 'Pawn', 'Voice of Silence', 'Night in Paradise',
    'Collector', 'Secret Zoo', 'Hitman: Agent Jun', 'The Swordsman', 'Okay Madam',
    'Innocence', 'Me and Me', 'Diva', 'More Than Family', 'The Closet', 'Beasts Clawing at Straws',
    'Honest Candidate', 'The Golden Holiday', 'Intruder', 'Search Out', 'Slate',
    
    // Broad 2020 Korean Hindi queries
    'korean 2020 hindi', 'kdrama 2020 hindi', 'k-drama 2020 hindi', 'korean movie 2020 hindi',
    'korea 2020 hindi', '2020 hindi korean', '2020 kdrama hindi'
  ];

  const map = new Map();
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const items = await search(q);
    for (const it of items) {
      if (!map.has(it.subjectId)) {
        map.set(it.subjectId, it);
      }
    }
  }

  console.log('Total unique items found:', map.size);
  const allItems = Array.from(map.values());

  // Filter for items with Hindi in title and 2020 in release date / or matched 2020
  const hindiItems = allItems.filter(it => {
    const title = (it.title || '').toLowerCase();
    const path = (it.detailPath || '').toLowerCase();
    return title.includes('hindi') || path.includes('hindi');
  });

  console.log('Total Hindi items:', hindiItems.length);
  fs.writeFileSync(path.join(__dirname, '../scratch/2020_raw_hindi.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();
