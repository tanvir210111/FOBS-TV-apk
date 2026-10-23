/**
 * FOBS TV - Add Golden Boy All Seasons and Episodes from MovieBox
 * 1. Turkish Drama: Golden Boy (Yalı Çapkını) [Hindi] - 3 Seasons, 371 Full Episodes
 *    - Season 1: Episodes 1 - 118
 *    - Season 2: Episodes 1 - 127 (MovieBox ep 119 to 245)
 *    - Season 3: Episodes 1 - 126 (MovieBox ep 246 to 371)
 * 2. Anime Series: Golden Boy (1995) [English / Multi] - 6 Complete Episodes
 */

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const TMDB_ID_TURKISH = '210865';
const SUBJECT_ID_TURKISH = '2706073799983877168';
const DETAIL_PATH_TURKISH = 'golden-boy-hindi-84Y8uLuQTd3';

const SUBJECT_ID_ANIME = '3929372124917419816';
const DETAIL_PATH_ANIME = 'golden-boy-GZ4ZlM5zgG4';

function buildTurkishGoldenBoy() {
  const seasonConfigs = [
    { seasonNumber: 1, name: 'Season 1 (118 Episodes)', startEp: 1, count: 118 },
    { seasonNumber: 2, name: 'Season 2 (127 Episodes)', startEp: 119, count: 127 },
    { seasonNumber: 3, name: 'Season 3 (126 Episodes)', startEp: 246, count: 126 }
  ];

  const seasons = [];
  const allEpisodes = [];

  for (const sCfg of seasonConfigs) {
    const sEpisodes = [];
    for (let i = 1; i <= sCfg.count; i++) {
      const mbEpNum = sCfg.startEp + (i - 1);
      const epPad = i < 10 ? `0${i}` : `${i}`;
      const mbEpPad = mbEpNum < 10 ? `0${mbEpNum}` : `${mbEpNum}`;

      const mbStreamUrl = `/api/moviebox/stream?id=${SUBJECT_ID_TURKISH}&path=${DETAIL_PATH_TURKISH}&se=1&ep=${mbEpNum}`;
      const multiembedUrl = `https://multiembed.mov/?video_id=${TMDB_ID_TURKISH}&tmdb=1&s=${sCfg.seasonNumber}&e=${i}`;
      const autoembedUrl = `https://autoembed.co/tv/tmdb/${TMDB_ID_TURKISH}/${sCfg.seasonNumber}/${i}`;
      const vidlinkUrl = `https://vidlink.pro/tv/${TMDB_ID_TURKISH}/${sCfg.seasonNumber}/${i}`;

      const epObj = {
        number: epPad,
        episode: i,
        season: sCfg.seasonNumber,
        title: `Episode ${i}`,
        duration: '45m-60m',
        overview: `Golden Boy (Yalı Çapkını) Hindi Dubbed Season ${sCfg.seasonNumber} Episode ${i} (Overall Ep ${mbEpNum}).`,
        still: 'https://image.tmdb.org/t/p/w500/vDqCoaMU5FUAuUs0EvL4OAUCxJk.jpg',
        streamUrl: mbStreamUrl,
        servers: [
          { name: 'Server 1 (MovieBox 1080p Direct)', url: mbStreamUrl },
          { name: 'Server 2 (AutoEmbed HD)', url: autoembedUrl },
          { name: 'Server 3 (Vidlink Fast)', url: vidlinkUrl },
          { name: 'Server 4 (MultiEmbed HD)', url: multiembedUrl }
        ],
        audioTracks: {
          'Hindi dub': mbStreamUrl,
          'Original / Multi Audio': autoembedUrl
        }
      };

      sEpisodes.push(epObj);
      allEpisodes.push(epObj);
    }

    seasons.push({
      seasonNumber: sCfg.seasonNumber,
      name: sCfg.name,
      episodeCount: sCfg.count,
      episodes: sEpisodes
    });
  }

  return {
    id: 'turkish-s-210865',
    subjectId: SUBJECT_ID_TURKISH,
    detailPath: DETAIL_PATH_TURKISH,
    tmdbId: TMDB_ID_TURKISH,
    title: 'Golden Boy (Yalı Çapkını) [Hindi]',
    originalTitle: 'Yalı Çapkını',
    language: 'Hindi',
    tag: '1080p HD',
    year: '2022',
    releaseDate: '2022-09-23',
    country: 'Turkey',
    industry: 'Turkish',
    category: 'Turkish Series',
    genre: 'Drama, Romance',
    badgeRight: 'Turkish',
    badgeLeft: 'Hindi',
    dubLanguage: 'Hindi',
    rating: '8.4',
    imdbRating: '8.4',
    poster: 'https://image.tmdb.org/t/p/w500/cgf5R2XrfRQGp2sTu3cncbnFxRy.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/vDqCoaMU5FUAuUs0EvL4OAUCxJk.jpg',
    description: 'Ferit, the frivolous son of a wealthy family, is forced to marry Seyran, a sensible girl from Gaziantep. Their reluctant union pulls them into the intense politics, secrets, and scandals of the Korhan mansion in Istanbul.',
    seasonsCount: 3,
    seasons: seasons,
    episodes: allEpisodes, // Defaults to all episodes or Season 1
    type: 'series',
    streamUrl: allEpisodes[0].streamUrl
  };
}

function buildAnimeGoldenBoy() {
  const animeEpisodes = [];
  for (let i = 1; i <= 6; i++) {
    const epPad = `0${i}`;
    const mbStreamUrl = `/api/moviebox/stream?id=${SUBJECT_ID_ANIME}&path=${DETAIL_PATH_ANIME}&se=1&ep=${i}`;
    const vidlinkUrl = `https://vidlink.pro/tv/anime-golden-boy/1/${i}`;

    animeEpisodes.push({
      number: epPad,
      episode: i,
      season: 1,
      title: `Episode ${i}`,
      duration: '30m',
      overview: `Golden Boy (1995) Episode ${i}. Kintaro Oe travels Japan on his bicycle, studying life through various odd jobs.`,
      still: 'https://pbcdnw.aoneroom.com/image/2026/01/27/c97ed57e1a8e22db2963e1a9324d16a6.jpg',
      streamUrl: mbStreamUrl,
      servers: [
        { name: 'Server 1 (MovieBox 1080p Direct)', url: mbStreamUrl },
        { name: 'Server 2 (Vidlink HD)', url: vidlinkUrl }
      ],
      audioTracks: {
        'Japanese / English': mbStreamUrl
      }
    });
  }

  return {
    id: 'mb-s-3929372124917419816',
    subjectId: SUBJECT_ID_ANIME,
    detailPath: DETAIL_PATH_ANIME,
    title: 'Golden Boy (1995)',
    originalTitle: 'Golden Boy: Sasurai no Obenkyō Yarō',
    language: 'Japanese / English',
    tag: '1080p HD',
    year: '1995',
    releaseDate: '1995-10-27',
    country: 'Japan',
    industry: 'Anime',
    category: 'Anime Series',
    genre: 'Animation, Comedy, Adventure',
    badgeRight: 'Anime',
    badgeLeft: 'Sub / Dub',
    rating: '8.0',
    imdbRating: '8.0',
    poster: 'https://pbcdnw.aoneroom.com/image/2026/01/27/c97ed57e1a8e22db2963e1a9324d16a6.jpg',
    backdrop: 'https://pbcdnw.aoneroom.com/image/2026/01/27/c97ed57e1a8e22db2963e1a9324d16a6.jpg',
    description: 'Kintaro Oe is a 25-year-old freeter who travels around Japan on his beloved bicycle Mikazuki 5, working part-time jobs and learning about life, women, and the world.',
    seasonsCount: 1,
    seasons: [
      {
        seasonNumber: 1,
        name: 'Season 1 (6 Episodes)',
        episodeCount: 6,
        episodes: animeEpisodes
      }
    ],
    episodes: animeEpisodes,
    type: 'series',
    streamUrl: animeEpisodes[0].streamUrl
  };
}

function updateCatalog() {
  console.log('🚀 Loading catalog files...');
  const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

  const turkishEntry = buildTurkishGoldenBoy();
  const animeEntry = buildAnimeGoldenBoy();

  // Replace or add Turkish Golden Boy
  const tIdx = catalog.series.findIndex(s => s.id === 'turkish-s-210865' || s.title.toLowerCase().includes('yalı çapkını') || s.title.toLowerCase().includes('golden boy (yalı'));
  if (tIdx >= 0) {
    catalog.series[tIdx] = turkishEntry;
    console.log(`✅ Updated existing Turkish Golden Boy (Yalı Çapkını) with 3 Seasons & ${turkishEntry.episodes.length} episodes.`);
  } else {
    catalog.series.unshift(turkishEntry);
    console.log(`✅ Added new Turkish Golden Boy (Yalı Çapkını) with 3 Seasons & ${turkishEntry.episodes.length} episodes.`);
  }

  // Replace or add Anime Golden Boy
  const aIdx = catalog.series.findIndex(s => s.id === 'mb-s-3929372124917419816' || s.title.includes('Golden Boy (1995)'));
  if (aIdx >= 0) {
    catalog.series[aIdx] = animeEntry;
    console.log(`✅ Updated Anime Golden Boy (1995) with 6 episodes.`);
  } else {
    catalog.series.push(animeEntry);
    console.log(`✅ Added Anime Golden Boy (1995) with 6 episodes.`);
  }

  // Save to all three seed files
  const dataStr = JSON.stringify(catalog, null, 2);
  fs.writeFileSync(CONTENT_FILE, dataStr, 'utf8');
  console.log(`💾 Saved ${CONTENT_FILE}`);

  fs.writeFileSync(PUBLIC_SEED, dataStr, 'utf8');
  console.log(`💾 Saved ${PUBLIC_SEED}`);

  if (fs.existsSync(path.dirname(ANDROID_SEED))) {
    fs.writeFileSync(ANDROID_SEED, dataStr, 'utf8');
    console.log(`💾 Saved ${ANDROID_SEED}`);
  }

  console.log('🎉 Done! Golden Boy series successfully added with all seasons and MovieBox streams.');
}

updateCatalog();
