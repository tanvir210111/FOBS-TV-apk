const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

async function run() {
  const allCandidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_all_hindi_candidates.json'), 'utf8'));
  console.log(`Checking ${allCandidates.length} candidate items for Korean origin...`);

  const koreanItems = [];

  for (let i = 0; i < allCandidates.length; i++) {
    const item = allCandidates[i];
    // Fast check: title or path
    const title = (item.title || '').toLowerCase();
    const detailPath = (item.detailPath || '').toLowerCase();

    // If it clearly mentions non-korean, skip
    if (title.includes('disabled') || title.includes('[cam]')) {
      // unless we want it, skip disabled
    }

    try {
      const d = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (!d) continue;

      if (d.industry === 'Korean' || d.category.toLowerCase().includes('korean')) {
        console.log(`[KOREAN FOUND] [${d.type.toUpperCase()}] "${d.title}" | Year: ${d.year} | ID: ${d.subjectId}`);
        koreanItems.push(d);
      }
    } catch (e) {}
  }

  console.log(`\nTotal verified Korean Hindi items: ${koreanItems.length}`);
  fs.writeFileSync(path.join(__dirname, '../scratch/all_korean_hindi_2019.json'), JSON.stringify(koreanItems, null, 2), 'utf8');
}

run();
