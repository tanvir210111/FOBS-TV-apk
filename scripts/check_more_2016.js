const axios = require('axios');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

const checks = [
  'Moon Lovers', 'Scarlet Heart Ryeo', 'Scarlet Heart',
  'W Two Worlds', 'Two Worlds',
  'Cheese in the Trap',
  'Love in the Moonlight', 'Moonlight Drawn by Clouds',
  'Cinderella and Four Knights', 'Cinderella with Four Knights',
  'The Handmaiden', 'The Wailing', 'The Age of Shadows', 'A Violent Prosecutor',
  'The Last Princess', 'Pandora', 'Luck-Key', 'Luck Key', 'My Annoying Brother',
  'Operation Chromite', 'Time Renegades', 'One Way Trip'
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
