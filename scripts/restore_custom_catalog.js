const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CONTENT_BACKUP = path.join(__dirname, '..', 'data', 'content.backup.json');
const CONTENT_LOCAL = path.join(__dirname, '..', 'data', 'content.local.json');
const CUSTOM_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');
const CUSTOM_BACKUP = path.join(__dirname, '..', 'data', 'custom_catalog.backup.json');

const EXCLUDED_SERIES_IDS = new Set(['mb-s-7472857198671315792']);

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
        content.movies[idx] = { ...cm, ...content.movies[idx] };
      } else {
        content.movies.unshift(cm);
      }
      mergedCount++;
    }
  }

  // Restore series
  if (Array.isArray(custom.series) && custom.series.length > 0) {
    custom.series = custom.series.filter(s => !EXCLUDED_SERIES_IDS.has(s.id));
    if (!Array.isArray(content.series)) content.series = [];
    content.series = content.series.filter(s => !EXCLUDED_SERIES_IDS.has(s.id));
    for (const cs of custom.series) {
      if (EXCLUDED_SERIES_IDS.has(cs.id)) continue;
      const idx = content.series.findIndex(s => s.id === cs.id || (cs.title && s.title && s.title.trim().toLowerCase() === cs.title.trim().toLowerCase()));
      if (idx >= 0) {
        const contentSeries = content.series[idx];
        const contentEpCount = Math.max(
          (contentSeries.episodes && contentSeries.episodes.length) || 0,
          (contentSeries.seasons && contentSeries.seasons[0]?.episodes && contentSeries.seasons[0].episodes.length) || 0
        );
        const customEpCount = Math.max(
          (cs.episodes && cs.episodes.length) || 0,
          (cs.seasons && cs.seasons[0]?.episodes && cs.seasons[0].episodes.length) || 0
        );

        if (contentEpCount >= customEpCount && contentEpCount > 0) {
          // Content in content.json has more or equal episodes; preserve newer episodes & seasons
          const { episodes, seasons, totalEpisodes, streamUrl, servers, ...restCs } = cs;
          content.series[idx] = {
            ...restCs,
            ...contentSeries,
            seasons: contentSeries.seasons,
            episodes: contentSeries.episodes || contentSeries.seasons?.[0]?.episodes || [],
            streamUrl: contentSeries.streamUrl || contentSeries.seasons?.[0]?.episodes?.[0]?.streamUrl,
            servers: contentSeries.servers || contentSeries.seasons?.[0]?.episodes?.[0]?.servers,
            totalEpisodes: contentSeries.totalEpisodes || contentEpCount
          };
          // Synchronize custom object so stale episodes do not persist
          cs.seasons = contentSeries.seasons;
          cs.episodes = contentSeries.episodes || contentSeries.seasons?.[0]?.episodes || [];
          cs.totalEpisodes = contentSeries.totalEpisodes || contentEpCount;
          if (contentSeries.poster && !contentSeries.poster.includes('aoneroom')) cs.poster = contentSeries.poster;
          if (contentSeries.backdrop && !contentSeries.backdrop.includes('aoneroom')) cs.backdrop = contentSeries.backdrop;
          if (contentSeries.banner && !contentSeries.banner.includes('aoneroom')) cs.banner = contentSeries.banner;
          if (contentSeries.category) cs.category = contentSeries.category;
          if (contentSeries.industry) cs.industry = contentSeries.industry;
          if (contentSeries.country) cs.country = contentSeries.country;
          if (contentSeries.language) cs.language = contentSeries.language;
          if (contentSeries.streamUrl) cs.streamUrl = contentSeries.streamUrl;
          if (contentSeries.servers) cs.servers = contentSeries.servers;
        } else {
          content.series[idx] = { ...cs, ...contentSeries };
          if (contentSeries.poster && !contentSeries.poster.includes('aoneroom')) cs.poster = contentSeries.poster;
          if (contentSeries.backdrop && !contentSeries.backdrop.includes('aoneroom')) cs.backdrop = contentSeries.backdrop;
          if (contentSeries.banner && !contentSeries.banner.includes('aoneroom')) cs.banner = contentSeries.banner;
          if (contentSeries.category) cs.category = contentSeries.category;
        }
      } else {
        content.series.unshift(cs);
      }
      mergedCount++;
    }

    try {
      if (fs.existsSync(CUSTOM_FILE)) fs.writeFileSync(CUSTOM_FILE, JSON.stringify(custom, null, 2), 'utf8');
      if (fs.existsSync(CUSTOM_BACKUP)) fs.writeFileSync(CUSTOM_BACKUP, JSON.stringify(custom, null, 2), 'utf8');
    } catch (_) {}
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

