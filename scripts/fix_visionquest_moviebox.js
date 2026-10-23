/**
 * Fix VisionQuest - use dynamic MovieBox resolve endpoint as stream source
 * Instead of expired CDN URLs, use the backend /api/moviebox/resolve endpoint
 * which fetches fresh CDN links at playtime from MovieBox API
 */

const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'https://fobs-tv-apk.onrender.com';
const VQ_SUBJECT_ID = '3908280950886646112';
const VQ_TOTAL_EPISODES = 6; // freeNum=6 from API

const files = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

function makeResolveUrl(subjectId, se, ep) {
  return `${BACKEND_URL}/api/moviebox/stream?id=${subjectId}&se=${se}&ep=${ep}`;
}

// App update config - bump to v1.5.0 / code 6
const updateConfig = {
  enabled: true,
  latestVersionCode: 6,
  latestVersionName: '1.5.0',
  minVersionCode: 1,  // force update on ALL old versions
  forceUpdate: true,
  title: 'New FOBS TV Update (v1.5.0) Available!',
  message: 'A new version of FOBS TV (v1.5.0) is available with fixed portrait player alignment, tap-to-show video controls, smooth auto-minimize, and VisionQuest streaming. Update now for the best experience.',
  releaseNotes: [
    'Fixed portrait player top status bar alignment',
    'Tap video to show/hide player controls (portrait & landscape)',
    'Smooth auto-minimize video controls after 3.5 seconds',
    'VisionQuest series playback via MovieBox live streaming',
    'Direct 1-Click APK Download link'
  ],
  downloadUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
  fallbackUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
  fileSize: '15.4 MB'
};

for (const filePath of files) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping (not found): ${filePath}`);
    continue;
  }

  console.log(`Processing ${filePath}...`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Update appUpdate config
  data.appUpdate = updateConfig;

  // Find and fix VisionQuest
  if (data.series) {
    const vq = data.series.find(s => s.title && s.title.toLowerCase().includes('vision'));
    if (vq) {
      console.log(`  Updating VisionQuest (id: ${vq.id})...`);

      // Use dynamic resolve URL for ep 1, se 1 as the main stream
      const mainResolveUrl = makeResolveUrl(VQ_SUBJECT_ID, 1, 1);

      vq.streamUrl = mainResolveUrl;
      vq.servers = [
        { name: 'Server 1 (MovieBox HD)', url: mainResolveUrl }
      ];

      // Build episodes using live MovieBox resolve URLs
      const existingEps = Array.isArray(vq.episodes) ? vq.episodes : [];
      const maxEps = Math.max(existingEps.length, VQ_TOTAL_EPISODES);

      vq.episodes = Array.from({ length: maxEps }, (_, i) => {
        const epNum = i + 1;
        const resolveUrl = makeResolveUrl(VQ_SUBJECT_ID, 1, epNum);
        const existing = existingEps.find(e => e.number === epNum) || {};

        return {
          number: epNum,
          season: 1,
          title: existing.title || `Episode ${epNum}`,
          streamUrl: resolveUrl,
          audioTracks: {
            'Hindi dub': resolveUrl
          },
          servers: [
            { name: 'Server 1 (MovieBox HD)', url: resolveUrl }
          ]
        };
      });

      console.log(`  ✅ VisionQuest updated: ${vq.episodes.length} episodes with live MovieBox resolve URLs`);
    } else {
      console.log('  ⚠️  VisionQuest not found in series list');
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  ✅ Saved: ${filePath}`);
}

console.log('\n🎉 Done! VisionQuest now uses live MovieBox stream resolution.');
console.log('   URLs pattern: /api/moviebox/resolve?id=<subjectId>&se=1&ep=N');
