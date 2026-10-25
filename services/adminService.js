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
const VIEWS_FILE = path.join(__dirname, '..', 'data', 'views.json');
const REQUESTS_FILE = path.join(__dirname, '..', 'data', 'requests.json');
const NOTIFICATIONS_FILE = path.join(__dirname, '..', 'data', 'notifications.json');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fobs2026admin';
const JWT_SECRET = process.env.JWT_SECRET || 'fobs_tv_admin_secret_key_2026';

function readContent() {
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading content.json in adminService:', err);
  }
  return { featured: {}, movies: [], series: [], liveTv: [], categories: [], industries: [] };
}

function writeContent(content) {
  try {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing content.json in adminService:', err);
    throw err;
  }
}

function readNotifications() {
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
    return true;
  } catch (e) {
    console.error('Error writing notifications.json:', e);
  }
  return false;
}

function readRequests() {
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
    return true;
  } catch (e) {
    console.error('Error writing requests.json:', e);
  }
  return false;
}

function readViewsMap() {
  try {
    if (fs.existsSync(VIEWS_FILE)) {
      return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function writeViewsMap(map) {
  try {
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(map, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing views.json:', e);
  }
  return false;
}

class AdminService {
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
  getStats() {
    const content = readContent();
    const viewsMap = readViewsMap();
    let totalViews = 0;

    for (const v of Object.values(viewsMap)) {
      if (typeof v === 'number') totalViews += v;
    }

    for (const m of content.movies || []) {
      if (m.views && !viewsMap[m.id]) totalViews += m.views;
    }
    for (const s of content.series || []) {
      if (s.views && !viewsMap[s.id]) totalViews += s.views;
    }

    const requests = readRequests();
    const notifications = readNotifications();

    const mem = process.memoryUsage();
    return {
      success: true,
      stats: {
        totalMovies: (content.movies || []).length,
        totalSeries: (content.series || []).length,
        totalChannels: (content.liveTv || []).length,
        totalViews: Math.max(totalViews, 0),
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
    const {
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

    if (!subjectId || !title) {
      throw new Error('subjectId and title are required for import');
    }

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
        optBackdrop = tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbItem.backdrop_path}` : optPoster;
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
        backdrop: optBackdrop || poster || mb.poster,
        genre: 'Action, Thriller',
        duration: '2h 00m',
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        audioTracks: isHindi ? ['Hindi dub', 'Original Audio'] : ['Original Audio'],
        selectedAudio: isHindi ? 'Hindi dub' : 'Original Audio',
        streamUrl: mb.streamUrl,
        views: 0,
        servers: [
          {
            name: `Server 1 (${isHindi ? 'Hindi Dub' : 'HD'} - Fast ${resName}p)`,
            url: mb.streamUrl,
            quality: `${resName}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          },
          ...(mb.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 2} (${q.resolution}p SD)`,
            url: q.url,
            quality: `${q.resolution}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          })),
          {
            name: `Server ${(mb.qualities?.length || 1) + 1} (Auto-Renewing Stream)`,
            url: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}`,
            quality: `${resName}p`,
            audio: isHindi ? 'Hindi dub' : 'Original Audio',
            isDirect: true
          }
        ],
        captions: formattedCaptions,
        subtitles: formattedCaptions,
        description: `${finalTitle} - Available in high definition on FOBS TV.`
      };

      content.movies = (content.movies || []).filter(m => m.id !== newMovie.id && m.subjectId !== subjectId);
      content.movies.unshift(newMovie);
      writeContent(content);

      return { success: true, item: newMovie };
    } else {
      // Import Series
      const count = Math.min(Math.max(parseInt(episodesCount, 10) || 1, 1), 50);
      const finalTitle = isHindi && !title.toLowerCase().includes('hindi') ? `${title} [Hindi]` : title;
      const episodes = [];

      for (let ep = 1; ep <= count; ep++) {
        const mb = await movieboxService.resolveMedia(subjectId, detailPath, 1, ep);
        if (!mb || !mb.streamUrl) break;

        const epCaptions = (mb.captions || []).map((c, i) => ({
          id: `ep${ep}_sub_${c.language}_${i}`,
          label: c.language === 'en' ? 'English' : (c.language === 'hi' ? 'हिन्दी' : c.language),
          language: c.language,
          srclang: c.language,
          src: c.url,
          url: c.url,
          format: c.url && c.url.includes('.srt') ? 'srt' : 'vtt'
        }));

        const res = mb.resolution || 1080;
        episodes.push({
          number: ep,
          episode: ep,
          season: 1,
          title: `Episode ${ep}`,
          duration: '45 min',
          still: poster,
          stillPath: poster,
          streamUrl: mb.streamUrl,
          servers: [
            {
              name: `Server 1 (${isHindi ? 'Hindi Dub' : 'HD'} - Fast ${res}p)`,
              url: mb.streamUrl,
              quality: `${res}p`,
              audio: isHindi ? 'Hindi dub' : 'Original Audio',
              isDirect: true
            },
            {
              name: `Server 2 (Auto-Renewing Stream)`,
              url: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}`,
              quality: `${res}p`,
              audio: isHindi ? 'Hindi dub' : 'Original Audio',
              isDirect: true
            }
          ],
          captions: epCaptions,
          subtitles: epCaptions
        });
      }

      const newSeries = {
        id: `mb-s-${subjectId}`,
        subjectId,
        detailPath,
        title: finalTitle,
        year: String(year),
        rating: String(rating),
        imdbRating: String(rating),
        poster: optPoster || poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: optBackdrop || poster,
        duration: `${episodes.length} Episodes`,
        episodesCount: episodes.length,
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        seasonsCount: 1,
        views: 0,
        seasons: [
          {
            seasonNumber: 1,
            title: 'Season 1',
            name: 'Season 1',
            year: String(year),
            episodesCount: episodes.length,
            episodes
          }
        ],
        description: `${finalTitle} - Full season streaming on FOBS TV.`
      };

      content.series = (content.series || []).filter(s => s.id !== newSeries.id && s.subjectId !== subjectId);
      content.series.unshift(newSeries);
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

    if (movie.views !== undefined) {
      const viewsMap = readViewsMap();
      viewsMap[movie.id] = parseInt(movie.views, 10) || 0;
      writeViewsMap(viewsMap);
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

    if (series.views !== undefined) {
      const viewsMap = readViewsMap();
      viewsMap[series.id] = parseInt(series.views, 10) || 0;
      writeViewsMap(viewsMap);
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
}

module.exports = new AdminService();
