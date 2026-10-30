const axios = require('axios');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

const checks = [
  'Vagabond', 'Arthdal Chronicles', 'He Is Psychometric', 'Her Private Life', 'Abyss',
  'When the Camellia Blooms', 'Leverage', 'Strangers from Hell', 'Graceful Family',
  'Psychopath Diary', 'The Bad Guys Reign of Chaos', 'Bad Guys', 'The Dude in Me',
  'No Mercy 2019', 'Svaha', 'Metamorphosis 2019', 'Inseparable Bros', 'Tune in for Love',
  'Kim Ji-young', 'The Battle: Roar to Victory', 'Innocent Witness', 'Juror 8',
  'Miss & Mrs Cops', 'Girl Cops', 'Mal-Mo-E', 'Jo Pil-ho', 'Bring Me Home', 'Money 2019'
];

async function run() {
  for (const name of checks) {
    try {
      const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
        keyword: name,
        page: 1,
        perPage: 6,
        subjectType: 0
      }, { headers, timeout: 5000 });
      const items = res.data?.data?.items || [];
      console.log(`\nResults for "${name}":`);
      for (const it of items) {
        console.log(`  - [${it.subjectType === 2 ? 'SERIES' : 'MOVIE'}] "${it.title}" (ID: ${it.subjectId}, Release: ${it.releaseDate})`);
      }
    } catch (e) {
      console.error(`Error searching ${name}: ${e.message}`);
    }
  }
}

run();
