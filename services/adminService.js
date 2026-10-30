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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fobs2026admin';
const JWT_SECRET = process.env.JWT_SECRET || 'fobs_tv_admin_secret_key_2026';

function atomicWriteFile(targetFile, dataStr) {
  const dir = path.dirname(targetFile);
  const tmpFile = path.join(dir, `.${path.basename(targetFile)}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`);
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

  // Load persistent local copy (immune to git checkout/pull)
  let localData = null;
  if (fs.existsSync(CONTENT_LOCAL_FILE)) {
    try {
      localData = JSON.parse(fs.readFileSync(CONTENT_LOCAL_FILE, 'utf8'));
    } catch(e) {}
  }

  // Load backup copy
  let backupData = null;
  if (fs.existsSync(CONTENT_BACKUP_FILE)) {
    try {
      backupData = JSON.parse(fs.readFileSync(CONTENT_BACKUP_FILE, 'utf8'));
    } catch(e) {}
  }

  if (!mainData) {
    mainData = localData || backupData || { featured: {}, movies: [], series: [], liveTv: [], categories: [], industries: [], upcoming: [] };
  }

  mainData.movies = Array.isArray(mainData.movies) ? mainData.movies : [];
  mainData.series = Array.isArray(mainData.series) ? mainData.series : [];
  mainData.liveTv = Array.isArray(mainData.liveTv) ? mainData.liveTv : [];
  mainData.upcoming = Array.isArray(mainData.upcoming) ? mainData.upcoming : [];

  // ANTI-LOSS VAULT MERGE:
  // If localData or backupData has items that mainData is missing (e.g. after a git pull/checkout),
  // merge them by ID so nothing added in Admin is ever lost!
  let needsSyncBack = false;
  const sources = [localData, backupData];
  for (const src of sources) {
    if (!src) continue;

    // Merge movies
    if (Array.isArray(src.movies)) {
      const existingMovieIds = new Set(mainData.movies.map(m => m.id));
      for (const m of src.movies) {
        if (m && m.id && !existingMovieIds.has(m.id)) {
          mainData.movies.push(m);
          existingMovieIds.add(m.id);
          needsSyncBack = true;
        }
      }
    }

    // Merge series
    if (Array.isArray(src.series)) {
      const existingSeriesIds = new Set(mainData.series.map(s => s.id));
      for (const s of src.series) {
        if (s && s.id && !existingSeriesIds.has(s.id)) {
          mainData.series.push(s);
          existingSeriesIds.add(s.id);
          needsSyncBack = true;
        }
      }
    }

    // Merge liveTv
    if (Array.isArray(src.liveTv) && src.liveTv.length > 0 && mainData.liveTv.length === 0) {
      mainData.liveTv = src.liveTv;
      needsSyncBack = true;
    }

    // Merge upcoming
    if (Array.isArray(src.upcoming)) {
      const existingUpcomingIds = new Set(mainData.upcoming.map(u => u.id));
      for (const u of src.upcoming) {
        if (u && u.id && !existingUpcomingIds.has(u.id)) {
          mainData.upcoming.push(u);
          existingUpcomingIds.add(u.id);
          needsSyncBack = true;
        }
      }
    }
  }

  if (needsSyncBack) {
    try {
      const jsonStr = JSON.stringify(mainData, null, 2);
      atomicWriteFile(CONTENT_FILE, jsonStr);
      atomicWriteFile(CONTENT_BACKUP_FILE, jsonStr);
      atomicWriteFile(CONTENT_LOCAL_FILE, jsonStr);
      console.log(`[readContent] Auto-healed catalog! Total movies: ${mainData.movies.length}, series: ${mainData.series.length}`);
    } catch (e) {}
  }

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
    const token = authHeader && authHeader.split(' ')[1] ? authHeader.split(' ')[1] : req.cookies?.adminToken || req.query.admin_token;
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
  getContent() {
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
      return { ...s, views: count };
    });

    return {
      success: true,
      data: {
        movies,
        series,
        liveTv: content.liveTv || [],
        categories: content.categories || [],
        industries: content.industries || [],
        viewsMap
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

  /**
   * Get Recent & Trending Releases from MovieBox Live Feed (with smart deduplication)
   */
  async getMovieBoxRecent(filter = 'all', hideImported = true) {
    const sections = await movieboxService.getHomepage();
    const content = readContent();

    const existingIds = new Set([
      ...(content.movies || []).map(m => String(m.subjectId || m.id)),
      ...(content.series || []).map(s => String(s.subjectId || s.id))
    ]);

    const existingTitles = new Set([
      ...(content.movies || []).map(m => this.normTitle(m.title)),
      ...(content.series || []).map(s => this.normTitle(s.title))
    ]);

    const seen = new Set();
    const allItems = [];

    for (const sec of sections) {
      for (const it of sec.items) {
        if (!it.id || seen.has(it.id)) continue;
        seen.add(it.id);

        const sid = String(it.subjectId || it.id);
        const titleNorm = this.normTitle(it.title);

        const alreadyImported = existingIds.has(sid) ||
          existingIds.has('mb-m-' + sid) ||
          existingIds.has('mb-s-' + sid) ||
          existingTitles.has(titleNorm);

        allItems.push({
          ...it,
          section: sec.title,
          alreadyImported
        });
      }
    }

    let filtered = allItems;
    if (filter === 'trending') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('trending') || (i.section || '').toLowerCase().includes('top'));
    } else if (filter === 'cinema') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('cinema'));
    } else if (filter === 'bollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('bollywood') || (i.section || '').toLowerCase().includes('south') || (i.title || '').toLowerCase().includes('hindi'));
    } else if (filter === 'hollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('hollywood') || (i.section || '').toLowerCase().includes('western'));
    } else if (filter === 'series') {
      filtered = allItems.filter(i => i.type === 'series' || (i.section || '').toLowerCase().includes('series') || (i.section || '').toLowerCase().includes('drama'));
    } else if (filter === 'anime') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('anime'));
    }

    const unimportedCount = filtered.filter(i => !i.alreadyImported).length;
    const finalItems = hideImported ? filtered.filter(i => !i.alreadyImported) : filtered;

    return {
      success: true,
      filter,
      hideImported,
      totalCount: allItems.length,
      filteredCount: filtered.length,
      unimportedCount,
      alreadyImportedCount: filtered.length - unimportedCount,
      items: finalItems
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
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('trending') || (i.section || '').toLowerCase().includes('top'));
    } else if (filter === 'cinema') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('cinema'));
    } else if (filter === 'bollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('bollywood') || (i.section || '').toLowerCase().includes('south') || (i.title || '').toLowerCase().includes('hindi'));
    } else if (filter === 'hollywood') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('hollywood') || (i.section || '').toLowerCase().includes('western'));
    } else if (filter === 'series') {
      filtered = allItems.filter(i => i.type === 'series' || (i.section || '').toLowerCase().includes('series') || (i.section || '').toLowerCase().includes('drama'));
    } else if (filter === 'anime') {
      filtered = allItems.filter(i => (i.section || '').toLowerCase().includes('anime'));
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
   */
  async searchMovieBox(query) {
    if (!query) return { success: true, items: [] };
    const items = await movieboxService.search(query);
    const content = readContent();
    const existingIds = new Set([
      ...(content.movies || []).map(m => String(m.subjectId || m.id)),
      ...(content.series || []).map(s => String(s.subjectId || s.id))
    ]);

    const formatted = items.map(it => ({
      ...it,
      alreadyImported: existingIds.has(String(it.subjectId || it.id)) ||
        existingIds.has(`mb-m-${it.subjectId || it.id}`) ||
        existingIds.has(`mb-s-${it.subjectId || it.id}`)
    }));

    return { success: true, items: formatted };
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
      episodesCount = 1
    } = payload;

    if (!subjectId) {
      throw new Error('subjectId is required for import');
    }

    // Auto-fetch full metadata, total uploaded episodes, and categories from MovieBox
    const autoDetail = await movieboxService.getDetail(subjectId);
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
    if (!episodesCount || episodesCount <= 0) episodesCount = type === 'series' ? 10 : 1;

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
        description: `${finalTitle} - Available in high definition on FOBS TV.`
      };

      content.movies = (content.movies || []).filter(m => m.id !== newMovie.id && m.subjectId !== subjectId);
      content.movies.unshift(newMovie);
      if (payload.isFeatured) {
        content.featured = { ...newMovie };
      }
      writeContent(content);

      return { success: true, item: newMovie };
    } else {
      // Import Series (Full Multi-Season Support)
      const finalTitle = isHindi && !title.toLowerCase().includes('hindi') ? `${title} [Hindi]` : title;
      const seasonMode = payload.seasonMode || 'all';

      // Determine seasons to import
      let targetSeasons = [];
      if (autoDetail && Array.isArray(autoDetail.seasons) && autoDetail.seasons.length > 0) {
        if (seasonMode !== 'all') {
          const seNum = parseInt(seasonMode, 10);
          const found = autoDetail.seasons.find(s => s.se === seNum);
          if (found) {
            targetSeasons = [{ se: found.se, maxEp: episodesCount || found.maxEp }];
          } else {
            targetSeasons = [{ se: seNum, maxEp: episodesCount || 10 }];
          }
        } else {
          targetSeasons = autoDetail.seasons.map(s => ({ se: s.se, maxEp: s.maxEp }));
        }
      } else {
        const seNum = seasonMode !== 'all' ? (parseInt(seasonMode, 10) || 1) : 1;
        targetSeasons = [{ se: seNum, maxEp: episodesCount || 10 }];
      }

      const seasons = [];
      let totalEpisodesImported = 0;

      for (const sInfo of targetSeasons) {
        const seNum = sInfo.se;
        const maxEp = Math.min(Math.max(parseInt(sInfo.maxEp, 10) || 1, 1), 150);
        const seasonEpisodes = [];

        // Pre-resolve episode 1 of this season for resolution, sample duration, and subtitle tracks
        let sampleRes = 1080;
        let sampleDuration = '45 min';
        let sampleCaptions = [];
        let directSampleUrl = '';
        try {
          const sampleMb = await movieboxService.resolveMedia(subjectId, detailPath, seNum, 1);
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
            ],
            captions: epCaptions,
            subtitles: epCaptions
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
        description: `${finalTitle} - ${durationStr} streaming in HD on FOBS TV.`
      };

      content.series = (content.series || []).filter(s => s.id !== newSeries.id && s.subjectId !== subjectId);
      content.series.unshift(newSeries);
      if (payload.isFeatured) {
        content.featured = { ...newSeries };
      }
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
          episodesCount: isSeries ? 10 : 1
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
    writeContent(content);
    return { success: true, movie };
  }

  /**
   * Delete Movie
   */
  deleteMovie(id) {
    const content = readContent();
    content.movies = (content.movies || []).filter(m => m.id !== id);
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
    series.type = 'series';

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
    writeContent(content);
    return { success: true, series };
  }

  /**
   * Delete Series
   */
  deleteSeries(id) {
    const content = readContent();
    content.series = (content.series || []).filter(s => s.id !== id);
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
    writeContent(content);
    return { success: true, channel };
  }

  /**
   * Delete Live TV Channel
   */
  deleteChannel(id) {
    const content = readContent();
    content.liveTv = (content.liveTv || []).filter(c => c.id !== id);
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
   * System Notifications
   */
  getNotifications() {
    return { success: true, notifications: readNotifications() };
  }

  saveNotification(notif) {
    if (!notif.title || !notif.message) throw new Error('Notification title and message required');
    const list = readNotifications();
    const newNotif = {
      id: notif.id || `notif_${Date.now()}`,
      title: notif.title,
      message: notif.message,
      tag: notif.tag || 'System',
      time: 'Just now',
      unread: true,
      createdAt: new Date().toISOString()
    };
    list.unshift(newNotif);
    writeNotifications(list);
    return { success: true, notification: newNotif };
  }

  deleteNotification(id) {
    let list = readNotifications();
    list = list.filter(n => n.id !== id);
    writeNotifications(list);
    return { success: true };
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
        if (!d || !d.totalEpisodes) continue;

        const curEps = s.episodesCount || (s.seasons ? s.seasons.reduce((acc, sea) => acc + (sea.episodes ? sea.episodes.length : 0), 0) : 0);
        const curSeasons = s.seasonsCount || (s.seasons ? s.seasons.length : 1);

        if (d.totalEpisodes > curEps || (d.seasonsCount && d.seasonsCount > curSeasons)) {
          console.log(`[Auto-Sync] Detected new release for ${s.title}: ${curEps} -> ${d.totalEpisodes} eps`);
          const syncRes = await this.syncSeriesEpisodes(s.id);
          if (syncRes.success && syncRes.isUpdated) {
            updatedSeries.push({
              title: s.title,
              oldEps: curEps,
              newEps: d.totalEpisodes,
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
   * App Settings & Remote Config
   */
  getAppSettings() {
    const content = readContent();
    const appUpdate = content.appUpdate || {
      enabled: true,
      latestVersionCode: 9,
      latestVersionName: "3.1.1",
      minVersionCode: 9,
      forceUpdate: true,
      title: "New FOBS TV Update (v3.1.1) Available!",
      message: "Please update FOBS TV to the latest version.",
      releaseNotes: [
        "⚠️ আগের অ্যাপটি আনইনস্টল করে নতুন v3.1.1 ইনস্টল করুন",
        "MX Player Style: সাবটাইটেল টেনে উপরে নিচে সরানোর সুবিধা",
        "ইনস্ট্যান্ট প্লেব্যাক ও কোনো ধরনের বাফারিং সমস্যা নেই",
        "ইন-অ্যাপ অফলাইন ডাউনলোড এবং অফলাইন ওয়াচিং",
        "মাল্টি-অডিও ও আল্ট্রা ফাস্ট স্ট্রিমিং"
      ],
      downloadUrl: "https://fobs-apk-download.vercel.app/",
      fallbackUrl: "http://187.127.114.52/download/apk",
      fileSize: "6.1 MB"
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
