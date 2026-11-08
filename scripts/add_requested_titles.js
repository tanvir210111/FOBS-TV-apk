const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');

const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
if (!Array.isArray(content.series)) content.series = [];
if (!Array.isArray(content.movies)) content.movies = [];

let custom = { movies: [], series: [], liveTv: [], upcoming: [] };
if (fs.existsSync(CUSTOM_FILE)) {
  try { custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8')); } catch (_) {}
}
if (!Array.isArray(custom.series)) custom.series = [];

// ==========================================
// 1. UPDATE "100 Days of Deception" (Add Ep 10)
// ==========================================
const s100 = content.series.find(s => s.id === 'mb-s-5844444070034161864' || s.title.includes('100 Days of Deception'));
if (s100) {
  console.log('Updating 100 Days of Deception...');
  if (!Array.isArray(s100.episodes)) s100.episodes = [];
  if (!s100.episodes.some(e => e.episode === 10)) {
    const ep10 = {
      id: `${s100.id}_s1_e10`,
      number: '10',
      episode: 10,
      season: 1,
      title: 'Episode 10',
      duration: s100.episodes[0]?.duration || '45 min',
      still: s100.poster,
      stillPath: s100.poster,
      streamUrl: `/api/moviebox/stream?id=${s100.subjectId}&path=${encodeURIComponent(s100.detailPath || '')}&se=1&ep=10&q=480`,
      servers: [
        {
          name: 'Server 1 (Original Audio - Auto-Renewing 480p)',
          url: `/api/moviebox/stream?id=${s100.subjectId}&path=${encodeURIComponent(s100.detailPath || '')}&se=1&ep=10&q=480`,
          quality: '480p',
          audio: 'Original Audio',
          isDirect: true
        }
      ]
    };
    s100.episodes.push(ep10);
  }
  if (Array.isArray(s100.seasons) && s100.seasons[0]) {
    s100.seasons[0].episodes = s100.episodes;
    s100.seasons[0].episodesCount = s100.episodes.length;
  }
  s100.episodesCount = s100.episodes.length;
  s100.totalEpisodes = s100.episodes.length;
  s100.duration = `${s100.episodes.length} Episodes`;
  console.log(`✅ 100 Days of Deception now has ${s100.episodes.length} episodes`);
}

// ==========================================
// 2. UPDATE "Between Steps" (Add Ep 9 & 10)
// ==========================================
const bs = content.series.find(s => s.id === 'mb-s-1490100413461324960' || s.title.includes('Between Steps'));
if (bs) {
  console.log('Updating Between Steps...');
  if (!Array.isArray(bs.episodes)) bs.episodes = [];
  for (let epNum = 9; epNum <= 10; epNum++) {
    if (!bs.episodes.some(e => e.episode === epNum)) {
      const ep = {
        id: `${bs.id}_s1_e${epNum}`,
        number: String(epNum).padStart(2, '0'),
        episode: epNum,
        season: 1,
        title: `Episode ${epNum}`,
        duration: bs.episodes[0]?.duration || '45 min',
        still: bs.poster,
        stillPath: bs.poster,
        streamUrl: `/api/moviebox/stream?id=${bs.subjectId}&path=${encodeURIComponent(bs.detailPath || '')}&se=1&ep=${epNum}&q=480`,
        servers: [
          {
            name: 'Server 1 (Original Audio - Auto-Renewing 480p)',
            url: `/api/moviebox/stream?id=${bs.subjectId}&path=${encodeURIComponent(bs.detailPath || '')}&se=1&ep=${epNum}&q=480`,
            quality: '480p',
            audio: 'Original Audio',
            isDirect: true
          }
        ]
      };
      bs.episodes.push(ep);
    }
  }
  if (Array.isArray(bs.seasons) && bs.seasons[0]) {
    bs.seasons[0].episodes = bs.episodes;
    bs.seasons[0].episodesCount = bs.episodes.length;
  }
  bs.episodesCount = bs.episodes.length;
  bs.totalEpisodes = bs.episodes.length;
  bs.duration = `${bs.episodes.length} Episodes`;
  console.log(`✅ Between Steps now has ${bs.episodes.length} episodes`);
}

// ==========================================
// 3. UPDATE "Merry Berry Love" (Add Ep 5)
// ==========================================
const mbl = content.series.find(s => s.id === 'mb-s-4141784352315295168' || s.title.includes('Merry Berry Love'));
if (mbl) {
  console.log('Updating Merry Berry Love...');
  if (!Array.isArray(mbl.episodes)) mbl.episodes = [];
  if (!mbl.episodes.some(e => e.episode === 5)) {
    const ep5 = {
      id: `${mbl.id}_s1_e5`,
      number: '05',
      episode: 5,
      season: 1,
      title: 'Episode 5',
      duration: mbl.episodes[0]?.duration || '45 min',
      still: mbl.poster,
      stillPath: mbl.poster,
      streamUrl: `/api/moviebox/stream?id=${mbl.subjectId}&path=${encodeURIComponent(mbl.detailPath || '')}&se=1&ep=5&q=480`,
      servers: [
        {
          name: 'Server 1 (Original Audio - Auto-Renewing 480p)',
          url: `/api/moviebox/stream?id=${mbl.subjectId}&path=${encodeURIComponent(mbl.detailPath || '')}&se=1&ep=5&q=480`,
          quality: '480p',
          audio: 'Original Audio',
          isDirect: true
        }
      ]
    };
    mbl.episodes.push(ep5);
  }
  if (Array.isArray(mbl.seasons) && mbl.seasons[0]) {
    mbl.seasons[0].episodes = mbl.episodes;
    mbl.seasons[0].episodesCount = mbl.episodes.length;
  }
  mbl.episodesCount = mbl.episodes.length;
  mbl.totalEpisodes = mbl.episodes.length;
  mbl.duration = `${mbl.episodes.length} Episodes`;
  console.log(`✅ Merry Berry Love now has ${mbl.episodes.length} episodes`);
}

// ==========================================
// 4. ADD "Bigg Boss [Hindi]" (All Seasons 13-20, 898 episodes)
// ==========================================
console.log('Creating Bigg Boss [Hindi] with all seasons...');
const biggBossSeasonsConfig = [
  { se: 13, maxEp: 128 },
  { se: 14, maxEp: 133 },
  { se: 15, maxEp: 121 },
  { se: 16, maxEp: 135 },
  { se: 17, maxEp: 106 },
  { se: 18, maxEp: 106 },
  { se: 19, maxEp: 106 },
  { se: 20, maxEp: 63 }
];

const bbSubjectId = '7770042234816577656';
const bbDetailPath = 'bigg-boss-hindi-MithgQiSYf9';
const bbPoster = 'https://pbcdnw.aoneroom.com/image/2024/10/07/7770042318027374664.jpg';
const bbCover = 'https://pbcdnw.aoneroom.com/image/2024/10/07/7770042318027374664.jpg';

const bbSeasons = [];
let bbTotalEps = 0;

for (const sc of biggBossSeasonsConfig) {
  const eps = [];
  for (let ep = 1; ep <= sc.maxEp; ep++) {
    eps.push({
      id: `mb-s-${bbSubjectId}_s${sc.se}_e${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      season: sc.se,
      title: `Episode ${ep}`,
      duration: '45 min',
      still: bbPoster,
      stillPath: bbPoster,
      streamUrl: `/api/moviebox/stream?id=${bbSubjectId}&path=${encodeURIComponent(bbDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
      servers: [
        {
          name: 'Server 1 (Hindi Dub - Auto-Renewing 480p)',
          url: `/api/moviebox/stream?id=${bbSubjectId}&path=${encodeURIComponent(bbDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
          quality: '480p',
          audio: 'Hindi dub',
          isDirect: true
        }
      ]
    });
  }
  bbTotalEps += eps.length;
  bbSeasons.push({
    seasonNumber: sc.se,
    title: `Season ${sc.se}`,
    name: `Season ${sc.se}`,
    year: '2026',
    episodesCount: eps.length,
    episodes: eps
  });
}

const biggBossSeries = {
  id: `mb-s-${bbSubjectId}`,
  subjectId: bbSubjectId,
  detailPath: bbDetailPath,
  title: 'Bigg Boss [Hindi]',
  year: '2026',
  rating: '8.4',
  imdbRating: '8.4',
  poster: bbPoster,
  backdrop: bbCover,
  cover: bbCover,
  genre: 'Reality-TV, Drama, Game-Show',
  duration: `${bbSeasons.length} Seasons (${bbTotalEps} Episodes)`,
  category: 'Hindi Reality Shows',
  industry: 'Bollywood',
  language: 'Hindi',
  dubLanguage: 'Hindi',
  audioTracks: ['Hindi dub'],
  selectedAudio: 'Hindi dub',
  streamUrl: `/api/moviebox/stream?id=${bbSubjectId}&path=${encodeURIComponent(bbDetailPath)}&se=13&ep=1&q=480`,
  addedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  releaseDate: '2026-10-06',
  originalReleaseDate: '2006-11-03',
  badgeLeft: 'Trending',
  badgeRight: 'Hindi',
  views: 3420,
  seasonsCount: bbSeasons.length,
  totalEpisodes: bbTotalEps,
  episodesCount: bbSeasons[0]?.episodes?.length || 128,
  seasons: bbSeasons,
  episodes: bbSeasons[0]?.episodes || [],
  servers: [
    {
      name: 'Server 1 (Hindi Dub - Auto-Renewing 480p)',
      url: `/api/moviebox/stream?id=${bbSubjectId}&path=${encodeURIComponent(bbDetailPath)}&se=13&ep=1&q=480`,
      quality: '480p',
      audio: 'Hindi dub',
      isDirect: true
    }
  ],
  description: 'Bigg Boss is the Indian Hindi-language television reality show where celebrity contestants live together in an isolated house isolated from the outside world, competing to win cash prizes and viewers votes.',
  isHindi: true,
  isCustom: true
};

// Insert / Replace Bigg Boss
const bbIdx = content.series.findIndex(s => s.id === biggBossSeries.id || s.title === biggBossSeries.title);
if (bbIdx >= 0) content.series[bbIdx] = biggBossSeries;
else content.series.unshift(biggBossSeries);
console.log(`✅ Bigg Boss [Hindi] added with ${bbSeasons.length} seasons and ${bbTotalEps} episodes!`);

// ==========================================
// 5. ALSO ADD "Bigg Boss OTT [Hindi]" (S1-S3, 143 episodes)
// ==========================================
console.log('Creating Bigg Boss OTT [Hindi]...');
const ottSeasonsConfig = [
  { se: 1, maxEp: 42 },
  { se: 2, maxEp: 58 },
  { se: 3, maxEp: 43 }
];
const ottSubjectId = '6528658057613246592';
const ottDetailPath = 'bigg-boss-ott-hindi-wA2SXf2khM7';
const ottPoster = 'https://pbcdnw.aoneroom.com/image/2024/06/22/6528658117742788936.jpg';

const ottSeasons = [];
let ottTotalEps = 0;
for (const sc of ottSeasonsConfig) {
  const eps = [];
  for (let ep = 1; ep <= sc.maxEp; ep++) {
    eps.push({
      id: `mb-s-${ottSubjectId}_s${sc.se}_e${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      season: sc.se,
      title: `Episode ${ep}`,
      duration: '45 min',
      still: ottPoster,
      stillPath: ottPoster,
      streamUrl: `/api/moviebox/stream?id=${ottSubjectId}&path=${encodeURIComponent(ottDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
      servers: [
        {
          name: 'Server 1 (Hindi Dub - Auto-Renewing 480p)',
          url: `/api/moviebox/stream?id=${ottSubjectId}&path=${encodeURIComponent(ottDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
          quality: '480p',
          audio: 'Hindi dub',
          isDirect: true
        }
      ]
    });
  }
  ottTotalEps += eps.length;
  ottSeasons.push({
    seasonNumber: sc.se,
    title: `Season ${sc.se}`,
    name: `Season ${sc.se}`,
    year: '2024',
    episodesCount: eps.length,
    episodes: eps
  });
}

const biggBossOttSeries = {
  id: `mb-s-${ottSubjectId}`,
  subjectId: ottSubjectId,
  detailPath: ottDetailPath,
  title: 'Bigg Boss OTT [Hindi]',
  year: '2024',
  rating: '8.2',
  imdbRating: '8.2',
  poster: ottPoster,
  backdrop: ottPoster,
  cover: ottPoster,
  genre: 'Reality-TV, Drama',
  duration: `${ottSeasons.length} Seasons (${ottTotalEps} Episodes)`,
  category: 'Hindi Reality Shows',
  industry: 'Bollywood',
  language: 'Hindi',
  dubLanguage: 'Hindi',
  audioTracks: ['Hindi dub'],
  selectedAudio: 'Hindi dub',
  streamUrl: `/api/moviebox/stream?id=${ottSubjectId}&path=${encodeURIComponent(ottDetailPath)}&se=1&ep=1&q=480`,
  addedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  releaseDate: '2024-06-21',
  originalReleaseDate: '2021-08-08',
  badgeLeft: 'OTT',
  badgeRight: 'Hindi',
  views: 2890,
  seasonsCount: ottSeasons.length,
  totalEpisodes: ottTotalEps,
  episodesCount: ottSeasons[0]?.episodes?.length || 42,
  seasons: ottSeasons,
  episodes: ottSeasons[0]?.episodes || [],
  servers: [
    {
      name: 'Server 1 (Hindi Dub - Auto-Renewing 480p)',
      url: `/api/moviebox/stream?id=${ottSubjectId}&path=${encodeURIComponent(ottDetailPath)}&se=1&ep=1&q=480`,
      quality: '480p',
      audio: 'Hindi dub',
      isDirect: true
    }
  ],
  description: 'Bigg Boss OTT is an Indian Hindi-language reality digital series, streaming exclusively on OTT platforms with 24x7 live feeds.',
  isHindi: true,
  isCustom: true
};

const ottIdx = content.series.findIndex(s => s.id === biggBossOttSeries.id || s.title === biggBossOttSeries.title);
if (ottIdx >= 0) content.series[ottIdx] = biggBossOttSeries;
else content.series.unshift(biggBossOttSeries);
console.log(`✅ Bigg Boss OTT [Hindi] added with ${ottSeasons.length} seasons and ${ottTotalEps} episodes!`);

// ==========================================
// 6. ALSO ADD "The Big Boss" (Chinese Drama, S1-S2, 36 episodes)
// ==========================================
console.log('Creating The Big Boss (Chinese Drama)...');
const cbbSubjectId = '7472857198671315792';
const cbbDetailPath = 'the-big-boss-YeUSMCrL1U8';
const cbbPoster = 'https://pbcdnw.aoneroom.com/image/2025/08/24/7472857241620988624.jpg';

const cbbSeasons = [];
let cbbTotalEps = 0;
for (const sc of [{ se: 1, maxEp: 18 }, { se: 2, maxEp: 18 }]) {
  const eps = [];
  for (let ep = 1; ep <= sc.maxEp; ep++) {
    eps.push({
      id: `mb-s-${cbbSubjectId}_s${sc.se}_e${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      season: sc.se,
      title: `Episode ${ep}`,
      duration: '40 min',
      still: cbbPoster,
      stillPath: cbbPoster,
      streamUrl: `/api/moviebox/stream?id=${cbbSubjectId}&path=${encodeURIComponent(cbbDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
      servers: [
        {
          name: 'Server 1 (Original Audio - Auto-Renewing 480p)',
          url: `/api/moviebox/stream?id=${cbbSubjectId}&path=${encodeURIComponent(cbbDetailPath)}&se=${sc.se}&ep=${ep}&q=480`,
          quality: '480p',
          audio: 'Original Audio',
          isDirect: true
        }
      ]
    });
  }
  cbbTotalEps += eps.length;
  cbbSeasons.push({
    seasonNumber: sc.se,
    title: `Season ${sc.se}`,
    name: `Season ${sc.se}`,
    year: '2017',
    episodesCount: eps.length,
    episodes: eps
  });
}

const cbbSeries = {
  id: `mb-s-${cbbSubjectId}`,
  subjectId: cbbSubjectId,
  detailPath: cbbDetailPath,
  title: 'The Big Boss',
  year: '2017',
  rating: '8.1',
  imdbRating: '8.1',
  poster: cbbPoster,
  backdrop: cbbPoster,
  cover: cbbPoster,
  genre: 'Comedy, Romance, School, Youth',
  duration: `${cbbSeasons.length} Seasons (${cbbTotalEps} Episodes)`,
  category: 'Chinese Series',
  industry: 'Chinese',
  language: 'Chinese',
  dubLanguage: 'Original',
  audioTracks: ['Original Audio'],
  selectedAudio: 'Original Audio',
  streamUrl: `/api/moviebox/stream?id=${cbbSubjectId}&path=${encodeURIComponent(cbbDetailPath)}&se=1&ep=1&q=480`,
  addedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  releaseDate: '2017-09-08',
  originalReleaseDate: '2017-09-08',
  badgeLeft: 'C-Drama',
  badgeRight: 'Chinese',
  views: 1890,
  seasonsCount: cbbSeasons.length,
  totalEpisodes: cbbTotalEps,
  episodesCount: cbbSeasons[0]?.episodes?.length || 18,
  seasons: cbbSeasons,
  episodes: cbbSeasons[0]?.episodes || [],
  servers: [
    {
      name: 'Server 1 (Original Audio - Auto-Renewing 480p)',
      url: `/api/moviebox/stream?id=${cbbSubjectId}&path=${encodeURIComponent(cbbDetailPath)}&se=1&ep=1&q=480`,
      quality: '480p',
      audio: 'Original Audio',
      isDirect: true
    }
  ],
  description: 'A cheerful teenage girl who loves comics finds her high school life complicated when she is elected class president alongside her perfectionist childhood friend and nemesis.',
  isHindi: false,
  isCustom: true
};

const cbbIdx = content.series.findIndex(s => s.id === cbbSeries.id || s.title === cbbSeries.title);
if (cbbIdx >= 0) content.series[cbbIdx] = cbbSeries;
else content.series.unshift(cbbSeries);
console.log(`✅ The Big Boss added with ${cbbSeasons.length} seasons and ${cbbTotalEps} episodes!`);

// Save content.json
fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), 'utf8');
console.log('✅ content.json saved successfully!');

// Save to custom_catalog.local.json
const customItems = [s100, bs, mbl, biggBossSeries, biggBossOttSeries, cbbSeries].filter(Boolean);
for (const ci of customItems) {
  const cIdx = custom.series.findIndex(s => s.id === ci.id || s.title === ci.title);
  if (cIdx >= 0) custom.series[cIdx] = ci;
  else custom.series.unshift(ci);
}
fs.writeFileSync(CUSTOM_FILE, JSON.stringify(custom, null, 2), 'utf8');
console.log('✅ custom_catalog.local.json updated with all updated series!');
