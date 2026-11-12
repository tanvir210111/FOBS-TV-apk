const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
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
    const cleanTitle = (title || '')
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/\b(s\d+\s*-\s*s\d+|s\d+-s\d+|season\s*\d+|part\s*\d+|s\d+)\b/gi, '')
      .replace(/[\-\–\—\:]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const isMovie = type === 'movie' || (!query.isSeries && (parseInt(season, 10) === 0 || !query.season));
    const seNum = isMovie ? 0 : (parseInt(season, 10) || 0);
    const epNum = isMovie ? 0 : (parseInt(episode, 10) || 0);

    // Strictly for The Remarried Empress:
    // Remove all AI and SubSource bangla subtitles; keep ONLY English (ESub) and FOBS Team Special Sub!
    const isRemarriedEmpress = cleanTitle.toLowerCase().includes('remarried empress');
    if (isRemarriedEmpress) {
      const rawEp = parseInt(query.episode || query.ep || episode || 1, 10) || 1;
      const ep = Math.max(1, Math.min(5, rawEp));
      return [
        {
          id: `fobs_special_sub_remarried_ep${ep}`,
          language: 'FOBS Team Special Sub (বাংলা)',
          langCode: 'bn',
          source: 'FOBS Team Special',
          url: `/subtitles/the_remarried_empress_s1_ep${ep}_fobs.vtt`,
          downloadUrl: `/subtitles/the_remarried_empress_s1_ep${ep}_fobs.vtt`,
          format: 'vtt',
          isFobsSpecial: true,
          isHuman: true
        },
        {
          id: `local_en_the_remarried_empress_s1_ep${ep}_en`,
          language: 'English',
          langCode: 'en',
          source: 'Official / ESub',
          url: `/subtitles/the_remarried_empress_s1_ep${ep}_en.vtt`,
          downloadUrl: `/subtitles/the_remarried_empress_s1_ep${ep}_en.vtt`,
          format: 'vtt'
        }
      ];
    }
    const cacheKey = `sub_${cleanTitle}_s${seNum}_e${epNum}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expireAt > Date.now()) {
        if (Array.isArray(cached.data) && cached.data.length > 0) {
          return cached.data;
        }
      }
    }

    const availableSubtitles = [];

    // 0. Check local bundled subtitles
    const normalizedName = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const localBnFiles = isMovie
      ? [
          `${normalizedName}_${year || ''}_bn.vtt`.replace(/__+/g, '_'),
          `${normalizedName}_bn.vtt`
        ]
      : [
          `${normalizedName}_s${seNum}_ep${epNum}_bn.vtt`,
          `${normalizedName}_s${seNum}_e${epNum}_bn.vtt`,
          `${normalizedName}_ep${epNum}_bn.vtt`,
          `${normalizedName}_e${epNum}_bn.vtt`
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

    const localEnFiles = isMovie
      ? [
          `${normalizedName}_${year || ''}_en.vtt`.replace(/__+/g, '_'),
          `${normalizedName}_en.vtt`
        ]
      : [
          `${normalizedName}_s${seNum}_ep${epNum}_en.vtt`,
          `${normalizedName}_s${seNum}_e${epNum}_en.vtt`,
          `${normalizedName}_ep${epNum}_en.vtt`,
          `${normalizedName}_e${epNum}_en.vtt`
        ];
    for (const f of localEnFiles) {
      const p = path.join(__dirname, '..', 'public', 'subtitles', f);
      if (fs.existsSync(p)) {
        availableSubtitles.push({
          id: `local_en_${f}`,
          language: 'English',
          langCode: 'en',
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
        const mbMedia = await movieboxService.resolveMedia(cleanSubjectId, detailPath, isMovie ? 0 : (seNum || 1), isMovie ? 0 : (epNum || 1), { requireCaptions: true });
        if (mbMedia && Array.isArray(mbMedia.captions)) {
          for (const cap of mbMedia.captions) {
            const lan = (cap.lan || '').toLowerCase();
            const langLower = (cap.language || '').toLowerCase();
            const lanName = (cap.lanName || '').toLowerCase();

            const isEnglish = lan === 'en' || langLower.includes('en') || langLower.includes('eng') || lanName.includes('english');
            const isBangla = lan === 'bn' || langLower.includes('bn') || langLower.includes('bangla') || langLower.includes('bengali') || (cap.language || '').includes('বাংলা') || (cap.lanName || '').includes('বাংলা');

            if (isEnglish || isBangla) {
              const code = isBangla ? 'bn' : 'en';
              const isAiSub = cap.url && cap.url.includes('/msubt/');
              const label = isBangla 
                ? (isAiSub ? 'Bangla (বাংলা) - MovieBox AI Sub' : 'Bangla (বাংলা) - Official Sub')
                : (isAiSub ? 'English - MovieBox AI Sub' : 'English - Official Sub');

              if (!availableSubtitles.some(s => s.url === cap.url)) {
                availableSubtitles.unshift({
                  id: `mb_${code}_${availableSubtitles.length + 1}`,
                  language: label,
                  langCode: code,
                  source: isAiSub ? 'MovieBox (AI)' : 'MovieBox (Official)',
                  url: cap.url,
                  downloadUrl: cap.url,
                  format: (cap.url && (cap.url.includes('.srt') || cap.url.endsWith('.srt'))) ? 'srt' : 'vtt',
                  isAi: isAiSub
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('MovieBox caption fetch warning:', e.message);
      }
    }

    // 2. Fetch top results from OpenSubtitles / SubSource (Human Subtitles)
    try {
      const onlineResults = await this.searchOnlineSubtitles({ title: cleanTitle, season: seNum, episode: epNum, year, type: isMovie ? 'movie' : 'series' });
      if (onlineResults.english && onlineResults.english.length > 0) {
        onlineResults.english.slice(0, 2).forEach(en => {
          const subUrl = en.url || en.downloadUrl;
          if (subUrl && !availableSubtitles.some(s => s.url === subUrl || s.downloadUrl === subUrl)) {
            availableSubtitles.push({
              ...en,
              url: subUrl,
              downloadUrl: subUrl,
              language: en.language.includes('Human') ? en.language : `${en.language} - OpenSubtitles (Human)`
            });
          }
        });
      }
      if (onlineResults.bangla && onlineResults.bangla.length > 0) {
        onlineResults.bangla.slice(0, 2).forEach(bn => {
          const subUrl = bn.url || bn.downloadUrl;
          if (subUrl && !availableSubtitles.some(s => s.url === subUrl || s.downloadUrl === subUrl)) {
            availableSubtitles.push({
              ...bn,
              url: subUrl,
              downloadUrl: subUrl,
              language: bn.language.includes('Human') ? bn.language : `${bn.language} - SubSource (Human)`
            });
          }
        });
      }
    } catch (e) {
      console.warn('Online subtitle prefetch warning:', e.message);
    }

    // 3. FOBS AI Auto-Translate fallback if user wants AI subtitle
    const enSub = availableSubtitles.find(s => s.langCode === 'en' && !s.isAi && s.url && s.url.includes('hakunaymatata'))
               || availableSubtitles.find(s => s.langCode === 'en' && !s.isAi)
               || availableSubtitles.find(s => s.langCode === 'en');
    if (enSub) {
      const enUrl = enSub.url || enSub.downloadUrl;
      if (enUrl && !availableSubtitles.some(s => s.id && s.id.startsWith('ai_bn_'))) {
        availableSubtitles.push({
          id: `ai_bn_generated`,
          language: 'Bangla (বাংলা) - AI Auto-Translate',
          langCode: 'bn',
          source: 'FOBS AI Translate',
          url: `/api/subtitles/ai-translate?url=${encodeURIComponent(enUrl)}&title=${encodeURIComponent(cleanTitle)}&season=${seNum}&episode=${epNum}`,
          format: 'vtt',
          isAi: true
        });
        // Pre-warm translation in background
        this.getOrTranslateToBangla(enUrl, `ai_${cleanTitle}_s${seNum}_e${epNum}`).catch(() => {});
      }
    }

    // Sort subtitles with strict user priority:
    // 1. Human Bangla (SubSource / OpenSubtitles / Local Verified)
    // 2. AI Bangla (MovieBox AI / FOBS AI Auto-Translate)
    // 3. English Subtitles (Human, then AI)
    availableSubtitles.sort((a, b) => {
      const isBnA = a.langCode === 'bn' || (a.language && a.language.toLowerCase().includes('bangla'));
      const isBnB = b.langCode === 'bn' || (b.language && b.language.toLowerCase().includes('bangla'));
      const isAiA = !!a.isAi || (a.language && a.language.toLowerCase().includes('ai')) || (a.source && a.source.toLowerCase().includes('ai'));
      const isAiB = !!b.isAi || (b.language && b.language.toLowerCase().includes('ai')) || (b.source && b.source.toLowerCase().includes('ai'));

      const isHumanBnA = isBnA && !isAiA;
      const isHumanBnB = isBnB && !isAiB;
      if (isHumanBnA && !isHumanBnB) return -1;
      if (!isHumanBnA && isHumanBnB) return 1;

      const isAiBnA = isBnA && isAiA;
      const isAiBnB = isBnB && isAiB;
      if (isAiBnA && !isAiBnB) return -1;
      if (!isAiBnA && isAiBnB) return 1;

      const isEnA = a.langCode === 'en' || (a.language && a.language.toLowerCase().includes('english'));
      const isEnB = b.langCode === 'en' || (b.language && b.language.toLowerCase().includes('english'));
      if (isEnA && !isEnB) return -1;
      if (!isEnA && isEnB) return 1;

      return 0;
    });

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
      .replace(/\b(s\d+\s*-\s*s\d+|s\d+-s\d+|season\s*\d+|part\s*\d+|s\d+)\b/gi, '')
      .replace(/[\-\–\—\:]+$/, '')
      .replace(/[^\w\s\-\:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const results = {
      english: [],
      bangla: []
    };

    if (!cleanTitle) return results;

    // The Remarried Empress uses only FOBS Special Sub + ESub
    if (cleanTitle.toLowerCase().includes('remarried empress')) {
      return results;
    }

    const isMovie = type === 'movie' || (!query.isSeries && (parseInt(season, 10) === 0 || !query.season));
    const seNum = isMovie ? 0 : parseInt(season || 0, 10);
    const epNum = isMovie ? 0 : parseInt(episode || 0, 10);

    // 0. Check local verified files in public/subtitles
    const normalizedName = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const localBn = isMovie
      ? [
          `${normalizedName}_${year || ''}_bn.vtt`.replace(/__+/g, '_'),
          `${normalizedName}_bn.vtt`
        ]
      : [
          `${normalizedName}_s${seNum}_ep${epNum}_bn.vtt`,
          `${normalizedName}_s${seNum}_e${epNum}_bn.vtt`,
          `${normalizedName}_ep${epNum}_bn.vtt`,
          `${normalizedName}_e${epNum}_bn.vtt`
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
          url: `/subtitles/${f}`,
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
                url: cap.url,
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
          family: 4,
          headers: {
            'User-Agent': 'TemporaryUserAgent'
          },
          timeout: 7000
        });

        if (Array.isArray(res.data)) {
          let list = res.data;
          // For series, strictly filter out any files that belong to a different episode!
          if (!isMovie && epNum > 0) {
            const filtered = list.filter(s => {
              if (s.SeriesEpisode !== undefined && s.SeriesEpisode !== null && s.SeriesEpisode !== '') {
                return parseInt(s.SeriesEpisode, 10) === epNum;
              }
              // Also check filename for episode number (e.g. E02, Ep02, 1x02)
              const fn = (s.SubFileName || '').toLowerCase();
              const epRegex = new RegExp(`(?:e|ep|episode)[0._-]?0*${epNum}(?:[^0-9]|$)`, 'i');
              return epRegex.test(fn);
            });
            if (filtered.length > 0) {
              list = filtered;
            }
          }

          return list.map(s => ({
            id: `os_${s.IDSubtitleFile || s.IDSubtitle}`,
            title: s.SubFileName || `${cleanTitle} (${sublang === 'ben' ? 'Bangla' : 'English'})`,
            language: sublang === 'ben' ? 'Bangla (বাংলা)' : 'English',
            langCode: sublang === 'ben' ? 'bn' : 'en',
            source: 'SubSource / OpenSubtitles',
            url: s.SubDownloadLink,
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

      // Only for movies do we fallback search without season/episode filter
      // (For series, searching without season/episode incorrectly attaches Episode 1 subtitle to all episodes!)
      if (isMovie && results.bangla.length === 0) {
        const fallbackBen = await searchOs('ben', false);
        if (fallbackBen && fallbackBen.length > 0) {
          results.bangla.push(...fallbackBen);
        }
      }
      if (isMovie && results.english.length === 0) {
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

    const downloadHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (url.includes('opensubtitles.org')) {
      // OpenSubtitles requires TemporaryUserAgent and rejects requests with foreign Referer
      downloadHeaders['User-Agent'] = 'TemporaryUserAgent';
    } else if (url.includes('subsource.net')) {
      downloadHeaders['Referer'] = 'https://subsource.net/';
    } else if (url.includes('hakunaymatata.com') || url.includes('moviebox')) {
      downloadHeaders['Referer'] = 'https://movieboxapp.in/';
      downloadHeaders['Origin'] = 'https://movieboxapp.in';
    }

    let response;
    try {
      response = await axios.get(url, {
        family: 4,
        responseType: 'arraybuffer',
        headers: downloadHeaders,
        timeout: 12000,
        maxRedirects: 10
      });
      rawBuffer = Buffer.from(response.data);
    } catch (dlErr) {
      // Retry with modern browser headers if TemporaryUserAgent failed or was blocked
      try {
        const retryHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8'
        };
        response = await axios.get(url, {
          family: 4,
          responseType: 'arraybuffer',
          headers: retryHeaders,
          timeout: 12000,
          maxRedirects: 10
        });
        rawBuffer = Buffer.from(response.data);
      } catch (retryErr) {
        console.warn(`Subtitle download failed for ${url} (${dlErr.message})`);
        return { ok: false, cuesCount: 0, cues: [], vtt: 'WEBVTT\n\n', error: dlErr.message };
      }
    }

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
    
    const BATCH_SIZE = 40;
    const batches = [];
    for (let i = 0; i < cues.length; i += BATCH_SIZE) {
      batches.push({ startIndex: i, cues: cues.slice(i, i + BATCH_SIZE) });
    }

    // Process up to 6 batches concurrently for lightning fast translation
    const CONCURRENCY = 6;
    const translatedCues = new Array(cues.length);

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const currentChunk = batches.slice(i, i + CONCURRENCY);
      await Promise.all(currentChunk.map(async (b) => {
        const texts = b.cues.map(c => (c.text || '').replace(/\n/g, ' '));
        const qs = texts.map(t => 'q=' + encodeURIComponent(t)).join('&');
        try {
          const res = await axios.post(
            'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=bn',
            qs,
            {
              family: 4,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 8000
            }
          );
          const translatedTexts = Array.isArray(res.data) ? res.data : texts;
          b.cues.forEach((cue, idx) => {
            translatedCues[b.startIndex + idx] = {
              startTime: cue.startTime,
              endTime: cue.endTime,
              text: translatedTexts[idx] || cue.text
            };
          });
        } catch (err) {
          b.cues.forEach((cue, idx) => {
            translatedCues[b.startIndex + idx] = {
              startTime: cue.startTime,
              endTime: cue.endTime,
              text: cue.text
            };
          });
        }
      }));
    }

    return translatedCues.filter(Boolean);
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
  async getOrTranslateToBangla(sourceUrl, cacheKey, meta = {}) {
    const subtitlesDir = path.join(__dirname, '..', 'data', 'subtitles');
    if (!fs.existsSync(subtitlesDir)) fs.mkdirSync(subtitlesDir, { recursive: true });

    const safeHash = crypto.createHash('md5').update(`${cacheKey || ''}__${sourceUrl || 'unknown'}`).digest('hex');
    const diskFile = path.join(subtitlesDir, `bn_ai_${safeHash}.vtt`);

    if (fs.existsSync(diskFile)) {
      const existing = fs.readFileSync(diskFile, 'utf8');
      if (existing && existing.trim().length > 30) {
        return existing;
      } else {
        try { fs.unlinkSync(diskFile); } catch (e) {}
      }
    }

    // Download and parse original source
    let downloaded = await this.downloadSubtitle(sourceUrl);
    if ((!downloaded.cues || downloaded.cues.length === 0) && meta.subjectId) {
      try {
        const mbMedia = await movieboxService.resolveMedia(meta.subjectId, meta.detailPath || '', meta.season || 0, meta.episode || 0, { forceRefresh: true });
        const freshEn = mbMedia?.captions?.find(c => (c.language || '').toLowerCase().includes('en'));
        if (freshEn && freshEn.url) {
          downloaded = await this.downloadSubtitle(freshEn.url);
        }
      } catch (_) {}
    }

    if (!downloaded.cues || downloaded.cues.length === 0) {
      return downloaded.vtt || 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\n[বাংলা সাবটাইটেল তৈরি হচ্ছে...]';
    }

    // Translate to Bangla
    const bnCues = await this.translateCuesToBangla(downloaded.cues);
    const bnVtt = this.cuesToVtt(bnCues);

    // Save permanently to disk only if non-empty
    if (bnCues.length > 0) {
      fs.writeFileSync(diskFile, bnVtt, 'utf8');
    }
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
