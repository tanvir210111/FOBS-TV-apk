const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

async function run() {
  const matched = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_matched_korean.json'), 'utf8'));
  console.log(`Verifying ${matched.length} candidates using movieboxService.getDetail...`);

  const results = [];

  for (const item of matched) {
    try {
      const detail = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (!detail) {
        console.log(`❌ No detail for ${item.matchedTitle} (${item.subjectId})`);
        continue;
      }
      console.log(`✅ [${detail.type.toUpperCase()}] "${detail.title}" | Year: ${detail.year} | Industry: ${detail.industry} | Category: ${detail.category} | Seasons: ${detail.seasons?.length}`);
      results.push({
        ...item,
        detail
      });
    } catch (e) {
      console.error(`Error: ${item.matchedTitle}: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(__dirname, '../scratch/2019_verified_with_details.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nSuccessfully verified ${results.length} items!`);
}

run();
