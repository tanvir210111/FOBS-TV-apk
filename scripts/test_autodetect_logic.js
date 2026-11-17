const adminService = require('../services/adminService');

const tests = [
  { q: 'Sen Cal Kapimi [Hindi]', type: 'series', lang: 'tr', country: 'TR', expectInd: 'Turkish', expectCat: 'Turkish Drama' },
  { q: 'Squid Game [Hindi]', type: 'series', lang: 'ko', country: 'KR', expectInd: 'Korean', expectCat: 'Korean (Dubbed) Series' },
  { q: 'Solo Leveling [Hindi]', type: 'series', lang: 'ja', country: 'JP', expectInd: 'Anime', expectCat: 'Anime Series (Hindi Dub)' },
  { q: 'Devara [Hindi]', type: 'movie', lang: 'te', country: 'IN', expectInd: 'South Indian', expectCat: 'South (Dubbed) Movies' },
  { q: 'Pushpa 2: The Rule [Hindi]', type: 'movie', lang: 'te', country: 'IN', expectInd: 'South Indian', expectCat: 'South (Dubbed) Movies' },
  { q: 'Toofan', type: 'movie', lang: 'bn', country: 'BD', expectInd: 'Bengali', expectCat: 'Bengali' },
  { q: 'Deadpool & Wolverine [Hindi]', type: 'movie', lang: 'en', country: 'US', expectInd: 'Hollywood', expectCat: 'Hollywood (Dubbed) Movies' },
  { q: 'Stree 2 [Hindi]', type: 'movie', lang: 'hi', country: 'IN', expectInd: 'Bollywood', expectCat: 'Bollywood Movies' },
  { q: 'Hidden Love', type: 'series', lang: 'zh', country: 'CN', expectInd: 'Chinese', expectCat: 'Chinese Drama' },
  { q: 'Ertugrul [Hindi]', type: 'series', lang: '', country: '', expectInd: 'Turkish', expectCat: 'Turkish Drama' },
  { q: 'KGF Chapter 2 [Hindi]', type: 'movie', lang: '', country: '', expectInd: 'South Indian', expectCat: 'South (Dubbed) Movies' }
];

let failed = 0;
for (const t of tests) {
  const isHindi = /hindi/i.test(t.q);
  const ind = adminService.detectIndustry({
    title: t.q,
    lang: t.lang,
    originCountry: t.country
  });
  const cat = adminService.detectCategory(ind, t.type, isHindi);
  const indOk = ind === t.expectInd;
  const catOk = cat === t.expectCat;
  console.log(`${indOk && catOk ? 'PASS' : 'FAIL'}: "${t.q}" -> Industry: ${ind} (exp: ${t.expectInd}), Category: ${cat} (exp: ${t.expectCat})`);
  if (!indOk || !catOk) failed++;
}
console.log(`\nTotal tests: ${tests.length}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
