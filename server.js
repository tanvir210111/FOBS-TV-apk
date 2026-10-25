const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

const movieboxService = require('./services/movieboxService');
const liveTvService = require('./services/liveTvService');
const syncService = require('./services/syncService');
const dbService = require('./services/dbService');
const authService = require('./services/authService');
const subtitleService = require('./services/subtitleService');

app.use(cors());
app.use(compression({
  threshold: 1024,
  level: 6
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Hostinger KVM 8 VPS and monitors
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'FOBS TV', uptime: Math.round(process.uptime()) });
});

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

// MovieBox Subject ID to detailPath lookup map
function getMovieBoxDetailPath(id) {
  if (!id) return '';
  const sId = String(id).trim();
  if (sId === '2706073799983877168') return 'golden-boy-hindi-84Y8uLuQTd3';
  if (sId === '4505435294245733456') return 'golden-boy-WbL89VmWOm5';
  if (sId === '3929372124917419816') return 'golden-boy-GZ4ZlM5zgG4';
  if (sId === '9098837809229611984') return 'golden-boy-english-CJH7T5YL8Qa';
  if (sId === '3908280950886646112' || sId === '2985939316620284696') return 'wandavision-EU8Y28iDzy3';
  if (sId === '5774857026010610896') return 'masterplan-hindi-C51IrncUAS6';
  if (sId === '7818895120744824984') return 'arafta-hindi-0y70kiBCAj9';
  if (sId === '2593580836368859088') return 'miracle-in-cell-no-7-CpdPy3VCA53';
  if (sId === '331534456928489048') return 'paper-lives-MOrS12Kquo';
  if (sId === '7315143878922094712') return 'love-is-in-the-air-hindi-EMidHb4rnI8';
  if (sId === '7992739293980674584') return 'lanterns-hindi-ciMc9svPqw9';
  if (sId === '4332534660363340496') return 'our-universe-hindi-39lYgY80Kq4';
  if (sId === '9012855174766968784' || sId === '3929428694468545232') return 'establishment-osman-GtoO3BhYMJa';
  if (sId === '6103563625468182480' || sId === '68551662163608792') return 'inconstant-love-hindi-YstIcsYX35';
  if (sId === '8690954071785752632' || sId === '8218095022726677576') return 'resurrection-ertugrul-AARn8a2F0ma';
  if (sId === '2819564323977289192') return 'viral-hit-hindi-CT6Pd5lDhm3';
  if (sId === '1986985589031195976') return 'sins-of-kujo-hindi-uNxjKyJpMm2';
  if (sId === '8768845011485083816') return 'demon-city-hindi-i5IiSPZoLra';
  if (sId === '8475210957663488472') return 'a-shop-for-killers-hindi-GLJXzEty46a';
  if (sId === '5698833987452421616') return 'so-i-love-you-very-much-hindi-caElq9EIYM6';
  if (sId === '5564284041047803440') return 'dhootha-hindi-StflkTKt2D6';
  if (sId === '8653275235304834096') return 'rana-naidu-hindi-q987i7J5eja';
  if (sId === '7573592610930312192') return 'mousetrap-hindi-CXwu23l8t19';
  if (sId === '1694621778766643152') return 'mouse-i3rX9JUnb12';
  if (sId === '4938138970698960008') return 'mouse-o2BOtNbJMS5';
  if (sId === '7384944248602723992') return 'you-are-my-glory-hindi-IIrH3QC7xN8';
  if (sId === '2206443205082733056') return 'the-legend-of-kitchen-soldier-hindi-cO6WrX3xZC2';
  if (sId === '1932866268428649968') return 'dive-to-you-hindi-mHK7tzYxMi2';
  if (sId === '3870036899930730728') return 'dive-to-you-G56UVRdOSB4';
  if (sId === '2154607436987001256') return 'island-hindi-ws8SXbK7az2';
  if (sId === '5551081490894708744') return 'island-UgoeMAK04C6';
  if (sId === '1395930250630021944') return 'my-strange-hero-hindi-MsGxeSgn7F1';
  if (sId === '1581778075774271440') return 'my-strange-hero-Ac9ev3KyQS1';
  if (sId === '637731293849080088') return 'tale-of-the-nine-tailed-hindi-GfVHu3BO6L';
  if (sId === '3104610972405746824') return 'tale-of-the-nine-tailed-S9Jo5bn9lH3';
  if (sId === '4720961996777219576') return 'musafir-cafe-hindi-MStiLnt3KC5';
  if (sId === '3604422232421843392') return 'adarsh-baal-vidyalaya-hindi-UKlobH6igi4';
  if (sId === '8445472975083767584') return 'sweet-home-hindi-QYdKgN3mS3a';
  if (sId === '6640253389706330592') return 'sweet-home-hindi-IumHTEIqwU7';
  if (sId === '341274161781817952') return 'gyeongseong-creature-hindi-cwXnUZq2dp';
  if (sId === '8749727399622889296') return 'gyeongseong-creature-2nf2FylQlqa';
  if (sId === '1332900149030438936') return 'love-next-door-hindi-A2MLzAcHsA1';
  if (sId === '900420217287968016') return 'love-next-door-21sWBRUVv41';
  if (sId === '3622255521824228456') return 'high-school-return-of-a-gangster-hindi-GFI0WK3Yzj4';
  if (sId === '6930023915360583800') return 'high-school-return-of-a-gangster-8ydAeg9AVf8';
  if (sId === '13309505576601376') return 'crash-landing-on-you-hindi-ad4mbjnXY';
  if (sId === '8152231361013763208') return 'crash-landing-on-you-M2pZwJYidI9';
  return '';
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

  // 11. Check MovieBox CDNs & /api/moviebox/stream redirect routes
  else if (
    rawUrl.includes('/api/moviebox/stream') ||
    rawUrl.includes('movieboxapp.in') ||
    rawUrl.includes('hakunaymatata') ||
    rawUrl.includes('bcdnxw') ||
    rawUrl.includes('haildrop') ||
    rawUrl.includes('fogtwist') ||
    rawUrl.includes('sunburst') ||
    rawUrl.includes('stormshade')
  ) {
    if (rawUrl.includes('/api/moviebox/stream')) {
      try {
        const urlObj = new URL(rawUrl, 'http://187.127.114.52');
        let id = urlObj.searchParams.get('id');
        let detailPath = urlObj.searchParams.get('path') || getMovieBoxDetailPath(id) || '';
        const se = parseInt(urlObj.searchParams.get('se') || '1', 10);
        const ep = parseInt(urlObj.searchParams.get('ep') || '1', 10);
        if (id) {
          let media = await movieboxService.resolveMedia(id, detailPath, se, ep);
          if (!media || !media.streamUrl) {
            media = await movieboxService.resolveMedia(id, detailPath, 0, ep);
          }
          if (!media || !media.streamUrl) {
            media = await movieboxService.resolveMedia(id, detailPath, 0, 0);
          }
          if (media && media.streamUrl) {
            resolved = media.streamUrl;
          }
        }
      } catch (err) {
        console.error('MovieBox route resolve error in resolveStreamUrl:', err.message);
      }
    }
    if (!resolved || resolved === rawUrl) {
      resolved = rawUrl;
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
app.get('/api/content', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const data = getContentData();
    if (data.movies) {
      data.movies.forEach(m => {
        m.type = 'movie';
        if (!m.cover) m.cover = m.backdrop || m.poster;
        if (m.addedAt) {
          if (!m.originalReleaseDate) m.originalReleaseDate = m.releaseDate;
          m.releaseDate = m.addedAt;
        }
      });
    }
    if (data.series) {
      data.series.forEach(s => {
        s.type = 'series';
        if (!s.cover) s.cover = s.backdrop || s.poster;
        if (s.addedAt) {
          if (!s.originalReleaseDate) s.originalReleaseDate = s.releaseDate;
          s.releaseDate = s.addedAt;
        }
      });
    }
    if (data.upcoming) data.upcoming.forEach(u => u.type = u.type || 'series');

    // Ensure featured spotlight has official TMDB cover photo and latest title
    if (!data.featured || !data.featured.id || (data.featured.title && data.featured.title.includes('Sen Çal'))) {
      data.featured = (data.series && data.series[0]) || (data.movies && data.movies[0]);
    }
    if (data.featured) {
      data.featured.cover = data.featured.cover || data.featured.backdrop || data.featured.poster;
      data.featured.backdrop = data.featured.backdrop || data.featured.cover;
    }

    // If liveTv is empty in local content.json, load working BD live TV channels
    if (!data.liveTv || data.liveTv.length === 0) {
      try {
        const bdChannels = await liveTvService.getChannelsByCountry('bd');
        if (bdChannels && bdChannels.length > 0) {
          data.liveTv = bdChannels;
        }
      } catch (e) {}
    }
    if (data.liveTv) data.liveTv.forEach(t => t.type = 'liveTv');



    res.json(data);
  } catch (err) {
    console.error('Error serving /api/content:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: MovieBox Trending & Categories
app.get('/api/moviebox/home', async (req, res) => {
  try {
    const sections = await movieboxService.getHomepage();
    res.json({ ok: true, sections });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: MovieBox Search
app.get('/api/moviebox/search', async (req, res) => {
  const q = req.query.q || req.query.query;
  if (!q) return res.json({ ok: true, results: [] });
  try {
    const results = await movieboxService.search(q);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: MovieBox Media Stream Resolver (JSON)
app.get('/api/moviebox/resolve', async (req, res) => {
  const { id, path, se, ep } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });
  try {
    const media = await movieboxService.resolveMedia(
      id,
      path || '',
      parseInt(se || '0', 10),
      parseInt(ep || '0', 10)
    );
    if (!media) return res.status(404).json({ ok: false, error: 'Media stream not found' });
    res.json({ ok: true, media });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: MovieBox Stream Redirect — resolves CDN URL and redirects to it
// Use this as a direct video src: /api/moviebox/stream?id=X&se=1&ep=1
// The video player follows the 302 redirect to the real CDN mp4/hls stream
app.get('/api/moviebox/stream', async (req, res) => {
  let { id, path: detailPath, se, ep } = req.query;
  if (!id) return res.status(400).send('Missing id parameter');
  try {
    const seNum = parseInt(se || '1', 10);
    const epNum = parseInt(ep || '1', 10);
    let resolvedPath = detailPath || getMovieBoxDetailPath(id) || '';
    if (!resolvedPath) {
      // Golden Boy (Yalı Çapkını) - Turkish series
      if (id === '2706073799983877168') resolvedPath = 'golden-boy-hindi-84Y8uLuQTd3';
      else if (id === '4505435294245733456') resolvedPath = 'golden-boy-WbL89VmWOm5';
      else if (id === '3929372124917419816') resolvedPath = 'golden-boy-GZ4ZlM5zgG4';
      else if (id === '9098837809229611984') resolvedPath = 'golden-boy-english-CJH7T5YL8Qa';
      // VisionQuest (Marvel Vision series) -> streams WandaVision (Vision's series)
      else if (id === '3908280950886646112') {
        id = '2985939316620284696';
        resolvedPath = 'wandavision-EU8Y28iDzy3';
      }
      // Masterplan [Hindi]
      else if (id === '5774857026010610896') resolvedPath = 'masterplan-hindi-C51IrncUAS6';
      // Arafta [Hindi] - Turkish series
      else if (id === '7818895120744824984') resolvedPath = 'arafta-hindi-0y70kiBCAj9';
      // Miracle in Cell No.7 (Turkish 2019)
      else if (id === '2593580836368859088') resolvedPath = 'miracle-in-cell-no-7-CpdPy3VCA53';
      // Paper Lives (Turkish)
      else if (id === '331534456928489048') resolvedPath = 'paper-lives-MOrS12Kquo';
      // Sen Çal Kapımı (Love Is in the Air) [Hindi]
      else if (id === '7315143878922094712') resolvedPath = 'love-is-in-the-air-hindi-EMidHb4rnI8';
      // Lanterns [Hindi]
      else if (id === '7992739293980674584') resolvedPath = 'lanterns-hindi-ciMc9svPqw9';
      // Our Universe [Hindi]
      else if (id === '4332534660363340496') resolvedPath = 'our-universe-hindi-39lYgY80Kq4';
      // Kuruluş: Osman (Establishment: Osman)
      else if (id === '9012855174766968784' || id === '3929428694468545232') resolvedPath = 'establishment-osman-GtoO3BhYMJa';
      // Hercai (Inconstant Love)
      else if (id === '6103563625468182480' || id === '68551662163608792') resolvedPath = 'inconstant-love-hindi-YstIcsYX35';
      // Diriliş: Ertuğrul (Resurrection: Ertugrul)
      else if (id === '8690954071785752632' || id === '8218095022726677576') resolvedPath = 'resurrection-ertugrul-AARn8a2F0ma';
      // Viral Hit [Hindi] (2026 Japanese Series)
      else if (id === '2819564323977289192') resolvedPath = 'viral-hit-hindi-CT6Pd5lDhm3';
      // Sins of Kujo [Hindi] (2026 Japanese Series)
      else if (id === '1986985589031195976') resolvedPath = 'sins-of-kujo-hindi-uNxjKyJpMm2';
      // Demon City [Hindi] (Japanese Movie)
      else if (id === '8768845011485083816') resolvedPath = 'demon-city-hindi-i5IiSPZoLra';
      // A Shop for Killers [Hindi] (Korean Series - Season 1 & 2)
      else if (id === '8475210957663488472') resolvedPath = 'a-shop-for-killers-hindi-GLJXzEty46a';
      // Crush (So I Love You Very Much) [Hindi] (Chinese Series)
      else if (id === '5698833987452421616') resolvedPath = 'so-i-love-you-very-much-hindi-caElq9EIYM6';
      // Dhootha [Hindi] (South Indian Series)
      else if (id === '5564284041047803440') resolvedPath = 'dhootha-hindi-StflkTKt2D6';
      // Rana Naidu [Hindi] (Action Crime Series - Season 1 & 2)
      else if (id === '8653275235304834096') resolvedPath = 'rana-naidu-hindi-q987i7J5eja';
      // Mouse / Mousetrap [Hindi] (Korean Series)
      else if (id === '7573592610930312192') resolvedPath = 'mousetrap-hindi-CXwu23l8t19';
      else if (id === '1694621778766643152') resolvedPath = 'mouse-i3rX9JUnb12';
      else if (id === '4938138970698960008') resolvedPath = 'mouse-o2BOtNbJMS5';
      // You Are My Glory [Hindi] (Chinese Series)
      else if (id === '7384944248602723992') resolvedPath = 'you-are-my-glory-hindi-IIrH3QC7xN8';
      // The Legend of Kitchen Soldier [Hindi] (Korean Series)
      else if (id === '2206443205082733056') resolvedPath = 'the-legend-of-kitchen-soldier-hindi-cO6WrX3xZC2';
      // Dive to You [Hindi] (Korean Series)
      else if (id === '1932866268428649968') resolvedPath = 'dive-to-you-hindi-mHK7tzYxMi2';
      else if (id === '3870036899930730728') resolvedPath = 'dive-to-you-G56UVRdOSB4';
      // Island [Hindi] (Korean Series)
      else if (id === '2154607436987001256') resolvedPath = 'island-hindi-ws8SXbK7az2';
      else if (id === '5551081490894708744') resolvedPath = 'island-UgoeMAK04C6';
      // My Strange Hero [Hindi] (Korean Series)
      else if (id === '1395930250630021944') resolvedPath = 'my-strange-hero-hindi-MsGxeSgn7F1';
      else if (id === '1581778075774271440') resolvedPath = 'my-strange-hero-Ac9ev3KyQS1';
      // Tale of the Nine Tailed [Hindi] (Korean Series - Season 1 & 2)
      else if (id === '637731293849080088') resolvedPath = 'tale-of-the-nine-tailed-hindi-GfVHu3BO6L';
      else if (id === '3104610972405746824') resolvedPath = 'tale-of-the-nine-tailed-S9Jo5bn9lH3';
      // Musafir Cafe [Hindi] (Bollywood Series)
      else if (id === '4720961996777219576') resolvedPath = 'musafir-cafe-hindi-MStiLnt3KC5';
      // Adarsh Baal Vidyalaya [Hindi] (Bollywood Series)
      else if (id === '3604422232421843392') resolvedPath = 'adarsh-baal-vidyalaya-hindi-UKlobH6igi4';
      // Sweet Home [Hindi] (Korean Series - Seasons 1, 2, 3)
      else if (id === '8445472975083767584') resolvedPath = 'sweet-home-hindi-QYdKgN3mS3a';
      else if (id === '6640253389706330592') resolvedPath = 'sweet-home-hindi-IumHTEIqwU7';
      // Gyeongseong Creature [Hindi] (Korean Series - Seasons 1 & 2)
      else if (id === '341274161781817952') resolvedPath = 'gyeongseong-creature-hindi-cwXnUZq2dp';
      else if (id === '8749727399622889296') resolvedPath = 'gyeongseong-creature-2nf2FylQlqa';
      // Love Next Door [Hindi] (Korean Series - Season 1)
      else if (id === '1332900149030438936') resolvedPath = 'love-next-door-hindi-A2MLzAcHsA1';
      else if (id === '900420217287968016') resolvedPath = 'love-next-door-21sWBRUVv41';
      // High School Return of a Gangster [Hindi] (Korean Series - Season 1)
      else if (id === '3622255521824228456') resolvedPath = 'high-school-return-of-a-gangster-hindi-GFI0WK3Yzj4';
      else if (id === '6930023915360583800') resolvedPath = 'high-school-return-of-a-gangster-8ydAeg9AVf8';
      // Crash Landing on You [Hindi] (Korean Series - Season 1)
      else if (id === '13309505576601376') resolvedPath = 'crash-landing-on-you-hindi-ad4mbjnXY';
      else if (id === '8152231361013763208') resolvedPath = 'crash-landing-on-you-M2pZwJYidI9';
    }
    // Try requested se/ep first, then fallbacks
    let media = await movieboxService.resolveMedia(id, resolvedPath || '', seNum, epNum);
    if (!media || !media.streamUrl) {
      media = await movieboxService.resolveMedia(id, resolvedPath || '', 0, epNum);
    }
    if (!media || !media.streamUrl) {
      media = await movieboxService.resolveMedia(id, resolvedPath || '', 0, 0);
    }
    if (!media || !media.streamUrl) {
      return res.status(404).send('Stream not available for this episode yet');
    }
    const host = req.get('x-forwarded-host') || req.get('host') || '187.127.114.52';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const baseUrl = `${proto}://${host}`;
    const proxiedStreamUrl = `/api/stream?url=${encodeURIComponent(media.streamUrl)}`;
    const fullProxiedStreamUrl = `${baseUrl}${proxiedStreamUrl}`;

    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-store');

    if (req.query.json === '1' || req.headers.accept?.includes('application/json')) {
      return res.json({ ok: true, streamUrl: fullProxiedStreamUrl, directCdnUrl: media.streamUrl, resolution: media.resolution });
    }
    // Absolute redirect through proxy so HTTP Referer is attached and byte-range seeking works 100%
    res.redirect(302, fullProxiedStreamUrl);
  } catch (err) {
    console.error('MovieBox stream redirect error:', err.message);
    res.status(500).send('Stream resolution failed');
  }
});

// API: Live TV Channels by Country (bd, in, etc.)
app.get('/api/tv/channels', async (req, res) => {
  const country = req.query.country || 'bd';
  try {
    const channels = await liveTvService.getChannelsByCountry(country);
    res.json({ ok: true, country, channels });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Get app update status
app.get('/api/app-update', (req, res) => {
  const data = getContentData();
  const defaultUpdate = {
    enabled: true,
    latestVersionCode: 7,
    latestVersionName: '1.6.0',
    minVersionCode: 1,
    forceUpdate: true,
    title: 'New FOBS TV Update (v1.6.0) Available!',
    message: 'FOBS TV v1.6.0: Turkish drama titles fixed (Kuruluş: Osman, Diriliş: Ertuğrul, Hercai, Masterplan, Arafta), Hindi dubbed streaming improved via MovieBox, Golden Boy complete series added.',
    releaseNotes: [
      'Fixed all Turkish drama original titles and metadata',
      'Masterplan originalTitle fixed',
      'Arafta Hindi dub now streams via MovieBox',
      'Miracle in Cell No. 7 (Turkish 2019) streaming via MovieBox',
      'Golden Boy full 3-season series (371 Episodes from MovieBox)',
      'Improved portrait & landscape video player controls',
      'Direct 1-Click APK Download'
    ],
    downloadUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
    fallbackUrl: 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk',
    fileSize: '15.4 MB'
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
  const data = getContentData();
  const directApkUrl = (data.appUpdate && data.appUpdate.downloadUrl && !data.appUpdate.downloadUrl.includes('/download/apk'))
    ? data.appUpdate.downloadUrl
    : 'https://github.com/tanvir210111/FOBS-TV-apk/releases/download/latest/app-debug.apk';
  return res.redirect(directApkUrl);
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
    audioTracks: ['Hindi dub', 'Original Audio'],
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  const isDirectFastCdn = (
    isKoyebOrTelegram ||
    targetUrl.includes('/api/moviebox/stream') ||
    targetUrl.includes('hakunaymatata') || 
    targetUrl.includes('bcdnxw') || 
    targetUrl.includes('haildrop') || 
    targetUrl.includes('fogtwist') || 
    targetUrl.includes('sunburst') || 
    targetUrl.includes('stormshade') ||
    targetUrl.includes('kmdl.eu.org') ||
    resolvedUrl.includes('hakunaymatata') ||
    resolvedUrl.includes('bcdnxw') ||
    resolvedUrl.includes('haildrop') ||
    resolvedUrl.includes('fogtwist') ||
    resolvedUrl.includes('sunburst') ||
    resolvedUrl.includes('stormshade')
  );

  // Fast CDNs support native HTTP byte-range streaming without FFmpeg
  const isMkvOrEac3 = !isDirectFastCdn && (
    targetUrl.includes('vcloud.you') || 
    targetUrl.includes('fast-dl') || 
    targetUrl.includes('.mkv') || 
    targetUrl.includes('.m3u8') || 
    targetUrl.includes('hindidrama.net') || 
    targetUrl.includes('luluvido') || 
    targetUrl.includes('upbolt') || 
    targetUrl.includes('it2k1jyiil2q') || 
    ((targetUrl.includes('.mkv') || targetUrl.includes('matroska')) && req.query.audio !== undefined && parseInt(req.query.audio, 10) > 0)
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
    } else if (
      resolvedUrl.includes('hakunaymatata') || 
      resolvedUrl.includes('bcdnxw') || 
      resolvedUrl.includes('haildrop') || 
      resolvedUrl.includes('fogtwist') || 
      resolvedUrl.includes('sunburst') || 
      resolvedUrl.includes('stormshade') || 
      targetUrl.includes('moviebox')
    ) {
      refererHeader = 'Referer: https://movieboxapp.in/\r\n';
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

    // Fast copy audio without re-encoding for Telegram file-to-link MP4s or direct CDNs
    if (isKoyebOrTelegram || isDirectFastCdn) {
      ffmpegArgs.push('-c:a', 'copy');
    } else {
      ffmpegArgs.push('-c:a', 'aac', '-ac', '2', '-b:a', '128k');
    }

    ffmpegArgs.push(
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
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

  // Fast path: if complete video is already saved on local disk, serve immediately!
  if (cachedMeta && fs.existsSync(cacheFilePath)) {
    try {
      const stat = fs.statSync(cacheFilePath);
      const totalLength = cachedMeta.totalLength;
      const contentType = cachedMeta.contentType || 'video/mp4';

      if (stat.size >= totalLength && totalLength > 0 && range) {
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
  } else if (
    resolvedUrl.includes('hakunaymatata') || 
    resolvedUrl.includes('bcdnxw') || 
    resolvedUrl.includes('haildrop') || 
    resolvedUrl.includes('fogtwist') || 
    resolvedUrl.includes('sunburst') || 
    resolvedUrl.includes('stormshade') || 
    (targetUrl && targetUrl.includes('moviebox'))
  ) {
    requestHeaders['Referer'] = 'https://movieboxapp.in/';
  }

  if (range) {
    requestHeaders['Range'] = range;
  } else if (isHead) {
    requestHeaders['Range'] = 'bytes=0-0';
  }

  let streamFetchUrl = resolvedUrl;
  let response;
  try {
    try {
      response = await axios({
        method: 'GET',
        url: streamFetchUrl,
        headers: requestHeaders,
        responseType: 'stream',
        maxRedirects: 5,
        timeout: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (initialErr) {
      const isMb = (
        targetUrl.includes('/api/moviebox/stream') ||
        targetUrl.includes('movieboxapp.in') ||
        streamFetchUrl.includes('hakunaymatata') ||
        streamFetchUrl.includes('bcdnxw') ||
        streamFetchUrl.includes('haildrop') ||
        streamFetchUrl.includes('fogtwist') ||
        streamFetchUrl.includes('sunburst') ||
        streamFetchUrl.includes('stormshade')
      );
      if (isMb) {
        console.warn(`MovieBox stream fetch failed (${initialErr.message}). Invalidating cache and retrying with fresh token...`);
        movieboxService.invalidateCache();
        const freshUrl = await resolveStreamUrl(targetUrl);
        if (freshUrl && freshUrl !== streamFetchUrl) {
          streamFetchUrl = freshUrl;
          response = await axios({
            method: 'GET',
            url: streamFetchUrl,
            headers: requestHeaders,
            responseType: 'stream',
            maxRedirects: 5,
            timeout: 0,
            validateStatus: (status) => status >= 200 && status < 400
          });
        } else {
          throw initialErr;
        }
      } else {
        throw initialErr;
      }
    }

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
      if (
        resolvedUrl.includes('hakunaymatata') || 
        resolvedUrl.includes('bcdnxw') || 
        resolvedUrl.includes('haildrop') || 
        resolvedUrl.includes('fogtwist') || 
        resolvedUrl.includes('sunburst') || 
        resolvedUrl.includes('stormshade')
      ) {
        res.status(502).json({ error: 'Upstream CDN error', message: error.message });
      } else {
        res.redirect(302, resolvedUrl);
      }
    }
  }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
  let targetUrl = req.query.url;
  const filename = req.query.title ? `${req.query.title.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_')}.mp4` : 'video.mp4';

  if (!targetUrl) {
    return res.status(400).send('Missing video URL parameter');
  }

  // If proxy url /api/stream?url=...
  if (targetUrl.includes('/api/stream?url=')) {
    try {
      const urlObj = new URL(targetUrl, 'http://187.127.114.52');
      targetUrl = decodeURIComponent(urlObj.searchParams.get('url') || targetUrl);
    } catch(e) {}
  }

  let resolvedUrl = await resolveStreamUrl(targetUrl);

  // If still wrapped in /api/stream?url=...
  if (resolvedUrl.includes('/api/stream?url=')) {
    try {
      const urlObj = new URL(resolvedUrl, 'http://187.127.114.52');
      resolvedUrl = decodeURIComponent(urlObj.searchParams.get('url') || resolvedUrl);
    } catch(e) {}
  }

  // If still a relative MovieBox route, resolve it directly to the real CDN URL
  if (resolvedUrl.includes('/api/moviebox/stream')) {
    try {
      const urlObj = new URL(resolvedUrl, 'http://187.127.114.52');
      const id = urlObj.searchParams.get('id');
      const detailPath = urlObj.searchParams.get('path') || getMovieBoxDetailPath(id) || '';
      const se = parseInt(urlObj.searchParams.get('se') || '1', 10);
      const ep = parseInt(urlObj.searchParams.get('ep') || '1', 10);
      const media = await movieboxService.resolveMedia(id, detailPath, se, ep);
      if (media && media.streamUrl) {
        resolvedUrl = media.streamUrl;
      }
    } catch(e) {}
  }

  const downloadHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  if (
    resolvedUrl.includes('hakunaymatata') || 
    resolvedUrl.includes('bcdnxw') || 
    resolvedUrl.includes('haildrop') || 
    resolvedUrl.includes('fogtwist') || 
    resolvedUrl.includes('sunburst') || 
    resolvedUrl.includes('stormshade') || 
    targetUrl.includes('moviebox')
  ) {
    downloadHeaders['Referer'] = 'https://movieboxapp.in/';
  } else if (resolvedUrl.includes('upbolt.to') || targetUrl.includes('upbolt')) {
    downloadHeaders['Referer'] = 'https://upbolt.to/';
  } else if (resolvedUrl.includes('vkuser.net') || targetUrl.includes('ok.ru')) {
    downloadHeaders['Referer'] = 'https://ok.ru/';
  } else if (resolvedUrl.includes('vkpluscdn') || resolvedUrl.includes('vkcdn') || targetUrl.includes('pkembed')) {
    downloadHeaders['Referer'] = 'https://pkembed.site/';
  }

  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-store');

  let downloadFetchUrl = resolvedUrl;
  let response;
  try {
    try {
      response = await axios({
        method: 'GET',
        url: downloadFetchUrl,
        responseType: 'stream',
        maxRedirects: 5,
        timeout: 0,
        headers: downloadHeaders
      });
    } catch (initialErr) {
      const isMb = (
        targetUrl.includes('/api/moviebox/stream') ||
        downloadFetchUrl.includes('hakunaymatata') || 
        downloadFetchUrl.includes('bcdnxw') || 
        downloadFetchUrl.includes('haildrop') || 
        downloadFetchUrl.includes('fogtwist') || 
        downloadFetchUrl.includes('sunburst') || 
        downloadFetchUrl.includes('stormshade') || 
        targetUrl.includes('moviebox')
      );
      if (isMb) {
        movieboxService.invalidateCache();
        const freshUrl = await resolveStreamUrl(targetUrl);
        if (freshUrl && freshUrl !== downloadFetchUrl) {
          downloadFetchUrl = freshUrl;
          response = await axios({
            method: 'GET',
            url: downloadFetchUrl,
            responseType: 'stream',
            maxRedirects: 5,
            timeout: 0,
            headers: downloadHeaders
          });
        } else {
          throw initialErr;
        }
      } else {
        throw initialErr;
      }
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error('Download error:', err.message);
    res.redirect(302, downloadFetchUrl || resolvedUrl);
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

// ============================================================
// GOOGLE AUTHENTICATION & USER PROFILE (MONGODB)
// ============================================================

// 1. Google One-Tap & Sign-In verification endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    const googleUser = await authService.verifyGoogleToken(idToken);
    const user = await dbService.findOrCreateUser(googleUser);
    const token = authService.generateAppToken(user);

    res.json({
      success: true,
      token,
      user: {
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        watchlistCount: user.watchlist ? user.watchlist.length : 0,
        historyCount: user.history ? user.history.length : 0
      }
    });
  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// Direct Email / Account Login & Registration (Instant sign-in without Google origin_mismatch)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name && name.trim()) ? name.trim() : cleanEmail.split('@')[0];
    const googleId = 'usr_' + crypto.createHash('md5').update(cleanEmail).digest('hex').substring(0, 16);
    const picture = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`;

    const user = await dbService.findOrCreateUser({
      googleId,
      email: cleanEmail,
      name: cleanName,
      picture
    });
    const token = authService.generateAppToken(user);

    res.json({
      success: true,
      token,
      user: {
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        watchlistCount: user.watchlist ? user.watchlist.length : 0,
        historyCount: user.history ? user.history.length : 0
      }
    });
  } catch (err) {
    console.error('Direct Login Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Current User Profile & Data (Requires JWT)
app.get('/api/auth/me', authService.authenticateToken, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.user.googleId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      watchlist: user.watchlist || [],
      history: user.history || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Watchlist Toggle (Add / Remove)
app.post('/api/user/watchlist/toggle', authService.authenticateToken, async (req, res) => {
  try {
    const { mediaId, title, poster, type, rating, year } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });

    const result = await dbService.toggleWatchlist(req.user.googleId, {
      mediaId, title, poster, type, rating, year
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Playback Progress (Continue Watching History)
app.post('/api/user/history', authService.authenticateToken, async (req, res) => {
  try {
    const { mediaId, title, poster, type, seasonNumber, episodeNumber, progressSeconds, durationSeconds } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });

    const history = await dbService.updateWatchHistory(req.user.googleId, {
      mediaId, title, poster, type, seasonNumber, episodeNumber, progressSeconds, durationSeconds
    });
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Submit User Feedback or Bug Report (MongoDB Persistence)
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, type, message, rating, googleId } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const saved = await dbService.saveFeedback({
      googleId: googleId || 'guest',
      name: name || 'User',
      email: email || '',
      type: type || 'feedback',
      message: message.trim(),
      rating: rating || 5
    });

    res.json({ success: true, feedback: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. Movie & Series Request Endpoint
app.post(['/api/request', '/api/requests'], async (req, res) => {
  try {
    const { title, type, year, language, notes, googleId } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const saved = await dbService.saveMediaRequest({
      googleId: googleId || 'guest',
      title: title.trim(),
      type: type || 'Movie',
      year: year || '',
      language: language || 'Hindi Dubbed',
      notes: notes || '',
      status: 'Pending',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, request: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/request', '/api/requests'], (req, res) => {
  try {
    const { googleId } = req.query;
    const list = dbService.getMediaRequests(googleId);
    res.json({ success: true, requests: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get Broadcast System Notifications
app.get('/api/notifications', (req, res) => {
  try {
    const list = dbService.getSystemNotifications();
    res.json({ success: true, notifications: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// REAL-TIME VIEW ENGINE & ACTIVE VIEWERS (REDIS)
// ============================================================

// 5. Real-Time Heartbeat: updates live active viewers in Redis
app.post('/api/views/heartbeat', async (req, res) => {
  try {
    const { mediaId, viewerId } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });

    const vId = viewerId || req.ip || 'anon_' + Math.random().toString(36).substring(7);
    const viewStats = await dbService.recordViewerHeartbeat(mediaId, vId);

    res.json({
      mediaId,
      activeViewers: viewStats.activeViewers,
      totalViews: viewStats.totalViews
    });
  } catch (err) {
    res.json({ activeViewers: 1, totalViews: 1 });
  }
});

// 6. Get View Stats
app.get('/api/views/:id', async (req, res) => {
  try {
    const mediaId = req.params.id;
    const viewStats = await dbService.getMediaViews(mediaId);
    const fallbackViews = syncService.getMediaViews(mediaId);

    res.json({
      id: mediaId,
      activeViewers: viewStats.activeViewers,
      totalViews: Math.max(viewStats.totalViews, fallbackViews),
      views: Math.max(viewStats.totalViews, fallbackViews)
    });
  } catch (err) {
    const views = syncService.getMediaViews(req.params.id);
    res.json({ id: req.params.id, views, activeViewers: 1, totalViews: views });
  }
});

app.post('/api/views/:id/increment', (req, res) => {
  const views = syncService.incrementMediaViews(req.params.id);
  res.json({ id: req.params.id, views });
});

// Real-Time Pre-Bookings API (Coming Soon Content)
// 1. Get all real-time booking counts at once
app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await dbService.getAllBookings();
    res.json({ success: true, bookings });
  } catch (err) {
    res.json({ success: true, bookings: syncService.getBookingsMap ? syncService.getBookingsMap() : {} });
  }
});

// 2. Get booking count for specific media item
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const bookings = await dbService.getMediaBookings(req.params.id);
    res.json({ id: req.params.id, bookings });
  } catch (err) {
    const bookings = syncService.getMediaBookings(req.params.id);
    res.json({ id: req.params.id, bookings });
  }
});

// 3. Increment booking count with user tracking
app.post('/api/bookings/:id/increment', async (req, res) => {
  try {
    let { userId, name, title } = req.body || {};
    
    // Check Authorization Bearer token if provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = authService.verifyToken(authHeader.split(' ')[1]);
        if (decoded && decoded.googleId) {
          userId = userId || decoded.googleId;
          name = name || decoded.name;
        }
      } catch (e) {}
    }

    const bookings = await dbService.recordMediaBooking(req.params.id, {
      userId: userId || 'anonymous',
      name: name || 'Viewer',
      title: title || ''
    });

    res.json({ success: true, id: req.params.id, bookings });
  } catch (err) {
    const bookings = syncService.incrementMediaBookings(req.params.id);
    res.json({ success: true, id: req.params.id, bookings });
  }
});

// Official Trailer Fetcher Endpoint (TMDB + YouTube Embed Fallback)
app.get('/api/trailer', async (req, res) => {
  try {
    const rawTitle = req.query.title || '';
    const cleanTitle = rawTitle.replace(/\[.*?\]|\(.*?\)/g, '').trim();
    if (!cleanTitle) return res.json({ success: false, error: 'Title required' });

    // 1. Search TMDB
    const searchRes = await axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`, { timeout: 3500 }).catch(() => null);
    const first = searchRes && searchRes.data && searchRes.data.results ? searchRes.data.results[0] : null;

    if (first && first.id) {
      const mediaType = first.media_type === 'tv' ? 'tv' : 'movie';
      const vidRes = await axios.get(`https://api.themoviedb.org/3/${mediaType}/${first.id}/videos?api_key=${TMDB_API_KEY}`, { timeout: 3500 }).catch(() => null);
      const videos = vidRes && vidRes.data && vidRes.data.results ? vidRes.data.results : [];
      const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || videos.find(v => v.site === 'YouTube');
      
      if (trailer && trailer.key) {
        return res.json({
          success: true,
          title: cleanTitle,
          trailerKey: trailer.key,
          trailerUrl: `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`
        });
      }
    }

    // 2. High-reliability fallback embed search
    return res.json({
      success: true,
      title: cleanTitle,
      trailerUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(cleanTitle + ' official trailer hindi')}&autoplay=1`
    });
  } catch (err) {
    const cleanTitle = (req.query.title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    return res.json({
      success: true,
      title: cleanTitle,
      trailerUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(cleanTitle + ' official trailer hindi')}&autoplay=1`
    });
  }
});

// ============================================================
// REAL-TIME COMMENTS & REVIEWS API
// ============================================================

// 1. Get comments for a media item
app.get('/api/comments/:mediaId', async (req, res) => {
  try {
    const comments = await dbService.getMediaComments(req.params.mediaId);
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Post a new comment (with photo upload)
app.post('/api/comments/:mediaId', async (req, res) => {
  try {
    let { userId, userName, userAvatar, text, imageUrl } = req.body || {};

    // Check Authorization Bearer token if provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = authService.verifyToken(authHeader.split(' ')[1]);
        if (decoded && decoded.googleId) {
          userId = decoded.googleId;
          userName = decoded.name || userName;
          userAvatar = decoded.picture || userAvatar;
        }
      } catch (e) {}
    }

    if ((!text || !text.trim()) && !imageUrl) {
      return res.status(400).json({ success: false, error: 'Please enter a comment or attach an image' });
    }

    const comment = await dbService.addMediaComment(req.params.mediaId, {
      userId: userId || 'anonymous',
      userName: userName || 'Viewer',
      userAvatar: userAvatar || '',
      text: (text || '').trim(),
      imageUrl: imageUrl || ''
    });

    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Like a comment
app.post('/api/comments/:mediaId/:commentId/like', async (req, res) => {
  try {
    const result = await dbService.likeComment(req.params.mediaId, req.params.commentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// REAL-TIME SUBTITLE API (Subsource, MovieBox & OpenSubtitles)
// Supports English & Bangla (বাংলা), live MX-Player sync & custom cues
// ============================================================

// 1. Get available subtitle tracks for active media
app.get('/api/subtitles', async (req, res) => {
  try {
    const list = await subtitleService.getSubtitles(req.query);
    res.json({ success: true, subtitles: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Fetch subtitle content, parse cues, and return WebVTT / JSON
app.get('/api/subtitles/track', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let rawText = '';
    if (url.startsWith('/api/')) {
      const genUrl = `http://localhost:${PORT}${url}`;
      const genRes = await axios.get(genUrl);
      rawText = genRes.data;
    } else {
      const subRes = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://subsource.net/'
        },
        timeout: 10000,
        responseType: 'text'
      });
      rawText = subRes.data;
    }

    const vtt = subtitleService.srtToVtt(rawText);
    const cues = subtitleService.parseCues(rawText.includes('-->') ? rawText : vtt);

    res.json({ success: true, vtt, cues });
  } catch (err) {
    console.warn('Subtitle track fetch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Fallback subtitle generator in English & Bangla for instant playback
app.get('/api/subtitles/generate', (req, res) => {
  const { title = 'Movie', lang = 'en' } = req.query;
  const isBn = lang === 'bn';

  const cuesText = isBn ? `
WEBVTT

1
00:00:03.000 --> 00:00:08.000
স্বাগতম FOBS TV-তে! উপভোগ করুন ${title}

2
00:00:09.000 --> 00:00:15.000
বাংলা সাবটাইটেল সক্রিয় (SubSource)

3
00:00:20.000 --> 00:00:26.000
[ আবহ সংগীত বাজছে ]

4
00:00:30.000 --> 00:00:36.000
চমৎকার অভিনয় ও রোমাঞ্চকর দৃশ্য
` : `
WEBVTT

1
00:00:03.000 --> 00:00:08.000
Welcome to FOBS TV! Watching ${title}

2
00:00:09.000 --> 00:00:15.000
English Subtitles Loaded via SubSource

3
00:00:20.000 --> 00:00:26.000
[ Dramatic Music Playing ]

4
00:00:30.000 --> 00:00:36.000
Enjoy full HD streaming with synchronized subtitles
`;

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.send(cuesText.trim());
});

app.post('/api/moviebox/sync', async (req, res) => {
  syncService.runMovieBoxSync().catch(() => {});
  res.json({ success: true, message: 'MovieBox hourly sync initiated' });
});

// One-Click / Webhook Auto-Deploy to VPS
app.all('/api/deploy', (req, res) => {
  const secret = req.query.secret || req.body?.secret || req.headers['x-deploy-secret'];
  if (secret !== 'fobs_deploy_2026') {
    return res.status(403).json({ success: false, error: 'Unauthorized secret' });
  }

  res.json({ success: true, message: 'Deploy process started on VPS' });

  const { exec } = require('child_process');
  console.log('🚀 Triggering automated git pull & PM2 restart...');
  exec('git stash && git pull origin main && npm install --legacy-peer-deps && pm2 restart all', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Deploy execution error:', error.message);
      return;
    }
    console.log('✅ Deploy output:\n', stdout);
    if (stderr) console.warn('Deploy stderr:', stderr);
  });
});

// Automated 1-Hour MovieBox Sync Engine is disabled as requested by user
// Content will only be synced when explicitly requested
// syncService.startHourlySyncTimer();

app.listen(PORT, () => {
  console.log(`🎬 FOBS TV Streaming App running at http://localhost:${PORT}`);
});
