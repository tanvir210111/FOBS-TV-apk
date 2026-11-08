const fs = require('fs');
const path = require('path');

const contentFile = path.join(__dirname, '../data/content.json');
const backupFile = path.join(__dirname, '../data/content.backup.json');

console.log('Reading content.json...');
const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

const originalBytes = Buffer.byteLength(JSON.stringify(content));
console.log(`Original content.json size: ${(originalBytes / (1024 * 1024)).toFixed(2)} MB`);

// 1. Optimize series
let totalEpsCleaned = 0;
if (Array.isArray(content.series)) {
  for (const s of content.series) {
    if (Array.isArray(s.seasons)) {
      for (const season of s.seasons) {
        if (Array.isArray(season.episodes)) {
          season.episodes = season.episodes.map(ep => {
            totalEpsCleaned++;
            const epNum = ep.episode || ep.episodeNumber || 1;
            const seNum = season.seasonNumber || ep.season || 1;
            const epTitle = ep.title || `Episode ${epNum}`;
            const sUrl = ep.streamUrl || (ep.servers && ep.servers[0] ? ep.servers[0].url : '');

            return {
              id: ep.id || `${s.id}_s${seNum}_e${epNum}`,
              episode: epNum,
              season: seNum,
              title: epTitle,
              streamUrl: sUrl
            };
          });
        }
      }
      if (s.seasons[0] && Array.isArray(s.seasons[0].episodes)) {
        s.episodes = s.seasons[0].episodes;
      }
    }
  }
}

// 2. Optimize movies (ensure no giant redundant arrays)
if (Array.isArray(content.movies)) {
  for (const m of content.movies) {
    if (m.servers && m.servers.length > 2) {
      m.servers = m.servers.slice(0, 2);
    }
  }
}

const newBytes = Buffer.byteLength(JSON.stringify(content));
console.log(`Streamlined content.json size: ${(newBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`Total episodes streamlined: ${totalEpsCleaned}`);
console.log(`Size reduction: ${(((originalBytes - newBytes) / originalBytes) * 100).toFixed(1)}%`);

// Write back
fs.writeFileSync(contentFile, JSON.stringify(content));
fs.writeFileSync(backupFile, JSON.stringify(content));

// Also write to seed files
const seedPaths = [
  path.join(__dirname, '../public/seed-content.json'),
  path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
];

for (const sp of seedPaths) {
  if (fs.existsSync(sp)) {
    fs.writeFileSync(sp, JSON.stringify(content));
    console.log(`Updated seed file: ${sp}`);
  }
}

console.log('✅ Content optimization complete!');


