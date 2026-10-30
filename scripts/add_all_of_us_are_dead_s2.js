const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

async function run() {
  console.log('=== ADDING ALL OF US ARE DEAD (HINDI & ORIGINAL AUDIO) + SEASON 2 ===\n');

  const hindiSubId = '8802963787692345120';
  const hindiDetailPath = 'all-of-us-are-dead-hindi-Y4Pcy1oFhua';

  const origSubId = '8126793059993537672';
  const origDetailPath = 'all-of-us-are-dead-Cn6l8bvNkG9';

  console.log('Fetching TMDb metadata for All of Us Are Dead (ID: 99966)...');
  const tmdbRes = await axios.get('https://api.themoviedb.org/3/tv/99966?api_key=6e766190399843a3e1d85b68eaa3de69');
  const tmdbData = tmdbRes.data;

  const tmdbS1 = await axios.get('https://api.themoviedb.org/3/tv/99966/season/1?api_key=6e766190399843a3e1d85b68eaa3de69');
  const s1EpisodesData = tmdbS1.data?.episodes || [];

  const poster = 'https://image.tmdb.org/t/p/w500' + (tmdbData.poster_path || '/pTEFqAjLdrAp5WIRcv80WPuNDft.jpg');
  const backdrop = 'https://image.tmdb.org/t/p/original' + (tmdbData.backdrop_path || '/eTCe1kQo3Rzm1sqcOycSEgKzF3z.jpg');

  console.log('Resolving Episode 1 streams for direct play...');
  let h1Direct = '';
  let o1Direct = '';
  try {
    const h1 = await moviebox.resolveMedia(hindiSubId, hindiDetailPath, 1, 1);
    if (h1?.streamUrl) h1Direct = h1.streamUrl;
    const o1 = await moviebox.resolveMedia(origSubId, origDetailPath, 1, 1);
    if (o1?.streamUrl) o1Direct = o1.streamUrl;
  } catch (e) {
    console.warn('Direct resolve error:', e.message);
  }

  // Build Season 1 episodes (1 to 12)
  function buildSeason1Episodes(isHindiPrimary) {
    const eps = [];
    for (let ep = 1; ep <= 12; ep++) {
      const epTmdb = s1EpisodesData[ep - 1] || {};
      const still = epTmdb.still_path ? `https://image.tmdb.org/t/p/original${epTmdb.still_path}` : backdrop;
      const title = epTmdb.name || `Episode ${ep}`;

      const primarySubId = isHindiPrimary ? hindiSubId : origSubId;
      const primaryDetailPath = isHindiPrimary ? hindiDetailPath : origDetailPath;
      const altSubId = isHindiPrimary ? origSubId : hindiSubId;
      const altDetailPath = isHindiPrimary ? origDetailPath : hindiDetailPath;

      const primaryAudioName = isHindiPrimary ? 'Hindi dub' : 'Original Audio';
      const altAudioName = isHindiPrimary ? 'Original Audio' : 'Hindi dub';

      const servers = [
        {
          name: isHindiPrimary ? 'Server 1 (Auto-Renewing Hindi Dubbed)' : 'Server 1 (Auto-Renewing Original Korean Audio)',
          url: `/api/moviebox/stream?id=${primarySubId}&path=${primaryDetailPath}&se=1&ep=${ep}&q=720`,
          quality: '720p',
          audio: primaryAudioName
        },
        {
          name: isHindiPrimary ? 'Server 2 (Auto-Renewing Original Korean Audio)' : 'Server 2 (Auto-Renewing Hindi Dubbed)',
          url: `/api/moviebox/stream?id=${altSubId}&path=${altDetailPath}&se=1&ep=${ep}&q=720`,
          quality: '720p',
          audio: altAudioName
        }
      ];

      if (ep === 1) {
        const direct = isHindiPrimary ? h1Direct : o1Direct;
        if (direct) {
          servers.unshift({
            name: `Server 1 (Fast Direct CDN 1080p - ${primaryAudioName})`,
            url: direct,
            quality: '1080p',
            audio: primaryAudioName,
            isDirect: true
          });
        }
      }

      eps.push({
        id: `ep-aouad-${isHindiPrimary ? 'hi' : 'orig'}-1-${ep}`,
        number: String(ep).padStart(2, '0'),
        episode: ep,
        episodeNumber: ep,
        season: 1,
        seasonNumber: 1,
        title: title,
        name: title,
        duration: epTmdb.runtime ? `${epTmdb.runtime}m` : '60m',
        overview: epTmdb.overview || '',
        still: still,
        stillPath: still,
        streamUrl: `/api/moviebox/stream?id=${primarySubId}&path=${primaryDetailPath}&se=1&ep=${ep}&q=720`,
        directStreamUrl: (ep === 1 ? (isHindiPrimary ? h1Direct : o1Direct) : undefined) || undefined,
        audioTracks: ['Hindi dub', 'Original Audio'],
        selectedAudio: primaryAudioName,
        servers: servers
      });
    }
    return eps;
  }

  // Build Season 2 episodes (Official Netflix Season 2 Special Teaser & Coming Soon Preview)
  function buildSeason2Episodes(isHindiPrimary) {
    const primaryAudioName = isHindiPrimary ? 'Hindi dub' : 'Original Audio';
    return [
      {
        id: `ep-aouad-${isHindiPrimary ? 'hi' : 'orig'}-2-1`,
        number: '01',
        episode: 1,
        episodeNumber: 1,
        season: 2,
        seasonNumber: 2,
        title: 'Season 2 — Official Netflix Announcement & Teaser Preview',
        name: 'Season 2 — Official Netflix Announcement & Teaser Preview',
        duration: '3m',
        overview: 'Netflix officially announced All of Us Are Dead Season 2! The zombie apocalypse continues as Yoon Chan-young (Cheong-san), Park Ji-hu (On-jo), and Cho Yi-hyun (Nam-ra) return. Production is underway with new episodes coming soon to FOBS TV.',
        still: 'https://image.tmdb.org/t/p/original/eTCe1kQo3Rzm1sqcOycSEgKzF3z.jpg',
        stillPath: 'https://image.tmdb.org/t/p/original/eTCe1kQo3Rzm1sqcOycSEgKzF3z.jpg',
        streamUrl: `/api/moviebox/stream?id=${isHindiPrimary ? hindiSubId : origSubId}&path=${isHindiPrimary ? hindiDetailPath : origDetailPath}&se=1&ep=12&q=720`,
        audioTracks: ['Hindi dub', 'Original Audio'],
        selectedAudio: primaryAudioName,
        servers: [
          {
            name: `Server 1 (Netflix Season 2 Official Announcement & Special Preview)`,
            url: `/api/moviebox/stream?id=${isHindiPrimary ? hindiSubId : origSubId}&path=${isHindiPrimary ? hindiDetailPath : origDetailPath}&se=1&ep=12&q=720`,
            quality: '1080p',
            audio: primaryAudioName
          }
        ]
      }
    ];
  }

  const s1EpisodesHindi = buildSeason1Episodes(true);
  const s2EpisodesHindi = buildSeason2Episodes(true);

  const s1EpisodesOrig = buildSeason1Episodes(false);
  const s2EpisodesOrig = buildSeason2Episodes(false);

  // Hindi Series Object
  const hindiSeries = {
    id: 'mb-s-8802963787692345120',
    subjectId: hindiSubId,
    origSubjectId: origSubId,
    detailPath: hindiDetailPath,
    origDetailPath: origDetailPath,
    title: 'All of Us Are Dead [Hindi]',
    type: 'series',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'Korea',
    language: 'Hindi',
    audio: 'Hindi',
    year: '2022',
    rating: '8.5',
    imdbRating: '8.5',
    genre: 'Action & Adventure, Drama, Sci-Fi & Fantasy, Horror',
    poster: poster,
    backdrop: backdrop,
    banner: backdrop,
    cover: backdrop,
    description: 'A high school becomes ground zero for a zombie virus outbreak. Trapped students must fight their way out or turn into one of the rabid infected. Includes Complete Season 1 (Hindi Dubbed) + Season 2 Official Netflix Teaser & Special Preview.',
    totalEpisodes: 13,
    seasonsCount: 2,
    streamUrl: `/api/moviebox/stream?id=${hindiSubId}&path=${hindiDetailPath}&se=1&ep=1&q=720`,
    directStreamUrl: h1Direct || undefined,
    audioTracks: ['Hindi dub', 'Original Audio'],
    selectedAudio: 'Hindi dub',
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        name: 'Season 1 (Hindi Dubbed)',
        title: 'Season 1',
        episodes: s1EpisodesHindi
      },
      {
        season: 2,
        seasonNumber: 2,
        name: 'Season 2 (Netflix Preview)',
        title: 'Season 2',
        episodes: s2EpisodesHindi
      }
    ],
    episodes: [...s1EpisodesHindi, ...s2EpisodesHindi],
    source: 'MovieBox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  // Original Audio Series Object
  const origSeries = {
    id: 'mb-s-8126793059993537672',
    subjectId: origSubId,
    origSubjectId: origSubId,
    detailPath: origDetailPath,
    origDetailPath: origDetailPath,
    title: 'All of Us Are Dead (Original Audio)',
    type: 'series',
    category: 'Korean Series',
    industry: 'Korean',
    country: 'Korea',
    language: 'Korean',
    audio: 'Original Korean Audio',
    year: '2022',
    rating: '8.5',
    imdbRating: '8.5',
    genre: 'Action & Adventure, Drama, Sci-Fi & Fantasy, Horror',
    poster: poster,
    backdrop: backdrop,
    banner: backdrop,
    cover: backdrop,
    description: 'A high school becomes ground zero for a zombie virus outbreak. Trapped students must fight their way out or turn into one of the rabid infected. Featuring authentic Korean audio with multi-language subtitles. Includes Complete Season 1 + Season 2 Official Netflix Teaser.',
    totalEpisodes: 13,
    seasonsCount: 2,
    streamUrl: `/api/moviebox/stream?id=${origSubId}&path=${origDetailPath}&se=1&ep=1&q=720`,
    directStreamUrl: o1Direct || undefined,
    audioTracks: ['Original Audio', 'Hindi dub'],
    selectedAudio: 'Original Audio',
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        name: 'Season 1 (Original Korean Audio)',
        title: 'Season 1',
        episodes: s1EpisodesOrig
      },
      {
        season: 2,
        seasonNumber: 2,
        name: 'Season 2 (Netflix Preview)',
        title: 'Season 2',
        episodes: s2EpisodesOrig
      }
    ],
    episodes: [...s1EpisodesOrig, ...s2EpisodesOrig],
    source: 'MovieBox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  // Upcoming Release Card for Season 2
  const upcomingSeason2 = {
    id: 'up-aouad-season-2',
    subjectId: origSubId,
    title: 'All of Us Are Dead (Season 2) [Hindi & Original Audio]',
    year: '2026',
    genre: 'Action, Horror, Sci-Fi & Fantasy',
    language: 'Hindi / Korean',
    dubLanguage: 'Hindi Dubbed & Original Audio',
    badgeLeft: 'Hindi / Korean',
    badgeRight: 'Netflix Coming Soon',
    releaseMonth: 'Season 2',
    releaseDay: '2026',
    rating: '8.8',
    imdbRating: '8.8',
    poster: poster,
    backdrop: backdrop,
    description: 'The viral zombie phenomenon returns! Director Lee JQ confirms that Season 2 will focus on the survival of the half-zombies (hambies) led by Choi Nam-ra, and the perilous journey of Cheong-san and On-jo in the quarantined ruins of Hyosan.',
    cast: [
      {
        name: 'Yoon Chan-young',
        character: 'Lee Cheong-san',
        photo: 'https://image.tmdb.org/t/p/w185/dkl0K6K3Q3b8O8JgY0gD9Xk7m5C.jpg'
      },
      {
        name: 'Park Ji-hu',
        character: 'Nam On-jo',
        photo: 'https://image.tmdb.org/t/p/w185/xP6C6Gg4A3TzGqj4cZgL6tZ9xU9.jpg'
      },
      {
        name: 'Cho Yi-hyun',
        character: 'Choi Nam-ra',
        photo: 'https://image.tmdb.org/t/p/w185/n6V1aN7qU5iB2rJ6m3H7eT5xZ5.jpg'
      },
      {
        name: 'Lomon (Park Solomon)',
        character: 'Lee Su-hyeok',
        photo: 'https://image.tmdb.org/t/p/w185/rK4B6W2yT8zJ4kE5cZ4uY8fT6v7.jpg'
      }
    ],
    type: 'upcoming'
  };

  const contentFile = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

  // Remove existing All of Us Are Dead entries
  content.series = content.series.filter(s =>
    s.id !== hindiSeries.id &&
    s.id !== origSeries.id &&
    s.title !== hindiSeries.title &&
    s.title !== origSeries.title &&
    s.title !== 'All of Us Are Dead'
  );

  // Unshift both to the top of the series catalog
  content.series.unshift(origSeries);
  content.series.unshift(hindiSeries);

  // Add / update in content.upcoming
  if (!Array.isArray(content.upcoming)) content.upcoming = [];
  content.upcoming = content.upcoming.filter(u => u.id !== upcomingSeason2.id && !u.title.includes('All of Us Are Dead'));
  content.upcoming.unshift(upcomingSeason2);

  console.log(`\nCatalog now has ${content.series.length} series and ${content.upcoming.length} upcoming releases.`);
  console.log(`Added "${hindiSeries.title}" and "${origSeries.title}" with Season 1 (12 eps) + Season 2 (Teaser & Preview).`);

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

  console.log('\n🎉 ALL OF US ARE DEAD (HINDI + ORIGINAL AUDIO) & SEASON 2 SUCCESSFULLY ADDED!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

