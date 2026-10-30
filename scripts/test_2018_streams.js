const movieboxService = require('../services/movieboxService');
const fs = require('fs');
const path = require('path');

async function testStreams() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2018_final_manifest.json'), 'utf8'));

  const samples = [
    manifest.find(x => x.title.includes('Secretary Kim')),
    manifest.find(x => x.title.includes('Gangnam Beauty')),
    manifest.find(x => x.title.includes('Waikiki')),
    manifest.find(x => x.title.includes('The Witch')),
    manifest.find(x => x.title.includes('Along With the Gods'))
  ].filter(Boolean);

  for (const s of samples) {
    const se = s.type === 'series' ? 1 : 0;
    const ep = s.type === 'series' ? 1 : 0;
    let res = await movieboxService.resolveMedia(s.id, s.detailPath, se, ep);
    if (!res || !res.streamUrl) {
      res = await movieboxService.resolveMedia(s.id, s.detailPath, 0, 1);
    }
    console.log(`Stream check [${s.title}]:`, {
      hasStreamUrl: !!res?.streamUrl,
      resolution: res?.resolution,
      captionsCount: res?.captions?.length || 0,
      streamUrlPrefix: res?.streamUrl ? res.streamUrl.substring(0, 50) + '...' : 'none'
    });
  }
}

testStreams();
