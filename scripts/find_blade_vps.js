const fs = require('fs');
const c = JSON.parse(fs.readFileSync('/home/FOBS-TV-apk/data/content.json', 'utf8'));
for (const cat of ['movies', 'series']) {
  for (const x of (c[cat] || [])) {
    if ((x.title || '').toLowerCase().includes('blade of the immortal')) {
      console.log(`=== ${cat} ===`);
      console.log(JSON.stringify(x, null, 2));
    }
  }
}

