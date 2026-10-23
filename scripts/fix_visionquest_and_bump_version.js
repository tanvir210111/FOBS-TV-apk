const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

const updateConfig = {
  enabled: true,
  latestVersionCode: 6,
  latestVersionName: '1.5.0',
  minVersionCode: 6,
  forceUpdate: true,
  title: 'New FOBS TV Update (v1.5.0) Available!',
  message: 'A new version of FOBS TV (v1.5.0) is available with fixed portrait player alignment, interactive subtitle & speed controls, smooth auto-minimize gestures, and VisionQuest streaming. Please update now to continue.',
  releaseNotes: [
    'Fixed portrait player top status bar alignment',
    'Added working subtitle, language, quality & speed controls to portrait player',
    'Smooth tap-to-show and tap-to-minimize video player controls',
    'Fixed VisionQuest series playback with fast multi-server streaming',
    'Direct 1-Click APK Download (15.4 MB)'
  ],
  downloadUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
  fallbackUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
  fileSize: '15.4 MB'
};

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  console.log(`Processing ${filePath}...`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Update appUpdate
  data.appUpdate = updateConfig;

  // Find and fix VisionQuest
  if (data.series) {
    const vq = data.series.find(s => s.title && s.title.toLowerCase().includes('vision'));
    if (vq) {
      console.log(`Updating VisionQuest in ${filePath}...`);
      vq.poster = 'https://image.tmdb.org/t/p/w500/ajbVvETMM7NMq4Gc5FauOoyeEnu.jpg';
      vq.backdrop = 'https://image.tmdb.org/t/p/original/uoXXbN2PrOxH6UKyP7kYwmGpAAP.jpg';
      vq.streamUrl = 'https://bcdnxw.hakunaymatata.com/resource/7658be12e275485a8dccd5d1cd3d5762.mp4?sign=9f0e9201aa95b7ef8b287fa1a762c32f&t=1792692516';
      vq.servers = [
        {
          name: 'Server 1',
          url: 'https://bcdnxw.hakunaymatata.com/resource/7658be12e275485a8dccd5d1cd3d5762.mp4?sign=9f0e9201aa95b7ef8b287fa1a762c32f&t=1792692516'
        },
        {
          name: 'Server 2',
          url: 'https://www.youtube.com/embed/sXKnmgmbkoE?autoplay=1&rel=0'
        }
      ];

      if (Array.isArray(vq.episodes)) {
        vq.episodes.forEach((ep, i) => {
          ep.servers = [
            {
              name: 'Server 1',
              url: ep.streamUrl || vq.streamUrl
            },
            {
              name: 'Server 2',
              url: 'https://www.youtube.com/embed/sXKnmgmbkoE?autoplay=1&rel=0'
            }
          ];
        });
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved ${filePath}`);
}

console.log('All files updated successfully!');
