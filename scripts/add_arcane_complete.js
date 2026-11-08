const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');

const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

// Build complete 18 episodes across 2 seasons
const season1Episodes = [];
for (let ep = 1; ep <= 9; ep++) {
  season1Episodes.push({
    id: `mb-s-8350263472579564576_s1_e${ep}`,
    episode: ep,
    episodeNumber: ep,
    season: 1,
    title: `Episode ${ep}`,
    streamUrl: `/api/moviebox/stream?id=8350263472579564576&path=arcane-cSoWT6jiQW9&se=1&ep=${ep}&q=480`,
    duration: '42m'
  });
}

const season2Episodes = [];
for (let ep = 1; ep <= 9; ep++) {
  season2Episodes.push({
    id: `mb-s-8350263472579564576_s2_e${ep}`,
    episode: ep,
    episodeNumber: ep,
    season: 2,
    title: `Episode ${ep}`,
    streamUrl: `/api/moviebox/stream?id=8350263472579564576&path=arcane-cSoWT6jiQW9&se=2&ep=${ep}&q=480`,
    duration: '44m'
  });
}

const arcaneSeries = {
  id: 'mb-s-8350263472579564576',
  subjectId: '8350263472579564576',
  detailPath: 'arcane-cSoWT6jiQW9',
  title: 'Arcane',
  year: '2021',
  rating: '9.0',
  imdbRating: '9.0',
  poster: 'https://image.tmdb.org/t/p/w500/87C0wecB8bHb1PsrKBI4kJiEkgV.jpg',
  backdrop: 'https://image.tmdb.org/t/p/w1280/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg',
  banner: 'https://image.tmdb.org/t/p/w1280/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg',
  cover: 'https://image.tmdb.org/t/p/w1280/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg',
  category: 'Hollywood Series',
  industry: 'Hollywood',
  language: 'English',
  country: 'United States',
  genre: 'Animation, Sci-Fi, Action, Fantasy',
  description: 'Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.',
  seasonsCount: 2,
  totalEpisodes: 18,
  type: 'series',
  isCustom: true,
  releaseDate: '2021-11-06',
  seasons: [
    {
      season: 1,
      seasonNumber: 1,
      title: 'Season 1',
      name: 'Season 1',
      year: '2021',
      episodesCount: 9,
      episodes: season1Episodes
    },
    {
      season: 2,
      seasonNumber: 2,
      title: 'Season 2',
      name: 'Season 2',
      year: '2024',
      episodesCount: 9,
      episodes: season2Episodes
    }
  ]
};

// Also create a synced object for mb-s-2587437118653956672 so any old bookmarks or database references work flawlessly
const arcaneHindiSeries = {
  ...arcaneSeries,
  id: 'mb-s-2587437118653956672',
  subjectId: '2587437118653956672',
  title: 'Arcane [Hindi]',
  category: 'Anime Series (Hindi Dub)'
};

// Remove any broken/duplicate arcane items
content.series = content.series.filter(s => s.id !== 'mb-s-8350263472579564576' && s.id !== 'mb-s-2587437118653956672' && !(s.title && s.title.toLowerCase() === 'arcane [hindi] s1'));

// Add the complete series
content.series.unshift(arcaneSeries);
content.series.unshift(arcaneHindiSeries);

fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), 'utf8');
console.log('✅ Updated data/content.json with complete Arcane (2 seasons, 18 unique episodes)');

// Sync to custom_catalog.local.json
if (fs.existsSync(CUSTOM_FILE)) {
  const custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
  if (Array.isArray(custom.series)) {
    custom.series = custom.series.filter(s => s.id !== 'mb-s-8350263472579564576' && s.id !== 'mb-s-2587437118653956672' && !(s.title && s.title.toLowerCase() === 'arcane [hindi] s1'));
    custom.series.unshift(arcaneSeries);
    custom.series.unshift(arcaneHindiSeries);
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(custom, null, 2), 'utf8');
    console.log('✅ Updated data/custom_catalog.local.json with complete Arcane');
  }
}
