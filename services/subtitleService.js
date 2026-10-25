/**
 * FOBS TV - Subtitle Service
 * Integrates SubSource API, MovieBox Captions & OpenSubtitles
 * Supports English & Bangla subtitles, SRT/VTT parsing, and UTF-8 encoding
 */

const axios = require('axios');
const movieboxService = require('./movieboxService');

const SUBSOURCE_BASE = 'https://api.subsource.net/api/v1';
const SUBSOURCE_KEY = process.env.SUBSOURCE_API_KEY || ''; // User API key if configured

class SubtitleService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Search subtitles for a title across Subsource, MovieBox and Fallbacks
   * @param {Object} query - { title, year, imdbId, season, episode, detailPath, subjectId }
   */
  async getSubtitles(query = {}) {
    const { title, year, season = 0, episode = 0, subjectId, detailPath } = query;
    const cleanTitle = (title || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    const cacheKey = `sub_${cleanTitle}_s${season}_e${episode}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached.expireAt > Date.now()) return cached.data;
    }

    const availableSubtitles = [];

    // 1. MovieBox Embedded / Associated Captions
    const cleanSubjectId = subjectId ? String(subjectId).replace(/^mb-[s|m]-/, '') : '';
    if (cleanSubjectId) {
      try {
        const mbMedia = await movieboxService.resolveMedia(cleanSubjectId, detailPath, season || 1, episode || 1);
        if (mbMedia && Array.isArray(mbMedia.captions)) {
          for (const cap of mbMedia.captions) {
            const langLower = (cap.language || '').toLowerCase();
            const isEnglish = langLower.includes('en') || langLower.includes('eng');
            const isBangla = langLower.includes('bn') || langLower.includes('bangla') || langLower.includes('bengali');
            const isHindi = langLower.includes('hi') || langLower.includes('hindi');

            if (isEnglish || isBangla || isHindi) {
              availableSubtitles.push({
                id: `mb_${cap.language || 'sub'}_${availableSubtitles.length + 1}`,
                language: isBangla ? 'Bangla (বাংলা)' : isHindi ? 'Hindi (हिन्दी)' : 'English',
                langCode: isBangla ? 'bn' : isHindi ? 'hi' : 'en',
                source: 'MovieBox / CDN',
                url: cap.url,
                format: cap.url.endsWith('.srt') ? 'srt' : 'vtt'
              });
            }
          }
        }
      } catch (e) {
        console.warn('MovieBox caption fetch warning:', e.message);
      }
    }

    // 2. Query Subsource API if available
    try {
      const subsourceResults = await this.fetchFromSubsource(cleanTitle, season, episode);
      if (Array.isArray(subsourceResults) && subsourceResults.length > 0) {
        availableSubtitles.push(...subsourceResults);
      }
    } catch (e) {
      console.warn('Subsource API lookup warning:', e.message);
    }

    // 3. Ensure both English and Bangla tracks are represented (with intelligent fallbacks)
    const hasEnglish = availableSubtitles.some(s => s.langCode === 'en');
    const hasBangla = availableSubtitles.some(s => s.langCode === 'bn');

    if (!hasEnglish) {
      availableSubtitles.unshift({
        id: `subsource_en_${Date.now()}`,
        language: 'English',
        langCode: 'en',
        source: 'SubSource (Auto)',
        url: `/api/subtitles/generate?title=${encodeURIComponent(cleanTitle)}&lang=en&season=${season}&ep=${episode}`,
        format: 'vtt'
      });
    }

    if (!hasBangla) {
      availableSubtitles.push({
        id: `subsource_bn_${Date.now()}`,
        language: 'Bangla (বাংলা)',
        langCode: 'bn',
        source: 'SubSource (বাংলা)',
        url: `/api/subtitles/generate?title=${encodeURIComponent(cleanTitle)}&lang=bn&season=${season}&ep=${episode}`,
        format: 'vtt'
      });
    }

    // Cache for 2 hours
    this.cache.set(cacheKey, {
      data: availableSubtitles,
      expireAt: Date.now() + 2 * 60 * 60 * 1000
    });

    return availableSubtitles;
  }

  /**
   * Search SubSource API for movie/series and fetch available subtitles
   */
  async fetchFromSubsource(cleanTitle, season = 0, episode = 0) {
    if (!SUBSOURCE_KEY) return [];

    try {
      const searchRes = await axios.get(`${SUBSOURCE_BASE}/movies/search`, {
        params: { query: cleanTitle },
        headers: { 'X-API-Key': SUBSOURCE_KEY },
        timeout: 6000
      });

      const movies = searchRes.data?.data || searchRes.data || [];
      if (!movies || movies.length === 0) return [];

      const targetMovie = movies[0];
      const movieId = targetMovie.id || targetMovie.movieId;
      if (!movieId) return [];

      // Query subtitles for English and Bengali
      const subRes = await axios.get(`${SUBSOURCE_BASE}/subtitles`, {
        params: { movieId },
        headers: { 'X-API-Key': SUBSOURCE_KEY },
        timeout: 6000
      });

      const list = subRes.data?.data || subRes.data || [];
      const results = [];

      for (const item of list) {
        const lang = (item.language || item.lang || '').toLowerCase();
        const isEn = lang.includes('en') || lang.includes('english');
        const isBn = lang.includes('bengali') || lang.includes('bangla') || lang.includes('bn');

        if (isEn || isBn) {
          results.push({
            id: `subsource_${item.id}`,
            language: isBn ? 'Bangla (বাংলা)' : 'English',
            langCode: isBn ? 'bn' : 'en',
            source: 'SubSource.net',
            url: `${SUBSOURCE_BASE}/subtitles/${item.id}/download`,
            format: 'srt'
          });
        }
      }

      return results;
    } catch (err) {
      console.warn('SubSource API error:', err.message);
      return [];
    }
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
  parseCues(rawText) {
    if (!rawText) return [];
    const cues = [];
    const lines = rawText.replace(/\r\n|\r/g, '\n').split('\n');
    let i = 0;

    // Helper to convert HH:MM:SS.mmm or MM:SS.mmm into seconds
    const parseTime = (timeStr) => {
      const parts = timeStr.trim().split(':');
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
          .trim();

        if (text) {
          cues.push({ startTime, endTime, text });
        }
      }
      i++;
    }

    return cues;
  }
}

module.exports = new SubtitleService();
