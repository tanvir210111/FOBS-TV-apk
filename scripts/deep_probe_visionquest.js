/**
 * Deep probe VisionQuest - examine raw API response
 */
const axios = require('axios');

const BASE_URL = 'https://h5.aoneroom.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/`,
  'Accept': 'application/json'
};

const VQ_ID = '3908280950886646112';
const VQ_PATH = 'visionquest-hindi-PLACEHOLDER'; // might not matter

async function main() {
  // 1. Try getting series detail page to find episode list
  console.log('=== 1. Subject detail API ===');
  try {
    const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/detail`, {
      params: { subjectId: VQ_ID },
      headers: HEADERS,
      timeout: 10000
    });
    const d = res.data?.data;
    if (d) {
      console.log(`Title: ${d.title}`);
      console.log(`Type: ${d.subjectType} (2=series)`);
      console.log(`Seasons: ${JSON.stringify(d.seasonList?.map(s => ({seasonNo: s.seasonNo, title: s.title})))}`);
      const eps = d.episodeList || d.episodes || [];
      console.log(`Episodes (first 5):`, eps.slice(0,5).map(e => ({ep: e.episodeNo || e.ep, se: e.seasonNo || e.se, id: e.id || e.episodeId})));
    } else {
      console.log('No data:', JSON.stringify(res.data).substring(0, 200));
    }
  } catch(e) {
    console.error('Detail error:', e.message);
  }

  // 2. Try different download endpoint combos
  console.log('\n=== 2. Download API - various combos ===');
  const combos = [[0,0],[0,1],[1,0],[1,1]];
  for (const [se, ep] of combos) {
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId: VQ_ID, se, ep },
        headers: HEADERS,
        timeout: 8000
      });
      const d = res.data?.data;
      if (d && d.downloads && d.downloads.length > 0) {
        console.log(`se=${se} ep=${ep}: ✅ ${d.downloads[0].resolution}p - ${d.downloads[0].url?.substring(0,80)}`);
      } else {
        console.log(`se=${se} ep=${ep}: ❌ response: ${JSON.stringify(res.data).substring(0,100)}`);
      }
    } catch(e) {
      console.log(`se=${se} ep=${ep}: error - ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // 3. Try alternative API endpoint
  console.log('\n=== 3. Alternative play/stream API ===');
  try {
    const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/play`, {
      params: { subjectId: VQ_ID, se: 1, ep: 1 },
      headers: HEADERS,
      timeout: 8000
    });
    console.log('Play API response:', JSON.stringify(res.data).substring(0, 300));
  } catch(e) {
    console.log('Play API error:', e.message);
  }

  // 4. Try the h5-api endpoint
  console.log('\n=== 4. h5-api subject detail ===');
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/detail', {
      subjectId: VQ_ID
    }, {
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      timeout: 8000
    });
    console.log('h5-api detail:', JSON.stringify(res.data?.data || res.data).substring(0, 400));
  } catch(e) {
    console.log('h5-api error:', e.message);
  }
}

main().catch(console.error);
