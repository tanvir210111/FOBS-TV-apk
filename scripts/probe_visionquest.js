/**
 * Probe VisionQuest - try different season/episode index combos
 */
const movieboxService = require('../services/movieboxService');

const VQ_SUBJECT_ID = '3908280950886646112';

async function probe() {
  console.log('Probing VisionQuest MovieBox API with different se/ep combos...\n');
  
  // Try combinations: season 0/1, episode 0/1/2/3
  const combos = [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1]
  ];

  for (const [se, ep] of combos) {
    try {
      const media = await movieboxService.resolveMedia(VQ_SUBJECT_ID, '', se, ep);
      if (media && media.streamUrl) {
        console.log(`✅ se=${se} ep=${ep}: ${media.resolution}p`);
        console.log(`   URL: ${media.streamUrl.substring(0, 100)}`);
        console.log(`   Qualities: ${(media.qualities || []).map(q => q.resolution + 'p').join(', ')}`);
      } else {
        console.log(`❌ se=${se} ep=${ep}: no stream`);
      }
    } catch (e) {
      console.log(`❌ se=${se} ep=${ep}: error - ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

probe().catch(console.error);
