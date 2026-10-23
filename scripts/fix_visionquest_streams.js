/**
 * Fix VisionQuest episode streams using live MovieBox API
 * Fetches fresh CDN URLs for each VisionQuest episode
 */

const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const files = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

// VisionQuest subject ID (from mb-s-3908280950886646112)
const VQ_SUBJECT_ID = '3908280950886646112';
const VQ_SEASON = 1;

async function fixVisionQuest() {
  console.log('=== VisionQuest Stream Fixer (MovieBox API) ===\n');

  // First, probe how many episodes exist by trying ep 1 to 10
  const episodeStreams = [];

  for (let ep = 1; ep <= 10; ep++) {
    console.log(`Resolving Episode ${ep} (Season ${VQ_SEASON})...`);
    try {
      const media = await movieboxService.resolveMedia(VQ_SUBJECT_ID, '', VQ_SEASON, ep);
      if (media && media.streamUrl) {
        console.log(`  ✅ Ep ${ep}: ${media.resolution}p - ${media.streamUrl.substring(0, 80)}...`);
        episodeStreams.push({
          ep,
          streamUrl: media.streamUrl,
          resolution: media.resolution,
          qualities: media.qualities || [],
          captions: media.captions || []
        });
      } else {
        console.log(`  ⚠️  Ep ${ep}: No stream found (series might have fewer episodes)`);
        if (ep > 5) break; // Stop probing if we've already gone past ep 5 with no results
      }
    } catch (err) {
      console.log(`  ❌ Ep ${ep}: Error - ${err.message}`);
      if (ep > 3) break;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  if (episodeStreams.length === 0) {
    console.error('\n❌ Could not resolve ANY VisionQuest streams from MovieBox. Check API availability.');
    process.exit(1);
  }

  console.log(`\n✅ Resolved ${episodeStreams.length} episodes from MovieBox.\n`);

  // Update all content files
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping (not found): ${filePath}`);
      continue;
    }

    console.log(`Updating: ${filePath}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (!data.series) { console.log('  No series array, skipping.'); continue; }

    const vq = data.series.find(s => s.title && s.title.toLowerCase().includes('vision'));
    if (!vq) { console.log('  VisionQuest not found in series, skipping.'); continue; }

    // Update top-level stream with best quality from episode 1
    const ep1 = episodeStreams[0];
    vq.streamUrl = ep1.streamUrl;
    vq.servers = ep1.qualities.length > 0
      ? ep1.qualities.map((q, i) => ({ name: `Server ${i + 1} (${q.resolution}p)`, url: q.url }))
      : [{ name: 'Server 1', url: ep1.streamUrl }];

    // Update each episode
    if (Array.isArray(vq.episodes)) {
      vq.episodes.forEach((ep, idx) => {
        const epNum = ep.number || (idx + 1);
        const stream = episodeStreams.find(s => s.ep === epNum) || episodeStreams[0];

        ep.streamUrl = stream.streamUrl;
        ep.servers = stream.qualities.length > 0
          ? stream.qualities.map((q, i) => ({ name: `Server ${i + 1} (${q.resolution}p)`, url: q.url }))
          : [{ name: 'Server 1', url: stream.streamUrl }];

        if (ep.audioTracks) {
          ep.audioTracks = { 'Hindi dub': stream.streamUrl };
        }

        // Add captions if available
        if (stream.captions && stream.captions.length > 0) {
          ep.subtitles = stream.captions.map(c => ({
            label: c.language || 'English',
            language: (c.language || 'en').substring(0, 2).toLowerCase(),
            url: c.url
          }));
        }
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`  ✅ Saved ${filePath}`);
  }

  console.log('\n🎉 VisionQuest streams updated from live MovieBox API!');
}

fixVisionQuest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
