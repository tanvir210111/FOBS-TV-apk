/**
 * FOBS TV - Populate Multi-Episodes for Anime and K-Dramas with single episodes
 */

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

const SHOWS_TO_EXPAND = [
  {
    keyword: 'shop for killers',
    tmdbId: 215072,
    imdbId: 'tt26541018',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 8 }
    ]
  },
  {
    keyword: 'mouse',
    tmdbId: 117376,
    imdbId: 'tt13634792',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 20 }
    ]
  },
  {
    keyword: 'mushoku tensei',
    tmdbId: 94664,
    imdbId: 'tt13293588',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 23 },
      { seasonNumber: 2, name: 'Season 2', eps: 24 }
    ]
  },
  {
    keyword: 're:zero',
    tmdbId: 65942,
    imdbId: 'tt5607616',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 25 },
      { seasonNumber: 2, name: 'Season 2', eps: 25 },
      { seasonNumber: 3, name: 'Season 3', eps: 16 }
    ]
  },
  {
    keyword: 'black torch',
    tmdbId: 94664,
    imdbId: 'tt13293588',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 12 }
    ]
  },
  {
    keyword: 'visionquest',
    tmdbId: 215072,
    imdbId: 'tt26541018',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 8 }
    ]
  },
  {
    keyword: 'legend after my 10',
    tmdbId: 94664,
    imdbId: 'tt13293588',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', eps: 12 }
    ]
  }
];

for (const target of SHOWS_TO_EXPAND) {
  const item = catalog.series.find(s => s.title && s.title.toLowerCase().includes(target.keyword));
  if (!item) continue;

  console.log(`✨ Expanding episodes for "${item.title}"...`);
  const seasonsArray = [];

  for (const sInfo of target.seasons) {
    const eps = [];
    for (let ep = 1; ep <= sInfo.eps; ep++) {
      const vidlinkUrl = `https://vidlink.pro/tv/${target.tmdbId}/${sInfo.seasonNumber}/${ep}`;
      const vidsrcUrl = `https://vidsrc.to/embed/tv/${target.tmdbId}/${sInfo.seasonNumber}/${ep}`;
      const autoembedUrl = `https://autoembed.co/tv/imdb/${target.imdbId}-${sInfo.seasonNumber}-${ep}`;

      eps.push({
        number: ep,
        season: sInfo.seasonNumber,
        title: `Episode ${ep}`,
        streamUrl: vidlinkUrl,
        audioTracks: {
          'Hindi dub': vidlinkUrl,
          'Original Audio': vidsrcUrl
        },
        servers: [
          { name: 'Server 1 (Fast HD - 1080p)', url: vidlinkUrl, isDirect: false },
          { name: 'Server 2 (Super Player)', url: vidsrcUrl, isDirect: false },
          { name: 'Server 3 (HD Player)', url: autoembedUrl, isDirect: false }
        ]
      });
    }

    seasonsArray.push({
      seasonNumber: sInfo.seasonNumber,
      name: sInfo.name,
      episodeCount: eps.length,
      episodes: eps
    });
  }

  item.seasons = seasonsArray;
  item.seasonsCount = seasonsArray.length;
  item.episodes = seasonsArray[0].episodes;
  item.streamUrl = seasonsArray[0].episodes[0].streamUrl;
  item.servers = seasonsArray[0].episodes[0].servers;
  console.log(`   ✅ Populated ${seasonsArray.length} season(s), total ${seasonsArray.reduce((acc, s) => acc + s.episodes.length, 0)} episodes!`);
}

// Save updated files
fs.writeFileSync(CONTENT_FILE, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(PUBLIC_SEED, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(ANDROID_SEED, JSON.stringify(catalog, null, 2), 'utf8');

console.log('✅ Finished expanding anime and series episodes!');
