const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

const kdramas = [
  'Hotel Del Luna', 'Vagabond', 'Extraordinary You', 'Arthdal Chronicles', 'Touch Your Heart',
  'He Is Psychometric', 'Her Private Life', 'Abyss', 'Search: WWW', "Angel's Last Mission: Love",
  'Rookie Historian Goo Hae-ryung', 'At Eighteen', 'When the Camellia Blooms', 'My Country: The New Age',
  'The Tale of Nokdu', 'Catch the Ghost', 'VIP', 'Psychopath Diary', 'Kingdom', 'Romance Is a Bonus Book',
  'The Fiery Priest', 'Doctor John', 'Watcher', 'Designated Survivor: 60 Days', 'Strangers from Hell',
  'Leverage', 'Beautiful World', 'My First First Love', 'Love Alarm', 'Class of Lies', 'Kill It',
  'Item', 'Haechi', 'Possessed', 'The Crowned Clown', 'Graceful Family', 'Pegasus Market',
  'Melting Me Softly', 'Clean with Passion for Now', 'Welcome 2 Life', 'Doctor Prisoner', 'Nokdu Flower',
  'Investigation Couple', 'Partners for Justice', 'My Fellow Citizens', 'Special Labor Inspector',
  'Legal High', 'Big Issue', 'He Is Psychometric', 'Confession', 'My Absolute Boyfriend', 'Search WWW',
  'Be Melodramatic', 'The Great Show', 'Catch The Ghost', 'Never Twice', 'Woman of 9.9 Billion',
  'Diary of a Prosecutor', 'Crash Landing on You'
];

const kmovies = [
  'Parasite', 'Extreme Job', 'Exit', 'Ashfall', 'The Gangster, The Cop, The Devil',
  'The Divine Fury', 'Tazza: One Eyed Jack', 'Bad Guys: Reign of Chaos', 'The Bad Guys: Reign of Chaos',
  'Kim Ji-young: Born 1982', 'Tune in for Love', 'Inseparable Bros', 'Metamorphosis', 'Svaha: The Sixth Finger',
  'The Battle: Roar to Victory', 'The Beast', 'Long Live the King', 'Juror 8', 'Innocent Witness',
  'Birthday', 'Another Child', 'Miss & Mrs. Cops', 'Mal-Mo-E: The Secret Mission', 'No Mercy',
  'The Culprit', 'The Dude in Me', 'Cheer Up Mr. Lee', 'Money',
  'Hit-and-Run Squad', 'Jo Pil-ho', 'Trade Your Love', 'Bring Me Home', 'Fist and Furious',
  'Ghost Walk', 'Sub-zero Wind', 'Moonlit Winter', 'Crazy Romance', 'Man of Men', 'Black Money',
  'The King\'s Letters', '0.0MHz', 'Warning: Do Not Play', 'Sunkist Family', 'Spring, Again'
];

async function searchKw(kw) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: kw,
      page: 1,
      perPage: 15,
      subjectType: 0
    }, { headers, timeout: 5000 });
    return res.data?.data?.items || [];
  } catch(e) {
    return [];
  }
}

async function check() {
  const matched = new Map();

  // First read what was already found in raw hindi
  if (fs.existsSync(path.join(__dirname, '../scratch/2019_raw_hindi.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_raw_hindi.json'), 'utf8'));
    for (const r of raw) {
      matched.set(r.subjectId, r);
    }
  }

  console.log(`Starting targeted search for 2019 K-Dramas & K-Movies...`);
  const allTargets = [
    ...kdramas.map(t => ({ name: t, cat: 'series' })),
    ...kmovies.map(t => ({ name: t, cat: 'movie' }))
  ];

  for (const item of allTargets) {
    const items = await searchKw(item.name + ' hindi');
    for (const it of items) {
      const titleLower = (it.title || '').toLowerCase();
      if (titleLower.includes('hindi') && !it.title.includes('Disabled')) {
        matched.set(it.subjectId, it);
      }
    }
  }

  console.log(`Total collected Hindi items: ${matched.size}`);
  fs.writeFileSync(path.join(__dirname, '../scratch/2019_all_hindi_candidates.json'), JSON.stringify(Array.from(matched.values()), null, 2), 'utf8');
}

check();

