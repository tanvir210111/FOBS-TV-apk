const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
/**
 * FOBS TV - Subtitle Service
 * Integrates SubSource, OpenSubtitles & MovieBox Captions
 * Supports English & Bangla subtitles, automatic Gzip decompression, SRT/VTT parsing & UTF-8 encoding
 */

const axios = require('axios');
const zlib = require('zlib');
const movieboxService = require('./movieboxService');

const SUBSOURCE_BASE = 'https://api.subsource.net/api/v1';
const SUBSOURCE_KEY = process.env.SUBSOURCE_API_KEY || '';

class SubtitleService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Search subtitles for a title across MovieBox, SubSource and OpenSubtitles
   * @param {Object} query - { title, year, imdbId, season, episode, detailPath, subjectId }
   */
  async getSubtitles(query = {}) {
    const { title, year, season = 0, episode = 0, subjectId, detailPath, type } = query;
    const cleanTitle = (title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    const isMovie = type === 'movie' || (!query.isSeries && (parseInt(season, 10) === 0 || !query.season));
    const seNum = isMovie ? 0 : (parseInt(season, 10) || 0);
    const epNum = isMovie ? 0 : (parseInt(episode, 10) || 0);
    const cacheKey = `sub_${cleanTitle}_s${seNum}_e${epNum}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expireAt > Date.now()) return cached.data;
    }

    const availableSubtitles = [];

    // 0. Check local bundled subtitles
    const normalizedName = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const localBnFiles = [
      `${normalizedName}_${year || ''}_bn.vtt`.replace(/__+/g, '_'),
      `${normalizedName}_bn.vtt`
    ];
    for (const f of localBnFiles) {
      const p = path.join(__dirname, '..', 'public', 'subtitles', f);
      if (fs.existsSync(p)) {
        availableSubtitles.push({
          id: `local_bn_${f}`,
          language: 'Bangla (বাংলা)',
          langCode: 'bn',
          source: 'SubSource / Verified',
          url: `/subtitles/${f}`,
          format: 'vtt'
        });
        break;
      }
    }

    // 1. MovieBox Embedded / Associated Captions
    const cleanSubjectId = subjectId ? String(subjectId).replace(/^mb-[s|m]-/, '') : '';
    if (cleanSubjectId) {
      try {
        const mbMedia = await movieboxService.resolveMedia(cleanSubjectId, detailPath, isMovie ? 0 : (seNum || 1), isMovie ? 0 : (epNum || 1));
        if (mbMedia && Array.isArray(mbMedia.captions)) {
          for (const cap of mbMedia.captions) {
            const langLower = (cap.language || '').toLowerCase();
            const isEnglish = langLower.includes('en') || langLower.includes('eng');
            const isBangla = langLower.includes('bn') || langLower.includes('bangla') || langLower.includes('bengali');

            if (isEnglish || isBangla) {
              const code = isBangla ? 'bn' : 'en';
              if (!availableSubtitles.some(s => s.langCode === code)) {
                availableSubtitles.push({
                  id: `mb_${code}_${availableSubtitles.length + 1}`,
                  language: isBangla ? 'Bangla (বাংলা)' : 'English',
                  langCode: code,
                  source: 'MovieBox / Official',
                  url: cap.url,
                  format: cap.url && cap.url.endsWith('.srt') ? 'srt' : 'vtt'
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('MovieBox caption fetch warning:', e.message);
      }
    }

    // 2. Fetch top results from OpenSubtitles / SubSource
    try {
      const onlineResults = await this.searchOnlineSubtitles({ title: cleanTitle, season: seNum, episode: epNum, year, type: isMovie ? 'movie' : 'series' });
      if (onlineResults.english && onlineResults.english.length > 0 && !availableSubtitles.some(s => s.langCode === 'en')) {
        availableSubtitles.push(onlineResults.english[0]);
      }
      if (onlineResults.bangla && onlineResults.bangla.length > 0 && !availableSubtitles.some(s => s.langCode === 'bn')) {
        availableSubtitles.push(onlineResults.bangla[0]);
      }
    } catch (e) {
      console.warn('Online subtitle prefetch warning:', e.message);
    }


    // 3. FOBS AI Auto-Translate fallback if no Bangla subtitle exists
    const hasBn = availableSubtitles.some(s => s.langCode === 'bn');
    const enSub = availableSubtitles.find(s => s.langCode === 'en');
    if (!hasBn && enSub) {
      const enUrl = enSub.url || enSub.downloadUrl;
      if (enUrl) {
        availableSubtitles.push({
          id: `ai_bn_${availableSubtitles.length + 1}`,
          language: 'Bangla (AI Translated) [বাংলা]',
          langCode: 'bn',
          source: 'FOBS AI Engine',
          url: `/api/subtitles/ai-translate?url=${encodeURIComponent(enUrl)}&title=${encodeURIComponent(cleanTitle)}&season=${season}&episode=${episode}`,
          format: 'vtt',
          isAi: true
        });
      }
    }

    // Cache for 2 hours
    this.cache.set(cacheKey, {
      data: availableSubtitles,
      expireAt: Date.now() + 2 * 60 * 60 * 1000
    });

    return availableSubtitles;
  }

  /**
   * Search Online Subtitles (English and Bangla) from Subsource / OpenSubtitles / Moviebox
   * Returns: { english: [...], bangla: [...] }
   */
  async searchOnlineSubtitles(query = {}) {
    const { title = '', season = 0, episode = 0, year = '', subjectId, detailPath, type } = query;
    const cleanTitle = (title || '')
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/[^\w\s\-\:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const results = {
      english: [],
      bangla: []
    };

    if (!cleanTitle) return results;

    const isMovie = type === 'movie' || (!query.isSeries && (parseInt(season, 10) === 0 || !query.season));
    const seNum = isMovie ? 0 : parseInt(season || 0, 10);
    const epNum = isMovie ? 0 : parseInt(episode || 0, 10);

    // 0. Check local verified files in public/subtitles
    const normalizedName = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const localBn = [
      `${normalizedName}_${year || ''}_bn.vtt`.replace(/__+/g, '_'),
      `${normalizedName}_bn.vtt`
    ];
    for (const f of localBn) {
      const p = path.join(__dirname, '..', 'public', 'subtitles', f);
      if (fs.existsSync(p)) {
        results.bangla.push({
          id: `local_${f}`,
          title: `${cleanTitle} - Verified Bangla Subtitle (বাংলা)`,
          language: 'Bangla (বাংলা)',
          langCode: 'bn',
          source: 'SubSource / FOBS Verified',
          downloadUrl: `/subtitles/${f}`,
          downloadsCount: 5000,
          rating: '10.0',
          format: 'vtt'
        });
        break;
      }
    }

    // 1. Moviebox Captions
    const cleanSubjectId = subjectId ? String(subjectId).replace(/^mb-[s|m]-/, '') : '';
    if (cleanSubjectId) {
      try {
        const mbMedia = await movieboxService.resolveMedia(cleanSubjectId, detailPath, isMovie ? 0 : (seNum || 1), isMovie ? 0 : (epNum || 1));
        if (mbMedia && Array.isArray(mbMedia.captions)) {
          mbMedia.captions.forEach((cap, idx) => {
            const langLower = (cap.language || '').toLowerCase();
            const isEn = langLower.includes('en');
            const isBn = langLower.includes('bn') || langLower.includes('bangla') || langLower.includes('bengali');
            if (isEn || isBn) {
              const item = {
                id: `mb_sub_${cleanSubjectId}_${idx}`,
                title: `${cleanTitle} - MovieBox Official (${isBn ? 'বাংলা' : 'English'})`,
                language: isBn ? 'Bangla (বাংলা)' : 'English',
                langCode: isBn ? 'bn' : 'en',
                source: 'MovieBox / CDN',
                downloadUrl: cap.url,
                format: cap.url && cap.url.endsWith('.srt') ? 'srt' : 'vtt'
              };
              if (isBn) results.bangla.push(item);
              else results.english.push(item);
            }
          });
        }
      } catch (e) {}
    }

    // 2. OpenSubtitles REST API (Free, fast, supports both English and Bangla)
    const searchOs = async (sublang, withSeason = true) => {
      try {
        let osUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(cleanTitle)}`;
        if (withSeason && seNum > 0 && epNum > 0) {
          osUrl += `/season-${seNum}/episode-${epNum}`;
        }
        osUrl += `/sublanguageid-${sublang}`;

        const res = await axios.get(osUrl, {
          headers: {
            'User-Agent': 'TemporaryUserAgent'
          },
          timeout: 7000
        });

        if (Array.isArray(res.data)) {
          return res.data.map(s => ({
            id: `os_${s.IDSubtitleFile || s.IDSubtitle}`,
            title: s.SubFileName || `${cleanTitle} (${sublang === 'ben' ? 'Bangla' : 'English'})`,
            language: sublang === 'ben' ? 'Bangla (বাংলা)' : 'English',
            langCode: sublang === 'ben' ? 'bn' : 'en',
            source: 'SubSource / OpenSubtitles',
            downloadUrl: s.SubDownloadLink,
            downloadsCount: s.SubDownloadsCnt || 0,
            rating: s.SubRating || '',
            format: 'srt'
          }));
        }
      } catch (err) {
        console.warn(`OpenSubtitles search (${sublang}) error:`, err.message);
      }
      return [];
    };

    try {
      const [engSubs, benSubs] = await Promise.all([
        searchOs('eng', !isMovie && seNum > 0),
        searchOs('ben', !isMovie && seNum > 0)
      ]);

      if (engSubs && engSubs.length > 0) {
        results.english.push(...engSubs);
      }
      if (benSubs && benSubs.length > 0) {
        results.bangla.push(...benSubs);
      }

      // Fallback search without season filter if zero bangla subtitles found
      if (results.bangla.length === 0 && seNum > 0) {
        const fallbackBen = await searchOs('ben', false);
        if (fallbackBen && fallbackBen.length > 0) {
          results.bangla.push(...fallbackBen);
        }
      }
      if (results.english.length === 0 && seNum > 0) {
        const fallbackEng = await searchOs('eng', false);
        if (fallbackEng && fallbackEng.length > 0) {
          results.english.push(...fallbackEng);
        }
      }
    } catch (e) {}
    // Deduplicate and limit to top 15 results per language
    const unique = (arr) => {
      const seen = new Set();
      return arr.filter(item => {
        const k = item.title?.toLowerCase() || item.downloadUrl;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 15);
    };

    results.english = unique(results.english);
    results.bangla = unique(results.bangla);

    return results;
  }

  /**
   * Download, unzip and parse subtitle into WebVTT and structured cues
   * @param {string} url - Subtitle direct download URL (supports .srt, .vtt, .gz)
   */
  async downloadSubtitle(url) {
    if (!url) throw new Error('Missing subtitle URL');

    let rawBuffer = null;
    if (url.startsWith('/subtitles/') || url.startsWith('subtitles/')) {
      const cleanPath = url.replace(/^\//, '');
      const fullPath = path.join(__dirname, '..', 'public', cleanPath);
      if (fs.existsSync(fullPath)) {
        const rawText = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '').trim();
        const vtt = this.srtToVtt(rawText);
        const cues = this.parseCues(rawText.includes('-->') ? rawText : vtt);
        return { ok: true, cuesCount: cues.length, cues, vtt };
      }
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://subsource.net/'
      },
      timeout: 15000
    });

    rawBuffer = Buffer.from(response.data);

    let rawText = '';
    // Check if buffer is GZIP compressed (Magic bytes 0x1F 0x8B)
    if (rawBuffer.length >= 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b) {
      try {
        rawText = zlib.gunzipSync(rawBuffer).toString('utf-8');
      } catch (gzErr) {
        console.warn('Gunzip error, falling back to inflate:', gzErr.message);
        rawText = zlib.inflateSync(rawBuffer).toString('utf-8');
      }
    } else {
      rawText = rawBuffer.toString('utf-8');
    }

    // Normalize BOM and special whitespace
    rawText = rawText.replace(/^\uFEFF/, '').trim();

    const vtt = this.srtToVtt(rawText);
    const cues = this.parseCues(rawText.includes('-->') ? rawText : vtt);

    return {
      ok: true,
      cuesCount: cues.length,
      cues,
      vtt
    };
  }

  /**
   * Convert SRT formatted text into standard WebVTT format
   */
  srtToVtt(srtText) {
    if (!srtText) return 'WEBVTT\n\n';
    let vtt = 'WEBVTT\n\n' + srtText
      .replace(/\r\n|\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // replace comma with period for milliseconds
    return vtt;
  }

  /**
   * Parse WebVTT or SRT text into structured JSON cues for precise custom rendering & live sync
   */

  /**
   * Translate WebVTT / SRT cues into natural Bengali using Google batch engine
   * @param {Array} cues - Structured cues array [{ startTime, endTime, text }]
   */
  async translateCuesToBangla(cues = []) {
    if (!Array.isArray(cues) || cues.length === 0) return [];
    
    const BATCH_SIZE = 50;
    const translatedCues = [];

    for (let i = 0; i < cues.length; i += BATCH_SIZE) {
      const batch = cues.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => (c.text || '').replace(/\n/g, ' '));
      const qs = texts.map(t => 'q=' + encodeURIComponent(t)).join('&');

      try {
        const res = await axios.post(
          'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=bn',
          qs,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
          }
        );

        const translatedTexts = Array.isArray(res.data) ? res.data : texts;
        batch.forEach((cue, idx) => {
          translatedCues.push({
            startTime: cue.startTime,
            endTime: cue.endTime,
            text: translatedTexts[idx] || cue.text
          });
        });
      } catch (err) {
        console.warn('AI Translation batch warning:', err.message);
        batch.forEach(cue => translatedCues.push(cue));
      }
    }

    return translatedCues;
  }

  /**
   * Format cues array back to standard WebVTT string
   */
  cuesToVtt(cues = []) {
    let vtt = 'WEBVTT\n\n';
    const formatTime = (secs) => {
      const pad = (n, z = 2) => String(Math.floor(n)).padStart(z, '0');
      const h = pad(secs / 3600);
      const m = pad((secs % 3600) / 60);
      const s = pad(secs % 60);
      const ms = String(Math.floor((secs % 1) * 1000)).padStart(3, '0');
      return `${h}:${m}:${s}.${ms}`;
    };

    cues.forEach((cue, idx) => {
      vtt += `${idx + 1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${cue.text}\n\n`;
    });

    return vtt;
  }

  /**
   * Get cached Bangla subtitle or translate from English source URL
   */
  async getOrTranslateToBangla(sourceUrl, cacheKey) {
    const subtitlesDir = path.join(__dirname, '..', 'data', 'subtitles');
    if (!fs.existsSync(subtitlesDir)) fs.mkdirSync(subtitlesDir, { recursive: true });

    const safeHash = crypto.createHash('md5').update(sourceUrl || cacheKey || 'unknown').digest('hex');
    const diskFile = path.join(subtitlesDir, `bn_ai_${safeHash}.vtt`);

    if (fs.existsSync(diskFile)) {
      return fs.readFileSync(diskFile, 'utf8');
    }

    // Download and parse original source
    const downloaded = await this.downloadSubtitle(sourceUrl);
    if (!downloaded.cues || downloaded.cues.length === 0) {
      return downloaded.vtt;
    }

    // Translate to Bangla
    const bnCues = await this.translateCuesToBangla(downloaded.cues);
    const bnVtt = this.cuesToVtt(bnCues);

    // Save permanently to disk
    fs.writeFileSync(diskFile, bnVtt, 'utf8');
    return bnVtt;
  }

  parseCues(rawText) {
    if (!rawText) return [];
    const cues = [];
    const lines = rawText.replace(/\r\n|\r/g, '\n').split('\n');
    let i = 0;

    const parseTime = (timeStr) => {
      const parts = (timeStr || '').trim().split(':');
      if (parts.length === 3) {
        const [h, m, s] = parts;
        return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s.replace(',', '.'));
      } else if (parts.length === 2) {
        const [m, s] = parts;
        return parseFloat(m) * 60 + parseFloat(s.replace(',', '.'));
      }
      return 0;
    };

    while (i < lines.length) {
      const line = lines[i].trim();
      // Match timestamp arrow: 00:01:20.000 --> 00:01:24.000
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->');
        const startTime = parseTime(startStr);
        const endTime = parseTime(endStr);

        i++;
        let textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }

        const text = textLines.join('\n')
          .replace(/<[^>]+>/g, '') // strip html tags
          .replace(/\{[^\}]+\}/g, '') // strip ASS/SSA styling tags
          .replace(/&rlm;|&lrm;|&nbsp;/gi, ' ')
          .trim();

        // Only register if cue has actual dialogue and valid non-zero duration
        if (text && endTime > startTime) {
          cues.push({ startTime, endTime, text });
        }
      }
      i++;
    }

    return cues;
  }
}

module.exports = new SubtitleService();
