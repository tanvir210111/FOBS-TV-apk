const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');

const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

// 1. Remove "The Big Boss" (Chinese Drama)
const initialCount = content.series.length;
content.series = content.series.filter(s => s.id !== 'mb-s-7472857198671315792');
console.log(`Removed The Big Boss: ${initialCount} -> ${content.series.length} series`);

// 2. Update Bigg Boss [Hindi]
const bbHindi = content.series.find(s => s.id === 'mb-s-7770042234816577656');
if (bbHindi) {
  bbHindi.poster = 'https://image.tmdb.org/t/p/w500/AspHixRhWg5q8sOER7BoZ3U6xsn.jpg';
  bbHindi.backdrop = 'https://image.tmdb.org/t/p/w1280/aNjKIoBIxxdvxxP7wqDYCs2eD70.jpg';
  bbHindi.banner = 'https://image.tmdb.org/t/p/w1280/aNjKIoBIxxdvxxP7wqDYCs2eD70.jpg';
  bbHindi.cover = 'https://image.tmdb.org/t/p/w1280/aNjKIoBIxxdvxxP7wqDYCs2eD70.jpg';
  bbHindi.category = 'Bollywood Series';
  bbHindi.industry = 'Bollywood';
  bbHindi.language = 'Hindi';
  bbHindi.country = 'India';
  bbHindi.genre = 'Reality-TV, Drama, Game-Show';
  console.log('✅ Updated Bigg Boss [Hindi] posters and Bollywood category');
}

// 3. Update Bigg Boss OTT [Hindi]
const bbOtt = content.series.find(s => s.id === 'mb-s-6528658057613246592');
if (bbOtt) {
  bbOtt.poster = 'https://image.tmdb.org/t/p/w500/ev0pJtwCG0oeaQHSO2VToMEPyne.jpg';
  bbOtt.backdrop = 'https://image.tmdb.org/t/p/w1280/1Oh6jcDYkjtndtgWw58Afh3qyEt.jpg';
  bbOtt.banner = 'https://image.tmdb.org/t/p/w1280/1Oh6jcDYkjtndtgWw58Afh3qyEt.jpg';
  bbOtt.cover = 'https://image.tmdb.org/t/p/w1280/1Oh6jcDYkjtndtgWw58Afh3qyEt.jpg';
  bbOtt.category = 'Bollywood Series';
  bbOtt.industry = 'Bollywood';
  bbOtt.language = 'Hindi';
  bbOtt.country = 'India';
  bbOtt.genre = 'Reality-TV, Drama';
  console.log('✅ Updated Bigg Boss OTT [Hindi] posters and Bollywood category');
}

// 4. Update Merry Berry Love
const mbl = content.series.find(s => s.id === 'mb-s-4141784352315295168');
if (mbl) {
  mbl.poster = 'https://image.tmdb.org/t/p/w500/aOz2lRcVTkYZpz1dGIGtJsirvsu.jpg';
  mbl.backdrop = 'https://image.tmdb.org/t/p/w1280/vPDVee1j6w0hJ2xMJ2bU5HVBA0Z.jpg';
  mbl.banner = 'https://image.tmdb.org/t/p/w1280/vPDVee1j6w0hJ2xMJ2bU5HVBA0Z.jpg';
  mbl.cover = 'https://image.tmdb.org/t/p/w1280/vPDVee1j6w0hJ2xMJ2bU5HVBA0Z.jpg';
  mbl.category = 'Korean Series';
  mbl.country = 'Korea';
  mbl.language = 'Korean';
  console.log('✅ Updated Merry Berry Love posters');
}

// 5. Update Between Steps
const bs = content.series.find(s => s.id === 'mb-s-1490100413461324960');
if (bs) {
  bs.poster = 'https://image.tmdb.org/t/p/w500/pGqcErS76y8bcvZZSFUefdZOg2x.jpg';
  bs.backdrop = 'https://image.tmdb.org/t/p/w1280/wwSoLQrLyiXXUbRnZq1eWBbHaRR.jpg';
  bs.banner = 'https://image.tmdb.org/t/p/w1280/wwSoLQrLyiXXUbRnZq1eWBbHaRR.jpg';
  bs.cover = 'https://image.tmdb.org/t/p/w1280/wwSoLQrLyiXXUbRnZq1eWBbHaRR.jpg';
  bs.category = 'Korean Series';
  bs.country = 'Korea';
  bs.language = 'Korean';
  console.log('✅ Updated Between Steps posters');
}

// 6. Update 100 Days of Deception
const hdd = content.series.find(s => s.id === 'mb-s-5844444070034161864');
if (hdd) {
  hdd.poster = 'https://image.tmdb.org/t/p/w500/bZHEU42QynnMrHUWK1Hhvj2cdPA.jpg';
  hdd.backdrop = 'https://image.tmdb.org/t/p/w1280/3SvKCITqMtjgPIhFBjRc4yTAc4H.jpg';
  hdd.banner = 'https://image.tmdb.org/t/p/w1280/3SvKCITqMtjgPIhFBjRc4yTAc4H.jpg';
  hdd.cover = 'https://image.tmdb.org/t/p/w1280/3SvKCITqMtjgPIhFBjRc4yTAc4H.jpg';
  hdd.category = 'Korean Series';
  hdd.country = 'Korea';
  hdd.language = 'Korean';
  console.log('✅ Updated 100 Days of Deception posters');
}

fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), 'utf8');
console.log('Saved data/content.json');

// Sync to custom_catalog.local.json
if (fs.existsSync(CUSTOM_FILE)) {
  const custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
  if (Array.isArray(custom.series)) {
    // remove The Big Boss
    custom.series = custom.series.filter(s => s.id !== 'mb-s-7472857198671315792');
    // sync updated items
    [bbHindi, bbOtt, mbl, bs, hdd].forEach(item => {
      if (!item) return;
      const idx = custom.series.findIndex(s => s.id === item.id);
      if (idx >= 0) {
        custom.series[idx] = { ...custom.series[idx], ...item };
      }
    });
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(custom, null, 2), 'utf8');
    console.log('Saved data/custom_catalog.local.json');
  }
}
