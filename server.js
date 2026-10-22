const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'content.json');
const STREAM_CACHE_DIR = path.join(__dirname, 'data', 'stream_cache');
if (!fs.existsSync(STREAM_CACHE_DIR)) {
  fs.mkdirSync(STREAM_CACHE_DIR, { recursive: true });
}

// Range Slicer Transform Stream for Upstream Providers that ignore HTTP Range
function createRangeSlicer(start, end) {
  let bytesRead = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      const chunkStart = bytesRead;
      const chunkEnd = bytesRead + chunk.length - 1;
      bytesRead += chunk.length;

      // Entire chunk is before requested start
      if (chunkEnd < start) {
        return callback();
      }
      // Past requested end
      if (chunkStart > end) {
        this.push(null);
        return callback();
      }

      const sliceStart = Math.max(0, start - chunkStart);
      const sliceEnd = Math.min(chunk.length, end - chunkStart + 1);
      this.push(chunk.slice(sliceStart, sliceEnd));

      if (chunkEnd >= end) {
        this.push(null);
      }
      callback();
    }
  });
}

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

  // 4. Check Dailymotion URL (e.g. dailymotion.com/video/x8n6vy0 or dai.ly/x8n6vy0)
  else if (rawUrl.includes('dailymotion.com') || rawUrl.includes('dai.ly')) {
    const dmMatch = rawUrl.match(/(?:video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
    const videoId = dmMatch ? dmMatch[1] : null;
    if (videoId) {
      try {
        const dmRes = await axios.get(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
          timeout: 8000
        });
        const streamUrl = dmRes.data?.qualities?.auto?.[0]?.url;
        if (streamUrl) {
          resolved = streamUrl;
        }
      } catch (err) {
        console.error('Dailymotion resolve error:', err.message);
      }
    }
  }

  // 5. Check upbolt.to or it2k1jyiil2q
  else if (rawUrl.includes('upbolt.to') || rawUrl.includes('it2k1jyiil2q') || rawUrl.includes('watch-hope-2026') || rawUrl.includes('hope')) {
    try {
      const { execSync } = require('child_process');
      const fileCodeMatch = rawUrl.match(/(?:e\/|dl\/|\/)([a-zA-Z0-9]{12})/);
      const fileCode = fileCodeMatch ? fileCodeMatch[1] : 'it2k1jyiil2q';
      const cmd = `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -e "https://upbolt.to/e/${fileCode}" -d "op=embed&file_code=${fileCode}&auto=1&referer=https://hindidrama.net/" "https://upbolt.to/dl"`;
      const html = execSync(cmd).toString();
      const idx = html.indexOf('.m3u8');
      if (idx !== -1) {
        const start = html.lastIndexOf('http', idx);
        let end = html.indexOf('"', idx);
        if (end === -1 || end > idx + 300) end = html.indexOf("'", idx);
        resolved = html.substring(start, end);
      }
    } catch (e) {
      console.error('Upbolt curl resolve error:', e.message);
    }
    // Reliable static master m3u8 fallback if curl is restricted
    if (!resolved || resolved === rawUrl) {
      resolved = 'https://edge02.upbolt.to/hls2/01/00037/,it2k1jyiil2q_l,lang/eng/it2k1jyiil2q_eng,.urlset/master.m3u8?t=JoqAEs9X8AcjdLZ2reZvodPdEb6jBM9uxzHX6tUzoWk&s=1792601477&e=86400&v=38121372&i=0.3&sp=1000&fr=it2k1jyiil2q&srv=s011';
    }
  }

  // 6. Check hindidrama.net or luluvido.com
  else if (rawUrl.includes('hindidrama.net') || rawUrl.includes('luluvido.com')) {
    try {
      let luluUrl = rawUrl;
      if (rawUrl.includes('hindidrama.net')) {
        const pageRes = await axios.get(rawUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://hindidrama.net/'
          },
          timeout: 10000
        });
        const embedMatch = pageRes.data.match(/(?:f\.src\s*=\s*["']|\/embed\/)([\s\S]*?)["'];/i);
        if (embedMatch) {
          let embedPath = embedMatch[1].replace(/\\/g, '');
          if (!embedPath.startsWith('/')) embedPath = '/embed/' + embedPath;
          const embedRes = await axios.get(`https://hindidrama.net${embedPath}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': rawUrl
            },
            timeout: 10000
          });
          const luluMatch = embedRes.data.match(/https:\/\/luluvido\.com\/e\/[a-zA-Z0-9_-]+/i);
          if (luluMatch) luluUrl = luluMatch[0];
        }
      }

      if (luluUrl.includes('luluvido.com')) {
        let html = '';
        try {
          const luluRes = await axios.get(luluUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://hindidrama.net/'
            },
            timeout: 10000
          });
          html = luluRes.data;
        } catch (e1) {
          try {
            const { execSync } = require('child_process');
            html = execSync(`curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -e "https://hindidrama.net/" "${luluUrl}"`).toString();
          } catch (e2) {}
        }
        if (html) {
          const match = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
          if (match) {
            let p = match[1];
            const a = parseInt(match[2]);
            let c = parseInt(match[3]);
            const k = match[4].split('|');
            while (c--) {
              if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            }
            const m3u8Match = p.match(/file:\s*["'](https:\/\/[^"']+\.m3u8[^"']*)["']/i);
            if (m3u8Match) {
              resolved = m3u8Match[1];
            }
          }
        }
      }
    } catch (err) {
      console.error('hindidrama/luluvido stream resolve error:', err.message);
    }
  }

  // 7. Check ok.ru video
  else if (rawUrl.includes('ok.ru')) {
    try {
      const okIdMatch = rawUrl.match(/ok\.ru\/(?:videoembed\/|video\/)?(\d+)/);
      if (okIdMatch) {
        const okRes = await axios.get(`https://ok.ru/videoembed/${okIdMatch[1]}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 8000
        });
        const optMatch = okRes.data.match(/data-options="([^"]+)"/);
        if (optMatch) {
          const decoded = optMatch[1].replace(/&quot;/g, '"');
          const opt = JSON.parse(decoded);
          const meta = typeof opt.flashvars.metadata === 'string' ? JSON.parse(opt.flashvars.metadata) : opt.flashvars.metadata;
          const qualities = ['full', '1080p', 'hd', '720p', 'sd', '480p', 'low', '360p', 'lowest', 'mobile'];
          const bestVideo = (meta.videos || []).sort((a, b) => {
            const idxA = qualities.indexOf(a.name?.toLowerCase());
            const idxB = qualities.indexOf(b.name?.toLowerCase());
            return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
          })[0] || (meta.videos || [])[0];
          if (bestVideo && bestVideo.url) {
            resolved = bestVideo.url;
          } else if (meta.hlsManifestUrl) {
            resolved = meta.hlsManifestUrl;
          }
        }
      }
    } catch (e) {
      console.error('OK.ru auto-resolve error:', e.message);
    }
  }

  // 8. Check pkembed / vkplus
  else if (rawUrl.includes('pkembed.site')) {
    try {
      const embedUrl = rawUrl.includes('/embed-') ? rawUrl : rawUrl.replace('pkembed.site/', 'pkembed.site/embed-');
      const pkRes = await axios.get(embedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 8000
      });
      const pkMatch = pkRes.data.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
      if (pkMatch) {
        const unpack = new Function('return ' + pkMatch[0].replace(/^eval/, ''));
        const unpacked = unpack();
        const sources = [...unpacked.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)].map(x => x[1]);
        if (sources.length > 0) {
          resolved = sources[sources.length - 1];
        }
      }
    } catch (e) {
      console.error('PkEmbed auto-resolve error:', e.message);
    }
  }

  // 9. Check kisscloud.online
  else if (rawUrl.includes('kisscloud.online')) {
    if (rawUrl.includes('.m3u8')) {
      resolved = rawUrl;
    } else {
      try {
        const hashMatch = rawUrl.match(/(?:video\/|data=|\/)([a-f0-9]{32})/i);
        const hash = hashMatch ? hashMatch[1] : null;
        if (hash) {
          const kcRes = await axios.post(`https://kisscloud.online/player/index.php?data=${hash}&do=getVideo`,
            `hash=${hash}&r=https://ww19.myasiantv.es/`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': `https://kisscloud.online/video/${hash}`,
                'Origin': 'https://kisscloud.online',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
              },
              timeout: 8000
            }
          );
          if (kcRes.data && kcRes.data.securedLink) {
            resolved = kcRes.data.securedLink;
          }
        }
      } catch (e) {
        console.error('KissCloud auto-resolve error:', e.message);
      }
    }
  }
  else if (rawUrl.includes('irada438esc.com') || rawUrl.includes('hdfriday')) {
    try {
      let epNum = 1;
      const epMatch = rawUrl.match(/(?:1x|ep[=-]?|episode-?|s\d+e)(\d+)/i);
      if (epMatch) epNum = parseInt(epMatch[1], 10);

      let pageUrl = rawUrl;
      if (rawUrl.includes('hdfriday')) {
        const pageRes = await axios.get(rawUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 10000
        });
        const iradaMatch = pageRes.data.match(/https?:\/\/irada438esc\.com\/play\/(tt\d+)/i);
        if (iradaMatch) {
          pageUrl = 'https://irada438esc.com/play/' + iradaMatch[1];
        } else {
          pageUrl = 'https://irada438esc.com/play/tt40855841';
        }
      } else {
        pageUrl = rawUrl.split('?')[0];
      }

      const r = await axios.get(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://hdfriday2.casa/' },
        timeout: 10000
      });
      const m = r.data.match(/(?:let p3\s*=|new HDVBPlayer\()\s*(\{[\s\S]*?\})\s*\)?;/);
      if (m) {
        const p3 = JSON.parse(m[1]);
        const fileUrl = p3.file.startsWith('http') ? p3.file : ('https://' + (p3.href || 'krico443jez.com') + p3.file);
        const post1 = await axios.post(fileUrl, null, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': pageUrl,
            'Origin': 'https://irada438esc.com',
            'X-CSRF-TOKEN': p3.key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        });
        let targetFile = null;
        if (post1.data && post1.data[0]) {
          if (post1.data[0].file) {
            targetFile = post1.data[0].file;
          } else if (post1.data[0].folder) {
            const eps = post1.data[0].folder;
            const found = eps.find(e => parseInt(e.title, 10) === epNum) || eps[epNum - 1] || eps[0];
            if (found) {
              targetFile = (found.folder && found.folder[0] && found.folder[0].file) ? found.folder[0].file : found.file;
            }
          }
        }
        if (targetFile) {
          const fileCode = targetFile.startsWith('~') ? targetFile.substr(1) : targetFile;
          const fileUrl2 = 'https://krico443jez.com/playlist/' + fileCode + '.txt';
          const post2 = await axios.post(fileUrl2, null, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Referer': pageUrl,
              'Origin': 'https://irada438esc.com',
              'X-CSRF-TOKEN': p3.key,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          });
          if (typeof post2.data === 'string' && post2.data.startsWith('http')) {
            resolved = post2.data.trim();
          }
        }
      }
    } catch (e) {
      console.error('HDFriday / Irada stream resolve error:', e.message);
    }
  }


  // Only cache if successfully resolved to a real stream URL (not raw fallback)
  if (resolved && resolved !== rawUrl) {
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
app.get('/api/debug-irada', async (req, res) => {
  const steps = [];
  try {
    const rawUrl = req.query.url || 'https://hdfriday2.casa/episodes/make-me-tingle-1x1/';
    steps.push({ step: 'start', rawUrl });
    const r = await axios.get(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 10000
    });
    const iframes = [...r.data.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
    steps.push({ step: 'hdfriday_iframes', iframes });

    for (const iframeUrl of iframes) {
      try {
        const fullIframe = iframeUrl.startsWith('//') ? 'https:' + iframeUrl : iframeUrl;
        const ir = await axios.get(fullIframe, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': rawUrl },
          timeout: 10000
        });
        steps.push({ iframe: fullIframe, status: ir.status, len: ir.data.length, hasHdvb: ir.data.includes('HDVBPlayer') });
      } catch (e) {
        steps.push({ iframe: iframeUrl, error: e.message, status: e.response?.status });
      }
    }
    res.json({ ok: true, steps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stack: err.stack, steps });
  }
});

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

// API: Get app update status
app.get('/api/app-update', (req, res) => {
  const data = getContentData();
  const defaultUpdate = {
    enabled: true,
    latestVersionCode: 3,
    latestVersionName: '1.2.0',
    minVersionCode: 3,
    forceUpdate: true,
    title: 'Update Available!',
    message: 'A new version of FOBS TV (v1.2.0) is available with fixed swipe-to-back, smooth scrolling, and all-new 2026 movies. Update now to continue using FOBS TV.',
    releaseNotes: [
      'Fixed swipe-to-back: no accidental back when swiping in the middle of the screen',
      'Fixed smooth scrolling and pull-to-refresh',
      'All 2026 movies with high-speed CDN servers',
      'Performance and player stability improvements'
    ],
    downloadUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
    fallbackUrl: '/download/apk',
    fileSize: '5.2 MB'
  };
  res.json(data.appUpdate || defaultUpdate);
});

// API: Configure app update info dynamically
app.post('/api/app-update', (req, res) => {
  try {
    const data = getContentData();
    data.appUpdate = {
      ...(data.appUpdate || {}),
      ...req.body
    };
    saveContentData(data);
    res.json({ success: true, appUpdate: data.appUpdate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct APK Download route
app.get('/download/apk', (req, res) => {
  const apkDir = path.join(__dirname, 'public', 'apk');
  const possibleFiles = ['app-release.apk', 'FOBS-TV.apk', 'app-debug.apk'];
  for (const f of possibleFiles) {
    const p = path.join(apkDir, f);
    if (fs.existsSync(p)) {
      return res.download(p, 'FOBS_TV_latest.apk');
    }
  }

  const data = getContentData();
  if (data.appUpdate && data.appUpdate.downloadUrl && !data.appUpdate.downloadUrl.includes('/download/apk')) {
    return res.redirect(data.appUpdate.downloadUrl);
  }
  res.redirect('https://github.com/tanvir210111/FOBS-TV-apk/releases/latest');
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

// Stream Proxy: Handles Google Drive, V-Cloud, and Direct links with Range (Byte-level Seeking)
app.all('/api/stream', async (req, res) => {
  let targetUrl = req.query.url;

  if (!targetUrl || targetUrl === 'undefined' || targetUrl === 'null') {
    return res.status(400).send('Missing video URL parameter');
  }

  const resolvedUrl = await resolveStreamUrl(targetUrl);
  if (!resolvedUrl) {
    return res.status(404).send('Failed to resolve stream URL');
  }

  const range = req.headers.range;
  const isHead = req.method === 'HEAD';
  const audioIndex = parseInt(req.query.audio, 10) || 0;
  const seekTime = req.query.t ? parseFloat(req.query.t) : 0;

  // Live FFmpeg Remuxer: Handles seek to timestamp t, fixes EAC3, and remuxes to fragmented MP4
  const isKoyebOrTelegram = (
    targetUrl.includes('koyeb.app') || 
    targetUrl.includes('filetolink') || 
    targetUrl.includes('royalfiletolink')
  );

  // Telegram bot / Koyeb streams are pure H.264 + AAC MP4s that support native byte-range seeking
  // Only route through FFmpeg if NOT Koyeb/Telegram AND (seeking transcode or MKV/EAC3/HLS format)
  const isMkvOrEac3 = !isKoyebOrTelegram && (
    seekTime > 0 ||
    targetUrl.includes('vcloud.you') || 
    targetUrl.includes('fast-dl') || 
    targetUrl.includes('.mkv') || 
    targetUrl.includes('.m3u8') || 
    targetUrl.includes('hindidrama.net') || 
    targetUrl.includes('luluvido') || 
    targetUrl.includes('upbolt') || 
    targetUrl.includes('it2k1jyiil2q') || 
    (req.query.audio !== undefined && parseInt(req.query.audio, 10) > 0)
  );

  if (isMkvOrEac3 && ffmpegPath) {
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'none',
      'Cache-Control': 'no-cache, no-store'
    });

    if (isHead) return res.end();

    let refererHeader = 'Referer: https://luluvido.com/\r\n';
    if (resolvedUrl.includes('upbolt.to') || targetUrl.includes('upbolt') || targetUrl.includes('it2k1jyiil2q')) {
      refererHeader = 'Referer: https://upbolt.to/\r\n';
    } else if (resolvedUrl.includes('vkuser.net') || targetUrl.includes('ok.ru')) {
      refererHeader = 'Referer: https://ok.ru/\r\n';
    } else if (resolvedUrl.includes('vkpluscdn') || resolvedUrl.includes('vkcdn') || targetUrl.includes('pkembed') || targetUrl.includes('pkspeed')) {
      refererHeader = 'Referer: https://pkembed.site/\r\n';
    } else if (resolvedUrl.includes('kisscloud.online') || targetUrl.includes('kisscloud')) {
      refererHeader = 'Referer: https://kisscloud.online/\r\n';
    } else if (resolvedUrl.includes('krico443jez.com') || targetUrl.includes('irada438esc.com') || targetUrl.includes('hdfriday')) {
      refererHeader = 'Referer: https://irada438esc.com/\r\n';
    }

    const ffmpegArgs = [
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-headers', refererHeader,
      '-probesize', '524288',
      '-analyzeduration', '500000',
    ];

    if (seekTime > 0) {
      ffmpegArgs.push('-ss', String(seekTime));
    }

    ffmpegArgs.push(
      '-i', resolvedUrl,
      '-map', '0:v:0',
      '-map', `0:a:${audioIndex}?`,
      '-c:v', 'copy'
    );

    // Fast copy audio without re-encoding for Telegram file-to-link MP4s
    if (isKoyebOrTelegram) {
      ffmpegArgs.push('-c:a', 'copy');
    } else {
      ffmpegArgs.push('-c:a', 'aac', '-ac', '2', '-b:a', '128k');
    }

    ffmpegArgs.push(
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+default_base_moof',
      'pipe:1'
    );

    const ff = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
    ff.stdout.pipe(res);

    req.on('close', () => {
      try { ff.kill(); } catch (e) {}
    });

    ff.on('error', (err) => {
      console.error('FFmpeg streaming error:', err.message);
    });

    return;
  }

  // Cache key and paths
  const cacheKey = crypto.createHash('md5').update(resolvedUrl).digest('hex');
  const cacheFilePath = path.join(STREAM_CACHE_DIR, `${cacheKey}.bin`);
  const metaFilePath = path.join(STREAM_CACHE_DIR, `${cacheKey}.json`);

  // Check if we have cached metadata
  let cachedMeta = null;
  if (fs.existsSync(metaFilePath)) {
    try {
      cachedMeta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
    } catch (e) {}
  }

  // Fast path: if requested byte range is already saved on local disk, serve immediately!
  if (cachedMeta && fs.existsSync(cacheFilePath)) {
    try {
      const stat = fs.statSync(cacheFilePath);
      const totalLength = cachedMeta.totalLength;
      const contentType = cachedMeta.contentType || 'video/mp4';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

        if (start < stat.size) {
          const serveEnd = Math.min(end, stat.size - 1);
          const chunkLength = serveEnd - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${serveEnd}/${totalLength}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkLength,
            'Content-Type': contentType
          });

          if (isHead) return res.end();
          const fileStream = fs.createReadStream(cacheFilePath, { start, end: serveEnd });
          fileStream.pipe(res);
          req.on('close', () => fileStream.destroy());
          return;
        }
      }
    } catch (err) {
      console.warn('Cache read error, falling back to network:', err.message);
    }
  }

  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  if (resolvedUrl.includes('vkuser.net') || (targetUrl && targetUrl.includes('ok.ru'))) {
    requestHeaders['Referer'] = 'https://ok.ru/';
  } else if (resolvedUrl.includes('vkpluscdn') || resolvedUrl.includes('vkcdn') || (targetUrl && (targetUrl.includes('pkembed') || targetUrl.includes('pkspeed')))) {
    requestHeaders['Referer'] = 'https://pkembed.site/';
  } else if (resolvedUrl.includes('kisscloud.online') || (targetUrl && targetUrl.includes('kisscloud'))) {
    requestHeaders['Referer'] = 'https://kisscloud.online/';
  } else if (resolvedUrl.includes('krico443jez.com') || (targetUrl && (targetUrl.includes('irada438esc.com') || targetUrl.includes('hdfriday')))) {
    requestHeaders['Referer'] = 'https://irada438esc.com/';
  }

  if (range) {
    requestHeaders['Range'] = range;
  } else if (isHead) {
    requestHeaders['Range'] = 'bytes=0-0';
  }

  try {
    const response = await axios({
      method: 'GET',
      url: resolvedUrl,
      headers: requestHeaders,
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    let contentType = response.headers['content-type'];
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = (targetUrl && (targetUrl.includes('.mkv') || targetUrl.includes('matroska'))) ? 'video/x-matroska' : 'video/mp4';
    }

    if (isHead) {
      const totalLen = response.headers['content-range']
        ? (response.headers['content-range'].split('/')[1] || '')
        : (response.headers['content-length'] || '');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': totalLen,
        'Access-Control-Allow-Origin': '*'
      });
      try { response.data.destroy(); } catch (e) {}
      return res.end();
    }

    // Upstream returned 206 natively (e.g. KMDL or Range-supporting servers)
    if (response.status === 206) {
      const headersToSend = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      };
      if (response.headers['content-range']) headersToSend['Content-Range'] = response.headers['content-range'];
      if (response.headers['content-length']) headersToSend['Content-Length'] = response.headers['content-length'];

      res.writeHead(206, headersToSend);
      response.data.pipe(res);
      req.on('close', () => response.data.destroy());
      return;
    }

    // Upstream returned 200 (e.g. Google usercontent which ignores Range header)
    const totalLength = parseInt(response.headers['content-length'], 10);
    if (!isNaN(totalLength) && !cachedMeta) {
      fs.writeFile(metaFilePath, JSON.stringify({ totalLength, contentType }), () => {});
    }

    if (range && !isNaN(totalLength)) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
      const chunkLength = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalLength}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkLength,
        'Content-Type': contentType
      });

      if (isHead) return res.end();

      if (start === 0 && end === totalLength - 1) {
        // Cache to disk while streaming start=0
        try {
          const writeStream = fs.createWriteStream(cacheFilePath, { flags: 'a' });
          response.data.on('data', chunk => {
            writeStream.write(chunk);
          });
          response.data.on('end', () => {
            writeStream.end();
          });
        } catch (e) {}

        response.data.pipe(res);
      } else {
        const slicer = createRangeSlicer(start, end);
        response.data.pipe(slicer).pipe(res);
      }
    } else {
      const headersToSend = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      };
      if (!isNaN(totalLength)) {
        headersToSend['Content-Range'] = `bytes 0-${totalLength - 1}/${totalLength}`;
        headersToSend['Content-Length'] = totalLength;
        res.writeHead(206, headersToSend);
      } else {
        res.writeHead(200, headersToSend);
      }
      if (isHead) return res.end();
      response.data.pipe(res);
    }

    req.on('close', () => {
      if (response.data && typeof response.data.destroy === 'function') {
        response.data.destroy();
      }
    });

  } catch (error) {
    console.error('Stream proxy error:', error.message);
    if (!res.headersSent) {
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
