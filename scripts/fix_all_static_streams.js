const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, '..', 'data', 'content.json');
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

// 1. Fix First Love: Hatsukoi
const firstLove = (content.series || []).find(s => s.id === 'mb-s-9031119355689454368');
if (firstLove && (!firstLove.episodes || firstLove.episodes.length === 0)) {
  firstLove.episodes = firstLove.seasons[0].episodes;
  console.log('Fixed First Love: Hatsukoi episodes:', firstLove.episodes.length);
}

// 2. Fix static CDN URLs in all series
let convertedCount = 0;
for (const s of (content.series || [])) {
  const cleanId = String(s.subjectId || s.id || '').replace(/^mb-[s|m]-/, '');
  const detailPath = s.detailPath || s.mbDetailPath || '';
  
  if (Array.isArray(s.episodes)) {
    for (const ep of s.episodes) {
      const seNum = ep.season || ep.seasonNumber || 1;
      const epNum = ep.episode || ep.episodeNumber || ep.number || 1;
      const dynUrl = '/api/moviebox/stream?id=' + encodeURIComponent(cleanId) + '&path=' + encodeURIComponent(detailPath) + '&se=' + seNum + '&ep=' + epNum;
      
      if (ep.streamUrl && (ep.streamUrl.includes('hakunaymatata') || ep.streamUrl.includes('bcdnxw') || ep.streamUrl.includes('/mbp/'))) {
        ep.streamUrl = dynUrl;
        convertedCount++;
      }
      if (ep.directStreamUrl && (ep.directStreamUrl.includes('hakunaymatata') || ep.directStreamUrl.includes('bcdnxw') || ep.directStreamUrl.includes('/mbp/'))) {
        ep.directStreamUrl = dynUrl;
      }
      if (Array.isArray(ep.servers)) {
        for (const srv of ep.servers) {
          if (srv.url && (srv.url.includes('hakunaymatata') || srv.url.includes('bcdnxw') || srv.url.includes('/mbp/'))) {
            srv.url = dynUrl;
          }
        }
      }
    }
  }

  if (Array.isArray(s.seasons)) {
    for (const se of s.seasons) {
      const seNum = se.season || se.seasonNumber || 1;
      if (Array.isArray(se.episodes)) {
        for (const ep of se.episodes) {
          const epNum = ep.episode || ep.episodeNumber || ep.number || 1;
          const dynUrl = '/api/moviebox/stream?id=' + encodeURIComponent(cleanId) + '&path=' + encodeURIComponent(detailPath) + '&se=' + seNum + '&ep=' + epNum;
          if (ep.streamUrl && (ep.streamUrl.includes('hakunaymatata') || ep.streamUrl.includes('bcdnxw') || ep.streamUrl.includes('/mbp/'))) {
            ep.streamUrl = dynUrl;
          }
          if (ep.directStreamUrl && (ep.directStreamUrl.includes('hakunaymatata') || ep.directStreamUrl.includes('bcdnxw') || ep.directStreamUrl.includes('/mbp/'))) {
            ep.directStreamUrl = dynUrl;
          }
          if (Array.isArray(ep.servers)) {
            for (const srv of ep.servers) {
              if (srv.url && (srv.url.includes('hakunaymatata') || srv.url.includes('bcdnxw') || srv.url.includes('/mbp/'))) {
                srv.url = dynUrl;
              }
            }
          }
        }
      }
    }
  }
}

console.log('Converted static CDN episodes to dynamic /api/moviebox/stream:', convertedCount);

fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'seed-content.json'), JSON.stringify(content), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json'), JSON.stringify(content), 'utf8');
console.log('Successfully synced data/content.json and seed-content.json!');

