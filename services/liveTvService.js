/**
 * FOBS TV - Live TV Service
 * Provides Bangladesh, India and International Live TV channels with HLS & YouTube Live streams.
 */

const axios = require('axios');

const BASE_TV_URL = 'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/raw';

class LiveTVService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Fetches channels for a given country code ('bd' for Bangladesh, 'in' for India, etc.)
   */
  async getChannelsByCountry(countryCode = 'bd') {
    const code = countryCode.toLowerCase();
    const cached = this.cache.get(code);
    if (cached && cached.expireAt > Date.now()) {
      return cached.channels;
    }

    try {
      const res = await axios.get(`${BASE_TV_URL}/countries/${code}.json`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (FOBS-TV)' }
      });
      const data = res.data || [];
      const channels = [];

      for (const c of data) {
        const name = c.name || 'Unknown Channel';
        const sources = c.sources || {};
        const iptvUrls = [
          ...(c.stream_urls || []),
          ...(sources.streams || [])
        ].filter(u => u && typeof u === 'string' && u.trim().startsWith('http'));

        const youtubeUrls = [
          ...(c.youtube_urls || []),
          ...(sources.youtube || [])
        ].filter(u => u && typeof u === 'string' && u.trim().startsWith('http'));

        const logo = c.logo || c.logo_url || c.image || '';

        // Priority 1: Direct IPTV (HLS .m3u8)
        if (iptvUrls.length > 0) {
          channels.push({
            id: `tv-${code}-${(c.nanoid || name.replace(/[^a-z0-9]/gi, '_')).toLowerCase()}`,
            name,
            title: name,
            category: code === 'bd' ? 'Bangladesh Live TV' : 'Indian Live TV',
            logo,
            poster: logo,
            streamUrl: iptvUrls[0],
            streamType: 'hls',
            badge: 'LIVE',
            country: code
          });
        }
        // Priority 2: YouTube Live
        else if (youtubeUrls.length > 0) {
          channels.push({
            id: `tv-${code}-${(c.nanoid || name.replace(/[^a-z0-9]/gi, '_')).toLowerCase()}`,
            name,
            title: name,
            category: code === 'bd' ? 'Bangladesh Live TV' : 'Indian Live TV',
            logo,
            poster: logo,
            streamUrl: youtubeUrls[0],
            streamType: 'youtube',
            badge: 'LIVE',
            country: code
          });
        }
      }

      // Cache for 6 hours
      this.cache.set(code, {
        channels,
        expireAt: Date.now() + 6 * 60 * 60 * 1000
      });

      return channels;
    } catch (err) {
      console.error(`LiveTVService getChannelsByCountry(${code}) error:`, err.message);
      return [];
    }
  }
}

module.exports = new LiveTVService();
