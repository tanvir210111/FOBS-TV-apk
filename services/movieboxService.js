/**
 * FOBS TV - MovieBox Integration Service
 * Extracts real-time trending movies, series, search results and streaming CDN links.
 */

const axios = require('axios');
const https = require('https');

const ipv4Agent = new https.Agent({
  family: 4,
  keepAlive: true,
  rejectUnauthorized: false
});

const BASE_URL = 'https://h5.aoneroom.com';
const FALLBACK_URL = 'https://movieboxapp.in';
const PLAY_DOMAINS = [
  'https://h5-api.aoneroom.com',
  'https://123moviesfree.club',
  'https://movie-box.co',
  'https://movieboxonline.net',
  'https://sflix.film'
];


const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Origin': BASE_URL,
  'Referer': `${BASE_URL}/`,
  'Accept': 'application/json'
};

class MovieBoxService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Fetches the homepage content with all categories (Trending, Cinema, Bollywood, Hollywood, Series, Anime)
   */
  async getHomepage() {
    try {
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/home`, {
        headers: HEADERS,
        httpsAgent: ipv4Agent,
        timeout: 10000
      });
      const raw = res.data?.data || res.data;
      const operatingList = raw?.operatingList || [];

      const sections = [];
      for (const group of operatingList) {
        const title = group.title;
        if (!title || title.includes('Update Required') || title.includes('Join us')) continue;

        const items = group.subjects || (group.banner?.items || []);
        if (!items || items.length === 0) continue;

        const formattedItems = items.map(it => {
          const isSeries = it.subjectType === 2;
          const poster = it.cover?.url || it.image?.url || '';
          const year = it.releaseDate ? it.releaseDate.substring(0, 4) : '';
          return {
            id: String(it.subjectId || it.id),
            subjectId: String(it.subjectId || it.id),
            title: it.title || 'Untitled',
            type: isSeries ? 'series' : 'movie',
            year: year || '2026',
            rating: String(it.imdbRatingValue || '7.5'),
            poster: poster,
            detailPath: it.detailPath || ''
          };
        }).filter(it => it.id && it.id !== '0' && it.title);

        if (formattedItems.length > 0) {
          sections.push({
            title,
            items: formattedItems
          });
        }
      }
      return sections;
    } catch (err) {
      console.error('MovieBoxService getHomepage error:', err.message);
      return [];
    }
  }

  /**
   * Searches MovieBox catalog
   */
  async search(query) {
    if (!query) return [];
    try {
      const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
        keyword: query,
        page: 1,
        perPage: 20,
        subjectType: 0
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': HEADERS['User-Agent'],
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/`
        },
        httpsAgent: ipv4Agent,
        timeout: 10000
      });
      const items = res.data?.data?.items || [];
      return items.map(it => ({
        id: String(it.subjectId || it.id),
        subjectId: String(it.subjectId || it.id),
        title: it.title,
        type: it.subjectType === 2 ? 'series' : 'movie',
        year: it.releaseDate ? it.releaseDate.substring(0, 4) : '2026',
        rating: String(it.imdbRatingValue || '7.5'),
        poster: it.cover?.url || it.image?.url || '',
        detailPath: it.detailPath || ''
      }));
    } catch (err) {
      console.error('MovieBoxService search error:', err.message);
      return [];
    }
  }

  /**
   * Fetches full metadata, total uploaded episodes, and auto-detected categories for a subject
   */
  async getDetail(subjectId, detailPath = '') {
    if (!subjectId) return null;
    try {
      let url = `${BASE_URL}/wefeed-h5-bff/web/subject/detail?subjectId=${subjectId}`;
      if (detailPath) url += `&detailPath=${encodeURIComponent(detailPath)}`;

      const res = await axios.get(url, {
        headers: HEADERS,
        httpsAgent: ipv4Agent,
        timeout: 10000
      });
      const d = res.data?.data;
      if (!d || !d.subject) return null;

      const sub = d.subject;
      const isSeries = sub.subjectType === 2;
      const seasons = d.resource?.seasons || [];

      let totalEpisodes = 1;
      if (isSeries) {
        if (seasons.length > 0) {
          totalEpisodes = seasons.reduce((sum, s) => sum + (s.maxEp || 0), 0) || seasons[0]?.maxEp || 10;
        } else {
          totalEpisodes = 10;
        }
      }

      const country = (sub.countryName || sub.country || '').toLowerCase();
      const genre = (sub.genre || '').toLowerCase();
      const title = sub.title || '';
      const desc = (sub.description || '').toLowerCase();
      const isHindi = title.toLowerCase().includes('hindi') || (sub.postTitle || '').toLowerCase().includes('hindi');

      const isAnimeOrAnimation = country.includes('japan') || genre.includes('anime') || genre.includes('animation') ||
        /\b(naruto|one piece|dragon ball|jujutsu|demon slayer|bleach|attack on titan|anime|manga)\b/i.test(title + ' ' + desc);

      const isChinese = country.includes('china') || country.includes('taiwan') || country.includes('hong kong') ||
        /\b(chinese|c-drama|cdrama|mandarin|sang zhi|hidden love)\b/i.test(title + ' ' + desc);

      const isKorean = country.includes('korea') || genre.includes('k-drama') || genre.includes('kdrama') ||
        /\b(k-drama|kdrama|korean|snowdrop)\b/i.test(title + ' ' + desc);

      const isTurkish = country.includes('turk') || genre.includes('turkish') ||
        /\b(turkish|turkey|dizi)\b/i.test(title + ' ' + desc);

      const isSouthIndian = country.includes('south') ||
        /\b(tollywood|kollywood|mollywood|sandalwood|telugu|tamil|malayalam|kannada|pushpa|kgf|rrr|salaar|bahubali|jailer|devara)\b/i.test(title + ' ' + desc);

      const isBollywood = country.includes('india') || genre.includes('bollywood') ||
        /\b(bollywood)\b/i.test(title + ' ' + desc);

      let industry = 'Hollywood';
      let category = isSeries ? 'Web Series' : 'Hollywood Movies';

      if (isChinese) {
        industry = 'Chinese';
        category = isSeries ? (isHindi ? 'Chinese (Dubbed) Series' : 'Chinese Series') : (isHindi ? 'Chinese (Dubbed) Movies' : 'Chinese Drama');
      } else if (isKorean) {
        industry = 'Korean';
        category = isSeries ? (isHindi ? 'Korean (Dubbed) Series' : 'Korean Series') : 'Korean Drama';
      } else if (isTurkish) {
        industry = 'Turkish';
        category = isSeries ? 'Turkish Series' : 'Turkish Series';
      } else if (isAnimeOrAnimation) {
        industry = 'Anime';
        category = isSeries ? (isHindi ? 'Anime Series (Hindi Dub)' : 'Japanese Series') : (isHindi ? 'Anime Movies (Hindi Dub)' : 'Animation & Anime');
      } else if (isSouthIndian) {
        industry = 'South Indian';
        category = isSeries ? 'South Indian Series' : (isHindi ? 'South (Dubbed) Movies' : 'South Indian Hindi Dubbed');
      } else if (isBollywood) {
        industry = 'Bollywood';
        category = isSeries ? 'Web Series' : (isHindi ? 'Bollywood Movies' : 'Bollywood Movies');
      } else if (isHindi) {
        industry = 'Hollywood';
        category = isSeries ? 'Hollywood (Dubbed) Series' : 'Hollywood (Dubbed) Movies';
      } else {
        industry = 'Hollywood';
        category = isSeries ? 'Web Series' : 'Hollywood Movies';
      }

      const year = sub.releaseDate ? sub.releaseDate.substring(0, 4) : '2026';
      const poster = sub.cover?.url || sub.cover || '';
      const cover = sub.stills?.[0]?.url || poster;

      return {
        subjectId: String(subjectId),
        detailPath: sub.detailPath || detailPath || '',
        title,
        type: isSeries ? 'series' : 'movie',
        year,
        industry,
        category,
        isHindi,
        totalEpisodes,
        seasonsCount: seasons.length || 1,
        seasons,
        poster,
        cover,
        rating: sub.imdbRatingValue || '8.2',
        description: sub.description || ''
      };
    } catch (err) {
      console.error(`MovieBoxService getDetail error (id: ${subjectId}):`, err.message);
      return null;
    }
  }

  
  async _fetchPlayStream(subjectId, detailPath, season, episode) {
    for (const domain of PLAY_DOMAINS) {
      try {
        const playUrl = `${domain}/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${season}&ep=${episode}&detailPath=${encodeURIComponent(detailPath || '')}&streamSignType=1&supportCodecs%5Bhevc%5D=1&supportCodecs%5Bh264%5D=1`;
        const referer = detailPath ? `${domain}/movies/${detailPath}?id=${subjectId}&type=/movie/detail&lang=en` : `${domain}/`;
        const res = await axios.get(playUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
            'Referer': referer,
            'Origin': domain,
            'Accept': 'application/json',
            'x-client-info': '{"timezone":"Asia/Calcutta"}',
            'x-request-lang': 'en',
            'x-vip-restrict': '0',
            'x-no-high-risk-restrict': '0',
            'x-source': 'moviebox'
          },
          httpsAgent: ipv4Agent,
          timeout: 8000
        });

        const data = res.data?.data;
        if (data && Array.isArray(data.streams) && data.streams.length > 0) {
          const sorted = [...data.streams].sort((a, b) => {
            const resA = parseInt(a.resolutions, 10) || 0;
            const resB = parseInt(b.resolutions, 10) || 0;
            return resB - resA;
          });
          const best = sorted[0];
          return {
            subjectId,
            streamUrl: best.url,
            resolution: parseInt(best.resolutions, 10) || 1080,
            qualities: sorted.map(st => ({
              resolution: parseInt(st.resolutions, 10) || 1080,
              url: st.url,
              size: st.size || 0
            })),
            captions: (data.captions || []).map(c => ({
              language: c.language || c.lan,
              url: c.url
            }))
          };
        }
      } catch (e) {
        // Try next domain
      }
    }
    return null;
  }

  async _fetchDownload(subjectId, detailPath, season, episode) {
    const urlsToTry = [
      `${BASE_URL}/wefeed-h5-bff/web/subject/download`,
      `${FALLBACK_URL}/wefeed-h5-bff/web/subject/download`
    ];

    for (const fetchUrl of urlsToTry) {
      try {
        const domain = fetchUrl.startsWith(FALLBACK_URL) ? FALLBACK_URL : BASE_URL;
        const refPath = detailPath ? `${domain}/movies/${detailPath}` : `${domain}/`;
        const res = await axios.get(fetchUrl, {
          params: {
            subjectId,
            se: season,
            ep: episode
          },
          headers: {
            ...HEADERS,
            'Origin': domain,
            'Referer': refPath
          },
          httpsAgent: ipv4Agent,
          timeout: 10000
        });

        const data = res.data?.data;
        if (!data || !data.downloads || data.downloads.length === 0) {
          continue;
        }

        const sortedDownloads = [...data.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
        const best = sortedDownloads[0];

        return {
          subjectId,
          streamUrl: best.url,
          resolution: best.resolution,
          qualities: sortedDownloads.map(d => ({
            resolution: d.resolution,
            url: d.url,
            size: d.size
          })),
          captions: (data.captions || []).map(c => ({
            language: c.language || c.lan,
            url: c.url
          }))
        };
      } catch (e) {
        // Continue to fallback
      }
    }
    return null;
  }

  async resolveMedia(subjectId, detailPath = '', season = 0, episode = 0) {
    if (!subjectId) return null;
    const cacheKey = `${subjectId}_s${season}_e${episode}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) {
      return cached.data;
    }

    // Try primary params
    let result = await this._fetchPlayStream(subjectId, detailPath, season, episode);
    if (!result) result = await this._fetchDownload(subjectId, detailPath, season, episode);

    // Fallback attempt: if season=1 & ep>0 returned nothing, try season=0 & ep-1 (0-based)
    if (!result && season === 1 && episode > 0) {
      result = await this._fetchPlayStream(subjectId, detailPath, 0, episode - 1);
      if (!result) result = await this._fetchDownload(subjectId, detailPath, 0, episode - 1);
    }
    // If season=0 & ep=0 returned nothing, try season=1 & ep=1 (1-based)
    if (!result && season === 0 && episode === 0) {
      result = await this._fetchPlayStream(subjectId, detailPath, 1, 1);
      if (!result) result = await this._fetchDownload(subjectId, detailPath, 1, 1);
    }

    if (result) {
      this.cache.set(cacheKey, {
        data: result,
        expireAt: Date.now() + 10 * 60 * 1000
      });
      return result;
    }

    // Legacy fallback using direct download
    try {
      const refPath = detailPath ? `${BASE_URL}/movies/${detailPath}` : `${BASE_URL}/`;
      const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/download`, {
        params: { subjectId, se: season, ep: episode },
        headers: { ...HEADERS, 'Referer': refPath },
        httpsAgent: ipv4Agent,
        timeout: 10000
      });
      const data = res.data?.data;
      if (!data || !data.downloads || data.downloads.length === 0) return null;
      const sortedDownloads = [...data.downloads].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
      const best = sortedDownloads[0];
      const legacyRes = {
        subjectId,
        streamUrl: best.url,
        resolution: best.resolution,
        qualities: sortedDownloads.map(d => ({ resolution: d.resolution, url: d.url, size: d.size })),
        captions: (data.captions || []).map(c => ({ language: c.language || c.lan, url: c.url }))
      };
      this.cache.set(cacheKey, { data: legacyRes, expireAt: Date.now() + 10 * 60 * 1000 });
      return legacyRes;
    } catch (err) {
      return null;
    }
  }

  invalidateCache(subjectId = null) {
    if (!subjectId) {
      this.cache.clear();
      return;
    }
    const prefix = String(subjectId);
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = new MovieBoxService();
