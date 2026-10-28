/**
 * FOBS TV - Live TV Service
 * Powered by IPTV-ORG (https://github.com/iptv-org/iptv)
 * Provides verified Bangladesh, India, Sports, News and International Live TV channels with HLS streams.
 */

const axios = require('axios');

const IPTV_ORG_BASE = 'https://iptv-org.github.io/iptv';
const FAMELACK_BASE = 'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/raw';

class LiveTVService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Parse M3U playlist into structured channel objects
   */
  _parseM3U(m3uContent, countryCode = 'bd') {
    const lines = m3uContent.split('\n');
    const channels = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const commaIdx = line.indexOf(',');
        const rawName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Unknown';
        const cleanName = rawName.replace(/\[.*?\]|\(.*?\)/g, '').trim() || rawName;

        const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        const group = groupMatch ? groupMatch[1] : '';

        let url = '';
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim();
          if (next && !next.startsWith('#')) {
            url = next;
            i = j;
            break;
          }
        }

        if (url && url.startsWith('http')) {
          let category = countryCode === 'bd' ? 'Bangladesh' : 'Indian Live TV';
          const lowerGroup = group.toLowerCase();
          const lowerName = cleanName.toLowerCase();

          if (lowerGroup.includes('sport') || lowerName.includes('sport') || lowerName.includes('cricket')) {
            category = 'Sports';
          } else if (lowerGroup.includes('news') || lowerName.includes('news')) {
            category = 'News';
          } else if (lowerGroup.includes('music') || lowerName.includes('music')) {
            category = 'Music';
          } else if (countryCode === 'bd') {
            category = 'Bangladesh';
          }

          const id = `tv-${countryCode}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.replace(/_+/g, '_').slice(0, 50);

          channels.push({
            id,
            name: cleanName,
            title: cleanName,
            category,
            language: countryCode === 'bd' ? 'Bangla' : 'Hindi',
            country: countryCode,
            streamUrl: url,
            streamType: 'hls',
            logo: logoMatch ? logoMatch[1] : '',
            poster: logoMatch ? logoMatch[1] : '',
            badge: 'LIVE'
          });
        }
      }
    }

    return channels;
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

    // 1. Try IPTV-ORG (Primary high quality source)
    try {
      const res = await axios.get(`${IPTV_ORG_BASE}/countries/${code}.m3u`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (FOBS-TV)' }
      });
      if (res.data && res.data.includes('#EXTINF:')) {
        const channels = this._parseM3U(res.data, code);
        if (channels.length > 0) {
          this.cache.set(code, {
            channels,
            expireAt: Date.now() + 6 * 60 * 60 * 1000
          });
          return channels;
        }
      }
    } catch (err) {
      console.warn(`IPTV-ORG country fetch (${code}) failed: ${err.message}. Trying fallback.`);
    }

    // 2. Fallback to famelack JSON
    try {
      const res = await axios.get(`${FAMELACK_BASE}/countries/${code}.json`, {
        timeout: 8000,
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

        const logo = c.logo || c.logo_url || c.image || '';

        if (iptvUrls.length > 0) {
          channels.push({
            id: `tv-${code}-${(c.nanoid || name.replace(/[^a-z0-9]/gi, '_')).toLowerCase()}`,
            name,
            title: name,
            category: code === 'bd' ? 'Bangladesh' : 'Indian Live TV',
            logo,
            poster: logo,
            streamUrl: iptvUrls[0],
            streamType: 'hls',
            badge: 'LIVE',
            country: code
          });
        }
      }

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
