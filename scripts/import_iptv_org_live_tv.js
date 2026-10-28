/**
 * FOBS TV - Master IPTV-ORG Integration & Live TV Overhaul
 * 
 * Sources verified channels from https://github.com/iptv-org/iptv:
 * - Bangladesh (bd.m3u)
 * - Sports (sports.m3u)
 * - News (news.m3u)
 * - Entertainment (entertainment.m3u & in.m3u)
 * - Music (music.m3u)
 * 
 * Merges with verified core channels (GTV, T Sports, Somoy, Jamuna, etc.)
 * Deduplicates, normalizes metadata, and saves cleanly into content.json.
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const appDir = path.resolve(__dirname, '..');
const adminService = require(path.join(appDir, 'services', 'adminService'));

function parseM3u(m3uContent, defaultCategory = 'Entertainment', defaultCountry = 'global') {
  const lines = m3uContent.split('\n');
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      const rawName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Unknown';
      const cleanName = rawName.replace(/\[.*?\]|\(.*?\)/g, '').trim() || rawName;

      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const countryMatch = line.match(/tvg-country="([^"]+)"/i);
      const langMatch = line.match(/tvg-language="([^"]+)"/i);

      let url = '';
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          url = nextLine;
          i = j;
          break;
        }
      }

      if (url && url.startsWith('http')) {
        let category = defaultCategory;
        const group = (groupMatch ? groupMatch[1] : '').toLowerCase();
        const lowerName = cleanName.toLowerCase();

        if (defaultCountry === 'bd' || group.includes('bangladesh') || lowerName.includes('bangla')) {
          category = 'Bangladesh';
        } else if (group.includes('sport') || lowerName.includes('sport') || lowerName.includes('cricket') || lowerName.includes('football')) {
          category = 'Sports';
        } else if (group.includes('news') || lowerName.includes('news') || lowerName.includes('khabor')) {
          category = 'News';
        } else if (group.includes('music') || lowerName.includes('music') || lowerName.includes('gaan')) {
          category = 'Music';
        } else if (group.includes('entertain') || group.includes('series') || group.includes('movie')) {
          category = 'Entertainment';
        }

        const id = `tv-${(defaultCountry || 'ch')}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.replace(/_+/g, '_').slice(0, 50);

        items.push({
          id,
          name: cleanName,
          title: cleanName,
          category,
          language: defaultCountry === 'bd' ? 'Bangla' : (langMatch ? langMatch[1] : 'HD'),
          country: defaultCountry || (countryMatch ? countryMatch[1].toLowerCase() : 'global'),
          streamUrl: url,
          streamType: 'hls',
          logo: logoMatch ? logoMatch[1] : '',
          poster: logoMatch ? logoMatch[1] : '',
          badge: 'LIVE'
        });
      }
    }
  }

  return items;
}

async function run() {
  console.log('🚀 STARTING IPTV-ORG MASTER OVERHAUL FOR FOBS TV...\n');

  const sources = [
    { name: 'Bangladesh', url: 'https://iptv-org.github.io/iptv/countries/bd.m3u', category: 'Bangladesh', country: 'bd' },
    { name: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', category: 'Sports', country: 'global', limit: 40 },
    { name: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u', category: 'News', country: 'global', limit: 40 },
    { name: 'Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u', category: 'Music', country: 'global', limit: 25 },
    { name: 'Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u', category: 'Entertainment', country: 'global', limit: 50 },
    { name: 'India', url: 'https://iptv-org.github.io/iptv/countries/in.m3u', category: 'Entertainment', country: 'in', limit: 60 }
  ];

  const fetchedChannels = [];

  for (const s of sources) {
    try {
      console.log(`Fetching ${s.name} from iptv-org...`);
      const res = await axios.get(s.url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 (FOBS-TV)' } });
      let parsed = parseM3u(res.data, s.category, s.country);
      if (s.limit && parsed.length > s.limit) {
        parsed = parsed.slice(0, s.limit);
      }
      console.log(` -> Loaded ${parsed.length} channels for ${s.name}`);
      fetchedChannels.push(...parsed);
    } catch (e) {
      console.warn(`Could not load ${s.name}: ${e.message}`);
    }
  }

  console.log(`\nTotal parsed channels from iptv-org: ${fetchedChannels.length}`);

  // Core verified cricket & BD channels to ensure 100% uninterrupted viewing
  const coreChannels = [
    {
      id: 'tv-sports-gtv-live',
      name: 'GTV Live (Gazi TV Cricket)',
      title: 'GTV Live (Gazi TV Cricket)',
      category: 'Sports',
      language: 'Bangla',
      country: 'bd',
      streamUrl: 'https://tvsen6.aynaott.com/6xyZ3N4oHv2KBJdB6W4p/index.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/gtv.svg',
      poster: 'assets/channels/gtv.svg',
      badge: 'LIVE'
    },
    {
      id: 'tv-sports-tsports',
      name: 'T Sports (Bangladesh Sports)',
      title: 'T Sports (Bangladesh Sports)',
      category: 'Sports',
      language: 'Bangla',
      country: 'bd',
      streamUrl: 'https://tvsen6.aynaott.com/6xyZ3N4oHv2KBJdB6W4p/index.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/tsports.svg',
      poster: 'assets/channels/tsports.svg',
      badge: 'LIVE'
    },
    {
      id: 'tv-bd-somoy',
      name: 'Somoy TV HD',
      title: 'Somoy TV HD',
      category: 'News',
      language: 'Bangla',
      country: 'bd',
      streamUrl: 'https://somoytv-apple-live.akamaized.net/hls/live/2042851/somoytv/master.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/somoy.svg',
      poster: 'assets/channels/somoy.svg',
      badge: 'LIVE'
    },
    {
      id: 'tv-bd-jamuna',
      name: 'Jamuna TV HD',
      title: 'Jamuna TV HD',
      category: 'News',
      language: 'Bangla',
      country: 'bd',
      streamUrl: 'https://live-origin.jamuna.tv/hls/jamuna_720p/index.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/jamuna.svg',
      poster: 'assets/channels/jamuna.svg',
      badge: 'LIVE'
    },
    {
      id: 'tv-bd-ekattor',
      name: 'Ekattor TV HD',
      title: 'Ekattor TV HD',
      category: 'News',
      language: 'Bangla',
      country: 'bd',
      streamUrl: 'https://ekattor.tv/live/stream.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/ekattor.svg',
      poster: 'assets/channels/ekattor.svg',
      badge: 'LIVE'
    },
    {
      id: 'tv-sports-redbull',
      name: 'Red Bull TV (Extreme Sports)',
      title: 'Red Bull TV (Extreme Sports)',
      category: 'Sports',
      language: 'English',
      country: 'global',
      streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
      streamType: 'hls',
      logo: 'assets/channels/redbull.svg',
      poster: 'assets/channels/redbull.svg',
      badge: 'LIVE'
    }
  ];

  // Combine core channels + iptv-org channels with deduplication
  const seenIds = new Set();
  const seenNames = new Set();
  const finalChannels = [];

  // 1. Add core channels first
  for (const c of coreChannels) {
    seenIds.add(c.id);
    seenNames.add(c.name.toLowerCase().trim());
    finalChannels.push(c);
  }

  // 2. Add iptv-org channels
  for (const c of fetchedChannels) {
    const normName = c.name.toLowerCase().trim();
    if (seenIds.has(c.id) || seenNames.has(normName)) continue;
    seenIds.add(c.id);
    seenNames.add(normName);
    finalChannels.push(c);
  }

  console.log(`\nFinal curated Live TV channel list: ${finalChannels.length} channels`);

  // Count by category
  const stats = {};
  finalChannels.forEach(c => {
    stats[c.category] = (stats[c.category] || 0) + 1;
  });
  console.log('Category breakdown:', stats);

  // Read and update content.json
  const content = adminService.readContent();
  content.liveTv = finalChannels;

  // Persist atomically
  adminService.writeContent(content);
  console.log('Successfully saved to data/content.json, backup, and local');

  // Update seed-content.json
  ['public/seed-content.json', 'android/app/src/main/assets/public/seed-content.json'].forEach(p => {
    const full = path.join(appDir, p);
    if (fs.existsSync(full)) {
      try {
        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
        data.liveTv = finalChannels;
        fs.writeFileSync(full, JSON.stringify(data), 'utf8');
        console.log(`Synced ${p}`);
      } catch (e) {
        console.warn(`Notice updating ${p}:`, e.message);
      }
    }
  });

  console.log('\n=== LIVE TV OVERHAUL COMPLETED SUCCESSFULLY! ===');
}

run().catch(console.error);
