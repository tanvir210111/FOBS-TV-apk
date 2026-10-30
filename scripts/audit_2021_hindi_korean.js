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
      perPage: 20,
      subjectType: 0
    }, { headers, timeout: 6000 });
    return res.data?.data?.items || [];
  } catch (e) {
    return [];
  }
}

async function probeMedia(subjectId, detailPath, se = 0, ep = 0) {
  try {
    const url = `https://h5.aoneroom.com/wefeed-h5-bff/web/subject/download?subjectId=${subjectId}&se=${se}&ep=${ep}`;
    const res = await axios.get(url, {
      headers: {
        'Origin': 'https://h5.aoneroom.com',
        'Referer': `https://h5.aoneroom.com/movies/${detailPath}`,
        'User-Agent': headers['User-Agent'],
        'Accept': 'application/json'
      },
      timeout: 6000
    });
    const downloads = res.data?.data?.downloads || [];
    return downloads.length > 0;
  } catch (e) {
    return false;
  }
}

const targets = [
  // 2021 K-Dramas
  'Squid Game',
  'Vincenzo',
  'Happiness',
  'Doom at Your Service',
  'My Name',
  'Hellbound',
  'The Silent Sea',
  'Snowdrop',
  'D.P.',
  'Youth of May',
  'Move to Heaven',
  'Yumi\'s Cells',
  'Work Later, Drink Now',
  'Dark Hole',
  'The Veil',
  'Melancholia',
  'Dali and the Cocky Prince',
  'User Not Found',
  'Red Sleeve',
  'The Red Sleeve',
  'Undercover',
  'Nevertheless',
  'The Devil Judge',
  'Bad and Crazy',
  'One Ordinary Day',
  'Beyond Evil',
  'Hometown Cha-Cha-Cha',
  'Jirisan',
  'Lovers of the Red Sky',
  'Police University',
  'Sell Your Haunted House',
  'River Where the Moon Rises',
  'Bossam: Steal the Fate',
  'Sisyphus: The Myth',
  'She Would Never Know',
  'The Witch\'s Diner',
  'Chimera',
  'Show Window: The Queen\'s House',
  'Artificial City',
  'Bulgasal',
  'The King\'s Affection',
  'Secret Royal Inspector',
  'So I Married an Anti-Fan',
  'Mad for Each Other',
  'Monthly Magazine Home',
  'Imitation',
  'At a Distance, Spring is Green',
  'Idol: The Coup',
  'High Class',
  'Reflection of You',
  'Uncle',
  'School 2021',
  'Shadow Beauty',
  'Adult Trainee',

  // 2021 K-Movies
  'Space Sweepers',
  'Seobok',
  'Night in Paradise',
  'Midnight',
  'Sinkhole',
  'Escape from Mogadishu',
  'The Medium',
  'Hard Hit',
  'Sweet & Sour',
  'Ghost Mansion',
  'Mission Possible',
  'Pipeline',
  'Spiritwalker',
  'Hostage: Missing Celebrity',
  'The Box',
  'Recalled',
  'Waiting for Rain',
  'Shark: The Beginning',
  'The Cursed: Dead Man\'s Prey',
  'New Year Blues',
  'Double Patty',
  'The Book of Fish',
  'Three Sisters'
];

function normWord(w) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function findBestMatch(name) {
  const words = name.toLowerCase().split(/\s+/).map(normWord).filter(w => w.length > 2);
  const searchQueries = [
    `${name} Hindi`,
    `${name}`
  ];

  for (const q of searchQueries) {
    const items = await search(q);
    // Find item that matches words AND has [Hindi]
    for (const it of items) {
      const itTitleNorm = (it.title || '').toLowerCase();
      const hasHindi = itTitleNorm.includes('hindi');
      // check word overlap
      const matchesAllWords = words.every(w => itTitleNorm.includes(w));
      if (hasHindi && matchesAllWords) {
        return it;
      }
    }
  }

  // If no explicit [Hindi] found, check if the original title exists and if its audio or stream has Hindi
  return null;
}

async function run() {
  console.log(`Auditing ${targets.length} target 2021 Korean dramas and movies...`);
  const found = [];
  const seenIds = new Set();

  for (const t of targets) {
    const match = await findBestMatch(t);
    if (match) {
      if (seenIds.has(match.subjectId)) continue;
      seenIds.add(match.subjectId);

      const isSeries = match.subjectType === 2;
      const se = isSeries ? 1 : 0;
      const ep = isSeries ? 1 : 0;
      const works = await probeMedia(match.subjectId, match.detailPath, se, ep);

      found.push({
        target: t,
        title: match.title,
        id: match.subjectId,
        path: match.detailPath,
        type: isSeries ? 'series' : 'movie',
        releaseDate: match.releaseDate,
        cover: match.cover?.url || match.image?.url || '',
        description: match.description || match.title,
        rating: match.imdbRatingValue || '8.0',
        streamWorking: works
      });

      console.log(`✅ [FOUND] "${match.title}" | Type: ${isSeries ? 'Series' : 'Movie'} | Stream: ${works ? 'OK' : 'FAIL'} | ID: ${match.subjectId}`);
    } else {
      console.log(`❌ [NOT IN HINDI] "${t}"`);
    }
  }

  console.log(`\nTotal verified Hindi dubbed 2021 titles found: ${found.length}`);
  fs.writeFileSync(path.join(__dirname, '../scratch/2021_hindi_korean_verified.json'), JSON.stringify(found, null, 2), 'utf8');
}

run();
