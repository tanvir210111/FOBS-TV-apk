const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

const fixes = {
  'Your Name. (2016) (Japanese Audio)': {
    poster: 'https://image.tmdb.org/t/p/w500/yLglTwyFOUZt5fNKm0PWL1PK5gm.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg',
    cover: 'https://image.tmdb.org/t/p/w1280/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg'
  },
  'Weathering with You (2019) (Japanese Audio)': {
    poster: 'https://image.tmdb.org/t/p/w500/sGBRqb0Y3DlUpmYXPGUsy587ofd.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    cover: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg'
  },
  'Cyborg She (2008) (Japanese Audio)': {
    poster: 'https://image.tmdb.org/t/p/w500/urQzxeK0fbT9OCTbI80MDnsKMhE.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w500/urQzxeK0fbT9OCTbI80MDnsKMhE.jpg',
    cover: 'https://image.tmdb.org/t/p/w500/urQzxeK0fbT9OCTbI80MDnsKMhE.jpg'
  }
};

files.forEach(f => {
  if (!fs.existsSync(f)) {
    console.warn('File not found:', f);
    return;
  }
  const content = JSON.parse(fs.readFileSync(f, 'utf8'));
  let count = 0;

  ['movies', 'series'].forEach(key => {
    (content[key] || []).forEach(item => {
      if (fixes[item.title]) {
        Object.assign(item, fixes[item.title]);
        count++;
        console.log(`Updated ${item.title} in ${path.basename(f)}`);
      }
    });
  });

  fs.writeFileSync(f, JSON.stringify(content, null, 2), 'utf8');
  console.log(`Saved ${f} (fixed ${count} items)`);
});
