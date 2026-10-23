/**
 * Search MovieBox for "Vision" series - find the correct Marvel Vision series
 * Also try resolving WandaVision and probe for any "Vision" standalone series
 */
const movieboxService = require('../services/movieboxService');
const axios = require('axios');

const BASE_URL = 'https://h5.aoneroom.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/`,
  'Accept': 'application/json'
};

async function main() {
  // Try resolving WandaVision ep 1
  console.log('Testing WandaVision se=1, ep=1...');
  const wv = await movieboxService.resolveMedia('2985939316620284696', 'wandavision-EU8Y28iDzy3', 1, 1);
  if (wv) {
    console.log(`WandaVision: ${wv.resolution}p - ${wv.streamUrl?.substring(0,80)}`);
  } else {
    console.log('WandaVision: no stream');
  }

  // Search for "Vision" series explicitly
  console.log('\nRaw search for "Vision" series...');
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: 'Vision',
      page: 1,
      perPage: 30,
      subjectType: 2  // 2 = series only
    }, { headers: { ...HEADERS, 'Content-Type': 'application/json' }, timeout: 10000 });
    const items = res.data?.data?.items || [];
    console.log(`Found ${items.length} series:`);
    items.forEach((it, i) => {
      console.log(`${i+1}. "${it.title}" (${it.releaseDate?.substring(0,4)}) - id: ${it.subjectId} - detailPath: ${it.detailPath}`);
    });
  } catch(e) {
    console.error('Search error:', e.message);
  }
  
  // Also try to get series details directly
  console.log('\nFetching MovieBox homepage for latest series...');
  const sections = await movieboxService.getHomepage();
  const allSeries = sections.flatMap(s => s.items).filter(it => it.type === 'series');
  console.log(`Total series on homepage: ${allSeries.length}`);
  const recent = allSeries.filter(s => parseInt(s.year) >= 2025);
  console.log(`2025-2026 series: ${recent.length}`);
  recent.slice(0, 20).forEach((s, i) => {
    console.log(`  ${i+1}. "${s.title}" (${s.year}) - id: ${s.subjectId}`);
  });
}

main().catch(console.error);
