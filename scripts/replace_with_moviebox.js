/**
 * Replace all old/broken third party links with high-speed MovieBox direct streams
 * Sorts latest releases to the very top.
 */

const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');
const liveTvService = require('../services/liveTvService');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

async function replaceAndUpgrade() {
  console.log('Fetching live MovieBox catalog...');
  const sections = await movieboxService.getHomepage();
  const allItems = sections.flatMap(s => s.items);

  const data = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

  // Upgrades for known movies with old links
  const targetUpgrades = [
    { key: 'lust stories', search: 'Lust Stories 3' },
    { key: 'oak street', search: 'The End of Oak Street' },
    { key: 'resident evil', search: 'Resident Evil' },
    { key: 'street fighter', search: 'Street Fighter' },
    { key: 'spider-man', search: 'Spider-Man' }
  ];

  for (const up of targetUpgrades) {
    const movie = data.movies.find(m => m.title.toLowerCase().includes(up.key));
    if (!movie) continue;

    const mbItem = allItems.find(it => it.title.toLowerCase().includes(up.search.toLowerCase()));
    if (!mbItem) {
      console.log(`MovieBox item not found for ${up.search}`);
      continue;
    }

    console.log(`Resolving MovieBox stream for "${movie.title}" -> "${mbItem.title}"...`);
    const res = await movieboxService.resolveMedia(mbItem.subjectId, mbItem.detailPath, 0, 0);
    if (res && res.streamUrl) {
      movie.streamUrl = res.streamUrl;
      movie.servers = [
        { name: `Server 1 (Fast HD ${res.resolution || 720}p)`, url: res.streamUrl },
        ...(res.qualities || []).slice(1).map((q, i) => ({
          name: `Server ${i + 2} (${q.resolution}p)`,
          url: q.url
        }))
      ];
      movie.badgeLeft = 'Hindi';
      movie.dubLanguage = 'Hindi';
      movie.audioTracks = ['Hindi dub'];
      movie.selectedAudio = 'Hindi dub';
      console.log(`  ✅ Replaced "${movie.title}" servers with MovieBox HD direct stream!`);
    }
  }

  // Populate Live TV channels from BD & IN
  console.log('Fetching comprehensive Live TV channels...');
  const bdChannels = await liveTvService.getChannelsByCountry('bd');
  const inChannels = await liveTvService.getChannelsByCountry('in');

  // Categorize channels properly
  const enhancedBd = bdChannels.map(c => ({
    ...c,
    category: 'Bangladesh',
    language: 'Bangla'
  }));

  const enhancedIn = inChannels.slice(0, 80).map(c => {
    let cat = 'Entertainment';
    const n = c.name.toLowerCase();
    if (n.includes('sport') || n.includes('cricket') || n.includes('football') || n.includes('willow') || n.includes('ten')) cat = 'Sports';
    else if (n.includes('news') || n.includes('aaj tak') || n.includes('ndtv') || n.includes('abp') || n.includes('republic') || n.includes('samachar')) cat = 'News';
    else if (n.includes('music') || n.includes('9x') || n.includes('mtv') || n.includes('zoom') || n.includes('b4u')) cat = 'Music';
    return {
      ...c,
      category: cat,
      language: 'Hindi'
    };
  });

  data.liveTv = [...enhancedBd, ...enhancedIn];
  console.log(`Total Live TV channels loaded: ${data.liveTv.length}`);

  // Sort Movies: 2026 and latest releases strictly at the top!
  data.movies.sort((a, b) => {
    const yrA = parseInt(a.year || '2020', 10);
    const yrB = parseInt(b.year || '2020', 10);
    if (yrB !== yrA) return yrB - yrA;
    return (b.id || '').localeCompare(a.id || '');
  });

  // Sort Series: latest releases strictly at the top!
  data.series.sort((a, b) => {
    const yrA = parseInt(a.year || '2020', 10);
    const yrB = parseInt(b.year || '2020', 10);
    if (yrB !== yrA) return yrB - yrA;
    return (b.id || '').localeCompare(a.id || '');
  });

  // Sync to all seed files
  const files = [CONTENT_FILE, PUBLIC_SEED, ANDROID_SEED];
  for (const f of files) {
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  }
  console.log('Successfully updated content.json and all seed files!');
}

replaceAndUpgrade().catch(e => console.error(e));
