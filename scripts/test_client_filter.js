const adminService = require('../services/adminService');

async function testFilter() {
  const r = await adminService.searchMovieBox('goblin');
  const raw = r.items || [];
  console.log('Raw count:', raw.length);

  // Exact simulation of applyImporterFilters with default filters:
  const audio = 'all';
  const category = 'all';
  const type = 'all';
  const year = 'all';
  const month = 'all';
  const status = 'all';
  const sort = 'default';
  const keyword = '';

  let filtered = raw.filter(item => {
    const tLower = (item.title || '').toLowerCase();
    const isHindi = !!item.isHindi ||
      tLower.includes('hindi') ||
      (item.audioTag && /hindi/i.test(item.audioTag)) ||
      (item.category && /hindi/i.test(item.category)) ||
      (item.section && /hindi/i.test(item.section)) ||
      (item.dubLanguage && /hindi/i.test(item.dubLanguage)) ||
      (item.audio && /hindi/i.test(item.audio)) ||
      item.industry === 'Bollywood';

    const isBangla = !!item.isBangla ||
      tLower.includes('bangla') || tLower.includes('bengali') ||
      (item.audioTag && /bangla|bengali/i.test(item.audioTag)) ||
      (item.category && /bangla|bengali/i.test(item.category)) ||
      (item.section && /bangla|bengali/i.test(item.section)) ||
      item.industry === 'Tollywood';

    const isEnglish = !!item.isEnglish ||
      /\[\s*english\s*\]|\(\s*english\s*\)|\benglish\s*dub(bed)?\b/i.test(item.title || '') ||
      (item.audioTag && /english/i.test(item.audioTag));

    const isSeries = item.type === 'series' || (item.category && item.category.toLowerCase().includes('series'));

    // 1. Audio Filter
    if (audio === 'original' && (isHindi || isBangla || isEnglish)) return false;
    if (audio === 'hindi' && !isHindi) return false;
    if (audio === 'english' && !isEnglish) return false;
    if (audio === 'bangla' && !isBangla) return false;

    // 2. Category / Industry Filter
    if (category !== 'all') {
      return false;
    }

    // 3. Media Type Filter
    if (type === 'movie' && isSeries) return false;
    if (type === 'series' && !isSeries) return false;

    // 4. Year Filter
    if (year !== 'all') return false;

    // 5. Month Filter
    if (month !== 'all') return false;

    // 6. Import Status Filter
    // isItemAlreadyImported:
    const isImported = !!item.alreadyImported;
    if (status === 'unimported' && isImported) return false;
    if (status === 'imported' && !isImported) return false;
    const isCS = !!item.isComingSoon || item.hasResource === false;
    if (status === 'coming_soon' && !isCS) return false;
    if (status === 'playable' && isCS) return false;

    return true;
  });

  console.log('Filtered count:', filtered.length);
  if (filtered.length > 0) {
    console.log('First filtered item:', filtered[0].title);
  }
}

testFilter().catch(console.error);
