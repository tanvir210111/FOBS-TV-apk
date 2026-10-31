const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

async function run() {
  console.log('=== HIGH-SPEED BATCH SYNC: ALL SERIES EPISODES WITH MOVIEBOX ===\n');

  const contentFile = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

  let totalUpdated = 0;
  let totalEpsAdded = 0;
  const seriesList = content.series || [];

  console.log(`Scanning ${seriesList.length} series in catalog using concurrent connection pool...\n`);

  async function processSeries(s, index) {
    const sId = s.subjectId || (s.id && s.id.startsWith('mb-s-') ? s.id.replace('mb-s-', '') : null);
    if (!sId) return;

    try {
      const d = await moviebox.getDetail(sId, s.detailPath);
      if (!d) return;

      const mbSeasons = d.seasons && d.seasons.length > 0 ? d.seasons : [{ se: 1, maxEp: d.totalEpisodes || 16 }];
      const isHindi = s.isHindi || (s.title && s.title.toLowerCase().includes('hindi')) || d.isHindi;
      const poster = s.poster || d.poster || '';
      const dPath = s.detailPath || d.detailPath || '';

      let seriesChanged = false;
      let newSeasons = [];
      let totalEpsInSeries = 0;

      for (const mbSea of mbSeasons) {
        const seNum = mbSea.se || 1;
        let mbMaxEp = parseInt(mbSea.maxEp, 10) || 0;
        if (mbSea.allEp) {
          const splitCount = mbSea.allEp.split(',').filter(Boolean).length;
          if (splitCount > mbMaxEp) mbMaxEp = splitCount;
        }
        if (!mbMaxEp || mbMaxEp <= 0) {
          mbMaxEp = d.totalEpisodes || 16;
        }

        let existingSeason = (s.seasons || []).find(sea => (sea.seasonNumber === seNum || sea.season === seNum));
        let existingEpisodes = (existingSeason && Array.isArray(existingSeason.episodes)) ? existingSeason.episodes : [];
        if (existingEpisodes.length === 0 && seNum === 1 && Array.isArray(s.episodes) && s.episodes.length > 0) {
          existingEpisodes = s.episodes;
        }

        const currentEpCount = existingEpisodes.length;

        if (mbMaxEp > currentEpCount) {
          seriesChanged = true;
          const diff = mbMaxEp - currentEpCount;
          totalEpsAdded += diff;

          const updatedEpisodes = [...existingEpisodes];
          for (let ep = currentEpCount + 1; ep <= mbMaxEp; ep++) {
            const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}&q=720`;
            const autoRenewUrl480 = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}&q=480`;

            updatedEpisodes.push({
              id: `ep-${sId}-${seNum}-${ep}`,
              number: String(ep).padStart(2, '0'),
              episode: ep,
              episodeNumber: ep,
              season: seNum,
              seasonNumber: seNum,
              title: `Episode ${ep}`,
              name: `Episode ${ep}`,
              duration: '45m',
              still: poster,
              stillPath: poster,
              streamUrl: autoRenewUrl,
              audioTracks: isHindi ? ['Hindi dub', 'Original Audio'] : ['Original Audio'],
              selectedAudio: isHindi ? 'Hindi dub' : 'Original Audio',
              servers: [
                {
                  name: `Server 1 (${isHindi ? 'Hindi Dub' : 'HD'} 720p - Ep ${ep})`,
                  url: autoRenewUrl,
                  quality: '720p',
                  audio: isHindi ? 'Hindi dub' : 'Original Audio',
                  isDirect: true
                },
                {
                  name: `Server 2 (Fast 480p - Ep ${ep})`,
                  url: autoRenewUrl480,
                  quality: '480p',
                  audio: isHindi ? 'Hindi dub' : 'Original Audio',
                  isDirect: true
                }
              ]
            });
          }

          newSeasons.push({
            seasonNumber: seNum,
            season: seNum,
            title: `Season ${seNum}`,
            name: `Season ${seNum}`,
            year: s.year || d.year || '2026',
            episodesCount: updatedEpisodes.length,
            episodes: updatedEpisodes
          });
          totalEpsInSeries += updatedEpisodes.length;
        } else {
          const seaEps = existingEpisodes.length > 0 ? existingEpisodes : [];
          newSeasons.push({
            seasonNumber: seNum,
            season: seNum,
            title: existingSeason?.title || `Season ${seNum}`,
            name: existingSeason?.name || `Season ${seNum}`,
            year: existingSeason?.year || s.year || '2026',
            episodesCount: seaEps.length,
            episodes: seaEps
          });
          totalEpsInSeries += seaEps.length;
        }
      }

      // Preserve any custom seasons (like Season 2 Announcement/Teaser)
      if (Array.isArray(s.seasons)) {
        for (const existingSea of s.seasons) {
          const sNum = existingSea.seasonNumber || existingSea.season;
          if (!newSeasons.some(ns => (ns.seasonNumber === sNum || ns.season === sNum))) {
            newSeasons.push(existingSea);
            totalEpsInSeries += (existingSea.episodes || []).length;
          }
        }
      }

      if (seriesChanged) {
        totalUpdated++;
        s.seasons = newSeasons;
        s.seasonsCount = newSeasons.length;
        s.episodesCount = totalEpsInSeries;
        s.totalEpisodes = totalEpsInSeries;
        if (newSeasons[0] && newSeasons[0].episodes && newSeasons[0].episodes.length > 0) {
          s.episodes = newSeasons[0].episodes;
          s.streamUrl = s.episodes[0].streamUrl || s.streamUrl;
          s.servers = s.episodes[0].servers || s.servers;
        }
        s.duration = newSeasons.length > 1
          ? `${newSeasons.length} Seasons (${totalEpsInSeries} Episodes)`
          : `${totalEpsInSeries} Episodes`;

        console.log(`[${totalUpdated}] Synced "${s.title}": Total ${totalEpsInSeries} eps across ${newSeasons.length} season(s)`);
      } else {
        s.episodesCount = totalEpsInSeries || (s.episodes ? s.episodes.length : 1);
        s.totalEpisodes = s.episodesCount;
        s.seasonsCount = newSeasons.length || 1;
        if (!s.episodes && newSeasons[0]?.episodes) {
          s.episodes = newSeasons[0].episodes;
        }
      }
    } catch (err) {}
  }

  // Run in chunks of 12 parallel requests
  const CONCURRENCY = 12;
  for (let i = 0; i < seriesList.length; i += CONCURRENCY) {
    const chunk = seriesList.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((s, idx) => processSeries(s, i + idx)));
    process.stdout.write(`Progress: ${Math.min(i + CONCURRENCY, seriesList.length)}/${seriesList.length} series checked\r`);
  }

  console.log(`\n\n=== SYNC COMPLETE ===`);
  console.log(`Total series updated with new episodes: ${totalUpdated}`);
  console.log(`Total new episodes added to catalog: ${totalEpsAdded}`);

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
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
