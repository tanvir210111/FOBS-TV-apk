const fs = require('fs');
const path = require('path');
const adminService = require('../services/adminService');
const movieboxService = require('../services/movieboxService');

async function recoverAllHistory() {
  console.log('=== SCANNING NGINX & PM2 LOGS FOR ALL USER IMPORTED MEDIA ===\n');

  const logFiles = [
    '/var/log/nginx/access.log',
    '/var/log/nginx/access.log.1',
    process.env.HOME + '/.pm2/logs/fobs-tv-out.log',
    process.env.HOME + '/.pm2/logs/fobs-tv-out-0.log',
    process.env.HOME + '/.pm2/logs/fobs-tv-out-1.log',
    process.env.HOME + '/.pm2/logs/fobs-tv-out-10.log',
    process.env.HOME + '/.pm2/logs/fobs-tv-out-11.log',
    process.env.HOME + '/.pm2/logs/fobs-tv-out-12.log'
  ];

  const candidateItems = new Map(); // subjectId -> { id, path, type, title }

  logFiles.forEach(f => {
    if (fs.existsSync(f)) {
      try {
        const lines = fs.readFileSync(f, 'utf8').split('\n');
        lines.forEach(line => {
          // Check for detail requests
          const m1 = line.match(/\/api\/admin\/moviebox\/detail\?([^ \t\r\n"]+)/);
          if (m1) {
            const params = new URLSearchParams(m1[1]);
            const sId = params.get('id') || params.get('subjectId');
            const dPath = params.get('path') || params.get('detailPath');
            if (sId) {
              candidateItems.set(String(sId), { subjectId: String(sId), detailPath: dPath || '' });
            }
          }
          // Check for resolve requests
          const m2 = line.match(/\/api\/admin\/moviebox\/resolve\?([^ \t\r\n"]+)/);
          if (m2) {
            const params = new URLSearchParams(m2[1]);
            const sId = params.get('id') || params.get('subjectId');
            const dPath = params.get('path') || params.get('detailPath');
            if (sId) {
              candidateItems.set(String(sId), { subjectId: String(sId), detailPath: dPath || '' });
            }
          }
        });
      } catch (e) {}
    }
  });

  console.log(`Found ${candidateItems.size} total media IDs in server access logs.\n`);

  const currentContent = adminService.readContent();
  const existingIds = new Set([
    ...(currentContent.movies || []).map(m => String(m.subjectId || m.id)),
    ...(currentContent.series || []).map(s => String(s.subjectId || s.id))
  ]);

  const missingToImport = [];
  for (const [sId, info] of candidateItems.entries()) {
    if (!existingIds.has(sId) && !existingIds.has(`mb-m-${sId}`) && !existingIds.has(`mb-s-${sId}`)) {
      missingToImport.push(info);
    }
  }

  console.log(`Missing items to recover: ${missingToImport.length}`);
  if (missingToImport.length === 0) {
    console.log('✓ All media ever accessed or imported are already present in content database!');
    return;
  }

  let recoveredCount = 0;
  for (const item of missingToImport) {
    try {
      console.log(`Recovering MovieBox subjectId: ${item.subjectId}...`);
      const detail = await movieboxService.getDetail(item.subjectId, item.detailPath);
      if (detail && detail.title) {
        console.log(`  -> Title: "${detail.title}" | Type: ${detail.type} | Seasons: ${detail.seasonsCount || 1}`);
        await adminService.importFromMovieBox({
          subjectId: item.subjectId,
          detailPath: detail.detailPath || item.detailPath,
          title: detail.title,
          type: detail.type || 'series',
          industry: detail.industry || 'Others',
          category: detail.type === 'movie' ? 'Trending Movies' : 'Trending Series',
          seasonMode: 'all'
        });
        recoveredCount++;
        console.log(`  ✓ Successfully recovered & imported: "${detail.title}"`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to recover ID ${item.subjectId}:`, err.message);
    }
  }

  const finalContent = adminService.readContent();
  console.log(`\n🎉 RECOVERY COMPLETE!`);
  console.log(`Total Movies: ${finalContent.movies?.length}`);
  console.log(`Total Series: ${finalContent.series?.length}`);
}

recoverAllHistory().catch(err => console.error(err));
