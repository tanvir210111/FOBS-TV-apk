const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CONTENT_BACKUP = path.join(__dirname, '..', 'data', 'content.backup.json');
const CONTENT_LOCAL = path.join(__dirname, '..', 'data', 'content.local.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');
const CUSTOM_BACKUP = path.join(__dirname, '..', 'data', 'custom_catalog.backup.json');

function restore() {
  let custom = null;
  try {
    if (fs.existsSync(CUSTOM_FILE)) {
      custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
    } else if (fs.existsSync(CUSTOM_BACKUP)) {
      custom = JSON.parse(fs.readFileSync(CUSTOM_BACKUP, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading custom catalog:', e.message);
  }

  if (!custom || typeof custom !== 'object') {
    console.log('No custom catalog to restore.');
    return;
  }

  let content = null;
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading content.json:', e.message);
  }

  if (!content) return;

  let mergedCount = 0;

  // Restore movies
  if (Array.isArray(custom.movies) && custom.movies.length > 0) {
    if (!Array.isArray(content.movies)) content.movies = [];
    for (const cm of custom.movies) {
      const idx = content.movies.findIndex(m => m.id === cm.id || (cm.title && m.title && m.title.trim().toLowerCase() === cm.title.trim().toLowerCase()));
      if (idx >= 0) {
        content.movies[idx] = { ...content.movies[idx], ...cm };
      } else {
        content.movies.unshift(cm);
      }
      mergedCount++;
    }
  }

  // Restore series
  if (Array.isArray(custom.series) && custom.series.length > 0) {
    if (!Array.isArray(content.series)) content.series = [];
    for (const cs of custom.series) {
      const idx = content.series.findIndex(s => s.id === cs.id || (cs.title && s.title && s.title.trim().toLowerCase() === cs.title.trim().toLowerCase()));
      if (idx >= 0) {
        content.series[idx] = { ...content.series[idx], ...cs };
      } else {
        content.series.unshift(cs);
      }
      mergedCount++;
    }
  }

  // Restore liveTv
  if (Array.isArray(custom.liveTv) && custom.liveTv.length > 0) {
    if (!Array.isArray(content.liveTv)) content.liveTv = [];
    for (const ct of custom.liveTv) {
      const idx = content.liveTv.findIndex(t => t.id === ct.id || (ct.name && t.name && t.name.trim().toLowerCase() === ct.name.trim().toLowerCase()));
      if (idx >= 0) {
        content.liveTv[idx] = { ...content.liveTv[idx], ...ct };
      } else {
        content.liveTv.unshift(ct);
      }
      mergedCount++;
    }
  }

  const jsonStr = JSON.stringify(content);
  fs.writeFileSync(CONTENT_FILE, jsonStr, 'utf8');
  try { fs.writeFileSync(CONTENT_BACKUP, jsonStr, 'utf8'); } catch(e) {}
  try { fs.writeFileSync(CONTENT_LOCAL, jsonStr, 'utf8'); } catch(e) {}

  console.log(`✅ Restored and protected ${mergedCount} custom items in catalog!`);
}

restore();

