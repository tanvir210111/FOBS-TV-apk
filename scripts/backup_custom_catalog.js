const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CONTENT_BACKUP = path.join(__dirname, '..', 'data', 'content.backup.json');
const CONTENT_LOCAL = path.join(__dirname, '..', 'data', 'content.local.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');
const CUSTOM_BACKUP = path.join(__dirname, '..', 'data', 'custom_catalog.backup.json');

function backup() {
  let custom = { movies: [], series: [], liveTv: [], upcoming: [] };
  try {
    if (fs.existsSync(CUSTOM_FILE)) {
      custom = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
    } else if (fs.existsSync(CUSTOM_BACKUP)) {
      custom = JSON.parse(fs.readFileSync(CUSTOM_BACKUP, 'utf8'));
    }
  } catch (e) {}

  if (!Array.isArray(custom.movies)) custom.movies = [];
  if (!Array.isArray(custom.series)) custom.series = [];
  if (!Array.isArray(custom.liveTv)) custom.liveTv = [];
  if (!Array.isArray(custom.upcoming)) custom.upcoming = [];

  let content = null;
  const candidates = [CONTENT_FILE, CONTENT_LOCAL, CONTENT_BACKUP];
  for (const cPath of candidates) {
    if (fs.existsSync(cPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cPath, 'utf8'));
        if (parsed && (parsed.movies?.length > 0 || parsed.series?.length > 0)) {
          content = parsed;
          break;
        }
      } catch (e) {}
    }
  }

  if (!content) {
    console.log('[Backup] No content file found to backup from.');
    return;
  }

  let moviesAdded = 0;
  let seriesAdded = 0;

  // Protect movies
  if (Array.isArray(content.movies)) {
    for (const m of content.movies) {
      const isCustom = m.isCustom ||
        (m.id && (String(m.id).startsWith('movie_') || String(m.id).startsWith('mb-m-') || String(m.id).startsWith('custom_'))) ||
        m.addedAt || m.isManual;
      if (isCustom) {
        const idx = custom.movies.findIndex(x => x.id === m.id || (x.title && m.title && x.title.trim().toLowerCase() === m.title.trim().toLowerCase()));
        if (idx >= 0) {
          custom.movies[idx] = { ...custom.movies[idx], ...m, isCustom: true };
        } else {
          custom.movies.unshift({ ...m, isCustom: true });
          moviesAdded++;
        }
      }
    }
  }

  // Protect series
  if (Array.isArray(content.series)) {
    for (const s of content.series) {
      const isCustom = s.isCustom ||
        (s.id && (String(s.id).startsWith('series_') || String(s.id).startsWith('mb-s-') || String(s.id).startsWith('custom_'))) ||
        s.addedAt || s.isManual;
      if (isCustom) {
        const idx = custom.series.findIndex(x => x.id === s.id || (x.title && s.title && x.title.trim().toLowerCase() === s.title.trim().toLowerCase()));
        if (idx >= 0) {
          custom.series[idx] = { ...custom.series[idx], ...s, isCustom: true };
        } else {
          custom.series.unshift({ ...s, isCustom: true });
          seriesAdded++;
        }
      }
    }
  }

  try {
    const jsonStr = JSON.stringify(custom, null, 2);
    fs.writeFileSync(CUSTOM_FILE, jsonStr, 'utf8');
    fs.writeFileSync(CUSTOM_BACKUP, jsonStr, 'utf8');
    console.log(`✅ [Pre-Deploy Backup] Preserved ${custom.movies.length} movies (+${moviesAdded} new) and ${custom.series.length} series (+${seriesAdded} new) safely in custom_catalog!`);
  } catch (e) {
    console.error('[Pre-Deploy Backup] Error writing custom catalog:', e.message);
  }
}

backup();
