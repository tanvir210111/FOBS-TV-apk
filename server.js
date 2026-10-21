const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'content.json');

// Helper to read data
function getContentData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading data:', err);
    return { featured: {}, movies: [], series: [], liveTv: [] };
  }
}

// Helper to save data
function saveContentData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// In-memory cache for resolved Google usercontent & direct streams (TTL: 4 hours)
const streamUrlCache = new Map();

// Extract Google Drive / KMDL / Direct Cloud URLs
async function resolveStreamUrl(rawUrl) {
  if (!rawUrl) return null;

  // Check memory cache first (instant 0ms response)
  const cached = streamUrlCache.get(rawUrl);
  if (cached && cached.expireAt > Date.now()) {
    return cached.url;
  }

  let resolved = rawUrl;

  // 1. Check if it's from kmdl.eu.org
  if (rawUrl.includes('kmdl.eu.org')) {
    if (rawUrl.includes('download.aspx')) {
      resolved = rawUrl;
    } else {
      try {
        const urlObj = new URL(rawUrl);
        const postUrl = `https://kmdl.eu.org${urlObj.pathname}`;
        const res = await axios.post(postUrl, { page_index: 0, password: '' }, { timeout: 8000 });
        const files = res.data && res.data.data && res.data.data.files;
        if (files && files.length > 0) {
          const videoFile = files.find(f => f.link);
          if (videoFile) resolved = `https://kmdl.eu.org${videoFile.link}`;
        }
      } catch (e) {
        console.error('KMDL Auto-resolve error:', e.message);
      }
    }
  }

  // 2. Check standard Google Drive URL
  else if (rawUrl.includes('drive.google.com') || rawUrl.includes('drive.usercontent.google.com')) {
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|drive\.usercontent\.google\.com\/download\?id=)([a-zA-Z0-9_-]+)/;
    const match = rawUrl.match(driveRegex);
    if (match && match[1]) {
      resolved = `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&authuser=0&confirm=t`;
    }
  }

  // 3. Check V-Cloud / Fast-DL / NexDrive / VegaCloud links (resolves to direct Google usercontent stream)
  else if (rawUrl.includes('vcloud.you') || rawUrl.includes('fast-dl.one') || rawUrl.includes('nexdrive')) {
    const codeMatch = rawUrl.match(/(?:dl\/|file\/|code=|\/)([a-f0-9]{6})(?:[^\w]|$)/i);
    const code = codeMatch ? codeMatch[1] : null;
    if (code) {
      try {
        const vcloudApi = `https://vcloud.you/dl.php?code=${code}&prepare=1`;
        const res = await axios.get(vcloudApi, {
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 8000
        });
        if (res.data && res.data.ok && (res.data.url || res.data.direct_url)) {
          resolved = res.data.url || res.data.direct_url;
        }
      } catch (err) {
        console.error('V-Cloud / Fast-DL resolve error:', err.message);
      }
    }
  }

  if (resolved) {
    streamUrlCache.set(rawUrl, {
      url: resolved,
      expireAt: Date.now() + 4 * 60 * 60 * 1000
    });
  }

  return resolved;
}

// Background pre-warming of series streams into memory
function prewarmEpisodeStreams() {
  try {
    const data = getContentData();
    if (data.series) {
      data.series.forEach(s => {
        if (s.episodes) {
          s.episodes.forEach(ep => {
            if (ep.streamUrl && ep.streamUrl.includes('vcloud.you')) {
              resolveStreamUrl(ep.streamUrl).catch(() => {});
            }
          });
        }
      });
    }
  } catch (e) {}
}
setTimeout(prewarmEpisodeStreams, 1500);

// API: Instant URL Resolver (CORS-enabled for Web and Android App)
app.get('/api/resolve', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });
  try {
    const resolved = await resolveStreamUrl(targetUrl);
    res.json({ ok: !!resolved, url: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get all contents
app.get('/api/content', (req, res) => {
  const data = getContentData();
  if (data.movies) data.movies.forEach(m => m.type = 'movie');
  if (data.series) data.series.forEach(s => s.type = 'series');
  if (data.liveTv) data.liveTv.forEach(t => t.type = 'liveTv');
  if (data.upcoming) data.upcoming.forEach(u => u.type = u.type || 'series');
  res.json(data);
});

// API: Add new content (Movie / Series / Live TV)
app.post('/api/content', (req, res) => {
  const { type, title, language, genre, poster, streamUrl, rating, year, seasonsCount, episodes } = req.body;
  if (!title || !streamUrl) {
    return res.status(400).json({ error: 'Title and Stream URL are required' });
  }

  const data = getContentData();
  const newId = `${type === 'series' ? 's' : type === 'liveTv' ? 'tv' : 'm'}-${Date.now()}`;

  const newItem = {
    id: newId,
    title,
    language: language || 'Hindi',
    genre: genre || 'Action',
    poster: poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
    rating: rating || '7.5',
    year: year || '2025',
    streamUrl,
    tag: 'HD',
    audioTracks: ['Hindi dub', 'Original Audio']
  };

  if (type === 'series') {
    newItem.seasonsCount = seasonsCount || 1;
    newItem.episodes = episodes && episodes.length > 0 ? episodes : [
      { number: '01', title: 'Episode 1', duration: '45m', streamUrl }
    ];
    data.series.unshift(newItem);
  } else if (type === 'liveTv') {
    newItem.badge = 'LIVE';
    newItem.category = genre || 'Sports';
    newItem.logo = newItem.poster;
    data.liveTv.unshift(newItem);
  } else {
    newItem.category = 'Trending Movies';
    data.movies.unshift(newItem);
  }

  saveContentData(data);
  res.json({ success: true, item: newItem });
});

// Stream Proxy: Handles Google Drive & Direct links with Range (Byte-level Seeking)
app.get('/api/stream', async (req, res) => {
  let targetUrl = req.query.url;

  if (!targetUrl || targetUrl === 'undefined' || targetUrl === 'null') {
    return res.status(400).send('Missing video URL parameter');
  }

  const resolvedUrl = await resolveStreamUrl(targetUrl);
  const range = req.headers.range;

  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  if (range) {
    requestHeaders['Range'] = range;
  }

  try {
    const response = await axios({
      method: 'GET',
      url: resolvedUrl,
      headers: requestHeaders,
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 12000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    let contentType = response.headers['content-type'];
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = (targetUrl && (targetUrl.includes('.mkv') || targetUrl.includes('matroska'))) ? 'video/x-matroska' : 'video/mp4';
    }

    const headersToSend = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };

    if (response.headers['content-range']) {
      headersToSend['Content-Range'] = response.headers['content-range'];
    }
    if (response.headers['content-length']) {
      headersToSend['Content-Length'] = response.headers['content-length'];
    }

    res.writeHead(response.status, headersToSend);
    response.data.pipe(res);

    response.data.on('error', (err) => {
      console.error('Stream pipe error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
    });

  } catch (error) {
    console.error('Stream proxy error:', error.message);
    if (!res.headersSent) {
      // Fallback: direct redirect if proxy stream blocked by origin
      res.redirect(resolvedUrl);
    }
  }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
  const targetUrl = req.query.url;
  const filename = req.query.title ? `${req.query.title.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_')}.mp4` : 'video.mp4';

  if (!targetUrl) {
    return res.status(400).send('Missing video URL parameter');
  }

  const resolvedUrl = await resolveStreamUrl(targetUrl);

  try {
    const response = await axios({
      method: 'GET',
      url: resolvedUrl,
      responseType: 'stream',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error('Download error:', err.message);
    // If stream fails, direct redirect to download
    res.redirect(resolvedUrl);
  }
});

const { syncFromKmdlAndTmdb } = require('./services/kmdlSync');

// API: Sync KMDL Content with TMDB Posters and Metadata
app.post('/api/sync-kmdl', async (req, res) => {
  try {
    const { moviesCount = 6, seriesCount = 4 } = req.body || {};
    const synced = await syncFromKmdlAndTmdb(moviesCount, seriesCount);

    const currentData = getContentData();

    // Merge without duplicates
    for (const m of synced.movies) {
      if (!currentData.movies.some(item => item.title === m.title)) {
        currentData.movies.unshift(m);
      }
    }

    for (const s of synced.series) {
      if (!currentData.series.some(item => item.title === s.title)) {
        currentData.series.unshift(s);
      }
    }

    saveContentData(currentData);
    res.json({ success: true, addedMovies: synced.movies.length, addedSeries: synced.series.length });
  } catch (err) {
    console.error('Sync KMDL + TMDB error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Get Full TMDB Details including Overview and Starring Cast (Screenshot 2 Match)
const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

app.get('/api/tmdb-details', async (req, res) => {
  const { title, type, year } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Clean title: remove [Hindi], tags, emojis
  const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  const isTv = type === 'series' || type === 'tv';

  try {
    const searchEndpoint = isTv ? 'https://api.themoviedb.org/3/search/tv' : 'https://api.themoviedb.org/3/search/movie';
    const searchRes = await axios.get(searchEndpoint, {
      params: {
        api_key: TMDB_API_KEY,
        query: cleanTitle,
        year: (!isTv && year) ? year : undefined,
        first_air_date_year: (isTv && year) ? year : undefined
      },
      timeout: 7000
    });

    const match = searchRes.data?.results?.[0];
    if (!match) {
      return res.json({
        title,
        overview: 'No detailed overview available on TMDB.',
        rating: '7.5',
        year: year || '2026',
        cast: []
      });
    }

    // Fetch credits & details
    const detailsEndpoint = isTv 
      ? `https://api.themoviedb.org/3/tv/${match.id}`
      : `https://api.themoviedb.org/3/movie/${match.id}`;

    const detailsRes = await axios.get(detailsEndpoint, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits'
      },
      timeout: 7000
    });

    const data = detailsRes.data;
    const cast = (data.credits?.cast || []).slice(0, 10).map(c => ({
      name: c.name,
      character: c.character || 'Cast',
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));

    res.json({
      title: data.title || data.name || cleanTitle,
      overview: data.overview || 'Synopsis not available.',
      rating: data.vote_average ? data.vote_average.toFixed(1) : match.vote_average?.toFixed(1) || '7.5',
      year: (data.release_date || data.first_air_date || '').split('-')[0] || year || '2026',
      country: data.production_countries?.[0]?.name || (data.origin_country?.[0] === 'KR' ? 'Korea' : 'India'),
      genres: data.genres?.map(g => g.name).join(', ') || 'Drama',
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      cast
    });
  } catch (err) {
    console.error('TMDB details error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎬 FOBS TV Streaming App running at http://localhost:${PORT}`);
});
