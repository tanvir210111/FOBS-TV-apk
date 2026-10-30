const axios = require('axios');
const movieboxService = require('../services/movieboxService');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

const checks = [
  'The Great Battle', 'Rampant', 'The Negotiation', 'Gonjiam', 'Champion',
  'Monstrum', 'High Society', 'Illang', 'On Your Wedding Day', 'Burning',
  'The Spy Gone North', 'Intimate Strangers', 'Unstoppable', 'Are You Human Too',
  'Memories of the Alhambra', 'My Mister', 'Terius Behind Me', 'My Secret Terrius',
  'The Smile Has Left Your Eyes', 'Life on Mars', 'Mr. Sunshine', 'About Time'
];

async function run() {
  for (const name of checks) {
    try {
      const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
        keyword: name + ' hindi',
        page: 1,
        perPage: 5,
        subjectType: 0
      }, { headers, timeout: 5000 });
      const items = res.data?.data?.items || [];
      for (const it of items) {
        if ((it.title || '').toLowerCase().includes('hindi')) {
          console.log(`[FOUND HINDI] ${name} -> "${it.title}" (ID: ${it.subjectId}, Release: ${it.releaseDate})`);
        }
      }
    } catch(e) {}
  }
}

run();
