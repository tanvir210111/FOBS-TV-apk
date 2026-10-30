const axios = require('axios');
const movieboxService = require('../services/movieboxService');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

const candidateChecks = [
  // Kdramas
  'Vagabond', 'Arthdal Chronicles', 'He Is Psychometric', 'Her Private Life', 'Abyss',
  'When the Camellia Blooms', 'Strangers from Hell', 'Graceful Family', 'Psychopath Diary',
  'My Absolute Boyfriend', 'The Crowned Clown', 'Rookie Historian', 'Romance Is a Bonus Book',
  'Designated Survivor: 60 Days', 'Love Alarm', 'My First First Love', 'Class of Lies', 'Kill It',
  'Item', 'Haechi', 'Level Up', 'Be Melodramatic', 'The Great Show', 'Woman of 9.9 Billion',
  'Diary of a Prosecutor', 'Confession', 'Leverage',
  // Movies
  'The Bad Guys: Reign of Chaos', 'The Dude in Me', 'Inseparable Bros', 'Metamorphosis',
  'Svaha: The Sixth Finger', 'Long Live the King', 'Juror 8', 'Innocent Witness',
  'Cheer Up, Mr. Lee', 'Money', 'Hit-and-Run Squad', 'Jo Pil-ho', 'Bring Me Home',
  'Tune in for Love', 'The Battle: Roar to Victory', 'The Beast'
];

async function checkAudio(subjectId, detailPath, type) {
  try {
    const se = type === 'series' ? 1 : 0;
    const ep = type === 'series' ? 1 : 0;
    const res = await movieboxService.resolveMedia(subjectId, detailPath, se, ep);
    if (!res) return null;
    return {
      streamUrl: res.streamUrl,
      captions: res.captions || [],
      resolution: res.resolution
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log('Checking if any Korean 2019 title has Hindi audio or Hindi captions...');
  for (const name of candidateChecks) {
    try {
      const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
        keyword: name,
        page: 1,
        perPage: 5,
        subjectType: 0
      }, { headers, timeout: 5000 });
      const items = res.data?.data?.items || [];
      for (const it of items) {
        const title = it.title || '';
        // If it explicitly says Hindi
        if (title.toLowerCase().includes('hindi')) {
          console.log(`[EXPLICIT HINDI] ${name} -> ${title} (ID: ${it.subjectId})`);
        }
      }
    } catch(e) {}
  }
}

run();
