const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  const content = JSON.parse(fs.readFileSync(f, 'utf8'));
  let movieFix = 0;
  let epFix = 0;

  (content.movies || []).forEach(m => {
    if (m.streamUrl && (m.streamUrl.includes('hakunaymatata') || m.streamUrl.includes('bcdnxw') || m.streamUrl.includes('haildrop') || m.streamUrl.includes('fogtwist') || m.streamUrl.includes('sunburst') || m.streamUrl.includes('stormshade'))) {
      const sId = m.subjectId || m.id?.replace(/^mb-m-/, '').replace(/-hindi$/, '');
      const dPath = m.detailPath || '';
      if (sId) {
        m.streamUrl = `/api/moviebox/stream?id=${sId}&path=${dPath}&se=0&ep=0`;
        movieFix++;
      }
    }
  });

  (content.series || []).forEach(s => {
    const sId = s.subjectId || s.id?.replace(/^mb-s-/, '').replace(/-hindi$/, '');
    const dPath = s.detailPath || '';
    if (s.streamUrl && (s.streamUrl.includes('hakunaymatata') || s.streamUrl.includes('bcdnxw') || s.streamUrl.includes('haildrop') || s.streamUrl.includes('fogtwist') || s.streamUrl.includes('sunburst') || s.streamUrl.includes('stormshade'))) {
      if (sId) {
        s.streamUrl = `/api/moviebox/stream?id=${sId}&path=${dPath}&se=1&ep=1`;
      }
    }
    (s.seasons || []).forEach(season => {
      const seNum = season.seasonNumber || season.season || 1;
      (season.episodes || []).forEach(ep => {
        if (ep.streamUrl && (ep.streamUrl.includes('hakunaymatata') || ep.streamUrl.includes('bcdnxw') || ep.streamUrl.includes('haildrop') || ep.streamUrl.includes('fogtwist') || ep.streamUrl.includes('sunburst') || ep.streamUrl.includes('stormshade'))) {
          const epNum = ep.episodeNumber || ep.episode || 1;
          if (sId) {
            ep.streamUrl = `/api/moviebox/stream?id=${sId}&path=${dPath}&se=${seNum}&ep=${epNum}`;
            epFix++;
          }
        }
      });
    });
  });

  fs.writeFileSync(f, JSON.stringify(content, null, 2), 'utf8');
  console.log(`Updated ${path.basename(f)}: fixed ${movieFix} movies and ${epFix} series episodes`);
});
