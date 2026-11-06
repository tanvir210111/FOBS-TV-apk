const axios = require('axios');
/**
 * FOBS TV - Web Admin Panel Service
 * Secure management for Content, MovieBox Recent Importer, Live TV, Views & User Requests
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const movieboxService = require('./movieboxService');
const dbService = require('./dbService');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const CONTENT_BACKUP_FILE = path.join(__dirname, '..', 'data', 'content.backup.json');
const CONTENT_LOCAL_FILE = path.join(__dirname, '..', 'data', 'content.local.json');
const VIEWS_FILE = path.join(__dirname, '..', 'data', 'views.json');
const REQUESTS_FILE = path.join(__dirname, '..', 'data', 'requests.json');
const NOTIFICATIONS_FILE = path.join(__dirname, '..', 'data', 'notifications.json');
const NOTIFICATIONS_LOCAL_FILE = path.join(__dirname, '..', 'data', 'notifications.local.json');
const REQUESTS_LOCAL_FILE = path.join(__dirname, '..', 'data', 'requests.local.json');
const VIEWS_LOCAL_FILE = path.join(__dirname, '..', 'data', 'views.local.json');
const CUSTOM_CATALOG_FILE = path.join(__dirname, '..', 'data', 'custom_catalog.local.json');
const CUSTOM_CATALOG_BACKUP = path.join(__dirname, '..', 'data', 'custom_catalog.backup.json');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fobs2026admin';
const JWT_SECRET = process.env.JWT_SECRET || 'fobs_tv_admin_secret_key_2026';

function atomicWriteFile(targetFile, dataStr) {
  const dir = path.dirname(targetFile);
  const tmpFile = path.join(dir, `.${path.basename(targetFile)}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`);
  fs.writeFileSync(tmpFile, dataStr, 'utf8');
  fs.renameSync(tmpFile, targetFile);
}

function readCustomCatalog() {
  try {
    if (fs.existsSync(CUSTOM_CATALOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CUSTOM_CATALOG_FILE, 'utf8'));
      if (data && typeof data === 'object') return data;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(CUSTOM_CATALOG_BACKUP)) {
      const data = JSON.parse(fs.readFileSync(CUSTOM_CATALOG_BACKUP, 'utf8'));
      if (data && typeof data === 'object') return data;
    }
  } catch (e) {}
  return { movies: [], series: [], liveTv: [], upcoming: [] };
}

function writeCustomCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') return;
  try {
    const jsonStr = JSON.stringify(catalog, null, 2);
    atomicWriteFile(CUSTOM_CATALOG_FILE, jsonStr);
    try { atomicWriteFile(CUSTOM_CATALOG_BACKUP, jsonStr); } catch (e) {}
  } catch (e) {
    console.error('[writeCustomCatalog] Error saving custom catalog:', e.message);
  }
}

let _cachedContentData = null;
let _cachedMtimeMs = 0;

function readContent() {
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      const stat = fs.statSync(CONTENT_FILE);
      if (_cachedContentData && stat.mtimeMs > 0 && stat.mtimeMs === _cachedMtimeMs) {
        return _cachedContentData;
      }
    }
  } catch (e) {}

  let mainData = null;

  try {
    if (fs.existsSync(CONTENT_FILE)) {
      mainData = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading content.json in adminService:', err);
  }

  // Fall back to localData or backupData only if mainData is missing/empty
  if (!mainData || (!mainData.movies?.length && !mainData.series?.length)) {
    let localData = null;
    if (fs.existsSync(CONTENT_LOCAL_FILE)) {
      try {
        localData = JSON.parse(fs.readFileSync(CONTENT_LOCAL_FILE, 'utf8'));
      } catch(e) {}
    }

    let backupData = null;
    if (fs.existsSync(CONTENT_BACKUP_FILE)) {
      try {
        backupData = JSON.parse(fs.readFileSync(CONTENT_BACKUP_FILE, 'utf8'));
      } catch(e) {}
    }

    mainData = localData || backupData || { featured: {}, movies: [], series: [], liveTv: [], categories: [], industries: [], upcoming: [] };
  }

  mainData.movies = Array.isArray(mainData.movies) ? mainData.movies : [];
  mainData.series = Array.isArray(mainData.series) ? mainData.series : [];
  mainData.liveTv = Array.isArray(mainData.liveTv) ? mainData.liveTv : [];
  mainData.upcoming = Array.isArray(mainData.upcoming) ? mainData.upcoming : [];

  // ALWAYS merge permanent custom catalog so admin additions are 100% resilient across git pull/restart!
  try {
    const custom = readCustomCatalog();
    if (Array.isArray(custom.movies) && custom.movies.length > 0) {
      for (const cm of custom.movies) {
        const idx = mainData.movies.findIndex(m => m.id === cm.id || (cm.title && m.title && m.title.trim().toLowerCase() === cm.title.trim().toLowerCase()));
        if (idx >= 0) {
          mainData.movies[idx] = { ...mainData.movies[idx], ...cm };
        } else {
          mainData.movies.unshift(cm);
        }
      }
    }
    if (Array.isArray(custom.series) && custom.series.length > 0) {
      for (const cs of custom.series) {
        const idx = mainData.series.findIndex(s => s.id === cs.id || (cs.title && s.title && s.title.trim().toLowerCase() === cs.title.trim().toLowerCase()));
        if (idx >= 0) {
          mainData.series[idx] = { ...mainData.series[idx], ...cs };
        } else {
          mainData.series.unshift(cs);
        }
      }
    }
    if (Array.isArray(custom.liveTv) && custom.liveTv.length > 0) {
      for (const ct of custom.liveTv) {
        const idx = mainData.liveTv.findIndex(t => t.id === ct.id || (ct.name && t.name && t.name.trim().toLowerCase() === ct.name.trim().toLowerCase()));
        if (idx >= 0) {
          mainData.liveTv[idx] = { ...mainData.liveTv[idx], ...ct };
        } else {
          mainData.liveTv.unshift(ct);
        }
      }
    }
    if (Array.isArray(custom.upcoming) && custom.upcoming.length > 0) {
      for (const cu of custom.upcoming) {
        const idx = mainData.upcoming.findIndex(u => u.id === cu.id || (cu.title && u.title && u.title.trim().toLowerCase() === cu.title.trim().toLowerCase()));
        if (idx >= 0) {
          mainData.upcoming[idx] = { ...mainData.upcoming[idx], ...cu };
        } else {
          mainData.upcoming.unshift(cu);
        }
      }
    }
  } catch (e) {
    console.warn('[readContent] Merge custom catalog error:', e.message);
  }

  try {
    if (fs.existsSync(CONTENT_FILE)) {
      _cachedMtimeMs = fs.statSync(CONTENT_FILE).mtimeMs;
    } else {
      _cachedMtimeMs = Date.now();
    }
    _cachedContentData = mainData;
  } catch (e) {}

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
      console.warn(`[writeContent] Blocked suspicious reduction in movies: from ${current.movies.length} down to ${content.movies.length}`);
      return false;
    }
  } catch (e) {}

  // Auto-sync custom/newly added movies and series to custom_catalog.local.json
  try {
    const custom = readCustomCatalog();
    if (!Array.isArray(custom.movies)) custom.movies = [];
    if (!Array.isArray(custom.series)) custom.series = [];
    let customChanged = false;

    if (Array.isArray(content.movies)) {
      for (const m of content.movies) {
        const isCustom = m.isCustom ||
          (m.id && (String(m.id).startsWith('movie_') || String(m.id).startsWith('mb-m-') || String(m.id).startsWith('custom_')));
        if (isCustom) {
          const idx = custom.movies.findIndex(x => x.id === m.id || (x.title && m.title && x.title.trim().toLowerCase() === m.title.trim().toLowerCase()));
          if (idx >= 0) {
            custom.movies[idx] = { ...custom.movies[idx], ...m, isCustom: true };
          } else {
            custom.movies.unshift({ ...m, isCustom: true });
          }
          customChanged = true;
        }
      }
    }

    if (Array.isArray(content.series)) {
      for (const s of content.series) {
        const isCustom = s.isCustom ||
          (s.id && (String(s.id).startsWith('series_') || String(s.id).startsWith('mb-s-') || String(s.id).startsWith('custom_')));
        if (isCustom) {
          const idx = custom.series.findIndex(x => x.id === s.id || (x.title && s.title && x.title.trim().toLowerCase() === s.title.trim().toLowerCase()));
          if (idx >= 0) {
            custom.series[idx] = { ...custom.series[idx], ...s, isCustom: true };
          } else {
            custom.series.unshift({ ...s, isCustom: true });
          }
          customChanged = true;
        }
      }
    }

    if (customChanged) {
      writeCustomCatalog(custom);
    }
  } catch (e) {
    console.warn('[writeContent] Custom catalog auto-sync warning:', e.message);
  }

  try {
    // Write high-performance compact JSON to keep file size < 60MB and eliminate git/disk bloat
    const jsonStr = JSON.stringify(content);

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

    try {
      if (fs.existsSync(CONTENT_FILE)) {
        _cachedMtimeMs = fs.statSync(CONTENT_FILE).mtimeMs;
      } else {
        _cachedMtimeMs = Date.now();
      }
      _cachedContentData = content;
    } catch (e) {}

    return true;
  } catch (err) {
    console.error('Error writing content.json in adminService:', err);
    throw err;
  }
}

function readNotifications() {
  try {
    if (fs.existsSync(NOTIFICATIONS_LOCAL_FILE)) {
      const localData = JSON.parse(fs.readFileSync(NOTIFICATIONS_LOCAL_FILE, 'utf8'));
      if (Array.isArray(localData) && localData.length > 0) return localData;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return dbService.getSystemNotifications() || [];
}

function writeNotifications(list) {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
    fs.writeFileSync(NOTIFICATIONS_LOCAL_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing notifications.json:', e);
  }
  return false;
}

function readRequests() {
  try {
    if (fs.existsSync(REQUESTS_LOCAL_FILE)) {
      const localData = JSON.parse(fs.readFileSync(REQUESTS_LOCAL_FILE, 'utf8'));
      if (Array.isArray(localData) && localData.length > 0) return localData;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
    }
  } catch (e) {}
  return dbService.getMediaRequests() || [];
}

function writeRequests(list) {
  try {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    fs.writeFileSync(REQUESTS_LOCAL_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing requests.json:', e);
  }
  return false;
}

function readViewsMap() {
  try {
    if (fs.existsSync(VIEWS_LOCAL_FILE)) {
      const local = JSON.parse(fs.readFileSync(VIEWS_LOCAL_FILE, 'utf8'));
      if (local && Object.keys(local).length > 0) return local;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(VIEWS_FILE)) {
      return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function writeViewsMap(map) {
  try {
    fs.writeFileSync(VIEWS_LOCAL_FILE, JSON.stringify(map, null, 2), 'utf8');
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(map, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing views.json:', e);
  }
  return false;
}

class AdminService {
  readContent() {
    return readContent();
  }
  writeContent(data) {
    return writeContent(data);
  }
  /**
   * Verify password & issue JWT
   */
  login(password) {
    if (!password || password !== ADMIN_PASSWORD) {
      return { success: false, error: 'Invalid admin password' };
    }
    const token = jwt.sign({ role: 'admin', loggedInAt: Date.now() }, JWT_SECRET, { expiresIn: '7d' });
    return { success: true, token, expires: '7 days' };
  }

  /**
   * Express middleware for protecting admin routes
   */
  authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) ? authHeader.split(' ')[1] : (req.cookies?.adminToken || req.query.admin_token || req.query.token);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Admin access required. Please login.' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') {
        req.admin = decoded;
        return next();
      }
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges' });
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
  }

  /**
   * Dashboard Stats
   */
  async getStats() {
    const content = readContent();
    const viewsMap = readViewsMap();

    // Canonical, strictly deduplicated views calculation
    let totalViews = 0;
    const accounted = new Set();

    for (const m of content.movies || []) {
      accounted.add(m.id);
      if (m.subjectId) {
        accounted.add(String(m.subjectId));
        accounted.add(`mb-m-${m.subjectId}`);
      }
      const val = viewsMap[m.id] ?? (m.subjectId ? viewsMap[m.subjectId] : undefined) ?? (m.subjectId ? viewsMap[`mb-m-${m.subjectId}`] : undefined) ?? m.views ?? 0;
      totalViews += Math.max(0, parseInt(val, 10) || 0);
    }

    for (const s of content.series || []) {
      accounted.add(s.id);
      if (s.subjectId) {
        accounted.add(String(s.subjectId));
        accounted.add(`mb-s-${s.subjectId}`);
      }
      const val = viewsMap[s.id] ?? (s.subjectId ? viewsMap[s.subjectId] : undefined) ?? (s.subjectId ? viewsMap[`mb-s-${s.subjectId}`] : undefined) ?? s.views ?? 0;
      totalViews += Math.max(0, parseInt(val, 10) || 0);
    }

    for (const [k, v] of Object.entries(viewsMap)) {
      if (!accounted.has(k) && !k.startsWith('mb-')) {
        accounted.add(k);
        totalViews += Math.max(0, parseInt(v, 10) || 0);
      }
    }

    const requests = readRequests();
    const notifications = readNotifications();
    const userStats = await dbService.getUserStats();

    const mem = process.memoryUsage();
    return {
      success: true,
      stats: {
        totalMovies: (content.movies || []).length,
        totalSeries: (content.series || []).length,
        totalChannels: (content.liveTv || []).length,
        totalViews: Math.max(totalViews, 0),
        totalUsers: userStats.totalUsers || 1,
        totalRegistered: userStats.totalRegistered || 0,
        totalDevices: userStats.totalDevices || 1,
        pendingRequests: requests.filter(r => (r.status || '').toLowerCase() === 'pending').length,
        totalRequests: requests.length,
        totalNotifications: notifications.length,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(mem.rss / (1024 * 1024)),
        nodeVersion: process.version
      }
    };
  }

  /**
   * Get all content with real-time views attached
   */
  getContent(options = {}) {
    const content = readContent();
    const viewsMap = readViewsMap();

    const movies = (content.movies || []).map(m => {
      const count = viewsMap[m.id] ||
        (m.subjectId ? viewsMap[m.subjectId] : 0) ||
        (m.subjectId ? viewsMap[`mb-m-${m.subjectId}`] : 0) ||
        m.views || 0;
      return { ...m, views: count };
    });

    const series = (content.series || []).map(s => {
      const count = viewsMap[s.id] ||
        (s.subjectId ? viewsMap[s.subjectId] : 0) ||
        (s.subjectId ? viewsMap[`mb-s-${s.subjectId}`] : 0) ||
        s.views || 0;
      const seasonsCount = s.seasonsCount || (s.seasons ? s.seasons.length : 1);
      const episodesCount = s.episodesCount || (s.seasons ? s.seasons.reduce((acc, x) => acc + (x.episodes?.length || 0), 0) : 0);

      // Lightweight representation for fast table rendering (drops multi-megabyte episode arrays)
      if (options.summary !== false) {
        return {
          id: s.id,
          subjectId: s.subjectId,
          title: s.title,
          year: s.year,
          rating: s.rating || s.imdbRating,
          poster: s.poster,
          cover: s.cover || s.backdrop,
          backdrop: s.backdrop,
          genre: s.genre,
          dubLanguage: s.dubLanguage || s.audio,
          audio: s.audio || s.dubLanguage,
          overview: s.overview || s.description,
          views: count,
          industry: s.industry,
          category: s.category,
          isCustom: s.isCustom,
          isFeatured: s.isFeatured,
          seasonsCount,
          episodesCount
        };
      }
      return { ...s, views: count, seasonsCount, episodesCount };
    });

    return {
      success: true,
      data: {
        movies,
        series,
        liveTv: content.liveTv || [],
        categories: content.categories || [],
        industries: content.industries || []
      }
    };
  }

  /**
   * Update or Set Media Views Count
   */
  updateMediaViews(id, newViews) {
    const count = Math.max(parseInt(newViews, 10) || 0, 0);
    const viewsMap = readViewsMap();
    viewsMap[id] = count;

    const content = readContent();
    const movie = (content.movies || []).find(m => m.id === id || m.subjectId === id);
    if (movie) {
      movie.views = count;
      if (movie.subjectId) viewsMap[movie.subjectId] = count;
      viewsMap[movie.id] = count;
    }

    const s = (content.series || []).find(s => s.id === id || s.subjectId === id);
    if (s) {
      s.views = count;
      if (s.subjectId) viewsMap[s.subjectId] = count;
      viewsMap[s.id] = count;
    }

    writeViewsMap(viewsMap);
    writeContent(content);

    return { success: true, id, views: count };
  }

  /**
   * Get Recent & Trending Releases from MovieBox Live Feed
   */
  normTitle(t) {
    return (t || '').toLowerCase().replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').trim();
  }

  detectIndustry(title = '', section = '', isBangla = false) {
    const tLower = (title || '').toLowerCase();
    const secLower = (section || '').toLowerCase();

    // 1. Korean
    if (/korean|kdrama|k-drama|remarried|squid game|glory|vincenzo|queen of tears|crash landing|descendants of the sun/i.test(tLower) || /k-drama|korean/i.test(secLower)) {
      return 'Korean';
    }
    // 2. Turkish
    if (/turkish|turkey|dizi|sen cal kapimi|ertugrul|kurulus|osman|yali capkini|hudutsuz sevda|kardeslerim/i.test(tLower) || /turkish/i.test(secLower)) {
      return 'Turkish';
    }
    // 3. Chinese
    if (/chinese|cdrama|c-drama|wuxia|hidden love|untamed|till the end of the moon/i.test(tLower) || /c-drama|chinese/i.test(secLower)) {
      return 'Chinese';
    }
    // 4. Anime / Japanese
    if (/anime|japan|manga|solo leveling|jujutsu|demon slayer|naruto|one piece|dragon ball|bleach|attack on titan/i.test(tLower) || /anime|japan/i.test(secLower)) {
      return 'Anime';
    }
    // 5. Tollywood / South Indian / Bangla
    if (isBangla || /bangla|bengali|kolkata/i.test(tLower) || /bangla|bengali/i.test(secLower)) {
      return 'Tollywood';
    }
    if (/south indian|tamil|telugu|malayalam|kannada/i.test(secLower) || /pushpa|bahubali|kgf|salaar|devara|kantara/i.test(tLower)) {
      return 'Tollywood';
    }
    // 6. Bollywood
    if (/bollywood|punjabi|marathi/i.test(tLower) || /bollywood|punjabi|marathi/i.test(secLower) || /indian drama|indian movies/i.test(secLower)) {
      return 'Bollywood';
    }
    // 7. Hollywood / Western
    if (secLower.includes('western') || secLower.includes('hollywood') || secLower.includes('cinema') || /avengers|marvel|spider-man|spiderman|batman|superman|stranger things|avatar|fast and furious/i.test(tLower)) {
      return 'Hollywood';
    }

    return 'Hollywood';
  }

  /**
   * Get Recent & Trending Releases from MovieBox Live Feed (with smart deduplication)
   */
  async getMovieBoxRecent(filter = 'all', hideImported = false) {
    const sections = await movieboxService.getHomepage();
    const content = readContent();

    const existingIds = new Set();
    const existingDetailPaths = new Set();
    const existingExactTitles = new Set();
    const existingCleanTitles = new Set();

    const allCatalog = [...(content.movies || []), ...(content.series || [])];
    for (const m of allCatalog) {
      if (m.id) existingIds.add(String(m.id));
      if (m.subjectId) {
        existingIds.add(String(m.subjectId));
        existingIds.add(`mb-m-${m.subjectId}`);
        existingIds.add(`mb-s-${m.subjectId}`);
      }
      if (m.detailPath) {
        existingDetailPaths.add(m.detailPath.trim().toLowerCase());
      }
      if (m.title) {
        const rawT = m.title.trim().toLowerCase();
        existingExactTitles.add(rawT);
        const cleanT = rawT.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
        if (cleanT) {
          const isH = rawT.includes('hindi') || (m.dubLanguage && m.dubLanguage.toLowerCase().includes('hindi'));
          existingCleanTitles.add(`${cleanT}_${isH ? 'hi' : 'orig'}`);
        }
      }
    }

    const seen = new Set();
    const allItems = [];

    for (const sec of sections) {
      for (const it of sec.items) {
        if (!it.id || seen.has(it.id)) continue;
        seen.add(it.id);

        const sid = String(it.subjectId || it.id || '');
        const itPath = (it.detailPath || '').trim().toLowerCase();
        const titleExact = (it.title || '').trim().toLowerCase();

        const tLower = (it.title || '').toLowerCase();
        const secLower = (sec.title || '').toLowerCase();
        const isHindi = tLower.includes('hindi') || secLower.includes('hindi');
        const isBangla = tLower.includes('bangla') || tLower.includes('bengali') || secLower.includes('bangla');
        const audioTag = isHindi ? 'Hindi Dubbed' : (isBangla ? 'Bangla Dubbed' : 'Original Audio');
        const baseTitle = (it.title || '').replace(/\[.*?hindi.*?\]|\(.*?\bhindi\b.*?\)|\[.*?bangla.*?\]|\(.*?\bbangla\b.*?\)/gi, '').trim().toLowerCase();

        const itClean = titleExact.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
        const itAudioKey = `${itClean}_${isHindi ? 'hi' : 'orig'}`;

        const alreadyImported = (sid && existingIds.has(sid)) ||
          (sid && existingIds.has(`mb-m-${sid}`)) ||
          (sid && existingIds.has(`mb-s-${sid}`)) ||
          (itPath && existingDetailPaths.has(itPath)) ||
          existingExactTitles.has(titleExact) ||
          (itClean && existingCleanTitles.has(itAudioKey));

        const industry = this.detectIndustry(it.title, sec.title, isBangla);

        let category = it.type === 'series'
          ? (isHindi ? `${industry} (Dubbed) Series` : `${industry} Series`)
          : (isHindi ? `${industry} (Dubbed) Movies` : `${industry} Movies`);

        let itemYear = it.year || '2026';
        let itemMonth = '01';
        const mMatch = (it.poster || '').match(/\/(\d{4})\/(\d{2})\//);
        if (mMatch) {
          if (!it.year) itemYear = mMatch[1];
          itemMonth = mMatch[2];
        }

        allItems.push({
          ...it,
          section: sec.title,
          alreadyImported,
          isHindi,
          isBangla,
          audioTag,
          baseTitle,
          industry,
          category,
          year: itemYear,
          month: itemMonth
        });
      }
    }

    let filtered = allItems;
    if (filter === 'trending') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('trending') || (i.section || '').toLowerCase().includes('top') || (i.section || '').toLowerCase().includes('hot'));
    } else if (filter === 'movies' || filter === 'cinema') {
      filtered = allItems.filter(i => i.type === 'movie' || (i.section || '').toLowerCase().includes('cinema') || (i.section || '').toLowerCase().includes('movie'));
    } else if (filter === 'series' || filter === 'tv') {
      filtered = allItems.filter(i => i.type === 'series' || (i.section || '').toLowerCase().includes('series') || (i.section || '').toLowerCase().includes('drama') || (i.section || '').toLowerCase().includes('show'));
    } else if (filter === 'kdrama-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (i.industry === 'Korean' || text.includes('korean') || text.includes('kdrama') || text.includes('k-drama')) && (i.isHindi || text.includes('hindi'));
      });
    } else if (filter === 'cdrama-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (i.industry === 'Chinese' || text.includes('chinese') || text.includes('cdrama') || text.includes('c-drama')) && (i.isHindi || text.includes('hindi'));
      });
    } else if (filter === 'turkish-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (i.industry === 'Turkish' || text.includes('turkish') || text.includes('turkey')) && (i.isHindi || text.includes('hindi'));
      });
    } else if (filter === 'kdrama' || filter === 'korean') {
      filtered = allItems.filter(i => i.industry === 'Korean' || (i.section || '').toLowerCase().includes('korean') || (i.section || '').toLowerCase().includes('kdrama') || (i.section || '').toLowerCase().includes('k-drama') || (i.title || '').toLowerCase().includes('korean'));
    } else if (filter === 'cdrama' || filter === 'chinese') {
      filtered = allItems.filter(i => i.industry === 'Chinese' || (i.section || '').toLowerCase().includes('chinese') || (i.section || '').toLowerCase().includes('c-drama') || (i.section || '').toLowerCase().includes('cdrama') || (i.title || '').toLowerCase().includes('chinese'));
    } else if (filter === 'turkish') {
      filtered = allItems.filter(i => i.industry === 'Turkish' || (i.section || '').toLowerCase().includes('turkish') || (i.section || '').toLowerCase().includes('turkey') || (i.title || '').toLowerCase().includes('turkish'));
    } else if (filter === 'hindi') {
      filtered = allItems.filter(i => i.isHindi || (i.section || '').toLowerCase().includes('hindi') || (i.title || '').toLowerCase().includes('hindi'));
    } else if (filter === 'bollywood') {
      filtered = allItems.filter(i => i.industry === 'Bollywood' || (i.section || '').toLowerCase().includes('bollywood') || (i.section || '').toLowerCase().includes('south'));
    } else if (filter === 'hollywood') {
      filtered = allItems.filter(i => i.industry === 'Hollywood' || (i.section || '').toLowerCase().includes('hollywood') || (i.section || '').toLowerCase().includes('western'));
    } else if (filter === 'anime') {
      filtered = allItems.filter(i => i.industry === 'Anime' || (i.section || '').toLowerCase().includes('anime') || (i.title || '').toLowerCase().includes('anime'));
    }

    const unimportedCount = filtered.filter(i => !i.alreadyImported).length;
    let listToPair = hideImported ? filtered.filter(i => !i.alreadyImported) : filtered;

    // Group & pair Original and Hindi versions of the same title so they ALWAYS appear together!
    const grouped = new Map();
    for (const item of listToPair) {
      const bKey = item.baseTitle || item.title.toLowerCase();
      if (!grouped.has(bKey)) grouped.set(bKey, []);
      grouped.get(bKey).push(item);
    }

    const pairedItems = [];
    for (const [_, grp] of grouped) {
      // Sort within the group: Original first, then Hindi, then Bangla
      grp.sort((a, b) => {
        if (!a.isHindi && b.isHindi) return -1;
        if (a.isHindi && !b.isHindi) return 1;
        return 0;
      });
      pairedItems.push(...grp);
    }

    return {
      success: true,
      filter,
      hideImported,
      totalCount: allItems.length,
      filteredCount: filtered.length,
      unimportedCount,
      alreadyImportedCount: filtered.length - unimportedCount,
      items: pairedItems
    };
  }

  async _old_getMovieBoxRecent(filter = 'all') {
    const sections = await movieboxService.getHomepage();
    const content = readContent();

    const existingIds = new Set([
      ...(content.movies || []).map(m => String(m.subjectId || m.id)),
      ...(content.series || []).map(s => String(s.subjectId || s.id))
    ]);

    const seen = new Set();
    const allItems = [];

    for (const sec of sections) {
      for (const it of sec.items) {
        if (!it.id || seen.has(it.id)) continue;
        seen.add(it.id);

        const alreadyImported = existingIds.has(String(it.subjectId || it.id)) ||
          existingIds.has(`mb-m-${it.subjectId || it.id}`) ||
          existingIds.has(`mb-s-${it.subjectId || it.id}`);

        allItems.push({
          ...it,
          section: sec.title,
          alreadyImported
        });
      }
    }

    let filtered = allItems;
    if (filter === 'trending') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('trending') || (i.section || '').toLowerCase().includes('top') || (i.section || '').toLowerCase().includes('hot'));
    } else if (filter === 'movies' || filter === 'cinema') {
      filtered = allItems.filter(i => i.type === 'movie' || (i.section || '').toLowerCase().includes('cinema') || (i.section || '').toLowerCase().includes('movie'));
    } else if (filter === 'series' || filter === 'tv') {
      filtered = allItems.filter(i => i.type === 'series' || (i.section || '').toLowerCase().includes('series') || (i.section || '').toLowerCase().includes('drama') || (i.section || '').toLowerCase().includes('show'));
    } else if (filter === 'kdrama-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (text.includes('korean') || text.includes('kdrama') || text.includes('k-drama')) && text.includes('hindi');
      });
    } else if (filter === 'cdrama-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (text.includes('chinese') || text.includes('cdrama') || text.includes('c-drama')) && text.includes('hindi');
      });
    } else if (filter === 'turkish-hindi') {
      filtered = allItems.filter(i => {
        const text = ((i.section || '') + ' ' + (i.title || '')).toLowerCase();
        return (text.includes('turkish') || text.includes('turkey')) && text.includes('hindi');
      });
    } else if (filter === 'kdrama' || filter === 'korean') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('korean') || (i.section || '').toLowerCase().includes('kdrama') || (i.section || '').toLowerCase().includes('k-drama') || (i.title || '').toLowerCase().includes('korean'));
    } else if (filter === 'cdrama' || filter === 'chinese') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('chinese') || (i.section || '').toLowerCase().includes('c-drama') || (i.section || '').toLowerCase().includes('cdrama') || (i.title || '').toLowerCase().includes('chinese'));
    } else if (filter === 'turkish') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('turkish') || (i.section || '').toLowerCase().includes('turkey') || (i.title || '').toLowerCase().includes('turkish'));
    } else if (filter === 'hindi') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('hindi') || (i.title || '').toLowerCase().includes('hindi'));
    } else if (filter === 'bollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('bollywood') || (i.section || '').toLowerCase().includes('south') || (i.section || '').toLowerCase().includes('hindi') || (i.title || '').toLowerCase().includes('hindi'));
    } else if (filter === 'hollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('hollywood') || (i.section || '').toLowerCase().includes('western'));
    } else if (filter === 'anime') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('anime') || (i.title || '').toLowerCase().includes('anime'));
    }

    return {
      success: true,
      filter,
      totalCount: allItems.length,
      filteredCount: filtered.length,
      unimportedCount: filtered.filter(i => !i.alreadyImported).length,
      items: filtered
    };
  }

  /**
   * Search MovieBox API directly for admin importer
   * Always searches Original and Hindi/Dubbed versions in parallel,
   * tags audio/category/dates, and pairs them side-by-side!
   */
  async searchMovieBox(query) {
    if (!query) return { success: true, items: [] };
    const cleanQ = query.trim();

    // Query both Original and Hindi / Dubbed versions in parallel
    const queriesToRun = [cleanQ];
    const isHindiQuery = /\bhindi\b/i.test(cleanQ);
    const isBanglaQuery = /\bbangla\b|\bbengali\b/i.test(cleanQ);

    if (!isHindiQuery) {
      queriesToRun.push(`${cleanQ} hindi`);
    } else {
      const strippedHindi = cleanQ.replace(/\bhindi\b/gi, '').trim();
      if (strippedHindi) queriesToRun.push(strippedHindi);
    }

    if (!isBanglaQuery && queriesToRun.length < 3) {
      queriesToRun.push(`${cleanQ} bangla`);
    }

    const searchResults = await Promise.allSettled(
      queriesToRun.map(q => movieboxService.search(q))
    );

    const seenMap = new Map();
    for (const res of searchResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const it of res.value) {
          const sid = String(it.subjectId || it.id || '');
          if (sid && !seenMap.has(sid)) {
            seenMap.set(sid, it);
          }
        }
      }
    }

    const items = Array.from(seenMap.values());
    const content = readContent();
    const existingIds = new Set();
    const existingDetailPaths = new Set();
    const existingExactTitles = new Set();
    const existingCleanTitles = new Set();

    const allCatalog = [...(content.movies || []), ...(content.series || [])];
    for (const m of allCatalog) {
      if (m.id) existingIds.add(String(m.id));
      if (m.subjectId) {
        existingIds.add(String(m.subjectId));
        existingIds.add(`mb-m-${m.subjectId}`);
        existingIds.add(`mb-s-${m.subjectId}`);
      }
      if (m.detailPath) {
        existingDetailPaths.add(m.detailPath.trim().toLowerCase());
      }
      if (m.title) {
        const rawT = m.title.trim().toLowerCase();
        existingExactTitles.add(rawT);
        const cleanT = rawT.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
        if (cleanT) {
          const isH = rawT.includes('hindi') || (m.dubLanguage && m.dubLanguage.toLowerCase().includes('hindi'));
          existingCleanTitles.add(`${cleanT}_${isH ? 'hi' : 'orig'}`);
        }
      }
    }

    // Enrich items with official TMDb HD poster & backdrop
    const enriched = await Promise.all(items.slice(0, 30).map(async it => {
      let poster = it.poster;
      let backdrop = it.backdrop || it.cover;
      let tmdbRating = it.rating;
      let tmdbOverview = '';
      let tmdbYear = it.year || '';
      let tmdbMonth = '';
      let tmdbReleaseDate = '';

      const tLower = (it.title || '').toLowerCase();
      const isHindi = tLower.includes('hindi');
      const isBangla = tLower.includes('bangla') || tLower.includes('bengali');
      const audioTag = isHindi ? 'Hindi Dubbed' : (isBangla ? 'Bangla Dubbed' : 'Original Audio');
      const baseTitle = (it.title || '').replace(/\[.*?hindi.*?\]|\(.*?\bhindi\b.*?\)|\[.*?bangla.*?\]|\(.*?\bbangla\b.*?\)/gi, '').trim().toLowerCase();

      try {
        const cleanName = (it.title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
        const tmdbType = it.type === 'series' ? 'tv' : 'movie';
        const tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=6e766190399843a3e1d85b68eaa3de69&query=${encodeURIComponent(cleanName)}`, { timeout: 2500 });
        const tmdbItem = tmdbRes.data?.results?.[0];
        if (tmdbItem) {
          if (tmdbItem.poster_path) {
            poster = `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`;
          }
          if (tmdbItem.backdrop_path) {
            backdrop = `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}`;
          }
          if (tmdbItem.vote_average) {
            tmdbRating = tmdbItem.vote_average.toFixed(1);
          }
          if (tmdbItem.overview) {
            tmdbOverview = tmdbItem.overview;
          }
          const relDate = tmdbItem.release_date || tmdbItem.first_air_date || '';
          if (relDate) {
            tmdbReleaseDate = relDate;
            const parts = relDate.split('-');
            if (parts[0]) tmdbYear = parts[0];
            if (parts[1]) tmdbMonth = parts[1];
          }
        }
      } catch (e) {}

      let industry = this.detectIndustry(it.title, '', isBangla);

      let category = it.type === 'series'
        ? (isHindi ? `${industry} (Dubbed) Series` : `${industry} Series`)
        : (isHindi ? `${industry} (Dubbed) Movies` : `${industry} Movies`);

      let itemYear = tmdbYear || it.year || '2026';
      let itemMonth = tmdbMonth || '01';
      const mMatch = (it.poster || '').match(/\/(\d{4})\/(\d{2})\//);
      if (mMatch && !tmdbMonth) {
        if (!tmdbYear && !it.year) itemYear = mMatch[1];
        itemMonth = mMatch[2];
      }

      const sid = String(it.subjectId || it.id || '');
      const itPath = (it.detailPath || '').trim().toLowerCase();
      const titleExact = (it.title || '').trim().toLowerCase();
      const itClean = titleExact.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const itAudioKey = `${itClean}_${isHindi ? 'hi' : 'orig'}`;

      const alreadyImported = (sid && existingIds.has(sid)) ||
        (sid && existingIds.has(`mb-m-${sid}`)) ||
        (sid && existingIds.has(`mb-s-${sid}`)) ||
        (itPath && existingDetailPaths.has(itPath)) ||
        existingExactTitles.has(titleExact) ||
        (itClean && existingCleanTitles.has(itAudioKey));

      return {
        ...it,
        poster: poster || it.poster,
        backdrop: backdrop || it.backdrop || poster || it.poster,
        cover: backdrop || it.backdrop || poster || it.poster,
        rating: tmdbRating || it.rating || '8.5',
        overview: tmdbOverview || it.description || '',
        year: itemYear,
        month: itemMonth,
        releaseDate: tmdbReleaseDate || '',
        isHindi,
        isBangla,
        audioTag,
        baseTitle,
        industry,
        category,
        alreadyImported
      };
    }));

    // Group & pair Original and Hindi versions of the same title so they ALWAYS appear together!
    const grouped = new Map();
    for (const item of enriched) {
      const bKey = item.baseTitle || item.title.toLowerCase();
      if (!grouped.has(bKey)) grouped.set(bKey, []);
      grouped.get(bKey).push(item);
    }

    const pairedItems = [];
    for (const [_, grp] of grouped) {
      grp.sort((a, b) => {
        if (!a.isHindi && b.isHindi) return -1;
        if (a.isHindi && !b.isHindi) return 1;
        return 0;
      });
      pairedItems.push(...grp);
    }

    return { success: true, items: pairedItems };
  }

  /**
   * Unified Auto-Detect Engine:
   * Combines TMDb (Official Title, HD Poster, Backdrop, Year, Rating, Genres, Overview)
   * with MovieBox (Subject ID, DetailPath, Stream URL, Seasons/Episodes)
   */
  async autoDetectMedia(query, type = 'movie') {
    if (!query) throw new Error('Query or Subject ID is required');
    const cleanQ = query.trim();
    const isSubjectId = /^\d+$/.test(cleanQ);

    let mbItem = null;
    let mbDetail = null;
    let searchTitle = cleanQ;

    if (isSubjectId) {
      try { movieboxService.invalidateCache(cleanQ); } catch (_) {}
      mbDetail = await movieboxService.getDetail(cleanQ, '', { forceRefresh: true });
      if (mbDetail && mbDetail.title) {
        searchTitle = mbDetail.title;
        mbItem = {
          subjectId: cleanQ,
          title: mbDetail.title,
          detailPath: mbDetail.detailPath || '',
          type: mbDetail.type || type
        };
      }
    } else {
      // Search MovieBox for best stream match
      try {
        const mbResults = await movieboxService.search(cleanQ);
        const list = Array.isArray(mbResults) ? mbResults : (mbResults?.items || []);
        if (list && list.length > 0) {
          const filtered = list.filter(it => type === 'series' ? (it.type === 'series') : (it.type === 'movie'));
          mbItem = filtered[0] || list[0];
          if (mbItem && mbItem.subjectId) {
            try { movieboxService.invalidateCache(mbItem.subjectId); } catch (_) {}
            mbDetail = await movieboxService.getDetail(mbItem.subjectId, mbItem.detailPath, { forceRefresh: true });
          }
        }
      } catch (e) {}
    }

    // Clean searchTitle for TMDb
    const cleanName = (searchTitle || cleanQ).replace(/\[.*?\]|\(.*?\)/g, '').trim();
    const tmdbType = (type === 'series' || (mbItem && mbItem.type === 'series')) ? 'tv' : 'movie';

    let tmdbData = null;
    try {
      const tmdbSearch = await axios.get(`https://api.themoviedb.org/3/search/${tmdbType}`, {
        params: {
          api_key: '6e766190399843a3e1d85b68eaa3de69',
          query: cleanName
        },
        timeout: 4500
      });
      let match = tmdbSearch.data?.results?.[0];
      if (!match && /to you/i.test(cleanName)) {
        try {
          const altRes = await axios.get(`https://api.themoviedb.org/3/search/${tmdbType}`, {
            params: { api_key: '6e766190399843a3e1d85b68eaa3de69', query: cleanName.replace(/to you/i, 'into you') },
            timeout: 3000
          });
          match = altRes.data?.results?.[0];
        } catch (_) {}
      }
      if (!match) {
        const words = cleanName.split(/\s+/);
        if (words.length > 2) {
          try {
            const shortRes = await axios.get(`https://api.themoviedb.org/3/search/${tmdbType}`, {
              params: { api_key: '6e766190399843a3e1d85b68eaa3de69', query: words.slice(0, 3).join(' ') },
              timeout: 3000
            });
            match = shortRes.data?.results?.[0];
          } catch (_) {}
        }
      }
      if (match) {
        const tmdbDetails = await axios.get(`https://api.themoviedb.org/3/${tmdbType}/${match.id}`, {
          params: {
            api_key: '6e766190399843a3e1d85b68eaa3de69',
            append_to_response: 'credits'
          },
          timeout: 4500
        });
        tmdbData = tmdbDetails.data;
      }
    } catch (e) {}

    // Combine metadata
    const finalTitle = tmdbData?.name || tmdbData?.title || mbDetail?.title || mbItem?.title || cleanName;
    const finalYear = (tmdbData?.first_air_date || tmdbData?.release_date || '').split('-')[0] || mbDetail?.year || mbItem?.year || '2026';
    const finalRating = tmdbData?.vote_average ? tmdbData.vote_average.toFixed(1) : (mbDetail?.rating || mbItem?.rating || '8.5');
    const finalGenres = (tmdbData?.genres || []).map(g => g.name).join(', ') || mbDetail?.genre || 'Drama';

    let finalPoster = '';
    if (tmdbData?.poster_path) {
      finalPoster = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    } else if (mbDetail?.poster) {
      finalPoster = mbDetail.poster;
    } else if (mbItem?.poster) {
      finalPoster = mbItem.poster;
    }

    let finalBackdrop = '';
    if (tmdbData?.backdrop_path) {
      finalBackdrop = `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`;
    } else if (mbDetail?.cover || mbDetail?.backdrop) {
      finalBackdrop = mbDetail.cover || mbDetail.backdrop;
    } else if (finalPoster) {
      finalBackdrop = finalPoster;
    }

    const finalOverview = tmdbData?.overview || mbDetail?.description || '';

    // Detect Industry & Category
    const originCountries = tmdbData?.origin_country || [];
    const prodCountries = (tmdbData?.production_countries || []).map(p => p.name);
    const countryStr = prodCountries.join(' ');
    const isKorean = originCountries.includes('KR') || /korea/i.test(countryStr) || /k-drama|kdrama/i.test(finalGenres + ' ' + finalOverview);
    const isBollywood = originCountries.includes('IN') || /india/i.test(countryStr) || /hindi/i.test(finalTitle);
    const isAnime = originCountries.includes('JP') || /japan/i.test(countryStr) || /anime/i.test(finalGenres);
    const isChinese = originCountries.includes('CN') || originCountries.includes('TW') || /china/i.test(countryStr);
    const isTurkish = originCountries.includes('TR') || /turkey|turkish/i.test(countryStr);

    let detectedIndustry = 'Hollywood';
    if (isKorean) detectedIndustry = 'Korean';
    else if (isBollywood) detectedIndustry = 'Bollywood';
    else if (isAnime) detectedIndustry = 'Anime';
    else if (isChinese) detectedIndustry = 'Chinese';
    else if (isTurkish) detectedIndustry = 'Turkish';

    const isHindiDubbed = /hindi/i.test(finalTitle) || (mbDetail && mbDetail.isHindi);
    let detectedCategory = type === 'series'
      ? (isHindiDubbed ? `${detectedIndustry} (Dubbed) Series` : `${detectedIndustry} Series`)
      : (isHindiDubbed ? `${detectedIndustry} (Dubbed) Movies` : `${detectedIndustry} Movies`);

    const sId = mbItem?.subjectId || mbDetail?.subjectId || (isSubjectId ? cleanQ : '');
    const dPath = mbItem?.detailPath || mbDetail?.detailPath || '';
    const streamUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}` : '';

    let finalSeasons = [];
    const tmdbEps = parseInt(tmdbData?.number_of_episodes, 10) || 0;
    const mbEps = parseInt(mbDetail?.totalEpisodes, 10) || 0;
    let detectedTotalEps = mbEps || tmdbEps;

    let isOngoing = false;
    let totalReleasedEps = 0;
    let totalPlannedEps = 0;

    if (tmdbType === 'tv') {
      const seasonMap = new Map();

      // 1. Add MovieBox seasons if available with real released episode counts
      const mbSeasonsList = (mbDetail && Array.isArray(mbDetail.seasons) && mbDetail.seasons.length > 0)
        ? mbDetail.seasons
        : ((mbDetail && (mbDetail.totalEpisodes || mbEps)) ? [{ se: 1, maxEp: mbDetail.totalEpisodes || mbEps || 1 }] : []);

      if (mbSeasonsList.length > 0) {
        for (const s of mbSeasonsList) {
          const seNum = parseInt(s.se, 10) || 1;
          let mEp = parseInt(s.maxEp, 10) || 0;
          if (s.allEp) {
            const sc = s.allEp.split(',').filter(Boolean).length;
            if (sc > mEp) mEp = sc;
          }
          if (Array.isArray(s.resolutions)) {
            for (const r of s.resolutions) {
              if (r.epNum && r.epNum > mEp) mEp = r.epNum;
            }
          }
          seasonMap.set(seNum, {
            se: seNum,
            title: `Season ${seNum}`,
            releasedMaxEp: mEp || 1,
            maxEp: mEp || 1,
            plannedMaxEp: mEp || 1
          });
        }
      }

      // 2. Add or enrich with TMDb seasons without overwriting real released episode counts
      if (Array.isArray(tmdbData?.seasons) && tmdbData.seasons.length > 0) {
        const validTmdbSeasons = tmdbData.seasons.filter(s => s.season_number > 0);
        for (const ts of validTmdbSeasons) {
          const seNum = ts.season_number;
          const epCount = ts.episode_count || 10;
          if (seasonMap.has(seNum)) {
            const existing = seasonMap.get(seNum);
            if (ts.name) existing.title = ts.name;
            existing.plannedMaxEp = Math.max(epCount, existing.releasedMaxEp);
          } else {
            seasonMap.set(seNum, {
              se: seNum,
              title: ts.name || `Season ${seNum}`,
              releasedMaxEp: epCount,
              maxEp: epCount,
              plannedMaxEp: epCount
            });
          }
        }
      }

      // 3. Fallback if no seasons found but detectedTotalEps > 0
      if (seasonMap.size === 0) {
        seasonMap.set(1, {
          se: 1,
          title: 'Season 1',
          releasedMaxEp: detectedTotalEps || 16,
          maxEp: detectedTotalEps || 16,
          plannedMaxEp: detectedTotalEps || 16
        });
      }

      for (const [_, s] of seasonMap) {
        totalReleasedEps += (s.releasedMaxEp || s.maxEp || 0);
        totalPlannedEps += (s.plannedMaxEp || s.maxEp || 0);
      }
      isOngoing = (totalReleasedEps < totalPlannedEps) ||
        (tmdbData?.status === 'Returning Series') ||
        (tmdbData?.in_production === true);

      const sortedSeasons = Array.from(seasonMap.values()).sort((a, b) => a.se - b.se);

      finalSeasons = sortedSeasons.map(s => {
        const seNum = s.se;
        const maxEp = Math.max(parseInt(s.maxEp, 10) || 1, 1);
        const eps = [];
        for (let ep = 1; ep <= maxEp; ep++) {
          const epUrl = sId ? `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}` : '';
          eps.push({
            number: String(ep).padStart(2, '0'),
            episode: ep,
            season: seNum,
            title: `Episode ${ep}`,
            duration: '45 min',
            still: finalPoster,
            streamUrl: epUrl,
            servers: [
              { name: `Server 1 (${isHindiDubbed ? 'Hindi Dub' : 'HD'})`, url: epUrl, quality: '1080p', isDirect: true },
              { name: 'Server 2 (Auto Failover)', url: epUrl, quality: '1080p', isDirect: true }
            ]
          });
        }
        return {
          seasonNumber: seNum,
          title: s.title || `Season ${seNum}`,
          name: s.title || `Season ${seNum}`,
          releasedEpisodesCount: s.releasedMaxEp || eps.length,
          plannedEpisodesCount: s.plannedMaxEp || eps.length,
          episodesCount: eps.length,
          episodes: eps
        };
      });
      detectedTotalEps = finalSeasons.reduce((sum, s) => sum + s.episodesCount, 0);
    }

    if (!detectedTotalEps) {
      detectedTotalEps = finalSeasons.length > 0 ? finalSeasons.reduce((sum, s) => sum + s.episodesCount, 0) : (tmdbType === 'tv' ? 16 : 1);
    }

    return {
      success: true,
      data: {
        title: finalTitle,
        year: finalYear,
        rating: finalRating,
        genre: finalGenres,
        industry: detectedIndustry,
        category: detectedCategory,
        poster: finalPoster,
        backdrop: finalBackdrop,
        cover: finalBackdrop,
        description: finalOverview,
        duration: tmdbData?.runtime ? `${tmdbData.runtime} min` : '120 min',
        subjectId: sId,
        detailPath: dPath,
        streamUrl: streamUrl,
        isHindi: isHindiDubbed,
        type: tmdbType === 'tv' ? 'series' : 'movie',
        isOngoing,
        releasedEpisodesCount: totalReleasedEps || detectedTotalEps,
        plannedEpisodesCount: totalPlannedEps || detectedTotalEps,
        status: isOngoing ? 'Ongoing' : 'Completed',
        seasonsCount: finalSeasons.length || 1,
        totalEpisodes: detectedTotalEps,
        seasons: finalSeasons,
        episodes: finalSeasons[0]?.episodes || []
      }
    };
  }

  /**
   * Resolve live MovieBox stream & qualities
   */
  async resolveMovieBox(subjectId, detailPath, season = 0, episode = 0) {
    movieboxService.invalidateCache();
    const res = await movieboxService.resolveMedia(subjectId, detailPath, season, episode);
    return { success: !!res, data: res };
  }

  /**
   * 1-Click Import Movie or Series from Moviebox
   */
  async importFromMovieBox(payload) {
    let {
      subjectId,
      detailPath = '',
      title,
      type = 'movie',
      year = '2026',
      rating = '8.0',
      poster = '',
      category = 'Hollywood Movies',
      industry = 'Hollywood',
      audio = 'Hindi dub',
      isHindi = false,
      episodesCount
    } = payload;

    if (!subjectId) {
      throw new Error('subjectId is required for import');
    }

    // Auto-fetch full metadata, total uploaded episodes, and categories from MovieBox
    try { movieboxService.invalidateCache(subjectId); } catch (_) {}
    const autoDetail = await movieboxService.getDetail(subjectId, detailPath, { forceRefresh: true });
    if (autoDetail) {
      if (!title) title = autoDetail.title;
      if (!type) type = autoDetail.type;
      if (!detailPath) detailPath = autoDetail.detailPath;
      if (!year || year === '2026') year = autoDetail.year || year || '2026';
      if (!rating || rating === '8.0') rating = autoDetail.rating || rating || '8.2';
      if (!industry || industry === 'Hollywood') industry = autoDetail.industry || industry;
      if (!category || category === 'Hollywood Movies') category = autoDetail.category || category;
      if (!poster) poster = autoDetail.poster;
      if (!payload.cover || payload.cover.includes('aoneroom')) payload.cover = autoDetail.cover && !autoDetail.cover.includes('aoneroom') ? autoDetail.cover : undefined;
      if (payload.isHindi === undefined) isHindi = autoDetail.isHindi;
      if (!episodesCount || episodesCount <= 0) episodesCount = autoDetail.totalEpisodes;
    }

    if (!title) title = 'Untitled Content';
    if (!episodesCount || episodesCount <= 0) episodesCount = type === 'series' ? (autoDetail?.totalEpisodes || 16) : 1;

    const content = readContent();

    // Fetch optimized lightweight TMDB poster (50-100KB) instead of raw 7.5MB uncompressed images
    let optPoster = poster;
    let optBackdrop = poster;
    try {
      const cleanName = title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      const tmdbType = type === 'series' ? 'tv' : 'movie';
      const tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=6e766190399843a3e1d85b68eaa3de69&query=${encodeURIComponent(cleanName)}`, { timeout: 3000 });
      const tmdbItem = tmdbRes.data?.results?.[0];
      if (tmdbItem && tmdbItem.poster_path) {
        optPoster = `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`;
        optBackdrop = tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbItem.backdrop_path}` : (payload.cover || optPoster);
      }
    } catch (e) {}

    if (type === 'movie') {
      const mb = await movieboxService.resolveMedia(subjectId, detailPath, 0, 0);
      if (!mb || !mb.streamUrl) {
        throw new Error('Could not resolve stream URL from MovieBox for this movie');
      }

      const formattedCaptions = (mb.captions || []).map((c, i) => ({
        id: `mb_sub_${c.language}_${i}`,
        label: c.language === 'en' ? 'English' : (c.language === 'hi' ? 'हिन्दी' : c.language),
        language: c.language,
        srclang: c.language,
        src: c.url,
        url: c.url,
        format: c.url && c.url.includes('.srt') ? 'srt' : 'vtt'
      }));

      const finalTitle = isHindi && !title.toLowerCase().includes('hindi') ? `${title} [Hindi]` : title;
      const resName = mb.resolution || 1080;

      const newMovie = {
        id: `mb-m-${subjectId}`,
        subjectId,
        detailPath,
        title: finalTitle,
        year: String(year),
        rating: String(rating),
        imdbRating: String(rating),
        poster: optPoster || poster || mb.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: payload.cover || optBackdrop || poster || mb.poster,
        cover: payload.cover || optBackdrop || poster || mb.poster,
        genre: 'Action, Thriller',
        duration: '2h 00m',
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        audioTracks: isHindi ? ['Hindi dub', 'Original Audio'] : ['Original Audio'],
        selectedAudio: isHindi ? 'Hindi dub' : 'Original Audio',
        streamUrl: `/api/moviebox/stream?id=${subjectId}&path=${encodeURIComponent(detailPath || '')}&se=0&ep=0`,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: year ? (year + '-10-25') : new Date().toISOString().split('T')[0],
        originalReleaseDate: year ? (year + '-01-01') : '2026-01-01',
        badgeLeft: 'Trending',
        badgeRight: isHindi ? 'Hindi' : industry,
        views: 1250,
        servers: [
          {
            name: `Server 1 (${isHindi ? 'Hindi Dub' : 'HD'} - Auto-Renewing ${resName}p)`,
            url: `/api/moviebox/stream?id=${subjectId}&path=${encodeURIComponent(detailPath || '')}&se=0&ep=0`,
            quality: `${resName}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          },
          {
            name: 'Server 2 (Direct Fast CDN)',
            url: mb.streamUrl,
            quality: `${resName}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          },
          ...(mb.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 3} (${q.resolution}p SD)`,
            url: q.url,
            quality: `${q.resolution}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          }))
        ],
        captions: formattedCaptions,
        subtitles: formattedCaptions,
        description: `${finalTitle} - Available in high definition on FOBS TV.`,
        isCustom: true
      };

      content.movies = (content.movies || []).filter(m => m.id !== newMovie.id && m.subjectId !== subjectId);
      content.movies.unshift(newMovie);
      if (payload.isFeatured) {
        content.featured = { ...newMovie };
      }
      try {
        const custom = readCustomCatalog();
        if (!Array.isArray(custom.movies)) custom.movies = [];
        const cIdx = custom.movies.findIndex(m => m.id === newMovie.id || (m.title && m.title.trim().toLowerCase() === newMovie.title.trim().toLowerCase()));
        if (cIdx >= 0) custom.movies[cIdx] = { ...custom.movies[cIdx], ...newMovie, isCustom: true };
        else custom.movies.unshift(newMovie);
        writeCustomCatalog(custom);
      } catch(e) {}
      writeContent(content);

      return { success: true, item: newMovie };
    } else {
      // Import Series (Full Multi-Season Support)
      const finalTitle = isHindi && !title.toLowerCase().includes('hindi') ? `${title} [Hindi]` : title;
      const seasonMode = payload.seasonMode || 'all';

      // Determine seasons to import
      const seasons = [];
      let totalEpisodesImported = 0;

      if (Array.isArray(payload.seasons) && payload.seasons.length > 0) {
        // Admin reviewed, added, or removed episodes/seasons in the detailed preview
        for (const ps of payload.seasons) {
          const seNum = ps.seasonNumber !== undefined ? parseInt(ps.seasonNumber, 10) : 1;
          const eps = Array.isArray(ps.episodes) ? ps.episodes : [];
          seasons.push({
            seasonNumber: seNum,
            title: ps.title || `Season ${seNum}`,
            name: ps.title || `Season ${seNum}`,
            year: String(year),
            episodesCount: eps.length,
            episodes: eps
          });
          totalEpisodesImported += eps.length;
        }
      } else {
        let targetSeasons = [];
        if (autoDetail && Array.isArray(autoDetail.seasons) && autoDetail.seasons.length > 0) {
          if (seasonMode !== 'all') {
            const seNum = parseInt(seasonMode, 10);
            const found = autoDetail.seasons.find(s => s.se === seNum);
            if (found) {
              let mEp = parseInt(found.maxEp, 10) || 0;
              if (found.allEp) {
                const sc = found.allEp.split(',').filter(Boolean).length;
                if (sc > mEp) mEp = sc;
              }
              if (Array.isArray(found.resolutions)) {
                for (const r of found.resolutions) {
                  if (r.epNum && r.epNum > mEp) mEp = r.epNum;
                }
              }
              targetSeasons = [{ se: found.se, maxEp: Math.max(mEp, 1) || 16 }];
            } else {
              targetSeasons = [{ se: seNum, maxEp: episodesCount || autoDetail.totalEpisodes || 16 }];
            }
          } else {
            targetSeasons = autoDetail.seasons.map(s => {
              let mEp = parseInt(s.maxEp, 10) || 0;
              if (s.allEp) {
                const sc = s.allEp.split(',').filter(Boolean).length;
                if (sc > mEp) mEp = sc;
              }
              if (Array.isArray(s.resolutions)) {
                for (const r of s.resolutions) {
                  if (r.epNum && r.epNum > mEp) mEp = r.epNum;
                }
              }
              return { se: s.se, maxEp: Math.max(mEp, 1) || 16 };
            });
          }
        } else {
          const seNum = seasonMode !== 'all' ? (parseInt(seasonMode, 10) || 1) : 1;
          targetSeasons = [{ se: seNum, maxEp: episodesCount || (autoDetail ? autoDetail.totalEpisodes : 16) || 16 }];
        }

        for (const sInfo of targetSeasons) {
        const seNum = sInfo.se;
        const maxEp = Math.max(parseInt(sInfo.maxEp, 10) || 1, 1);
        const seasonEpisodes = [];

        // Pre-resolve episode 1 of this season for resolution, sample duration, and subtitle tracks
        let sampleRes = 1080;
        let sampleDuration = '45 min';
        let sampleCaptions = [];
        let directSampleUrl = '';
        try {
          const sampleMb = await Promise.race([
            movieboxService.resolveMedia(subjectId, detailPath, seNum, 1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Sample timeout')), 6000))
          ]);
          if (sampleMb) {
            if (sampleMb.resolution) sampleRes = sampleMb.resolution;
            if (sampleMb.duration) sampleDuration = sampleMb.duration;
            if (sampleMb.streamUrl) directSampleUrl = sampleMb.streamUrl;
            if (Array.isArray(sampleMb.captions)) {
              sampleCaptions = sampleMb.captions.map((c, i) => {
                const l = (c.language || 'en').toLowerCase();
                const label = l === 'en' ? 'English' : (l === 'hi' ? 'Hindi (हिन्दी)' : (l === 'bn' ? 'Bangla (বাংলা)' : (c.language || 'Subtitle')));
                return {
                  id: `s${seNum}ep1_sub_${l}_${i}`,
                  label,
                  language: l,
                  srclang: l,
                  src: c.url,
                  url: c.url,
                  format: c.url && c.url.includes('.srt') ? 'srt' : 'vtt'
                };
              });
            }
          }
        } catch (e) {}

        for (let ep = 1; ep <= maxEp; ep++) {
          const autoRenewEpUrl = `/api/moviebox/stream?id=${subjectId}&path=${encodeURIComponent(detailPath || '')}&se=${seNum}&ep=${ep}`;
          const epCaptions = sampleCaptions.map((c, idx) => ({
            ...c,
            id: `s${seNum}ep${ep}_sub_${c.language}_${idx}`
          }));

          seasonEpisodes.push({
            number: String(ep).padStart(2, '0'),
            episode: ep,
            season: seNum,
            title: `Episode ${ep}`,
            duration: sampleDuration,
            still: poster,
            stillPath: poster,
            streamUrl: autoRenewEpUrl,
            servers: [
              {
                name: `Server 1 (${isHindi ? 'Hindi Dub' : 'Original Audio'} - Auto-Renewing ${sampleRes}p)`,
                url: autoRenewEpUrl,
                quality: `${sampleRes}p`,
                audio: isHindi ? 'Hindi dub' : 'Original Audio',
                isDirect: true
              },
              {
                name: ep === 1 && directSampleUrl ? 'Server 2 (Direct Fast CDN)' : 'Server 2 (Auto Failover)',
                url: ep === 1 && directSampleUrl ? directSampleUrl : autoRenewEpUrl,
                quality: `${sampleRes}p`,
                audio: isHindi ? 'Hindi dub' : 'Original Audio',
                isDirect: true
              }
            ]
          });
        }

        totalEpisodesImported += seasonEpisodes.length;
        seasons.push({
          seasonNumber: seNum,
          title: `Season ${seNum}`,
          name: `Season ${seNum}`,
          year: String(year),
          episodesCount: seasonEpisodes.length,
          episodes: seasonEpisodes
        });
      }
    }

    if (seasons.length === 0 || totalEpisodesImported === 0) {
        throw new Error('No episodes could be imported for this series');
      }

      const firstSeason = seasons[0];
      const firstEp = firstSeason.episodes[0];
      const durationStr = seasons.length > 1
        ? `${seasons.length} Seasons (${totalEpisodesImported} Episodes)`
        : `${totalEpisodesImported} Episodes`;

      const newSeries = {
        id: `mb-s-${subjectId}`,
        subjectId,
        detailPath,
        title: finalTitle,
        year: String(year),
        rating: String(rating),
        imdbRating: String(rating),
        poster: optPoster || poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: payload.cover || optBackdrop || poster,
        cover: payload.cover || optBackdrop || poster,
        duration: durationStr,
        streamUrl: firstEp.streamUrl,
        servers: firstEp.servers,
        episodesCount: totalEpisodesImported,
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        audioTracks: isHindi ? ['Hindi dub', 'Original Audio'] : ['Original Audio'],
        selectedAudio: isHindi ? 'Hindi dub' : 'Original Audio',
        seasonsCount: seasons.length,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: year ? (year + '-10-25') : new Date().toISOString().split('T')[0],
        originalReleaseDate: year ? (year + '-01-01') : '2026-01-01',
        badgeLeft: 'Trending',
        badgeRight: isHindi ? 'Hindi' : industry,
        views: 1250,
        seasons,
        episodes: firstSeason.episodes,
        description: `${finalTitle} - ${durationStr} streaming in HD on FOBS TV.`,
        isCustom: true
      };

      content.series = (content.series || []).filter(s => s.id !== newSeries.id && s.subjectId !== subjectId);
      content.series.unshift(newSeries);
      if (payload.isFeatured) {
        content.featured = { ...newSeries };
      }
      try {
        const custom = readCustomCatalog();
        if (!Array.isArray(custom.series)) custom.series = [];
        const cIdx = custom.series.findIndex(s => s.id === newSeries.id || (s.title && s.title.trim().toLowerCase() === newSeries.title.trim().toLowerCase()));
        if (cIdx >= 0) custom.series[cIdx] = { ...custom.series[cIdx], ...newSeries, isCustom: true };
        else custom.series.unshift(newSeries);
        writeCustomCatalog(custom);
      } catch(e) {}
      writeContent(content);

      return { success: true, item: newSeries };
    }
  }

  /**
   * Auto-Batch Import Top N Unimported Recent Items
   */
  async batchImportRecent(count = 5, filter = 'trending') {
    const recent = await this.getMovieBoxRecent(filter);
    const unimported = (recent.items || []).filter(i => !i.alreadyImported).slice(0, count);

    const results = [];
    for (const item of unimported) {
      try {
        const isSeries = item.type === 'series';
        const isHindi = (item.title || '').toLowerCase().includes('hindi') || (item.section || '').toLowerCase().includes('hindi');
        
        let category = 'Hollywood Movies';
        let industry = 'Hollywood';
        if (isSeries) {
          category = 'Web Series';
        } else if ((item.section || '').toLowerCase().includes('bollywood')) {
          category = 'Bollywood Movies';
          industry = 'Bollywood';
        } else if ((item.section || '').toLowerCase().includes('south')) {
          category = 'South Indian Hindi Dubbed';
          industry = 'Tollywood';
        }

        const res = await this.importFromMovieBox({
          subjectId: item.subjectId || item.id,
          detailPath: item.detailPath || '',
          title: item.title,
          year: item.year || '2026',
          rating: item.rating || '8.0',
          poster: item.poster,
          type: item.type,
          category,
          industry,
          isHindi,
          episodesCount: isSeries ? undefined : 1
        });
        results.push({ id: item.id, title: item.title, success: true });
      } catch (e) {
        results.push({ id: item.id, title: item.title, success: false, error: e.message });
      }
    }

    return {
      success: true,
      requestedCount: count,
      importedCount: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * Save or Update Movie
   */
  saveMovie(movie) {
    if (!movie.title) throw new Error('Movie title is required');
    const content = readContent();
    if (!movie.id) {
      movie.id = `movie_${Date.now()}`;
    }

    const now = new Date().toISOString();
    movie.addedAt = movie.addedAt || now;
    movie.createdAt = movie.createdAt || now;
    movie.releaseDate = movie.releaseDate || (movie.year ? (movie.year + '-10-25') : now.split('T')[0]);
    movie.badgeLeft = movie.badgeLeft || 'Trending';
    movie.views = movie.views !== undefined ? parseInt(movie.views, 10) : 1250;
    movie.isCustom = true;
    movie.type = 'movie';
    movie.cover = movie.cover || movie.backdrop || movie.poster;
    movie.backdrop = movie.backdrop || movie.cover;

    if (movie.views !== undefined) {
      const viewsMap = readViewsMap();
      viewsMap[movie.id] = parseInt(movie.views, 10) || 0;
      writeViewsMap(viewsMap);
    }

    if (movie.isFeatured) {
      content.featured = { ...movie };
    }

    const idx = (content.movies || []).findIndex(m => m.id === movie.id);
    if (idx >= 0) {
      content.movies[idx] = { ...content.movies[idx], ...movie };
    } else {
      content.movies.unshift(movie);
    }

    // Persist to git-immune custom catalog so it NEVER gets wiped by updates
    try {
      const custom = readCustomCatalog();
      if (!Array.isArray(custom.movies)) custom.movies = [];
      const cIdx = custom.movies.findIndex(m => m.id === movie.id || (m.title && m.title.trim().toLowerCase() === movie.title.trim().toLowerCase()));
      if (cIdx >= 0) custom.movies[cIdx] = { ...custom.movies[cIdx], ...movie };
      else custom.movies.unshift(movie);
      writeCustomCatalog(custom);
    } catch(e) {}

    writeContent(content);
    return { success: true, movie };
  }

  /**
   * Delete Movie
   */
  deleteMovie(id) {
    const content = readContent();
    content.movies = (content.movies || []).filter(m => m.id !== id);
    try {
      const custom = readCustomCatalog();
      if (Array.isArray(custom.movies)) {
        custom.movies = custom.movies.filter(m => m.id !== id);
        writeCustomCatalog(custom);
      }
    } catch(e) {}
    writeContent(content);
    return { success: true };
  }

  /**
   * Save or Update Series
   */
  saveSeries(series) {
    if (!series.title) throw new Error('Series title is required');
    const content = readContent();
    if (!series.id) {
      series.id = `series_${Date.now()}`;
    }

    const now = new Date().toISOString();
    series.addedAt = series.addedAt || now;
    series.createdAt = series.createdAt || now;
    series.releaseDate = series.releaseDate || (series.year ? (series.year + '-10-25') : now.split('T')[0]);
    series.badgeLeft = series.badgeLeft || 'Trending';
    series.views = series.views !== undefined ? parseInt(series.views, 10) : 1250;
    series.isCustom = true;
    series.type = 'series';

    // Check if series already exists to preserve existing multi-season episodes if not passed in payload
    const existingSeries = (content.series || []).find(s => s.id === series.id || (series.subjectId && (s.subjectId === series.subjectId || s.id === `mb-s-${series.subjectId}`)));
    if (existingSeries && Array.isArray(existingSeries.seasons) && existingSeries.seasons.length > 0) {
      if (!Array.isArray(series.seasons) || series.seasons.length === 0) {
        series.seasons = existingSeries.seasons;
        series.seasonsCount = existingSeries.seasonsCount || existingSeries.seasons.length;
      }
      if (!Array.isArray(series.episodes) || series.episodes.length === 0) {
        series.episodes = existingSeries.episodes || series.seasons[0]?.episodes || [];
        series.episodesCount = existingSeries.episodesCount || series.seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
      }
      if (!series.streamUrl && existingSeries.streamUrl) {
        series.streamUrl = existingSeries.streamUrl;
      }
    }

    // Auto-repair episodes if subjectId exists and episodes are missing or empty
    if (series.subjectId && (!series.episodes || series.episodes.length === 0)) {
      const sId = series.subjectId;
      const dPath = series.detailPath || '';
      if (!Array.isArray(series.seasons) || series.seasons.length === 0) {
        series.seasons = [{ seasonNumber: 1, title: 'Season 1', episodesCount: 16, episodes: [] }];
      }
      series.seasons.forEach((season, sIdx) => {
        const seNum = season.seasonNumber || (sIdx + 1);
        if (!Array.isArray(season.episodes) || season.episodes.length === 0) {
          const maxEp = Math.max(parseInt(season.maxEp || season.episodesCount, 10) || 16, 1);
          season.episodes = [];
          for (let ep = 1; ep <= maxEp; ep++) {
            const epUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}`;
            season.episodes.push({
              number: String(ep).padStart(2, '0'),
              episode: ep,
              season: seNum,
              title: `Episode ${ep}`,
              duration: '45 min',
              still: series.poster,
              streamUrl: epUrl,
              servers: [
                { name: 'Server 1 (Auto-Renewing HD)', url: epUrl, quality: '1080p', isDirect: true },
                { name: 'Server 2 (Auto Failover)', url: epUrl, quality: '1080p', isDirect: true }
              ]
            });
          }
          season.episodesCount = season.episodes.length;
        }
      });
      series.episodes = series.seasons[0]?.episodes || [];
      series.streamUrl = series.episodes[0]?.streamUrl || '';
      series.seasonsCount = series.seasons.length;
      series.episodesCount = series.seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
    }

    if (series.views !== undefined) {
      const viewsMap = readViewsMap();
      viewsMap[series.id] = parseInt(series.views, 10) || 0;
      writeViewsMap(viewsMap);
    }

    if (series.isFeatured) {
      content.featured = { ...series };
    }

    const idx = (content.series || []).findIndex(s => s.id === series.id);
    if (idx >= 0) {
      content.series[idx] = { ...content.series[idx], ...series };
    } else {
      content.series.unshift(series);
    }

    // Persist to git-immune custom catalog
    try {
      const custom = readCustomCatalog();
      if (!Array.isArray(custom.series)) custom.series = [];
      const cIdx = custom.series.findIndex(s => s.id === series.id || (s.title && s.title.trim().toLowerCase() === series.title.trim().toLowerCase()));
      if (cIdx >= 0) custom.series[cIdx] = { ...custom.series[cIdx], ...series };
      else custom.series.unshift(series);
      writeCustomCatalog(custom);
    } catch(e) {}

    writeContent(content);
    return { success: true, series };
  }

  /**
   * Delete Series
   */
  deleteSeries(id) {
    const content = readContent();
    content.series = (content.series || []).filter(s => s.id !== id);
    try {
      const custom = readCustomCatalog();
      if (Array.isArray(custom.series)) {
        custom.series = custom.series.filter(s => s.id !== id);
        writeCustomCatalog(custom);
      }
    } catch(e) {}
    writeContent(content);
    return { success: true };
  }

  /**
   * Save Live TV Channel
   */
  saveChannel(channel) {
    if (!channel.name || !channel.streamUrl) throw new Error('Channel name and streamUrl required');
    const content = readContent();
    if (!content.liveTv) content.liveTv = [];

    if (!channel.id) {
      channel.id = `ch_${Date.now()}`;
    }

    const idx = content.liveTv.findIndex(c => c.id === channel.id);
    if (idx >= 0) {
      content.liveTv[idx] = { ...content.liveTv[idx], ...channel };
    } else {
      content.liveTv.push(channel);
    }

    // Persist to git-immune custom catalog
    try {
      const custom = readCustomCatalog();
      if (!Array.isArray(custom.liveTv)) custom.liveTv = [];
      const cIdx = custom.liveTv.findIndex(t => t.id === channel.id || (t.name && t.name.trim().toLowerCase() === channel.name.trim().toLowerCase()));
      if (cIdx >= 0) custom.liveTv[cIdx] = { ...custom.liveTv[cIdx], ...channel };
      else custom.liveTv.push(channel);
      writeCustomCatalog(custom);
    } catch(e) {}

    writeContent(content);
    return { success: true, channel };
  }

  /**
   * Delete Live TV Channel
   */
  deleteChannel(id) {
    const content = readContent();
    content.liveTv = (content.liveTv || []).filter(c => c.id !== id);
    try {
      const custom = readCustomCatalog();
      if (Array.isArray(custom.liveTv)) {
        custom.liveTv = custom.liveTv.filter(t => t.id !== id);
        writeCustomCatalog(custom);
      }
    } catch(e) {}
    writeContent(content);
    return { success: true };
  }

  /**
   * Get User Requests
   */
  saveRequest(req) {
    if (!req.title) throw new Error('Title is required');
    const list = readRequests();
    const newReq = {
      id: req.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      googleId: req.googleId || 'guest',
      userName: req.userName || req.userEmail || 'FOBS TV App User',
      title: req.title.trim(),
      type: req.type || 'Movie',
      year: req.year || '',
      language: req.language || 'Hindi Dubbed',
      notes: req.notes || '',
      status: req.status || 'Pending',
      createdAt: req.createdAt || new Date().toISOString()
    };
    list.unshift(newReq);
    writeRequests(list);
    return { success: true, request: newReq };
  }

  getRequests() {
    return { success: true, requests: readRequests() };
  }

  /**
   * Update Request Status
   */
  updateRequestStatus(id, status) {
    const list = readRequests();
    const idx = list.findIndex(r => r.id === id || String(r._id) === String(id));
    if (idx >= 0) {
      list[idx].status = status;
      list[idx].updatedAt = new Date().toISOString();
      writeRequests(list);
      return { success: true, request: list[idx] };
    }
    throw new Error('Request not found');
  }

  /**
   * System Notifications & In-App Announcements
   */
  getNotifications() {
    return { success: true, notifications: readNotifications() };
  }

  saveNotification(notif) {
    if (!notif.title || !notif.message) throw new Error('Notification title and message required');
    const list = readNotifications();
    const id = notif.id || `notif_${Date.now()}`;
    const existingIndex = list.findIndex(n => n.id === id);
    const existing = existingIndex !== -1 ? list[existingIndex] : null;

    const newNotif = {
      id,
      title: notif.title.trim(),
      message: notif.message.trim(),
      tag: notif.tag || 'Notice',
      isPopup: notif.isPopup !== undefined ? !!notif.isPopup : true,
      image: (notif.image || '').trim(),
      link: (notif.link || '').trim(),
      linkText: (notif.linkText || '').trim(),
      active: notif.active !== undefined ? !!notif.active : true,
      likes: existing?.likes || 0,
      dislikes: existing?.dislikes || 0,
      userReactions: existing?.userReactions || {},
      comments: existing?.comments || [],
      time: 'Just now',
      unread: true,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    if (existingIndex !== -1) {
      list[existingIndex] = { ...list[existingIndex], ...newNotif };
    } else {
      list.unshift(newNotif);
    }

    writeNotifications(list);
    return { success: true, notification: newNotif };
  }

  deleteNotification(id) {
    let list = readNotifications();
    list = list.filter(n => n.id !== id);
    writeNotifications(list);
    return { success: true };
  }

  toggleNotificationPopup(id) {
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found' };
    item.isPopup = !item.isPopup;
    writeNotifications(list);
    return { success: true, isPopup: item.isPopup };
  }

  reactToNotification(id, userId, reactionType, userName = '') {
    if (!id || !userId || !['like', 'dislike'].includes(reactionType)) {
      return { success: false, error: 'Invalid reaction parameters' };
    }
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found' };

    if (!item.userReactions) item.userReactions = {};
    if (typeof item.likes !== 'number') item.likes = 0;
    if (typeof item.dislikes !== 'number') item.dislikes = 0;

    const prev = item.userReactions[userId];
    const prevType = typeof prev === 'string' ? prev : prev?.type;
    let myReaction = null;

    if (prevType === reactionType) {
      delete item.userReactions[userId];
      if (reactionType === 'like') item.likes = Math.max(0, item.likes - 1);
      if (reactionType === 'dislike') item.dislikes = Math.max(0, item.dislikes - 1);
      myReaction = null;
    } else {
      if (prevType === 'like') item.likes = Math.max(0, item.likes - 1);
      if (prevType === 'dislike') item.dislikes = Math.max(0, item.dislikes - 1);

      item.userReactions[userId] = {
        type: reactionType,
        userName: userName || ('User_' + String(userId).slice(-4)),
        userId,
        time: new Date().toISOString()
      };
      if (reactionType === 'like') item.likes += 1;
      if (reactionType === 'dislike') item.dislikes += 1;
      myReaction = reactionType;
    }

    writeNotifications(list);
    return {
      success: true,
      likes: item.likes,
      dislikes: item.dislikes,
      myReaction
    };
  }

  getNotificationReactions(id) {
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found', likes: [], dislikes: [] };

    const likes = [];
    const dislikes = [];
    if (item.userReactions && typeof item.userReactions === 'object') {
      for (const [uid, r] of Object.entries(item.userReactions)) {
        const type = typeof r === 'string' ? r : r.type;
        const name = (typeof r === 'object' && r.userName) ? r.userName : ('User ' + String(uid).slice(-4));
        const time = (typeof r === 'object' && r.time) ? r.time : (item.createdAt || new Date().toISOString());
        const entry = {
          userId: uid,
          userName: name,
          time,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`
        };
        if (type === 'like') likes.push(entry);
        else if (type === 'dislike') dislikes.push(entry);
      }
    }

    return {
      success: true,
      id: item.id,
      title: item.title,
      totalLikes: item.likes || likes.length,
      totalDislikes: item.dislikes || dislikes.length,
      likes,
      dislikes
    };
  }

  addNotificationCommentReply(id, commentId, replyText, author = 'FOBS TV Admin') {
    if (!id || !commentId || !replyText) {
      return { success: false, error: 'Notice ID, comment ID, and reply text are required' };
    }
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found' };

    const comment = (item.comments || []).find(c => c.id === commentId);
    if (!comment) return { success: false, error: 'Comment not found' };

    if (!Array.isArray(comment.replies)) comment.replies = [];
    const replyObj = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      author: author || 'FOBS TV Admin',
      role: 'admin',
      text: replyText.trim(),
      createdAt: new Date().toISOString()
    };
    comment.replies.push(replyObj);

    writeNotifications(list);
    return {
      success: true,
      reply: replyObj,
      comment
    };
  }

  addNotificationComment(id, commentData) {
    if (!id || !commentData || !commentData.text) {
      return { success: false, error: 'Comment text is required' };
    }
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found' };

    if (!Array.isArray(item.comments)) item.comments = [];
    const newComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: (commentData.name || 'FOBS Member').trim(),
      avatar: commentData.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(commentData.name || 'User')}`,
      text: commentData.text.trim().substring(0, 500),
      createdAt: new Date().toISOString()
    };

    item.comments.push(newComment);
    writeNotifications(list);
    return {
      success: true,
      comment: newComment,
      commentsCount: item.comments.length
    };
  }

  getNotificationComments(id) {
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found', comments: [] };
    return {
      success: true,
      comments: item.comments || []
    };
  }

  deleteNotificationComment(id, commentId) {
    const list = readNotifications();
    const item = list.find(n => n.id === id);
    if (!item) return { success: false, error: 'Announcement not found' };
    item.comments = (item.comments || []).filter(c => c.id !== commentId);
    writeNotifications(list);
    return { success: true };
  }

  getActivePopupNotification(userId = null) {
    const list = readNotifications();
    const item = list.find(n => n.isPopup && n.active !== false);
    if (!item) return { success: true, announcement: null };

    const rawReaction = (userId && item.userReactions && item.userReactions[userId]) ? item.userReactions[userId] : null;
    const myReaction = typeof rawReaction === 'string' ? rawReaction : (rawReaction?.type || null);

    return {
      success: true,
      announcement: {
        id: item.id,
        title: item.title,
        message: item.message,
        tag: item.tag || 'Notice',
        isPopup: item.isPopup,
        image: item.image || '',
        link: item.link || '',
        linkText: item.linkText || '',
        likes: item.likes || 0,
        dislikes: item.dislikes || 0,
        myReaction,
        commentsCount: (item.comments || []).length,
        comments: item.comments || [],
        createdAt: item.createdAt || ''
      }
    };
  }

  /**
   * Get Active Featured Spotlight
   */
  getFeatured() {
    const content = readContent();
    return content.featured || null;
  }

  /**
   * Set or Update Featured Spotlight Banner
   */
  setFeatured(payload) {
    if (!payload) throw new Error('Featured payload is required');
    const content = readContent();

    let featuredItem = null;
    if (payload.id) {
      const movie = (content.movies || []).find(m => m.id === payload.id);
      const series = (content.series || []).find(s => s.id === payload.id);
      const base = movie || series;
      if (base) {
        const itemType = payload.type || (movie ? 'movie' : 'series');
        featuredItem = {
          ...base,
          ...payload,
          type: itemType,
          cover: payload.cover || payload.backdrop || base.cover || base.backdrop || base.poster,
          backdrop: payload.cover || payload.backdrop || base.backdrop || base.cover || base.poster,
          poster: payload.poster || base.poster
        };
        if (itemType === 'series' && (!featuredItem.episodes || featuredItem.episodes.length === 0) && base.seasons && base.seasons[0] && base.seasons[0].episodes) {
          featuredItem.episodes = base.seasons[0].episodes;
        }
      }
    }

    if (!featuredItem) {
      if (!payload.title) throw new Error('Title is required for featured item');
      featuredItem = {
        id: payload.id || `feat_${Date.now()}`,
        title: payload.title,
        type: payload.type || 'movie',
        year: payload.year || '2026',
        rating: payload.rating || '8.5',
        poster: payload.poster || '',
        cover: payload.cover || payload.backdrop || payload.poster || '',
        backdrop: payload.cover || payload.backdrop || payload.poster || '',
        description: payload.description || '',
        streamUrl: payload.streamUrl || '',
        badgeLeft: payload.badgeLeft || 'Featured',
        badgeRight: payload.badgeRight || '4K Ultra HD',
        servers: payload.servers || (payload.streamUrl ? [{ name: 'Server 1 (Fast HD)', url: payload.streamUrl, isDirect: true }] : [])
      };
    }

    content.featured = featuredItem;
    writeContent(content);
    return { success: true, featured: featuredItem };
  }

  /**
   * Automated 15-Minute CDN Token Background Auto-Refresh Engine
   * Continuously fetches fresh MovieBox CDN signatures in parallel batches so links NEVER expire.
   */
  async refreshAllCdnTokens() {
    console.log('[CDN Refresher] ⚡ Starting active 15-minute background refresh of all MovieBox CDN streams...');
    const content = readContent();
    let refreshedMovies = 0;
    let refreshedEpisodes = 0;

    async function runBatch(tasks, concurrency = 8) {
      const results = [];
      for (let i = 0; i < tasks.length; i += concurrency) {
        const chunk = tasks.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(fn => fn().catch(() => null)));
        results.push(...chunkResults);
      }
      return results;
    }

    const tasks = [];

    // 1. Featured Spotlight
    if (content.featured) {
      const feat = content.featured;
      const sId = feat.subjectId || (feat.id && (feat.id.startsWith('mb-m-') || feat.id.startsWith('mb-s-')) ? feat.id.replace(/^mb-[sm]-/, '') : null);
      if (sId) {
        tasks.push(async () => {
          const isSer = feat.type === 'series' || (feat.seasons && feat.seasons.length > 0);
          const media = await movieboxService.resolveMedia(sId, feat.detailPath || '', isSer ? 1 : 0, isSer ? 1 : 0);
          if (media && media.streamUrl) {
            feat.streamUrl = media.streamUrl;
            feat.directStreamUrl = media.streamUrl;
            const autoUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(feat.detailPath || '')}&se=${isSer ? 1 : 0}&ep=${isSer ? 1 : 0}`;
            feat.servers = [
              { name: 'Server 1 (Direct Fast CDN)', url: media.streamUrl, quality: '1080p', audio: feat.dubLanguage || 'Hindi dub', isDirect: true },
              { name: 'Server 2 (HD - Auto-Renewing 1080p)', url: autoUrl, quality: '1080p', audio: feat.dubLanguage || 'Hindi dub', isDirect: true }
            ];
          }
        });
      }
    }

    // 2. Movies
    for (const m of (content.movies || [])) {
      const sId = m.subjectId || (m.id && m.id.startsWith('mb-m-') ? m.id.replace('mb-m-', '') : null);
      if (sId) {
        tasks.push(async () => {
          const media = await movieboxService.resolveMedia(sId, m.detailPath || '', 0, 0);
          if (media && media.streamUrl) {
            m.streamUrl = media.streamUrl;
            m.directStreamUrl = media.streamUrl;
            const autoUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(m.detailPath || '')}&se=0&ep=0`;
            m.servers = [
              { name: 'Server 1 (Direct Fast CDN)', url: media.streamUrl, quality: '1080p', audio: m.dubLanguage || 'Hindi dub', isDirect: true },
              { name: 'Server 2 (HD - Auto-Renewing 1080p)', url: autoUrl, quality: '1080p', audio: m.dubLanguage || 'Hindi dub', isDirect: true }
            ];
            refreshedMovies++;
          }
        });
      }
    }

    // 3. Series Episodes
    for (const s of (content.series || [])) {
      const sId = s.subjectId || (s.id && s.id.startsWith('mb-s-') ? s.id.replace('mb-s-', '') : null);
      if (sId && Array.isArray(s.seasons)) {
        for (const season of s.seasons) {
          const seNum = season.seasonNumber || season.season || 1;
          if (Array.isArray(season.episodes)) {
            for (const ep of season.episodes) {
              const epNum = ep.number || ep.episode || 1;
              tasks.push(async () => {
                const media = await movieboxService.resolveMedia(sId, s.detailPath || '', seNum, epNum);
                if (media && media.streamUrl) {
                  ep.streamUrl = media.streamUrl;
                  ep.directStreamUrl = media.streamUrl;
                  const autoUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(s.detailPath || '')}&se=${seNum}&ep=${epNum}`;
                  ep.servers = [
                    { name: 'Server 1 (Direct Fast CDN)', url: media.streamUrl, quality: '1080p', audio: s.dubLanguage || 'Hindi dub', isDirect: true },
                    { name: 'Server 2 (HD - Auto-Renewing 1080p)', url: autoUrl, quality: '1080p', audio: s.dubLanguage || 'Hindi dub', isDirect: true }
                  ];
                  refreshedEpisodes++;
                }
              });
            }
          }
        }
      }
    }

    // Execute in parallel batches
    await runBatch(tasks, 8);

    // Sync top-level episodes
    for (const s of (content.series || [])) {
      if (s.seasons && s.seasons[0] && s.seasons[0].episodes) {
        s.episodes = s.seasons[0].episodes;
      }
    }

    writeContent(content);
    console.log(`[CDN Refresher] ✅ Finished 15-min background refresh: ${refreshedMovies} movies & ${refreshedEpisodes} episodes refreshed at ${new Date().toLocaleTimeString()}`);
    return { success: true, refreshedMovies, refreshedEpisodes };
  }

  repairAllPlaybackStreams() {
    const content = readContent();
    let repairedSeries = 0;
    let repairedEpisodes = 0;
    let repairedMovies = 0;

    const movieBoxIdMap = {
      'tmdb-m-1654581': { sId: '2978700976560953208', path: 'daldal-hindi-s6e4P5Tt2y3' },
      'tmdb-m-1451944': { sId: '4615851813508628976', path: 'lust-stories-hindi-Otol6FjEYu5' },
      'tmdb-m-1423191': { sId: '4192178861456740576', path: 'resident-evil-M6HaKKRdGZ4' },
      'tmdb-m-1234139': { sId: '2838322006842639760', path: 'jailer-indonesian-YCa3PBMxFn3' },
      'tmdb-m-969681':  { sId: '1321879841695749848', path: 'spider-man-brand-new-day-hindi-full-movie-iHD2LTRdEz1' },
      'tmdb-m-1153576': { sId: '1050173597374890184', path: 'street-fighter-cam-2DhSc6ZNzf1' },
      'tmdb-m-1101383': { sId: '774020224193544440',  path: 'the-dark-end-of-the-street-6P6Gp6i1bV' },
      'turkish-m-785534': { sId: '331534456928489048', path: 'paper-lives-MOrS12Kquo' },
      'turkish-m-637920': { sId: '2593580836368859088', path: 'miracle-in-cell-no-7-CpdPy3VCA53' },
      'turkish-m-375784': { sId: '6754139210678502168', path: 'adini-feriha-koydum-hindi-sUF1ZoO1W28' }
    };

    function isExpiringCdn(url) {
      if (!url) return true;
      return url.includes('hakunaymatata') || url.includes('bcdnxw') || url.includes('haildrop') ||
             url.includes('fogtwist') || url.includes('sunburst') || url.includes('stormshade') ||
             url.includes('.mp4?s=') || url.includes('.mp4?sign=');
    }

    // 1. Repair Series & All Season Episodes (Covering all categories: Korean, Turkish, Anime, Hollywood, Bollywood, etc.)
    for (const s of content.series || []) {
      let sId = s.subjectId || s.mbSubjectId;
      if (!sId && s.id && s.id.startsWith('mb-s-')) {
        sId = s.id.replace('mb-s-', '');
        s.subjectId = sId;
      }
      const dPath = s.detailPath || s.mbDetailPath || s.movieboxDetailPath || '';

      if (sId) {
        let seriesTouched = false;

        // Parent streamUrl
        if (!s.streamUrl || isExpiringCdn(s.streamUrl)) {
          s.streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`;
          s.servers = [{ name: 'Fast Server (Auto-Renew)', url: s.streamUrl, isDirect: true }];
          seriesTouched = true;
        }

        // Season episodes
        if (Array.isArray(s.seasons)) {
          s.seasons.forEach((season, sIdx) => {
            const seNum = season.seasonNumber || season.season || (sIdx + 1);
            if (Array.isArray(season.episodes)) {
              season.episodes.forEach((ep, epIdx) => {
                const epNum = ep.episode || parseInt(ep.number, 10) || (epIdx + 1);
                const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${epNum}`;

                if (!ep.streamUrl || isExpiringCdn(ep.streamUrl)) {
                  ep.streamUrl = autoRenewUrl;
                  ep.servers = [
                    { name: 'Server 1 (Fast HD Auto-Renew)', url: autoRenewUrl, isDirect: true },
                    { name: 'Server 2 (Auto Failover)', url: autoRenewUrl, isDirect: true }
                  ];
                  repairedEpisodes++;
                  seriesTouched = true;
                }

                if (ep.audioTracks && typeof ep.audioTracks === 'object') {
                  for (const k of Object.keys(ep.audioTracks)) {
                    if (isExpiringCdn(ep.audioTracks[k])) {
                      ep.audioTracks[k] = autoRenewUrl;
                      seriesTouched = true;
                    }
                  }
                }
              });
            }
          });
        }

        // Top-level episodes
        if (Array.isArray(s.episodes)) {
          s.episodes.forEach((ep, epIdx) => {
            const epNum = ep.episode || parseInt(ep.number, 10) || (epIdx + 1);
            const seNum = ep.season || 1;
            const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${epNum}`;

            if (!ep.streamUrl || isExpiringCdn(ep.streamUrl)) {
              ep.streamUrl = autoRenewUrl;
              ep.servers = [
                { name: 'Server 1 (Fast HD Auto-Renew)', url: autoRenewUrl, isDirect: true },
                { name: 'Server 2 (Auto Failover)', url: autoRenewUrl, isDirect: true }
              ];
              seriesTouched = true;
            }

            if (ep.audioTracks && typeof ep.audioTracks === 'object') {
              for (const k of Object.keys(ep.audioTracks)) {
                if (isExpiringCdn(ep.audioTracks[k])) {
                  ep.audioTracks[k] = autoRenewUrl;
                  seriesTouched = true;
                }
              }
            }
          });
        }

        if (seriesTouched) repairedSeries++;
      }
    }

    // 2. Repair Movies (All categories: Hollywood, Bollywood, South, Anime, Turkish, etc.)
    for (const m of content.movies || []) {
      // Map known unlinked movies to their MovieBox counterparts
      if (movieBoxIdMap[m.id]) {
        m.subjectId = movieBoxIdMap[m.id].sId;
        m.detailPath = movieBoxIdMap[m.id].path;
      }

      let sId = m.subjectId || m.mbSubjectId;
      if (!sId && m.id && m.id.startsWith('mb-m-')) {
        sId = m.id.replace('mb-m-', '');
        m.subjectId = sId;
      }
      const dPath = m.detailPath || m.mbDetailPath || m.movieboxDetailPath || '';

      if (sId && (!m.streamUrl || isExpiringCdn(m.streamUrl))) {
        m.streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=0&ep=0`;
        m.servers = [
          { name: 'Server 1 (Fast HD Auto-Renew)', url: m.streamUrl, isDirect: true },
          { name: 'Server 2 (Direct Fast CDN)', url: m.streamUrl, isDirect: true }
        ];
        repairedMovies++;
      }
    }

    // 3. Repair Featured Hero Spotlight
    if (content.featured) {
      const feat = content.featured;
      let sId = feat.subjectId || feat.mbSubjectId;
      if (!sId && feat.id && (feat.id.startsWith('mb-m-') || feat.id.startsWith('mb-s-'))) {
        sId = feat.id.replace('mb-m-', '').replace('mb-s-', '');
        feat.subjectId = sId;
      }
      if (sId && (!feat.streamUrl || isExpiringCdn(feat.streamUrl))) {
        const isSeries = feat.type === 'series' || (feat.seasons && feat.seasons.length > 0);
        feat.streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(feat.detailPath || '')}&se=${isSeries ? 1 : 0}&ep=${isSeries ? 1 : 0}`;
        feat.servers = [
          { name: 'Server 1 (Fast HD Auto-Renew)', url: feat.streamUrl, isDirect: true }
        ];
      }
    }

    writeContent(content);
    return {
      success: true,
      repairedSeries,
      repairedEpisodes,
      repairedMovies,
      totalSeries: (content.series || []).length,
      totalMovies: (content.movies || []).length,
      timestamp: new Date().toISOString()
    };
  }

  async syncSeriesEpisodes(identifier) {
    const content = readContent();
    const seriesList = content.series || [];
    const target = seriesList.find(s => s.id === identifier || s.subjectId === identifier || String(s.subjectId) === String(identifier));
    if (!target) {
      throw new Error('Series not found in database');
    }

    const sId = target.subjectId || (target.id && target.id.startsWith('mb-s-') ? target.id.replace('mb-s-', '') : null);
    if (!sId) {
      throw new Error('This series was manually added without a MovieBox subjectId');
    }

    const autoDetail = await movieboxService.getDetail(sId);
    if (!autoDetail) {
      throw new Error('Could not fetch latest details from MovieBox');
    }

    const existingViews = target.views || 0;
    const isFeatured = content.featured && (content.featured.id === target.id || content.featured.subjectId === sId);

    const prevEpsCount = target.episodesCount || (target.seasons ? target.seasons.reduce((acc, s) => acc + (s.episodes ? s.episodes.length : 0), 0) : 0);
    const prevSeasonsCount = target.seasonsCount || (target.seasons ? target.seasons.length : 1);

    const result = await this.importFromMovieBox({
      subjectId: sId,
      detailPath: target.detailPath || autoDetail.detailPath,
      title: target.title || autoDetail.title,
      type: 'series',
      year: target.year || autoDetail.year,
      rating: target.rating || autoDetail.rating,
      category: target.category || autoDetail.category,
      industry: target.industry || autoDetail.industry,
      isHindi: target.isHindi !== undefined ? target.isHindi : autoDetail.isHindi,
      cover: target.cover || target.backdrop,
      seasonMode: 'all',
      isFeatured
    });

    if (result.success && result.item) {
      const updated = result.item;
      // Preserve original views
      updated.views = existingViews;
      const newEpsCount = updated.episodesCount || 0;
      const newSeasonsCount = updated.seasonsCount || 1;
      const diffEps = newEpsCount - prevEpsCount;
      const diffSeasons = newSeasonsCount - prevSeasonsCount;

      const latestContent = readContent();
      const idx = (latestContent.series || []).findIndex(s => s.id === updated.id);
      if (idx !== -1) {
        latestContent.series[idx].views = existingViews;
        writeContent(latestContent);
      }

      return {
        success: true,
        series: updated,
        prevEpsCount,
        newEpsCount,
        diffEps: Math.max(diffEps, 0),
        diffSeasons: Math.max(diffSeasons, 0),
        isUpdated: diffEps > 0 || diffSeasons > 0,
        message: (diffEps > 0 || diffSeasons > 0)
          ? `🎉 Updated "${updated.title}"! Added ${diffEps > 0 ? `${diffEps} new episode(s)` : ''}${diffSeasons > 0 ? ` ${diffSeasons} new season(s)` : ''}. Total: ${newEpsCount} episodes.`
          : `✓ "${updated.title}" is already up-to-date with MovieBox (${newEpsCount} episodes across ${newSeasonsCount} season(s)).`
      };
    }

    return result;
  }

  /**
   * Auto-scan all series in FOBS TV and sync any that have new episodes on MovieBox
   */
  async autoSyncAllSeries() {
    const content = readContent();
    const seriesList = content.series || [];
    const updatedSeries = [];

    for (const s of seriesList) {
      const sId = s.subjectId || (s.id && s.id.startsWith('mb-s-') ? s.id.replace('mb-s-', '') : null);
      if (!sId) continue;

      try {
        const d = await movieboxService.getDetail(sId);
        if (!d) continue;

        let dTotal = d.totalEpisodes || 0;
        if (Array.isArray(d.seasons)) {
          let sSum = 0;
          for (const sea of d.seasons) {
            let mEp = parseInt(sea.maxEp, 10) || 0;
            if (sea.allEp) {
              const count = sea.allEp.split(',').filter(Boolean).length;
              if (count > mEp) mEp = count;
            }
            sSum += mEp;
          }
          if (sSum > dTotal) dTotal = sSum;
        }
        if (!dTotal && !d.seasonsCount) continue;

        const curEps = s.episodesCount || (s.seasons ? s.seasons.reduce((acc, sea) => acc + (sea.episodes ? sea.episodes.length : 0), 0) : 0);
        const curSeasons = s.seasonsCount || (s.seasons ? s.seasons.length : 1);

        if (dTotal > curEps || (d.seasonsCount && d.seasonsCount > curSeasons)) {
          console.log(`[Auto-Sync] Detected new release for ${s.title}: ${curEps} -> ${dTotal} eps`);
          const syncRes = await this.syncSeriesEpisodes(s.id);
          if (syncRes.success && syncRes.isUpdated) {
            updatedSeries.push({
              title: s.title,
              oldEps: curEps,
              newEps: dTotal,
              added: syncRes.diffEps
            });
          }
        }
      } catch (err) {
        console.error(`Failed to check series ${s.title}:`, err.message);
      }
    }

    return {
      success: true,
      updatedCount: updatedSeries.length,
      updatedSeries,
      message: updatedSeries.length > 0
        ? `🎉 Auto-sync completed! Updated ${updatedSeries.length} series with new episodes: ${updatedSeries.map(u => `${u.title} (+${u.added} eps)`).join(', ')}`
        : '✓ All TV series are currently up-to-date with MovieBox releases.'
    };
  }

  /**
   * Real-time Check for newly released episodes on MovieBox for a specific series
   */
  async checkSeriesUpdates(identifier) {
    const content = readContent();
    const seriesList = content.series || [];
    const target = seriesList.find(s => s.id === identifier || s.subjectId === identifier || String(s.subjectId) === String(identifier));
    if (!target) throw new Error('Series not found in database');

    const sId = target.subjectId || (target.id && target.id.startsWith('mb-s-') ? target.id.replace('mb-s-', '') : null);
    if (!sId) throw new Error('This series does not have a MovieBox Subject ID linked');

    try { movieboxService.invalidateCache(sId); } catch (_) {}
    const autoDetail = await movieboxService.getDetail(sId, target.detailPath || '', { forceRefresh: true });
    if (!autoDetail) throw new Error('Could not fetch latest details from MovieBox API');

    // Existing episodes currently stored in FOBS TV
    const existingSeasons = Array.isArray(target.seasons) && target.seasons.length > 0
      ? target.seasons
      : [{ seasonNumber: 1, episodes: target.episodes || [] }];

    let currentEpisodesTotal = 0;
    const existingKeys = new Set();

    for (const s of existingSeasons) {
      const seNum = s.seasonNumber || 1;
      const eps = Array.isArray(s.episodes) ? s.episodes : [];
      currentEpisodesTotal += eps.length;
      for (const ep of eps) {
        const epNum = ep.episode || parseInt(ep.number, 10);
        existingKeys.add(`s${seNum}_e${epNum}`);
      }
    }

    // MovieBox released episodes
    const mbSeasons = Array.isArray(autoDetail.seasons) && autoDetail.seasons.length > 0
      ? autoDetail.seasons
      : [{ se: 1, maxEp: autoDetail.totalEpisodes || 1 }];

    const newEpisodes = [];
    let mbReleasedTotal = 0;

    for (const mbs of mbSeasons) {
      const seNum = parseInt(mbs.se, 10) || 1;
      let mEp = parseInt(mbs.maxEp, 10) || 0;
      if (mbs.allEp) {
        const count = mbs.allEp.split(',').filter(Boolean).length;
        if (count > mEp) mEp = count;
      }
      if (Array.isArray(mbs.resolutions)) {
        for (const r of mbs.resolutions) {
          if (r.epNum && r.epNum > mEp) mEp = r.epNum;
        }
      }
      mbReleasedTotal += mEp;

      for (let epNum = 1; epNum <= mEp; epNum++) {
        const key = `s${seNum}_e${epNum}`;
        if (!existingKeys.has(key)) {
          newEpisodes.push({
            seasonNumber: seNum,
            episode: epNum,
            episodeNumber: epNum,
            number: String(epNum).padStart(2, '0'),
            title: `Episode ${epNum}`,
            season: seNum,
            streamUrl: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(target.detailPath || autoDetail.detailPath || '')}&se=${seNum}&ep=${epNum}`,
            duration: '45 min'
          });
        }
      }
    }

    return {
      success: true,
      seriesId: target.id,
      title: target.title,
      poster: target.poster || autoDetail.poster,
      cover: target.cover || target.backdrop || autoDetail.cover,
      currentEpisodesTotal,
      mbReleasedTotal,
      newEpisodesCount: newEpisodes.length,
      newEpisodes,
      isOngoing: target.isOngoing || (mbReleasedTotal > currentEpisodesTotal)
    };
  }

  /**
   * Sync and append newly released episodes to an existing series
   */
  async syncNewSeriesEpisodes(identifier, episodesToAdd) {
    if (!Array.isArray(episodesToAdd) || episodesToAdd.length === 0) {
      throw new Error('No episodes provided to add');
    }
    const content = readContent();
    const seriesList = content.series || [];
    const target = seriesList.find(s => s.id === identifier || s.subjectId === identifier || String(s.subjectId) === String(identifier));
    if (!target) throw new Error('Series not found in database');

    if (!Array.isArray(target.seasons) || target.seasons.length === 0) {
      target.seasons = [{
        seasonNumber: 1,
        title: 'Season 1',
        name: 'Season 1',
        episodes: Array.isArray(target.episodes) ? target.episodes : []
      }];
    }

    let addedCount = 0;
    for (const newEp of episodesToAdd) {
      const seNum = parseInt(newEp.seasonNumber || newEp.season, 10) || 1;
      let season = target.seasons.find(s => (s.seasonNumber || 1) === seNum);
      if (!season) {
        season = {
          seasonNumber: seNum,
          title: `Season ${seNum}`,
          name: `Season ${seNum}`,
          episodes: []
        };
        target.seasons.push(season);
      }
      if (!Array.isArray(season.episodes)) season.episodes = [];
      const existingEpNums = new Set(season.episodes.map(e => e.episode || parseInt(e.number, 10)));
      const epNum = parseInt(newEp.episode || newEp.number, 10);
      if (!existingEpNums.has(epNum)) {
        season.episodes.push({
          episode: epNum,
          episodeNumber: epNum,
          number: String(epNum).padStart(2, '0'),
          title: newEp.title || `Episode ${epNum}`,
          season: seNum,
          streamUrl: newEp.streamUrl,
          duration: newEp.duration || '45 min'
        });
        season.episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
        season.episodesCount = season.episodes.length;
        addedCount++;
      }
    }

    target.seasons.sort((a, b) => (a.seasonNumber || 1) - (b.seasonNumber || 1));
    target.seasonsCount = target.seasons.length;
    target.episodesCount = target.seasons.reduce((sum, s) => sum + (s.episodes ? s.episodes.length : 0), 0);
    target.updatedAt = new Date().toISOString();

    const idx = content.series.findIndex(s => s.id === target.id);
    if (idx !== -1) {
      content.series[idx] = target;
      writeContent(content);
    }

    try {
      const custom = readCustomCatalog();
      if (Array.isArray(custom.series)) {
        const cIdx = custom.series.findIndex(s => s.id === target.id);
        if (cIdx !== -1) {
          custom.series[cIdx] = { ...custom.series[cIdx], ...target, isCustom: true };
          writeCustomCatalog(custom);
        }
      }
    } catch (_) {}

    return {
      success: true,
      addedCount,
      totalEpisodes: target.episodesCount,
      totalSeasons: target.seasonsCount,
      series: target,
      message: `🎉 Successfully synced ${addedCount} new episode(s)! Total: ${target.episodesCount} episodes.`
    };
  }

  /**
   * App Settings & Remote Config
   */
  getAppSettings() {
    const content = readContent();
    const appUpdate = content.appUpdate || {
      enabled: true,
      latestVersionCode: 11,
      latestVersionName: "3.1.3",
      minVersionCode: 11,
      forceUpdate: true,
      title: "জরুরি আপডেট: FOBS TV v3.1.3",
      message: "FOBS TV-র নতুন v3.1.3 ভার্সন চলে এসেছে! আপনার মোবাইলে থাকা আগের অ্যাপটি আনইনস্টল (Uninstall) করে নিচের লিংক থেকে নতুন v3.1.3 অ্যাপটি ডাউনলোড করে ইনস্টল করুন।",
      releaseNotes: [
        "⚠️ আগের অ্যাপটি আনইনস্টল (Uninstall) করে নতুন v3.1.3 ইনস্টল করুন",
        "⚡ ইনস্ট্যান্ট ভিডিও প্লেব্যাক ও বাফারিং অপ্টিমাইজেশন",
        "📺 নতুন রেট্রো লোগো এবং ফুলস্ক্রিন সোয়াইপ কন্ট্রোল",
        "📥 অফলাইন ভিডিও ডাউনলোড ও অটো-রিজিউম আপডেট"
      ],
      downloadUrl: "https://fobs-apk-download.vercel.app/",
      fallbackUrl: "https://fobs-apk-download.vercel.app/",
      fileSize: "9.2 MB"
    };

    const settings = content.settings || {
      appName: 'FOBS TV',
      appTagline: 'Infinite Entertainment Stream',
      marqueeNotice: '🔥 Welcome to FOBS TV! Watch Movies, Series & Live TV in HD without buffering.',
      maintenanceMode: false,
      maintenanceMessage: 'System maintenance in progress. We will be back shortly!',
      supportTelegram: 'https://t.me/fobs_support',
      supportWhatsApp: '',
      officialApkUrl: 'http://187.127.114.52/download/apk',
      defaultAudioLang: 'Hindi'
    };

    return { success: true, appUpdate, settings };
  }

  saveAppSettings({ appUpdate, settings }) {
    const content = readContent();
    if (appUpdate && typeof appUpdate === 'object') {
      content.appUpdate = {
        ...(content.appUpdate || {}),
        ...appUpdate
      };
      if (content.appUpdate.latestVersionCode !== undefined) {
        content.appUpdate.latestVersionCode = parseInt(content.appUpdate.latestVersionCode, 10) || 9;
      }
      if (content.appUpdate.minVersionCode !== undefined) {
        content.appUpdate.minVersionCode = parseInt(content.appUpdate.minVersionCode, 10) || 9;
      }
      if (typeof content.appUpdate.forceUpdate === 'string') {
        content.appUpdate.forceUpdate = content.appUpdate.forceUpdate === 'true';
      }
      if (typeof content.appUpdate.enabled === 'string') {
        content.appUpdate.enabled = content.appUpdate.enabled === 'true';
      }
      if (typeof content.appUpdate.releaseNotes === 'string') {
        content.appUpdate.releaseNotes = content.appUpdate.releaseNotes.split('\n').map(s => s.trim()).filter(Boolean);
      }
    }

    if (settings && typeof settings === 'object') {
      content.settings = {
        ...(content.settings || {}),
        ...settings
      };
      if (typeof content.settings.maintenanceMode === 'string') {
        content.settings.maintenanceMode = content.settings.maintenanceMode === 'true';
      }
    }

    writeContent(content);
    return { success: true, appUpdate: content.appUpdate, settings: content.settings };
  }

  /**
   * Upcoming Management
   */
  getUpcoming() {
    const content = readContent();
    return content.upcoming || [];
  }

  saveUpcoming(item) {
    if (!item || !item.title) throw new Error('Upcoming title is required');
    const content = readContent();
    if (!content.upcoming) content.upcoming = [];
    if (!item.id) {
      item.id = `up_${Date.now()}`;
    }
    item.type = 'upcoming';
    const idx = content.upcoming.findIndex(u => u.id === item.id);
    if (idx >= 0) {
      content.upcoming[idx] = { ...content.upcoming[idx], ...item };
    } else {
      content.upcoming.unshift(item);
    }
    writeContent(content);
    return { success: true, item };
  }

  deleteUpcoming(id) {
    const content = readContent();
    content.upcoming = (content.upcoming || []).filter(u => u.id !== id);
    writeContent(content);
    return { success: true };
  }

  /**
   * Deep Season & Episode Studio Management
   */
  getSeriesDetails(id) {
    const content = readContent();
    const series = (content.series || []).find(s => s.id === id);
    if (!series) throw new Error(`Series not found with ID: ${id}`);
    return { success: true, series };
  }

  saveSeriesEpisodes(seriesId, seasons) {
    if (!Array.isArray(seasons)) throw new Error('Seasons must be an array');
    const content = readContent();
    const series = (content.series || []).find(s => s.id === seriesId);
    if (!series) throw new Error(`Series not found with ID: ${seriesId}`);

    let totalEps = 0;
    seasons.forEach((season, sIdx) => {
      season.seasonNumber = season.seasonNumber !== undefined ? parseInt(season.seasonNumber, 10) : (sIdx + 1);
      season.title = season.title || `Season ${season.seasonNumber}`;
      season.name = season.name || season.title;
      if (Array.isArray(season.episodes)) {
        totalEps += season.episodes.length;
        season.episodesCount = season.episodes.length;
        season.episodes.forEach((ep, eIdx) => {
          ep.episode = ep.episode !== undefined ? parseInt(ep.episode, 10) : (eIdx + 1);
          ep.episodeNumber = ep.episode;
          ep.number = ep.number || String(ep.episode).padStart(2, '0');
          ep.title = ep.title || `Episode ${ep.episode}`;
          ep.season = season.seasonNumber;
          if (!ep.servers || !Array.isArray(ep.servers) || ep.servers.length === 0) {
            if (ep.streamUrl) {
              ep.servers = [{ name: 'Server 1 (HD)', url: ep.streamUrl, quality: '1080p', isDirect: true }];
            }
          }
        });
      } else {
        season.episodes = [];
        season.episodesCount = 0;
      }
    });

    series.seasons = seasons;
    series.seasonsCount = seasons.length;
    series.episodesCount = totalEps;
    series.totalEpisodes = totalEps;
    if (seasons.length > 0 && seasons[0].episodes && seasons[0].episodes.length > 0) {
      series.episodes = seasons[0].episodes;
      series.streamUrl = series.episodes[0].streamUrl || series.streamUrl;
      series.servers = series.episodes[0].servers || series.servers;
    }
    series.duration = seasons.length > 1 ? `${seasons.length} Seasons (${totalEps} Episodes)` : `${totalEps} Episodes`;

    try {
      const custom = readCustomCatalog();
      if (Array.isArray(custom.series)) {
        const cIdx = custom.series.findIndex(s => s.id === seriesId);
        if (cIdx >= 0) {
          custom.series[cIdx] = { ...custom.series[cIdx], ...series };
          writeCustomCatalog(custom);
        }
      }
    } catch (e) {}

    writeContent(content);
    return { success: true, series, totalEpisodes: totalEps, seasonsCount: seasons.length };
  }

  /**
   * Backup & Restore
   */
  getBackupCatalog() {
    return readContent();
  }

  restoreBackupCatalog(catalogData) {
    if (!catalogData || typeof catalogData !== 'object') {
      throw new Error('Invalid catalog data');
    }
    if (!Array.isArray(catalogData.movies) || !Array.isArray(catalogData.series)) {
      throw new Error('Backup data must contain movies and series arrays');
    }
    catalogData.movies = catalogData.movies || [];
    catalogData.series = catalogData.series || [];
    catalogData.liveTv = Array.isArray(catalogData.liveTv) ? catalogData.liveTv : [];
    catalogData.upcoming = Array.isArray(catalogData.upcoming) ? catalogData.upcoming : [];
    writeContent(catalogData);
    return {
      success: true,
      stats: {
        movies: catalogData.movies.length,
        series: catalogData.series.length,
        liveTv: catalogData.liveTv.length,
        upcoming: catalogData.upcoming.length
      }
    };
  }

  /**
   * 1-Click Cloud Deployment to VPS
   */
  async triggerVpsDeploy() {
    try {
      const resp = await axios.post('http://187.127.114.52/api/deploy', {
        secret: 'fobs_deploy_2026'
      }, {
        headers: { 'x-deploy-secret': 'fobs_deploy_2026' },
        timeout: 45000
      });
      return { success: true, data: resp.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'VPS deployment request failed'
      };
    }
  }

}

module.exports = new AdminService();
