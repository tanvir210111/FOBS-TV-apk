const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
const files = [
  path.join(dir, 'custom_catalog.local.json'),
  path.join(dir, 'custom_catalog.backup.json'),
  path.join(dir, 'content.json'),
  path.join(dir, 'content.backup.json'),
  path.join(dir, 'content.local.json')
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Array.isArray(data.series)) {
      // 1. Remove 1-episode Hindi duplicate
      data.series = data.series.filter(s => s.id !== 'mb-s-1789038705722774000' && !s.title.includes('Remarried Empress [Hindi]'));

      // 2. Find Korean 5-episode version
      const korIdx = data.series.findIndex(s => s.id === 'mb-s-579116273137862480' || s.title === 'The Remarried Empress');
      let korItem = null;
      if (korIdx !== -1) {
        korItem = data.series.splice(korIdx, 1)[0];
      }

      if (korItem) {
        korItem.addedAt = new Date().toISOString();
        korItem.createdAt = new Date().toISOString();
        korItem.releaseDate = '2026-11-12';
        korItem.episodesCount = (korItem.episodes && korItem.episodes.length) || 5;
        data.series.unshift(korItem);
        data.featured = JSON.parse(JSON.stringify(korItem));
      }
    }
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    console.log('✓ Purged Hindi duplicate & set Korean 5-ep as #1 in:', f);
  } catch (err) {
    console.error('Error on', f, err.message);
  }
});

