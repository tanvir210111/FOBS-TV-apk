const path = require('path');
const adminService = require('../services/adminService');
const moviebox = require('../services/movieboxService');

async function run() {
  console.log('=== Adding Haikyu!! Hindi Dubbed (All Seasons & The Dumpster Battle) ===\n');

  const content = adminService.readContent();
  if (!content || !content.series || !content.movies) {
    console.error('Failed to read content catalog');
    process.exit(1);
  }

  // 1. Haikyu!! [Hindi] Series (Season 1-4, 85 episodes)
  const seriesId = 'mb-s-3056873170046255232';
  const seriesSubjectId = '3056873170046255232';
  const seriesDetailPath = 'haikyu-hindi-Cpr6FoIvOD3';
  const seriesPoster = 'https://pbcdnw.aoneroom.com/image/2026/01/27/7d6d892882893ca937473cd5d198e5c6.jpg';

  // Build Season 1 to 4
  const seasonConfigs = [
    { season: 1, episodesCount: 25, year: '2014' },
    { season: 2, episodesCount: 25, year: '2015' },
    { season: 3, episodesCount: 10, year: '2016' },
    { season: 4, episodesCount: 25, year: '2020' }
  ];

  const seasons = seasonConfigs.map(cfg => {
    const episodes = [];
    for (let ep = 1; ep <= cfg.episodesCount; ep++) {
      const streamUrl = `/api/moviebox/stream?id=${seriesSubjectId}&path=${encodeURIComponent(seriesDetailPath)}&se=${cfg.season}&ep=${ep}`;
      const stream720 = `${streamUrl}&q=720`;
      const stream480 = `${streamUrl}&q=480`;

      episodes.push({
        id: `${seriesId}_s${cfg.season}_e${ep}`,
        episode: ep,
        episodeNumber: ep,
        number: String(ep).padStart(2, '0'),
        season: cfg.season,
        seasonNumber: cfg.season,
        title: `Episode ${ep}`,
        name: `Episode ${ep}`,
        duration: '24m',
        still: seriesPoster,
        stillPath: seriesPoster,
        streamUrl: streamUrl,
        audioTracks: ['Hindi Dub', 'Original Audio'],
        selectedAudio: 'Hindi Dub',
        servers: [
          {
            name: `Server 1 (Hindi Dub 720p - Ep ${ep})`,
            url: stream720,
            quality: '720p',
            audio: 'Hindi Dub',
            isDirect: true
          },
          {
            name: `Server 2 (Fast 480p - Ep ${ep})`,
            url: stream480,
            quality: '480p',
            audio: 'Hindi Dub',
            isDirect: true
          }
        ]
      });
    }

    return {
      season: cfg.season,
      seasonNumber: cfg.season,
      title: `Season ${cfg.season}`,
      name: `Season ${cfg.season}`,
      year: cfg.year,
      episodesCount: episodes.length,
      episodes: episodes
    };
  });

  const totalEpisodes = seasons.reduce((acc, s) => acc + s.episodesCount, 0);

  const seriesEntry = {
    id: seriesId,
    subjectId: seriesSubjectId,
    detailPath: seriesDetailPath,
    title: 'Haikyu!! [Hindi]',
    year: '2014',
    rating: '8.7',
    imdbRating: '8.7',
    poster: seriesPoster,
    backdrop: seriesPoster,
    cover: seriesPoster,
    duration: `4 Seasons (${totalEpisodes} Episodes)`,
    episodesCount: totalEpisodes,
    seasonsCount: 4,
    category: 'Anime',
    genre: 'Anime, Animation, Comedy, Drama, Sports',
    industry: 'Japanese',
    country: 'Japan',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    audioTracks: ['Hindi Dub', 'Original Audio'],
    selectedAudio: 'Hindi Dub',
    badgeLeft: 'Trending',
    badgeRight: 'Hindi Dub',
    views: 18500,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: '2014-04-06',
    originalReleaseDate: '2014-04-06',
    description: "Determined to be like the volleyball championship's star player, Shouyou Hinata joins his school's volleyball club, forming an unexpected partnership with rival Tobio Kageyama to aim for the national championships.",
    type: 'series',
    streamUrl: `/api/moviebox/stream?id=${seriesSubjectId}&path=${encodeURIComponent(seriesDetailPath)}&se=1&ep=1`,
    servers: [
      {
        name: 'Server 1 (Hindi Dub - Auto-Renewing 720p)',
        url: `/api/moviebox/stream?id=${seriesSubjectId}&path=${encodeURIComponent(seriesDetailPath)}&se=1&ep=1&q=720`,
        quality: '720p',
        audio: 'Hindi Dub',
        isDirect: true
      },
      {
        name: 'Server 2 (Fast 480p)',
        url: `/api/moviebox/stream?id=${seriesSubjectId}&path=${encodeURIComponent(seriesDetailPath)}&se=1&ep=1&q=480`,
        quality: '480p',
        audio: 'Hindi Dub',
        isDirect: true
      }
    ],
    seasons: seasons
  };

  // 2. Haikyu!! The Dumpster Battle [Hindi] Movie (2024)
  const movieId = 'mb-m-6240602183298438496';
  const movieSubjectId = '6240602183298438496';
  const movieDetailPath = 'haikyu-the-dumpster-battle-hindi-Qqqlk3v10r7';
  const moviePoster = 'https://pbcdnw.aoneroom.com/image/2026/01/26/16fcb60b2d1acbe454fa90ca80386516.jpg';

  const movieEntry = {
    id: movieId,
    subjectId: movieSubjectId,
    detailPath: movieDetailPath,
    title: 'Haikyu!! The Dumpster Battle [Hindi]',
    year: '2024',
    rating: '7.7',
    imdbRating: '7.7',
    poster: moviePoster,
    backdrop: moviePoster,
    cover: moviePoster,
    duration: '1h 25m',
    category: 'Anime Movies (Hindi Dub)',
    genre: 'Anime, Animation, Comedy, Drama, Sports',
    industry: 'Japanese',
    country: 'Japan',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    audioTracks: ['Hindi Dub', 'Original Audio'],
    selectedAudio: 'Hindi Dub',
    badgeLeft: 'Trending',
    badgeRight: 'Hindi Dub',
    views: 24200,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: '2024-02-16',
    originalReleaseDate: '2024-02-16',
    description: 'Despite a strong field, the Karasuno High volleyball team advances to the fourth round of the Spring Tournament, where they face their perennial rivals, the Nekoma High team in the fateful Dumpster Battle.',
    type: 'movie',
    streamUrl: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0`,
    servers: [
      {
        name: 'Server 1 (Hindi Dub - Auto-Renewing 1080p)',
        url: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0&q=1080`,
        quality: '1080p',
        audio: 'Hindi Dub',
        isDirect: true
      },
      {
        name: 'Server 2 (Fast 480p)',
        url: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0&q=480`,
        quality: '480p',
        audio: 'Hindi Dub',
        isDirect: true
      }
    ]
  };

  // Insert or update in series list
  const existingSeriesIdx = content.series.findIndex(s => s.id === seriesId || s.subjectId === seriesSubjectId || s.detailPath === seriesDetailPath);
  if (existingSeriesIdx !== -1) {
    console.log(`Updating existing series at index ${existingSeriesIdx}...`);
    content.series[existingSeriesIdx] = seriesEntry;
  } else {
    console.log('Inserting new series at the beginning of series list...');
    content.series.unshift(seriesEntry);
  }

  // Insert or update in movies list
  const existingMovieIdx = content.movies.findIndex(m => m.id === movieId || m.subjectId === movieSubjectId || m.detailPath === movieDetailPath);
  if (existingMovieIdx !== -1) {
    console.log(`Updating existing movie at index ${existingMovieIdx}...`);
    content.movies[existingMovieIdx] = movieEntry;
  } else {
    console.log('Inserting new movie at the beginning of movies list...');
    content.movies.unshift(movieEntry);
  }

  console.log(`\nCatalog totals: ${content.movies.length} movies, ${content.series.length} series.`);
  console.log(`Haikyu series has ${seriesEntry.seasons.length} seasons, ${seriesEntry.episodesCount} episodes.`);

  const success = adminService.writeContent(content);
  if (success) {
    console.log('Successfully written to data/content.json and synced memory cache!');
  } else {
    console.error('Failed to write content catalog!');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
