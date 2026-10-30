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

async function search(kw, page = 1) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: kw,
      page: page,
      perPage: 30,
      subjectType: 0
    }, { headers, timeout: 5000 });
    return res.data?.data?.items || [];
  } catch (e) {
    return [];
  }
}

async function run() {
  const queries = [
    'korean hindi', 'kdrama hindi', 'k-drama hindi', 'korean movie hindi',
    'korea hindi', 'korean 2021', 'kdrama 2021', 'korean', 'kdrama',
    'love hindi', 'game hindi', 'ghost hindi', 'monster hindi', 'witch hindi',
    'king hindi', 'prince hindi', 'doctor hindi', 'hospital hindi', 'police hindi',
    'school hindi', 'flower hindi', 'moon hindi', 'sun hindi', 'night hindi',
    'dark hindi', 'sky hindi', 'hell hindi', 'death hindi', 'devil hindi',
    'angel hindi', 'secret hindi', 'blood hindi', 'zombie hindi', 'dead hindi',
    'memory hindi', 'time hindi', 'dream hindi', 'sweet hindi', 'blue hindi',
    'red hindi', 'black hindi', 'white hindi', 'paradise hindi', 'sea hindi',
    'space hindi', 'mansion hindi', 'vincenzo', 'squid game', 'happiness',
    'doom at your service', 'my name', 'hellbound', 'silent sea', 'snowdrop',
    'd.p.', 'youth of may', 'move to heaven', 'yumis cells', 'yumi cells',
    'work later drink now', 'dark hole', 'the veil', 'melancholia', 'dali cocky prince',
    'user not found', 'red sleeve', 'undercover', 'high class', 'space sweepers',
    'night in paradise', 'midnight', 'escape from mogadishu', 'the medium',
    'ghost mansion', 'mission possible', 'new year blues', 'so i married an anti-fan',
    'sell your haunted house', 'taxi driver', 'mouse', 'hometown cha cha cha',
    'bad and crazy', 'the devil judge', 'one ordinary day', 'beyond evil',
    'jirisan', 'lovers of the red sky', 'police university', 'river where the moon rises',
    'bossam', 'sisyphus', 'she would never know', 'the witchs diner', 'chimera',
    'show window', 'artificial city', 'bulgasal', 'the kings affection', 'secret royal inspector',
    'mad for each other', 'monthly magazine home', 'imitation', 'at a distance spring is green',
    'idol the coup', 'reflection of you', 'uncle', 'lost', 'sinkhole', 'hard hit',
    'pipeline', 'spiritwalker', 'hostage', 'the box', 'recalled', 'shark the beginning',
    'the cursed dead mans prey', 'special delivery', 'decibel', 'single in seoul'
  ];

  const map = new Map();
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const items = await search(q, 1);
    for (const it of items) {
      if (!map.has(it.subjectId)) {
        map.set(it.subjectId, it);
      }
    }
  }

  console.log('Total items collected across all queries:', map.size);
  const allItems = Array.from(map.values());

  // Filter for items that have Hindi in title, and are Korean (or 2021)
  const hindiItems = allItems.filter(it => {
    const title = (it.title || '').toLowerCase();
    const path = (it.detailPath || '').toLowerCase();
    return title.includes('hindi') || path.includes('hindi');
  });

  console.log('Total Hindi items:', hindiItems.length);
  fs.writeFileSync(path.join(__dirname, '../scratch/all_hindi_items.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();
