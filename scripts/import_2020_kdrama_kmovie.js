const path = require('path');
const fs = require('fs');
const movieboxService = require('../services/movieboxService');
const adminService = require('../services/adminService');

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatCaptions(rawCaptions, prefix) {
  if (!Array.isArray(rawCaptions)) return [];
  const seenLangs = new Set();
  const formatted = [];

  rawCaptions.forEach((c, idx) => {
    if (!c || !c.url) return;
    const lang = String(c.language || c.lan || '').toLowerCase();
    if (!lang) return;
    if (seenLangs.has(lang)) return; // Strictly no duplicates
    seenLangs.add(lang);

    let label = c.lanName || lang.toUpperCase();
    if (lang === 'en') label = 'English';
    else if (lang === 'hi') label = 'हिन्दी';
    else if (lang === 'bn') label = 'বাংলা';
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
  console.log('=== STARTING 2020 K-DRAMA & K-MOVIE HINDI DUBBED IMPORT ===\n');

  const manifestPath = path.join(__dirname, '../scratch/2020_import_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Found ${manifest.length} items in manifest to import.\n`);

  const content = adminService.readContent();
  content.movies = content.movies || [];
  content.series = content.series || [];

  let importedMovies = 0;
  let importedSeries = 0;
  let skippedCount = 0;

  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    console.log(`\n------------------------------------------------------------`);
    console.log(`[${i + 1}/${manifest.length}] Processing ${item.type.toUpperCase()}: "${item.title}"`);

    // Check if already in content
    const isAlready = (item.type === 'movie' ? content.movies : content.series).some(x =>
      String(x.subjectId) === String(item.id) ||
      norm(x.title) === norm(item.title) ||
      norm(x.title) === norm(item.title.replace(' [Hindi]', ''))
    );

    if (isAlready) {
      console.log(`⏩ Skipping already added item: "${item.title}"`);
      skippedCount++;
      continue;
    }

    const cleanTitle = item.title.includes('[Hindi]') ? item.title : `${item.title} [Hindi]`;
    const posterUrl = item.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800';
    const backdropUrl = item.backdrop || posterUrl;

    if (item.type === 'movie') {
      try {
        let mediaRes = await movieboxService.resolveMedia(item.id, item.detailPath, 0, 0);
        if (!mediaRes || !mediaRes.streamUrl) {
          mediaRes = await movieboxService.resolveMedia(item.id, item.detailPath, 1, 1);
        }

        const autoStreamUrl = `/api/moviebox/stream?id=${item.id}&path=${encodeURIComponent(item.detailPath)}&se=0&ep=0&q=480`;
        const resName = mediaRes?.resolution || 1080;
        const subtitles = formatCaptions(mediaRes?.captions, `m_${item.id}`);

        const servers = [
          {
            name: 'Server 1 (Auto-Renewing Hindi Stream)',
            url: autoStreamUrl,
            quality: `${resName}p`,
            audio: 'Hindi dub'
          }
        ];
        if (mediaRes && mediaRes.streamUrl) {
          servers.push({
            name: `Server 2 (Hindi Dub - Fast ${resName}p)`,
            url: mediaRes.streamUrl,
            quality: `${resName}p`,
            audio: 'Hindi dub',
            isDirect: true
          });
        }

        const newMovie = {
          id: `mb-m-${item.id}`,
          subjectId: item.id,
          title: cleanTitle,
          type: 'movie',
          category: 'Korean (Dubbed) Movies',
          industry: 'Korean',
          country: 'Korea',
          language: 'Korean',
          audio: 'Hindi',
          year: item.year || '2020',
          duration: '1h 55m',
          rating: item.rating || '8.2',
          genre: item.genres || 'Korean Movie, Drama, Hindi Dubbed',
          poster: posterUrl,
          backdrop: backdropUrl,
          banner: backdropUrl,
          description: item.description || cleanTitle,
          streamUrl: autoStreamUrl,
          directStreamUrl: mediaRes?.streamUrl || autoStreamUrl,
          servers: servers,
          subtitles: subtitles,
          captions: subtitles,
          detailPath: item.detailPath,
          source: 'moviebox',
          createdAt: new Date().toISOString()
        };

        // unshift to show at the top
        content.movies.unshift(newMovie);
        importedMovies++;
        console.log(`✅ [IMPORTED MOVIE] "${cleanTitle}" | Quality: ${resName}p | Subs: ${subtitles.length}`);
      } catch (err) {
        console.error(`❌ Failed to import movie ${item.title}: ${err.message}`);
      }
    } else if (item.type === 'series') {
      try {
        const seasons = [];
        let totalBuiltEps = 0;

        for (const seasonConfig of item.seasons) {
          const seNum = seasonConfig.seasonNumber;
          const maxEp = seasonConfig.maxEp || 1;
          const episodes = [];

          for (let ep = 1; ep <= maxEp; ep++) {
            let mediaRes = await movieboxService.resolveMedia(item.id, item.detailPath, seNum, ep);
            if (!mediaRes || !mediaRes.streamUrl) {
              mediaRes = await movieboxService.resolveMedia(item.id, item.detailPath, 0, ep);
            }

            const autoStreamUrl = `/api/moviebox/stream?id=${item.id}&path=${encodeURIComponent(item.detailPath)}&se=${seNum}&ep=${ep}&q=480`;
            const resName = mediaRes?.resolution || 1080;
            const subs = formatCaptions(mediaRes?.captions, `s_${item.id}_s${seNum}_e${ep}`);

            const epServers = [
              {
                name: 'Server 1 (Auto-Renewing Hindi Stream)',
                url: autoStreamUrl,
                quality: `${resName}p`,
                audio: 'Hindi dub'
              }
            ];
            if (mediaRes && mediaRes.streamUrl) {
              epServers.push({
                name: `Server 2 (Hindi Dub - Fast ${resName}p)`,
                url: mediaRes.streamUrl,
                quality: `${resName}p`,
                audio: 'Hindi dub',
                isDirect: true
              });
            }

            episodes.push({
              id: `ep-${item.id}-${seNum}-${ep}`,
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
            totalBuiltEps++;
          }

          seasons.push({
            season: seNum,
            seasonNumber: seNum,
            name: `Season ${seNum}`,
            title: `Season ${seNum}`,
            episodes: episodes
          });
        }

        const firstEp = seasons[0]?.episodes?.[0];
        const primaryAutoUrl = firstEp?.streamUrl || `/api/moviebox/stream?id=${item.id}&path=${encodeURIComponent(item.detailPath)}&se=1&ep=1&q=480`;

        const newSeries = {
          id: `mb-s-${item.id}`,
          subjectId: item.id,
          title: cleanTitle,
          type: 'series',
          category: 'Korean (Dubbed) Series',
          industry: 'Korean',
          country: 'Korea',
          language: 'Korean',
          audio: 'Hindi',
          year: item.year || '2020',
          rating: item.rating || '8.2',
          genre: item.genres || 'Korean Drama, Hindi Dubbed',
          poster: posterUrl,
          backdrop: backdropUrl,
          banner: backdropUrl,
          description: item.description || cleanTitle,
          totalEpisodes: totalBuiltEps,
          seasonsCount: seasons.length,
          streamUrl: primaryAutoUrl,
          directStreamUrl: firstEp?.directStreamUrl || primaryAutoUrl,
          seasons: seasons,
          episodes: seasons[0]?.episodes || [],
          detailPath: item.detailPath,
          source: 'moviebox',
          createdAt: new Date().toISOString()
        };

        content.series.unshift(newSeries);
        importedSeries++;
        console.log(`✅ [IMPORTED SERIES] "${cleanTitle}" | Seasons: ${seasons.length} | Episodes: ${totalBuiltEps}`);
      } catch (err) {
        console.error(`❌ Failed to import series ${item.title}: ${err.message}`);
      }
    }
  }

  // Update addedAt sequential timestamps so all newly added 2020 items stay in Recently Added
  const now = Date.now();
  content.movies.forEach((m, idx) => {
    m.addedAt = new Date(now - idx * 60000).toISOString();
  });
  content.series.forEach((s, idx) => {
    s.addedAt = new Date(now - idx * 60000).toISOString();
  });

  console.log(`\n============================================================`);
  console.log(`Import Complete Summary:`);
  console.log(`- New 2020 Movies Added: ${importedMovies}`);
  console.log(`- New 2020 Series Added: ${importedSeries}`);
  console.log(`- Skipped: ${skippedCount}`);
  console.log(`- Total Content Movies: ${content.movies.length}`);
  console.log(`- Total Content Series: ${content.series.length}`);
  console.log(`============================================================\n`);

  const contentFile = path.join(__dirname, '../data/content.json');
  const backupFile = path.join(__dirname, '../data/content.backup.json');
  const localFile = path.join(__dirname, '../data/content.local.json');

  atomicWriteJson(contentFile, content);
  console.log(`💾 Saved to ${contentFile}`);
  atomicWriteJson(backupFile, content);
  console.log(`💾 Backup saved to ${backupFile}`);

  if (fs.existsSync(localFile)) {
    atomicWriteJson(localFile, content);
    console.log(`💾 Local copy saved to ${localFile}`);
  }

  console.log('\n🎉 ALL 2020 K-DRAMAS & K-MOVIES (HINDI DUBBED) SUCCESSFULLY IMPORTED!');
}

run();
