/**
 * FOBS TV - Web Admin Panel Service
 * Secure management for Content, MovieBox 1-Click Importer, Live TV, User Requests & Announcements
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
    let totalViews = 0;
    try {
      if (fs.existsSync(VIEWS_FILE)) {
        const views = JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
        totalViews = Object.values(views).reduce((acc, v) => acc + (typeof v === 'number' ? v : 1), 0);
      }
    } catch (e) {}

    const requests = readRequests();
    const notifications = readNotifications();

    const mem = process.memoryUsage();
    return {
      success: true,
      stats: {
        totalMovies: (content.movies || []).length,
        totalSeries: (content.series || []).length,
        totalChannels: (content.liveTv || []).length,
        totalViews,
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
   * Get all content for admin view
   */
  getContent() {
    const content = readContent();
    return {
      success: true,
      data: {
        movies: content.movies || [],
        series: content.series || [],
        liveTv: content.liveTv || [],
        categories: content.categories || [],
        industries: content.industries || []
      }
    };
  }

  /**
   * Search MovieBox API directly for admin importer
   */
  async searchMovieBox(query) {
    if (!query) return { success: true, items: [] };
    const items = await movieboxService.search(query);
    return { success: true, items };
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
        poster: poster || mb.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: poster || mb.poster,
        genre: 'Action, Thriller',
        duration: '2h 00m',
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        audioTracks: isHindi ? ['Hindi dub', 'Original Audio'] : ['Original Audio'],
        selectedAudio: isHindi ? 'Hindi dub' : 'Original Audio',
        streamUrl: mb.streamUrl,
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
        poster: poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: poster,
        duration: `${episodes.length} Episodes`,
        episodesCount: episodes.length,
        category,
        industry,
        language: isHindi ? 'Hindi' : 'English',
        dubLanguage: isHindi ? 'Hindi' : 'Original',
        seasonsCount: 1,
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
   * Save or Update Movie
   */
  saveMovie(movie) {
    if (!movie.title) throw new Error('Movie title is required');
    const content = readContent();
    if (!movie.id) {
      movie.id = `movie_${Date.now()}`;
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
