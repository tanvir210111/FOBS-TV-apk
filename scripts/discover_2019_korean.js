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
    // 2019 top K-Dramas
    'Hotel Del Luna', 'Vagabond', 'Extraordinary You', 'Arthdal Chronicles', 'Touch Your Heart',
    'He Is Psychometric', 'Her Private Life', 'Abyss', 'Search: WWW', 'Angel\'s Last Mission: Love',
    'Rookie Historian Goo Hae-ryung', 'At Eighteen', 'When the Camellia Blooms', 'My Country: The New Age',
    'The Tale of Nokdu', 'Catch the Ghost', 'VIP', 'Psychopath Diary', 'Kingdom', 'Romance Is a Bonus Book',
    'The Fiery Priest', 'Doctor John', 'Watcher', 'Designated Survivor: 60 Days', 'Strangers from Hell',
    'Leverage', 'Beautiful World', 'My First First Love', 'Love Alarm', 'Class of Lies', 'Kill It',
    'Item', 'Haechi', 'Possessed', 'The Crowned Clown', 'Luwak Human', 'Graceful Family', 'Pegasus Market',

    // 2019 top K-Movies
    'Parasite', 'Extreme Job', 'Exit', 'Ashfall', 'The Gangster The Cop The Devil',
    'The Divine Fury', 'Tazza: One Eyed Jack', 'Bad Guys: Reign of Chaos', 'Kim Ji-young: Born 1982',
    'Tune in for Love', 'Inseparable Bros', 'Metamorphosis', 'Svaha: The Sixth Finger',
    'The Battle: Roar to Victory', 'The Beast', 'Long Live the King', 'Juror 8', 'Innocent Witness',
    'Birthday', 'Another Child', 'Miss & Mrs. Cops', 'Mal-Mo-E: The Secret Mission', 'No Mercy',
    'The Culprit', 'Fist & Furious', 'The Dude in Me',

    // Broad 2019 searches
    'korean 2019 hindi', 'kdrama 2019 hindi', 'k-drama 2019 hindi', 'korean movie 2019 hindi',
    'korea 2019 hindi', '2019 hindi korean', '2019 kdrama hindi'
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

  // Filter for items with Hindi in title
  const hindiItems = allItems.filter(it => {
    const title = (it.title || '').toLowerCase();
    const path = (it.detailPath || '').toLowerCase();
    return title.includes('hindi') || path.includes('hindi');
  });

  console.log('Total Hindi items:', hindiItems.length);
  fs.writeFileSync(path.join(__dirname, '../scratch/2019_raw_hindi.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();

