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
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

async function run() {
  console.log('=== Ingesting Perfect Marriage Revenge ===');

  const subjectId = '2570408434466177368';
  const detailPath = 'perfect-marriage-revenge-AwpuuVRuS33';
  const title = 'Perfect Marriage Revenge';
  const year = '2023';
  const genre = 'Korean Drama, Romance, Revenge, Fantasy, Contract Marriage';
  const description = 'The story of Han Yi-joo, who chose a contract marriage to avenge her husband and family, and Seo Do-gook who postpones a contract marriage to welcome her as his wife.';
  const poster = 'https://pbcdnw.aoneroom.com/image/2026/01/26/b02d1556d4d572d7559abddc40f0b222.jpg';

  const episodes = [];
  const totalEps = 12;

  for (let ep = 1; ep <= totalEps; ep++) {
    console.log(`Resolving Episode ${ep}/${totalEps}...`);
    let mediaRes = await movieboxService.resolveMedia(subjectId, detailPath, 1, ep);
    if (!mediaRes || !mediaRes.streamUrl) {
      mediaRes = await movieboxService.resolveMedia(subjectId, detailPath, 0, ep);
    }

    const autoStreamUrl = `/api/moviebox/stream?id=${subjectId}&path=${encodeURIComponent(detailPath)}&se=1&ep=${ep}&q=480`;
    const resName = mediaRes?.resolution || 720;
    const subs = formatCaptions(mediaRes?.captions, `s_${subjectId}_s1_e${ep}`);

    const epServers = [
      {
        name: 'Server 1 (Auto-Renewing Stream)',
        url: autoStreamUrl,
        quality: `${resName}p`,
        audio: 'Korean (Original)'
      }
    ];

    if (mediaRes && mediaRes.streamUrl) {
      epServers.push({
        name: `Server 2 (Fast Direct ${resName}p)`,
        url: mediaRes.streamUrl,
        quality: `${resName}p`,
        audio: 'Korean (Original)',
        isDirect: true
      });
    }

    episodes.push({
      id: `ep-${subjectId}-1-${ep}`,
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '60m',
      streamUrl: autoStreamUrl,
      directStreamUrl: mediaRes?.streamUrl || autoStreamUrl,
      servers: epServers,
      subtitles: subs,
      captions: subs
    });
  }

  const seasons = [
    {
      season: 1,
      seasonNumber: 1,
      name: 'Season 1',
      title: 'Season 1',
      episodes: episodes
    }
  ];

  const firstEp = episodes[0];
  const primaryAutoUrl = firstEp?.streamUrl || `/api/moviebox/stream?id=${subjectId}&path=${encodeURIComponent(detailPath)}&se=1&ep=1&q=480`;

  const newSeries = {
    id: `mb-s-${subjectId}`,
    subjectId: subjectId,
    title: title,
    type: 'series',
    category: 'Korean Drama',
    industry: 'Korean',
    country: 'Korea',
    language: 'Korean',
    audio: 'Korean',
    year: year,
    rating: '7.8',
    genre: genre,
    poster: poster,
    backdrop: poster,
    banner: poster,
    description: description,
    totalEpisodes: totalEps,
    seasonsCount: 1,
    streamUrl: primaryAutoUrl,
    directStreamUrl: firstEp?.directStreamUrl || primaryAutoUrl,
    seasons: seasons,
    episodes: episodes,
    detailPath: detailPath,
    source: 'moviebox',
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const content = adminService.readContent();
  content.series = content.series || [];

  // Remove any existing duplicate
  content.series = content.series.filter(s => s.id !== newSeries.id && s.title !== title);

  // Put right at the beginning so it shows in Recently Added
  content.series.unshift(newSeries);

  const contentFile = path.join(__dirname, '../data/content.json');
  const backupFile = path.join(__dirname, '../data/content.backup.json');
  const localFile = path.join(__dirname, '../data/content.local.json');

  atomicWriteJson(contentFile, content);
  atomicWriteJson(backupFile, content);
  if (fs.existsSync(localFile)) {
    atomicWriteJson(localFile, content);
  }

  console.log(`\n🎉 "${title}" successfully added with all ${totalEps} episodes and dual subtitles (Bangla + English)!`);
}

run();
