const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

async function run() {
  console.log('=== ADDING MITHAI [BENGALI] (875 EPISODES) ===\n');

  const subjectId = '2033195013856708224';
  const detailPath = 'mithai-bengali-OlawFoo3cq2';
  const totalEps = 875;

  console.log('Resolving Episode 1 stream for direct playback...');
  let ep1Direct = '';
  try {
    const res1 = await moviebox.resolveMedia(subjectId, detailPath, 1, 1);
    if (res1 && res1.streamUrl) {
      ep1Direct = res1.streamUrl;
      console.log('✓ Ep 1 direct stream resolved:', ep1Direct.slice(0, 80));
    }
  } catch (e) {
    console.warn('Could not pre-resolve Ep 1:', e.message);
  }

  const poster = 'https://image.tmdb.org/t/p/w500/c9ECRSyYu5VZ3L8Q4FYy0sAwi09.jpg';
  const backdrop = 'https://image.tmdb.org/t/p/original/gfA6kltfCqEVpkviA1gFyZNrUMM.jpg';

  const episodes = [];
  for (let ep = 1; ep <= totalEps; ep++) {
    const epObj = {
      id: `ep-mithai-bn-1-${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      season: 1,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '22m',
      still: backdrop,
      stillPath: backdrop,
      streamUrl: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}&q=720`,
      audioTracks: ['Bengali'],
      selectedAudio: 'Bengali',
      servers: [
        {
          name: `Server 1 (Bengali 720p HD - Ep ${ep})`,
          url: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}&q=720`,
          quality: '720p',
          audio: 'Bengali'
        },
        {
          name: `Server 2 (Fast 480p Stream - Ep ${ep})`,
          url: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}&q=480`,
          quality: '480p',
          audio: 'Bengali'
        }
      ]
    };

    if (ep === 1 && ep1Direct) {
      epObj.directStreamUrl = ep1Direct;
      epObj.servers.unshift({
        name: 'Server 1 (Fast Direct CDN 1080p)',
        url: ep1Direct,
        quality: '1080p',
        audio: 'Bengali',
        isDirect: true
      });
    }

    episodes.push(epObj);
  }

  const seriesObj = {
    id: `series-mithai-bengali-875`,
    subjectId: subjectId,
    detailPath: detailPath,
    title: 'Mithai [Bengali]',
    type: 'series',
    category: 'Trending Series',
    industry: 'Others',
    country: 'India',
    language: 'Bengali',
    audio: 'Bengali',
    year: '2021',
    rating: '8.9',
    imdbRating: '8.9',
    genre: 'Drama, Romance, Comedy, Family',
    poster: poster,
    backdrop: backdrop,
    banner: backdrop,
    cover: backdrop,
    description: 'Mithai is a sweet, cheerful girl who makes delicious traditional Bengali sweets and brings joy to the Modak family, melting the cold heart of Siddhartha (Ucchebabu). A beloved Bengali television serial featuring all 875 complete episodes.',
    totalEpisodes: totalEps,
    seasonsCount: 1,
    streamUrl: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=1&q=720`,
    directStreamUrl: ep1Direct || undefined,
    audioTracks: ['Bengali'],
    selectedAudio: 'Bengali',
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        name: 'Season 1',
        title: 'Season 1',
        episodes: episodes
      }
    ],
    episodes: episodes,
    source: 'MovieBox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const contentFile = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

  // Remove existing Mithai entry if present
  content.series = content.series.filter(s =>
    s.id !== seriesObj.id &&
    s.title !== seriesObj.title &&
    s.title !== 'Mithai'
  );

  // Unshift to top of series list
  content.series.unshift(seriesObj);

  console.log(`\nCatalog now has ${content.series.length} series. Added: "${seriesObj.title}" with ${seriesObj.totalEpisodes} episodes.`);

  const savePaths = [
    path.join(__dirname, '../data/content.json'),
    path.join(__dirname, '../data/content.backup.json'),
    path.join(__dirname, '../data/content.local.json'),
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];

  for (const p of savePaths) {
    if (fs.existsSync(path.dirname(p))) {
      fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8');
      console.log(`✓ Saved to ${p}`);
    }
  }

  console.log('\n🎉 ALL 875 EPISODES OF MITHAI [BENGALI] SUCCESSFULLY ADDED!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

