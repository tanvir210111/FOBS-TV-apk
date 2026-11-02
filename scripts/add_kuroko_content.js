const adminService = require('../services/adminService');

async function run() {
  console.log("=== Adding Kuroko's Basketball (Hindi Dub & Original Audio) ===\n");

  const content = adminService.readContent();
  if (!content || !content.series || !content.movies) {
    console.error('Failed to read content catalog');
    process.exit(1);
  }

  const poster = 'https://pbcdnw.aoneroom.com/image/2026/01/27/bf22ef22f785dcbcd191af6891a30b75.jpg';

  // 1. Kuroko's Basketball [Hindi] (Series - Season 1: 25 Episodes)
  const hindiSeriesId = 'mb-s-3965846582238530584';
  const hindiSubjectId = '3965846582238530584';
  const hindiDetailPath = 'kurokos-basketball-hindi-Isvrq3pCXI4';

  const hindiEpisodes = [];
  for (let ep = 1; ep <= 25; ep++) {
    const streamUrl = `/api/moviebox/stream?id=${hindiSubjectId}&path=${encodeURIComponent(hindiDetailPath)}&se=1&ep=${ep}`;
    hindiEpisodes.push({
      id: `${hindiSeriesId}_s1_e${ep}`,
      episode: ep,
      episodeNumber: ep,
      number: String(ep).padStart(2, '0'),
      season: 1,
      seasonNumber: 1,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '24m',
      still: poster,
      stillPath: poster,
      streamUrl: streamUrl,
      audioTracks: ['Hindi Dub', 'Original Audio'],
      selectedAudio: 'Hindi Dub',
      servers: [
        {
          name: `Server 1 (Hindi Dub 720p - Ep ${ep})`,
          url: `${streamUrl}&q=720`,
          quality: '720p',
          audio: 'Hindi Dub',
          isDirect: true
        },
        {
          name: `Server 2 (Fast 480p - Ep ${ep})`,
          url: `${streamUrl}&q=480`,
          quality: '480p',
          audio: 'Hindi Dub',
          isDirect: true
        }
      ]
    });
  }

  const hindiSeriesEntry = {
    id: hindiSeriesId,
    subjectId: hindiSubjectId,
    detailPath: hindiDetailPath,
    title: "Kuroko's Basketball [Hindi]",
    year: '2012',
    rating: '8.3',
    imdbRating: '8.3',
    poster: poster,
    backdrop: poster,
    cover: poster,
    duration: '1 Season (25 Episodes)',
    episodesCount: 25,
    seasonsCount: 1,
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
    views: 19800,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: '2012-04-08',
    originalReleaseDate: '2012-04-08',
    description: "The Teiko Middle School Basketball Club was crowned champion three years in a row thanks to the 'Generation of Miracles'. Tetsuya Kuroko, the phantom sixth man, joins Seirin High and aims to take down each of his former teammates with Taiga Kagami.",
    type: 'series',
    streamUrl: `/api/moviebox/stream?id=${hindiSubjectId}&path=${encodeURIComponent(hindiDetailPath)}&se=1&ep=1`,
    servers: [
      {
        name: 'Server 1 (Hindi Dub - Auto-Renewing 720p)',
        url: `/api/moviebox/stream?id=${hindiSubjectId}&path=${encodeURIComponent(hindiDetailPath)}&se=1&ep=1&q=720`,
        quality: '720p',
        audio: 'Hindi Dub',
        isDirect: true
      },
      {
        name: 'Server 2 (Fast 480p)',
        url: `/api/moviebox/stream?id=${hindiSubjectId}&path=${encodeURIComponent(hindiDetailPath)}&se=1&ep=1&q=480`,
        quality: '480p',
        audio: 'Hindi Dub',
        isDirect: true
      }
    ],
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2012',
        episodesCount: 25,
        episodes: hindiEpisodes
      }
    ]
  };

  // 2. Kuroko's Basketball (Series - Original Audio / Multi-Audio, 3 Seasons, 75 Episodes)
  const origSeriesId = 'mb-s-3166726178862419960';
  const origSubjectId = '3166726178862419960';
  const origDetailPath = 'kurokos-basketball-cwVJJdEDVL3';

  const seasonConfigs = [
    { season: 1, episodesCount: 25, year: '2012' },
    { season: 2, episodesCount: 25, year: '2013' },
    { season: 3, episodesCount: 25, year: '2015' }
  ];

  const origSeasons = seasonConfigs.map(cfg => {
    const episodes = [];
    for (let ep = 1; ep <= cfg.episodesCount; ep++) {
      const origStreamUrl = `/api/moviebox/stream?id=${origSubjectId}&path=${encodeURIComponent(origDetailPath)}&se=${cfg.season}&ep=${ep}`;
      const servers = [
        {
          name: `Server 1 (Original Audio 720p - Ep ${ep})`,
          url: `${origStreamUrl}&q=720`,
          quality: '720p',
          audio: 'Original Audio',
          isDirect: true
        }
      ];

      // For Season 1, also attach Hindi Dub server directly so users can switch seamlessly!
      if (cfg.season === 1) {
        const hindiStreamUrl = `/api/moviebox/stream?id=${hindiSubjectId}&path=${encodeURIComponent(hindiDetailPath)}&se=1&ep=${ep}`;
        servers.push({
          name: `Server 2 (Hindi Dub 720p - Ep ${ep})`,
          url: `${hindiStreamUrl}&q=720`,
          quality: '720p',
          audio: 'Hindi Dub',
          isDirect: true
        });
      }

      servers.push({
        name: `Server ${cfg.season === 1 ? '3' : '2'} (Fast 480p - Ep ${ep})`,
        url: `${origStreamUrl}&q=480`,
        quality: '480p',
        audio: 'Original Audio',
        isDirect: true
      });

      episodes.push({
        id: `${origSeriesId}_s${cfg.season}_e${ep}`,
        episode: ep,
        episodeNumber: ep,
        number: String(ep).padStart(2, '0'),
        season: cfg.season,
        seasonNumber: cfg.season,
        title: `Episode ${ep}`,
        name: `Episode ${ep}`,
        duration: '24m',
        still: poster,
        stillPath: poster,
        streamUrl: origStreamUrl,
        audioTracks: cfg.season === 1 ? ['Original Audio', 'Hindi Dub'] : ['Original Audio'],
        selectedAudio: 'Original Audio',
        servers: servers
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

  const origTotalEpisodes = origSeasons.reduce((acc, s) => acc + s.episodesCount, 0);

  const origSeriesEntry = {
    id: origSeriesId,
    subjectId: origSubjectId,
    detailPath: origDetailPath,
    title: "Kuroko's Basketball",
    year: '2012',
    rating: '8.3',
    imdbRating: '8.3',
    poster: poster,
    backdrop: poster,
    cover: poster,
    duration: `3 Seasons (${origTotalEpisodes} Episodes)`,
    episodesCount: origTotalEpisodes,
    seasonsCount: 3,
    category: 'Anime',
    genre: 'Anime, Animation, Comedy, Drama, Sports',
    industry: 'Japanese',
    country: 'Japan',
    language: 'Japanese',
    dubLanguage: 'Original Audio',
    audioTracks: ['Original Audio', 'Hindi Dub'],
    selectedAudio: 'Original Audio',
    badgeLeft: 'Trending',
    badgeRight: 'Japanese',
    views: 26500,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: '2012-04-08',
    originalReleaseDate: '2012-04-08',
    description: "The Teiko Middle School Basketball Club was crowned champion three years in a row thanks to the 'Generation of Miracles'. Tetsuya Kuroko, the phantom sixth man, joins Seirin High and aims to take down each of his former teammates with Taiga Kagami to win the Inter-High and Winter Cup.",
    type: 'series',
    streamUrl: `/api/moviebox/stream?id=${origSubjectId}&path=${encodeURIComponent(origDetailPath)}&se=1&ep=1`,
    servers: [
      {
        name: 'Server 1 (Original Audio - Auto-Renewing 720p)',
        url: `/api/moviebox/stream?id=${origSubjectId}&path=${encodeURIComponent(origDetailPath)}&se=1&ep=1&q=720`,
        quality: '720p',
        audio: 'Original Audio',
        isDirect: true
      },
      {
        name: 'Server 2 (Fast 480p)',
        url: `/api/moviebox/stream?id=${origSubjectId}&path=${encodeURIComponent(origDetailPath)}&se=1&ep=1&q=480`,
        quality: '480p',
        audio: 'Original Audio',
        isDirect: true
      }
    ],
    seasons: origSeasons
  };

  // 3. Kuroko's Basketball: Last Game (Movie 2017)
  const movieId = 'mb-m-7971108207127318520';
  const movieSubjectId = '7971108207127318520';
  const movieDetailPath = 'kurokos-basketball-last-game-Ykzls28LPu9';
  const moviePoster = 'https://pbcdnw.aoneroom.com/image/2026/01/27/5dcdb7d0e17c0a335765c87422592851.jpg';

  const movieEntry = {
    id: movieId,
    subjectId: movieSubjectId,
    detailPath: movieDetailPath,
    title: "Kuroko's Basketball: Last Game",
    year: '2017',
    rating: '7.8',
    imdbRating: '7.8',
    poster: moviePoster,
    backdrop: moviePoster,
    cover: moviePoster,
    duration: '1h 30m',
    category: 'Anime',
    genre: 'Anime, Animation, Comedy, Drama, Sports',
    industry: 'Japanese',
    country: 'Japan',
    language: 'Japanese',
    dubLanguage: 'Original Audio',
    audioTracks: ['Original Audio'],
    selectedAudio: 'Original Audio',
    badgeLeft: 'Trending',
    badgeRight: 'Japanese',
    views: 18200,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    releaseDate: '2017-03-18',
    originalReleaseDate: '2017-03-18',
    description: "An American street basketball team called Jabberwock comes to Japan and mocks Japanese basketball. To get revenge, a dream team consisting of the Generation of Miracles, Kuroko, and Kagami is formed: Team Vorpal Swords!",
    type: 'movie',
    streamUrl: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0`,
    servers: [
      {
        name: 'Server 1 (HD 1080p - Auto-Renewing)',
        url: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0&q=1080`,
        quality: '1080p',
        audio: 'Original Audio',
        isDirect: true
      },
      {
        name: 'Server 2 (Fast 480p)',
        url: `/api/moviebox/stream?id=${movieSubjectId}&path=${encodeURIComponent(movieDetailPath)}&se=0&ep=0&q=480`,
        quality: '480p',
        audio: 'Original Audio',
        isDirect: true
      }
    ]
  };

  // Upsert Hindi Series
  const idxHindi = content.series.findIndex(s => s.id === hindiSeriesId || s.subjectId === hindiSubjectId);
  if (idxHindi !== -1) {
    content.series[idxHindi] = hindiSeriesEntry;
  } else {
    content.series.unshift(hindiSeriesEntry);
  }

  // Upsert Original Series
  const idxOrig = content.series.findIndex(s => s.id === origSeriesId || s.subjectId === origSubjectId);
  if (idxOrig !== -1) {
    content.series[idxOrig] = origSeriesEntry;
  } else {
    content.series.unshift(origSeriesEntry);
  }

  // Upsert Movie
  const idxMovie = content.movies.findIndex(m => m.id === movieId || m.subjectId === movieSubjectId);
  if (idxMovie !== -1) {
    content.movies[idxMovie] = movieEntry;
  } else {
    content.movies.unshift(movieEntry);
  }

  console.log(`Updated content: ${content.movies.length} movies, ${content.series.length} series.`);
  const success = adminService.writeContent(content);
  if (success) {
    console.log('Successfully saved to content.json and updated RAM cache!');
  } else {
    console.error('Failed to write content!');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
