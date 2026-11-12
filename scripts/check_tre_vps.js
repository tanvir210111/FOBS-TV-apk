const path = require('path');
const fs = require('fs');
const cPath = path.join(__dirname, '../data/content.json');
const c = JSON.parse(fs.readFileSync(cPath, 'utf8'));
const matches = (c.series || []).filter(s => (s.title && s.title.toLowerCase().includes('remarried')) || s.id.includes('579116273137862480'));
console.log('Matches in content.json:');
matches.forEach(m => {
  console.log('id:', m.id, 'title:', m.title, 'episodes length:', m.episodes && m.episodes.length, 'seasons[0] length:', m.seasons && m.seasons[0] && m.seasons[0].episodes && m.seasons[0].episodes.length);
});
