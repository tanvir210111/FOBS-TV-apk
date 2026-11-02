const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

const candidates = require('./anime_candidates.json');

// Strict exclude list for non-anime
const EXCLUDES = [
  'Fate: The Winx Saga',
  'New Saga',
  'Sparks of Tomorrow',
  'Overflow',
  'Lock Upp',
  'The Dragon Prince',
  'The Legend of Hanuman',
  'The Legend of Karna'
];

async function main() {
  const contentFile = path.join(__dirname, '../data/content.json');
  console.log('Loading content.json...');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  content.series = content.series || [];

  const filteredCandidates = candidates.filter(c => {
    return !EXCLUDES.some(ex => c.title.includes(ex));
  });

  console.log(`Starting import of ${filteredCandidates.length} candidate Anime series...`);

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const processedSeries = [];

  for (let i = 0; i < filteredCandidates.length; i++) {
    const item = filteredCandidates[i];
    const sId = item.id;
    const dPath = item.path;
    const internalId = `mb-s-${sId}`;

    console.log(`[${i + 1}/${filteredCandidates.length}] Checking: ${item.title}...`);

    try {
      const detail = await moviebox.getDetail(sId, dPath);
      if (!detail) {
        console.log(`  ⚠️ Skipped (No detail returned)`);
        skippedCount++;
        continue;
      }

      const poster = detail.poster || '';
      const cover = detail.backdrop || poster;
      const audioLabel = item.dub || 'Hindi';

      const seasons = [];
      const allEpisodes = [];
      const rawSeasons = detail.seasons && detail.seasons.length > 0 ? detail.seasons : [{ se: 1, maxEp: 1 }];

      for (let sIdx = 0; sIdx < rawSeasons.length; sIdx++) {
        const rawSeason = rawSeasons[sIdx];
        const seNum = rawSeason.se || (sIdx + 1);
        let epList = [];

        if (Array.isArray(rawSeason.episodes) && rawSeason.episodes.length > 0) {
          epList = rawSeason.episodes.map(e => (typeof e === 'object' ? (e.ep || e.episodeNumber || 1) : e));
        } else {
          const maxEp = rawSeason.maxEp || 1;
          for (let e = 1; e <= maxEp; e++) epList.push(e);
        }

        const seasonEpisodes = [];
        for (const ep of epList) {
          const streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}`;
          const epObj = {
            id: `${internalId}_s${seNum}_e${ep}`,
            episode: ep,
            episodeNumber: ep,
            season: seNum,
            seasonNumber: seNum,
            title: `Episode ${ep}`,
            name: `Episode ${ep}`,
            duration: '24m',
            still: poster,
            stillPath: poster,
            streamUrl: streamUrl,
            audioTracks: [audioLabel],
            selectedAudio: audioLabel,
            servers: [
              {
                name: `Server 1 (${audioLabel} - Auto-Renewing 720p)`,
                url: streamUrl,
                quality: '720p',
                audio: audioLabel,
                isDirect: true
              },
              {
                name: `Server 2 (Auto Failover 480p)`,
                url: `${streamUrl}&q=480`,
                quality: '480p',
                audio: audioLabel,
                isDirect: true
              }
            ]
          };
          seasonEpisodes.push(epObj);
          allEpisodes.push(epObj);
        }

        seasons.push({
          season: seNum,
          seasonNumber: seNum,
          name: `Season ${seNum}`,
          title: `Season ${seNum}`,
          year: String(detail.year || item.year || '2024'),
          episodesCount: seasonEpisodes.length,
          episodes: seasonEpisodes
        });
      }

      if (allEpisodes.length === 0) {
        console.log(`  ⚠️ Skipped (0 episodes)`);
        skippedCount++;
        continue;
      }

      const cleanTitle = (detail.title && detail.title.includes('[')) ? detail.title : item.title;

      const seriesRecord = {
        id: internalId,
        subjectId: sId,
        detailPath: dPath,
        title: cleanTitle,
        year: String(detail.year || item.year || '2024'),
        rating: String(detail.rating || '8.5'),
        imdbRating: String(detail.rating || '8.5'),
        poster: poster,
        backdrop: cover,
        cover: cover,
        duration: `${allEpisodes.length} Episodes`,
        streamUrl: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
        servers: [
          {
            name: `Server 1 (${audioLabel} - Auto-Renewing 720p)`,
            url: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
            quality: '720p',
            audio: audioLabel,
            isDirect: true
          }
        ],
        episodesCount: allEpisodes.length,
        category: 'Anime',
        genre: 'Anime, Animation, Action, Drama',
        industry: 'Japanese',
        country: 'Japan',
        language: audioLabel,
        dubLanguage: audioLabel,
        audioTracks: [audioLabel],
        selectedAudio: audioLabel,
        seasonsCount: seasons.length,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: `${detail.year || item.year || '2024'}-01-01`,
        originalReleaseDate: `${detail.year || item.year || '2024'}-01-01`,
        badgeLeft: 'Trending',
        badgeRight: 'Anime',
        views: 2200,
        seasons: seasons,
        episodes: allEpisodes,
        description: detail.description || `${cleanTitle} streaming in Hindi on FOBS TV.`,
        type: 'series'
      };

      const existingIdx = content.series.findIndex(s => s.id === internalId || s.subjectId === sId);
      if (existingIdx !== -1) {
        content.series[existingIdx] = seriesRecord;
        updatedCount++;
        console.log(`  🔄 Updated: ${cleanTitle} (${allEpisodes.length} eps across ${seasons.length} seasons)`);
      } else {
        content.series.unshift(seriesRecord);
        addedCount++;
        console.log(`  ✨ Added: ${cleanTitle} (${allEpisodes.length} eps across ${seasons.length} seasons)`);
      }
      processedSeries.push(seriesRecord);
    } catch (err) {
      console.error(`  ❌ Error processing ${item.title}:`, err.message);
      skippedCount++;
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Total Catalog Series: ${content.series.length}`);

  // Write content.json and backup
  console.log('Writing to data/content.json and data/content.backup.json...');
  fs.writeFileSync(contentFile, JSON.stringify(content));
  const backupFile = path.join(__dirname, '../data/content.backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(content));

  // Sync to seed files
  const seedPaths = [
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];
  for (const sp of seedPaths) {
    if (fs.existsSync(sp)) {
      console.log(`Syncing to ${sp}...`);
      const seed = JSON.parse(fs.readFileSync(sp, 'utf8'));
      seed.series = seed.series || [];
      for (const p of processedSeries) {
        const sIdx = seed.series.findIndex(s => s.subjectId === p.subjectId || s.id === p.id);
        if (sIdx !== -1) {
          seed.series[sIdx] = p;
        } else {
          seed.series.unshift(p);
        }
      }
      fs.writeFileSync(sp, JSON.stringify(seed));
      console.log(`  Updated seed file: ${sp}`);
    }
  }

  console.log('🎉 Done importing and syncing all Anime series!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
