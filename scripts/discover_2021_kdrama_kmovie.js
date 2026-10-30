const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function search(kw) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: kw,
      page: 1,
      perPage: 10,
      subjectType: 0
    }, { headers, timeout: 6000 });
    return res.data?.data?.items || [];
  } catch (e) {
    return [];
  }
}

// Function to check if download streams exist and what audios/resolutions exist
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

const list = [
  // 2021 K-Dramas
  'Squid Game', 'Vincenzo', 'Happiness', 'Doom at Your Service', 'My Name', 'Hellbound',
  'The Silent Sea', 'Snowdrop', 'D.P.', 'Youth of May', 'Move to Heaven', 'Yumi\'s Cells',
  'Work Later Drink Now', 'Dark Hole', 'The Veil', 'Melancholia', 'Dali and Cocky Prince',
  'User Not Found', 'Jirisan', 'Lovers of the Red Sky', 'The Red Sleeve', 'Police University',
  'Sell Your Haunted House', 'Beyond Evil', 'The Devil Judge', 'Nevertheless',
  'One Ordinary Day', 'Bad and Crazy', 'Hometown Cha-Cha-Cha', 'River Where the Moon Rises',
  'Bossam: Steal the Fate', 'Sisyphus: The Myth', 'She Would Never Know', 'The Witch\'s Diner',
  'Chimera', 'Show Window', 'Artificial City', 'Bulgasal', 'The King\'s Affection',
  'Secret Royal Inspector', 'Inspector Koo', 'So I Married an Anti-Fan', 'Mad for Each Other',
  'Monthly Magazine Home', 'Imitation', 'At a Distance Spring is Green', 'Idol: The Coup',
  'High Class', 'Reflection of You', 'Uncle', 'L.U.C.A.', 'Royal Secret Agent',
  'Undercover', 'Mine', 'You Are My Spring', 'The Great Shaman Ga Doo-shim',
  'Blue Birthday', 'Shadow Beauty', 'Adult Trainee', 'School 2021', 'Let Me Be Your Knight',
  'Young Lady and Gentleman', 'Red Shoes',

  // 2021 K-Movies
  'Space Sweepers', 'Seobok', 'Night in Paradise', 'Midnight', 'Sinkhole',
  'Escape from Mogadishu', 'The Medium', 'Hard Hit', 'Sweet & Sour', 'Ghost Mansion',
  'Mission Possible', 'Pipeline', 'Spiritwalker', 'Hostage: Missing Celebrity', 'The Box',
  'Recalled', 'Waiting for Rain', 'Shark: The Beginning', 'The Cursed: Dead Man\'s Prey',
  'New Year Blues', 'What Happened to Mr. Cha', 'Double Patty', 'Three Sisters',
  'The Book of Fish', 'Black Light', 'Aloners', 'Fighter', 'Single in Seoul'
];

async function run() {
  console.log(`Starting scan of ${list.length} 2021 Korean titles...`);
  const results = [];
  const seenIds = new Set();

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    // 1. Try with " Hindi"
    let res = await search(item + ' Hindi');
    let match = res.find(x => x.title && x.title.toLowerCase().includes('hindi'));

    // 2. If not found, try searching exact title
    if (!match) {
      res = await search(item);
      // check if any result has Hindi
      match = res.find(x => x.title && x.title.toLowerCase().includes('hindi'));
    }

    if (match) {
      if (seenIds.has(match.subjectId)) continue;
      seenIds.add(match.subjectId);

      const type = match.subjectType === 2 ? 'series' : 'movie';
      const se = type === 'series' ? 1 : 0;
      const ep = type === 'series' ? 1 : 0;

      // Verify stream availability
      const hasStream = await probeMedia(match.subjectId, match.detailPath, se, ep);

      results.push({
        query: item,
        title: match.title,
        id: match.subjectId,
        path: match.detailPath,
        type: type,
        releaseDate: match.releaseDate,
        hasStream: hasStream,
        cover: match.cover?.url || match.image?.url || '',
        description: match.description || match.title,
        rating: match.imdbRatingValue || '7.5'
      });

      console.log(`[${results.length}] FOUND (${type.toUpperCase()}): "${match.title}" | Stream: ${hasStream ? 'YES' : 'NO'} | Date: ${match.releaseDate} | ID: ${match.subjectId}`);
    }
  }

  console.log(`\nScan complete! Found ${results.length} valid Hindi dubbed titles.`);
  fs.writeFileSync(path.join(__dirname, '../scratch/2021_discovered_korean.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('Saved to scratch/2021_discovered_korean.json');
}

run();
