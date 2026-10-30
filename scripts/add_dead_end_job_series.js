const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');
const adminService = require('../services/adminService');

function formatCaptions(rawCaptions, prefix) {
  if (!Array.isArray(rawCaptions)) return [];
  const seenLangs = new Set();
  const formatted = [];

  rawCaptions.forEach((c, idx) => {
    if (!c || !c.url) return;
    const lang = String(c.language || c.lan || '').toLowerCase();
    if (!lang || seenLangs.has(lang)) return;
    seenLangs.add(lang);

    let label = c.lanName || lang.toUpperCase();
    if (lang === 'en') label = 'English';
    else if (lang === 'bn') label = 'বাংলা';
    else if (lang === 'hi') label = 'हिन्दी';
    else if (lang === 'ko') label = '한국어';
    else if (lang === 'es') label = 'Español';
    else if (lang === 'fr') label = 'Français';
    else if (lang === 'ar') label = 'العربية';
    else if (lang === 'ru') label = 'Русский';

    formatted.push({
      id: `${prefix}_sub_${lang}_${idx}`,
      label,
      language: lang,
      srclang: lang,
      src: c.url,
      url: c.url,
      format: c.url.includes('.srt') ? 'srt' : 'vtt'
    });
  });

  return formatted;
}

function atomicWriteJson(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(7)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    console.error(`Error writing to ${filePath}:`, e.message);
  }
}

async function run() {
  console.log('=== Adding Dead-End Job Series (Hindi Dubbed + Original Audio) ===\n');

  const HINDI_ID = '6624920251769814224';
  const HINDI_PATH = 'dead-end-job-hindi-qrpLoaIcoT7';

  const ORIG_ID = '4780148614284956296';
  const ORIG_PATH = 'dead-end-job-oAmYsY887H5';

  const TMDB_POSTER = 'https://image.tmdb.org/t/p/w500/1yobke0bpfNOazuF9wW7QbM2GER.jpg';
  const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/original/gWedDgBsZkuOho2qe3q2sTQmbpO.jpg';
  const DESCRIPTION = 'When Byeon Hyeok-jun (Lee Jae-wook), a young man drowning in heavy debt, is lured by a mysterious employment agency offering lucrative part-time jobs paying 50 times minimum wage, he is soon thrust into terrifying and bizarre workplaces where his survival is on the line. Starring Lee Jae-wook, Go Min-si, Kim Min-ha.';
  const GENRE = 'K-Drama, Mystery, Horror, Thriller, Sci-Fi & Fantasy';
  const YEAR = '2026';
  const RATING = '8.6';
  const TOTAL_EPS = 8;

  const hindiEpisodes = [];
  const origEpisodes = [];

  for (let ep = 1; ep <= TOTAL_EPS; ep++) {
    console.log(`Resolving Episode ${ep}/${TOTAL_EPS}...`);

    let hindiEpRes = await movieboxService.resolveMedia(HINDI_ID, HINDI_PATH, 1, ep);
    if (!hindiEpRes || !hindiEpRes.streamUrl) {
      hindiEpRes = await movieboxService.resolveMedia(HINDI_ID, HINDI_PATH, 0, ep);
    }

    let origEpRes = await movieboxService.resolveMedia(ORIG_ID, ORIG_PATH, 1, ep);
    if (!origEpRes || !origEpRes.streamUrl) {
      origEpRes = await movieboxService.resolveMedia(ORIG_ID, ORIG_PATH, 0, ep);
    }

    const hindiAutoUrl = `/api/moviebox/stream?id=${HINDI_ID}&path=${encodeURIComponent(HINDI_PATH)}&se=1&ep=${ep}&q=720`;
    const origAutoUrl = `/api/moviebox/stream?id=${ORIG_ID}&path=${encodeURIComponent(ORIG_PATH)}&se=1&ep=${ep}&q=720`;

    const hindiResName = hindiEpRes?.resolution || 720;
    const origResName = origEpRes?.resolution || 1080;

    const allCaptionsRaw = [
      ...(origEpRes?.captions || []),
      ...(hindiEpRes?.captions || [])
    ];
    const episodeSubs = formatCaptions(allCaptionsRaw, `s_dead_end_job_ep${ep}`);

    // Build servers for Hindi Dubbed Version
    const hindiServers = [
      {
        name: 'Server 1 (Auto-Renewing Hindi Stream)',
        url: hindiAutoUrl,
        quality: `${hindiResName}p`,
        audio: 'Hindi dub'
      }
    ];
    if (hindiEpRes && hindiEpRes.streamUrl) {
      hindiServers.push({
        name: `Server 2 (Fast Direct CDN - Hindi ${hindiResName}p)`,
        url: hindiEpRes.streamUrl,
        quality: `${hindiResName}p`,
        audio: 'Hindi dub',
        isDirect: true
      });
    }
    hindiServers.push({
      name: 'Server 3 (Original Korean Audio Stream)',
      url: origAutoUrl,
      quality: `${origResName}p`,
      audio: 'Original Audio'
    });
    if (origEpRes && origEpRes.streamUrl) {
      hindiServers.push({
        name: `Server 4 (Fast Direct CDN - Original Audio ${origResName}p)`,
        url: origEpRes.streamUrl,
        quality: `${origResName}p`,
        audio: 'Original Audio',
        isDirect: true
      });
    }

    hindiEpisodes.push({
      id: `ep-${HINDI_ID}-1-${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      season: 1,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '50m',
      still: TMDB_BACKDROP,
      stillPath: TMDB_BACKDROP,
      streamUrl: hindiAutoUrl,
      directStreamUrl: hindiEpRes?.streamUrl || hindiAutoUrl,
      audioTracks: ['Hindi dub', 'Original Audio'],
      selectedAudio: 'Hindi dub',
      servers: hindiServers,
      captions: episodeSubs,
      subtitles: episodeSubs
    });

    // Build servers for Original Audio Version
    const origServers = [
      {
        name: 'Server 1 (Auto-Renewing Original Audio)',
        url: origAutoUrl,
        quality: `${origResName}p`,
        audio: 'Korean (Original)'
      }
    ];
    if (origEpRes && origEpRes.streamUrl) {
      origServers.push({
        name: `Server 2 (Fast Direct CDN - Original Audio ${origResName}p)`,
        url: origEpRes.streamUrl,
        quality: `${origResName}p`,
        audio: 'Korean (Original)',
        isDirect: true
      });
    }
    origServers.push({
      name: 'Server 3 (Hindi Dubbed Stream)',
      url: hindiAutoUrl,
      quality: `${hindiResName}p`,
      audio: 'Hindi dub'
    });
    if (hindiEpRes && hindiEpRes.streamUrl) {
      origServers.push({
        name: `Server 4 (Fast Direct CDN - Hindi Dub ${hindiResName}p)`,
        url: hindiEpRes.streamUrl,
        quality: `${hindiResName}p`,
        audio: 'Hindi dub',
        isDirect: true
      });
    }

    origEpisodes.push({
      id: `ep-${ORIG_ID}-1-${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      season: 1,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '50m',
      still: TMDB_BACKDROP,
      stillPath: TMDB_BACKDROP,
      streamUrl: origAutoUrl,
      directStreamUrl: origEpRes?.streamUrl || origAutoUrl,
      audioTracks: ['Korean (Original)', 'Hindi dub'],
      selectedAudio: 'Korean (Original)',
      servers: origServers,
      captions: episodeSubs,
      subtitles: episodeSubs
    });

    console.log(`  ✓ Episode ${ep} ready (Hindi & Original stream + ${episodeSubs.length} subs)`);
  }

  // 1. Construct Hindi Dubbed Series Object
  const hindiSeries = {
    id: `mb-s-${HINDI_ID}`,
    subjectId: HINDI_ID,
    origSubjectId: ORIG_ID,
    detailPath: HINDI_PATH,
    origDetailPath: ORIG_PATH,
    title: 'Dead-End Job [Hindi]',
    type: 'series',
    category: 'Korean (Dubbed) Series',
    industry: 'Korean',
    country: 'South Korea',
    language: 'Hindi Dubbed',
    audio: 'Hindi',
    year: YEAR,
    rating: RATING,
    imdbRating: RATING,
    genre: GENRE,
    poster: TMDB_POSTER,
    backdrop: TMDB_BACKDROP,
    banner: TMDB_BACKDROP,
    cover: TMDB_POSTER,
    description: DESCRIPTION,
    totalEpisodes: TOTAL_EPS,
    seasonsCount: 1,
    streamUrl: hindiEpisodes[0]?.streamUrl,
    directStreamUrl: hindiEpisodes[0]?.directStreamUrl,
    audioTracks: ['Hindi dub', 'Original Audio'],
    selectedAudio: 'Hindi dub',
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        name: 'Season 1',
        title: 'Season 1',
        episodes: hindiEpisodes
      }
    ],
    episodes: hindiEpisodes,
    source: 'moviebox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  // 2. Construct Original Audio Series Object
  const origSeries = {
    id: `mb-s-${ORIG_ID}`,
    subjectId: ORIG_ID,
    origSubjectId: HINDI_ID,
    detailPath: ORIG_PATH,
    origDetailPath: HINDI_PATH,
    title: 'Dead-End Job (Original Audio)',
    type: 'series',
    category: 'Korean Series',
    industry: 'Korean',
    country: 'South Korea',
    language: 'Korean',
    audio: 'Korean (Original)',
    year: YEAR,
    rating: RATING,
    imdbRating: RATING,
    genre: GENRE,
    poster: TMDB_POSTER,
    backdrop: TMDB_BACKDROP,
    banner: TMDB_BACKDROP,
    cover: TMDB_POSTER,
    description: DESCRIPTION,
    totalEpisodes: TOTAL_EPS,
    seasonsCount: 1,
    streamUrl: origEpisodes[0]?.streamUrl,
    directStreamUrl: origEpisodes[0]?.directStreamUrl,
    audioTracks: ['Korean (Original)', 'Hindi dub'],
    selectedAudio: 'Korean (Original)',
    seasons: [
      {
        season: 1,
        seasonNumber: 1,
        name: 'Season 1',
        title: 'Season 1',
        episodes: origEpisodes
      }
    ],
    episodes: origEpisodes,
    source: 'moviebox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  // Read current content
  const content = adminService.readContent();
  content.series = content.series || [];

  // Filter out any prior entries matching either ID or title
  content.series = content.series.filter(s =>
    s.id !== hindiSeries.id &&
    s.id !== origSeries.id &&
    s.title !== hindiSeries.title &&
    s.title !== origSeries.title &&
    s.title !== 'Dead-End Job' &&
    s.title !== 'Dead End Job'
  );

  // Unshift both to the top of series list
  content.series.unshift(origSeries);
  content.series.unshift(hindiSeries);

  console.log(`\nSaving to all database and seed files... Total series in catalog: ${content.series.length}`);

  const pathsToSave = [
    path.join(__dirname, '../data/content.json'),
    path.join(__dirname, '../data/content.backup.json'),
    path.join(__dirname, '../data/content.local.json'),
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];

  for (const p of pathsToSave) {
    if (fs.existsSync(path.dirname(p))) {
      atomicWriteJson(p, content);
      console.log(`  ✓ Saved: ${p}`);
    }
  }

  console.log('\n🎉 Successfully added Dead-End Job [Hindi] and Dead-End Job (Original Audio)!');
}

run().catch(err => {
  console.error('Fatal error adding series:', err);
  process.exit(1);
});

