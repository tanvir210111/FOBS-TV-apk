const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== [DIAGNOSE & RECOVER VPS CONTENT] ===');

const dataDir = path.join(__dirname, '..', 'data');
const contentFile = path.join(dataDir, 'content.json');
const customFile = path.join(dataDir, 'custom_catalog.local.json');
const customBackup = path.join(dataDir, 'custom_catalog.backup.json');
const viewsFile = path.join(dataDir, 'views.local.json');

// 1. Inspect data directory
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  console.log('Files in data directory:', files);
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(dataDir, f));
      console.log(` - ${f}: ${st.size} bytes, modified: ${st.mtime.toISOString()}`);
    } catch (e) {}
  }
}

// 2. Read current content
let currentContent = { movies: [], series: [] };
try {
  if (fs.existsSync(contentFile)) {
    currentContent = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
    console.log(`Current content.json has ${currentContent.movies?.length || 0} movies, ${currentContent.series?.length || 0} series`);
  }
} catch (e) {
  console.error('Error reading current content.json:', e.message);
}

// 3. Inspect custom catalog
let custom = { movies: [], series: [], liveTv: [], upcoming: [] };
try {
  if (fs.existsSync(customFile)) {
    custom = JSON.parse(fs.readFileSync(customFile, 'utf8'));
    console.log(`custom_catalog.local.json has ${custom.movies?.length || 0} movies, ${custom.series?.length || 0} series`);
  } else if (fs.existsSync(customBackup)) {
    custom = JSON.parse(fs.readFileSync(customBackup, 'utf8'));
    console.log(`custom_catalog.backup.json has ${custom.movies?.length || 0} movies, ${custom.series?.length || 0} series`);
  } else {
    console.log('custom_catalog files do not exist yet on disk.');
  }
} catch (e) {
  console.error('Error reading custom catalog:', e.message);
}

// 4. Check views.local.json for missing IDs
const missingIds = [];
try {
  if (fs.existsSync(viewsFile)) {
    const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
    const keys = Object.keys(views);
    console.log(`views.local.json has ${keys.length} tracked items`);

    const existingMovieIds = new Set((currentContent.movies || []).map(m => String(m.id)));
    const existingSeriesIds = new Set((currentContent.series || []).map(s => String(s.id)));
    const existingSubjIds = new Set([
      ...(currentContent.movies || []).map(m => String(m.subjectId || '')).filter(Boolean),
      ...(currentContent.series || []).map(s => String(s.subjectId || '')).filter(Boolean)
    ]);

    for (const k of keys) {
      if (!existingMovieIds.has(k) && !existingSeriesIds.has(k) && !existingSubjIds.has(k)) {
        missingIds.push({ key: k, views: views[k] });
      }
    }
    console.log('Missing IDs found in views.local.json:', JSON.stringify(missingIds));
  }
} catch (e) {
  console.error('Error inspecting views.local.json:', e.message);
}

// 5. Check PM2 logs for subjectIds or titles imported recently
try {
  const pm2LogPaths = [
    path.join(process.env.HOME || '/root', '.pm2', 'logs', 'fobs-tv-out.log'),
    path.join(process.env.HOME || '/root', '.pm2', 'logs', 'fobs-tv-error.log'),
    path.join(process.env.HOME || '/root', '.pm2', 'logs', 'app-out.log'),
    path.join(process.env.HOME || '/root', '.pm2', 'logs', 'server-out.log')
  ];

  for (const lp of pm2LogPaths) {
    if (fs.existsSync(lp)) {
      console.log(`Found PM2 log: ${lp}`);
      const logContent = fs.readFileSync(lp, 'utf8');
      const lines = logContent.split('\n').slice(-300);
      const importLines = lines.filter(l => l.includes('import') || l.includes('moviebox') || l.includes('Auto-Sync'));
      console.log(`Recent import/sync lines in ${path.basename(lp)}:`, importLines.slice(-15).join('\n'));
    }
  }
} catch (e) {
  console.error('Error reading PM2 logs:', e.message);
}

// 6. Check git reflog
try {
  const reflog = execSync('git reflog -n 10', { encoding: 'utf8' });
  console.log('Git reflog:\n', reflog);
} catch (e) {
  console.error('Error running git reflog:', e.message);
}

console.log('=== [END DIAGNOSE] ===');
