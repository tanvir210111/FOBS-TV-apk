/**
 * Search MovieBox for VisionQuest to find the correct subjectId
 */
const movieboxService = require('../services/movieboxService');

async function search() {
  console.log('Searching MovieBox for "Vision"...');
  const results = await movieboxService.search('Vision');
  console.log(`Found ${results.length} results:\n`);
  results.forEach((r, i) => {
    console.log(`${i+1}. [${r.type}] "${r.title}" (${r.year}) - subjectId: ${r.subjectId} - detailPath: ${r.detailPath}`);
  });

  console.log('\nSearching MovieBox for "VisionQuest"...');
  const results2 = await movieboxService.search('VisionQuest');
  console.log(`Found ${results2.length} results:\n`);
  results2.forEach((r, i) => {
    console.log(`${i+1}. [${r.type}] "${r.title}" (${r.year}) - subjectId: ${r.subjectId} - detailPath: ${r.detailPath}`);
  });
}

search().catch(console.error);
