const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'services', 'adminService.js');
let code = fs.readFileSync(adminPath, 'utf8');

// Replacement for readContent and writeContent
const targetBlockRegex = /function readContent\(\)[\s\S]*?function writeContent\(content\)[\s\S]*?throw err;\s*\}\s*\}/;

const replacementBlock = `function atomicWriteFile(targetFile, dataStr) {
  const dir = path.dirname(targetFile);
  const tmpFile = path.join(dir, \`.\${path.basename(targetFile)}.tmp.\${Date.now()}.\${Math.random().toString(36).substring(2, 8)}\`);
  fs.writeFileSync(tmpFile, dataStr, 'utf8');
  fs.renameSync(tmpFile, targetFile);
}

function readContent() {
  let mainData = null;

  try {
    if (fs.existsSync(CONTENT_FILE)) {
      mainData = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading content.json in adminService:', err);
  }

  // If mainData is missing or empty, try local, then backup
  if (!mainData || ((!mainData.movies || mainData.movies.length === 0) && (!mainData.series || mainData.series.length === 0))) {
    if (fs.existsSync(CONTENT_LOCAL_FILE)) {
      try {
        const local = JSON.parse(fs.readFileSync(CONTENT_LOCAL_FILE, 'utf8'));
        if (local.movies?.length > 0 || local.series?.length > 0) mainData = local;
      } catch(e) {}
    }
  }

  if (!mainData || ((!mainData.movies || mainData.movies.length === 0) && (!mainData.series || mainData.series.length === 0))) {
    if (fs.existsSync(CONTENT_BACKUP_FILE)) {
      try {
        const backup = JSON.parse(fs.readFileSync(CONTENT_BACKUP_FILE, 'utf8'));
        if (backup.movies?.length > 0 || backup.series?.length > 0) mainData = backup;
      } catch(e) {}
    }
  }

  if (!mainData) {
    mainData = { featured: {}, movies: [], series: [], liveTv: [], categories: [], industries: [] };
  }

  mainData.movies = Array.isArray(mainData.movies) ? mainData.movies : [];
  mainData.series = Array.isArray(mainData.series) ? mainData.series : [];
  mainData.liveTv = Array.isArray(mainData.liveTv) ? mainData.liveTv : [];

  return mainData;
}

function writeContent(content) {
  if (!content || (!content.movies && !content.series)) {
    console.error('[writeContent] Refusing to write empty or invalid content');
    return false;
  }

  // Safety latch: prevent accidental downgrade of catalog
  try {
    const current = readContent();
    if (current.movies?.length > 20 && content.movies?.length < current.movies.length - 10) {
      console.warn(\`[writeContent] Blocked suspicious reduction in movies: from \${current.movies.length} down to \${content.movies.length}\`);
      return false;
    }
  } catch (e) {}

  try {
    const jsonStr = JSON.stringify(content, null, 2);

    // 1. Atomically update main content.json
    atomicWriteFile(CONTENT_FILE, jsonStr);

    // 2. Atomically update content.backup.json so backup is NEVER outdated!
    try {
      atomicWriteFile(CONTENT_BACKUP_FILE, jsonStr);
    } catch(e) {}

    // 3. Atomically update content.local.json (git-immune local copy)
    try {
      atomicWriteFile(CONTENT_LOCAL_FILE, jsonStr);
    } catch(e) {}

    return true;
  } catch (err) {
    console.error('Error writing content.json in adminService:', err);
    throw err;
  }
}`;

if (targetBlockRegex.test(code)) {
  code = code.replace(targetBlockRegex, replacementBlock);
  console.log('✓ Successfully patched readContent and writeContent with atomic multi-file protection');
} else {
  console.error('❌ Could not match targetBlockRegex');
}

// Ensure repairAllPlaybackStreams only writes if repairs occurred
const oldRepair = 'writeContent(content);\n    return {';
const newRepair = `if (repairedEpisodes > 0 || repairedMovies > 0 || repairedSeries > 0) {
      writeContent(content);
    }
    return {`;

if (code.includes(oldRepair)) {
  code = code.replace(oldRepair, newRepair);
  console.log('✓ Successfully patched repairAllPlaybackStreams write check');
}

fs.writeFileSync(adminPath, code, 'utf8');
console.log('✓ services/adminService.js saved successfully');
