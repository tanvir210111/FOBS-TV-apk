const fs = require('fs');
const path = require('path');

const CHANNELS_DIR = path.join(__dirname, '..', 'public', 'assets', 'channels');
fs.mkdirSync(CHANNELS_DIR, { recursive: true });

// Verified direct download URLs for official channel logos
const LOGO_SOURCES = [
  {
    id: 'gtv',
    file: 'gtv.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/f/f1/Logo_of_GTV_%28Bangladesh%29.svg',
    channels: ['tv-sports-gtv-live', 'tv-gazi']
  },
  {
    id: 'tsports',
    file: 'tsports.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/T_Sports_logo.svg',
    channels: ['tv-sports-tsports']
  },
  {
    id: 'redbull',
    file: 'redbull.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/f/f5/RedBullEnergyDrink.svg',
    channels: ['tv-sports-redbull']
  },
  {
    id: 'boishakhi',
    file: 'boishakhi.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/c/c7/Boishakhi_TV_logo.svg',
    channels: ['tv-boishakhi']
  },
  {
    id: 'channel24',
    file: 'channel24.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/9/9b/Logo_of_Channel_24_%28Bangladesh%29.svg',
    channels: ['tv-channel24', 'tv-news-channel24']
  },
  {
    id: 'dbc',
    file: 'dbc.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/93/%E0%A6%A1%E0%A6%BF%E0%A6%AC%E0%A6%BF%E0%A6%B8%E0%A6%BF_%E0%A6%A8%E0%A6%BF%E0%A6%89%E0%A6%9C%E2%80%93%E0%A6%8F%E0%A6%B0_%E0%A6%B2%E0%A7%8B%E0%A6%97%E0%A7%8B.svg',
    channels: ['tv-dbc', 'tv-news-dbc']
  },
  {
    id: 'desh',
    file: 'desh.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/Logo_of_Desh_TV.svg',
    channels: ['tv-desh']
  },
  {
    id: 'duronto',
    file: 'duronto.png',
    url: 'https://upload.wikimedia.org/wikipedia/en/d/d7/Duronto_TV_Logo.png',
    channels: ['tv-duronto']
  },
  {
    id: 'ekattor',
    file: 'ekattor.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/5/57/Ekattor_TV_logo.svg',
    channels: ['tv-ekattor', 'tv-news-ekattor']
  },
  {
    id: 'jamuna',
    file: 'jamuna.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Jamuna_TV_logo.svg',
    channels: ['tv-jamuna']
  },
  {
    id: 'maasranga',
    file: 'maasranga.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/en/3/39/Maasranga_Television_Logo.jpg',
    channels: ['tv-maasranga']
  },
  {
    id: 'mytv',
    file: 'mytv.svg',
    url: 'https://upload.wikimedia.org/wikipedia/bn/0/09/%E0%A6%AE%E0%A6%BE%E0%A6%87_%E0%A6%9F%E0%A6%BF%E0%A6%AD%E0%A6%BF_%E0%A6%B2%E0%A7%8B%E0%A6%97%E0%A7%8B.svg',
    channels: ['tv-mytv']
  },
  {
    id: 'ntv',
    file: 'ntv.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/e/ef/NTV_%28Bangladesh%29_logo.svg',
    channels: ['tv-ntv', 'tv-ntv-live']
  },
  {
    id: 'rtv',
    file: 'rtv.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/4/4e/Rtv_bangladesh.svg',
    channels: ['tv-rtv']
  },
  {
    id: 'somoy',
    file: 'somoy.svg',
    url: 'https://upload.wikimedia.org/wikipedia/bn/f/f6/%E0%A6%B8%E0%A6%AE%E0%A6%AF%E0%A6%BC_%E0%A6%9F%E0%A6%BF%E0%A6%AD%E0%A6%BF%E0%A6%B0_%E0%A6%B2%E0%A7%8B%E0%A6%97%E0%A7%8B.svg',
    channels: ['tv-news-somoy']
  },
  {
    id: 'independent',
    file: 'independent.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/c/c1/Independent_Television_Logo.svg',
    channels: ['tv-news-independent']
  },
  {
    id: 'aajtak',
    file: 'aajtak.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/7/77/Aaj_Tak_logo.svg',
    channels: ['tv-news-aajtak']
  },
  {
    id: 'abpnews',
    file: 'abpnews.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/48/ABP_News_logo.svg',
    channels: ['tv-news-abp']
  },
  {
    id: 'ddsports',
    file: 'ddsports.svg',
    url: 'https://upload.wikimedia.org/wikipedia/en/1/16/DD_Sports_logo.svg',
    channels: ['tv-sports-dd']
  }
];

// Fallback branded SVG generator for channels without direct vectors
function createBrandedLogoSvg(name, primaryColor, secondaryColor, accentText) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primaryColor}"/>
      <stop offset="100%" stop-color="${secondaryColor}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="160" height="160" rx="32" fill="url(#bg)"/>
  <circle cx="80" cy="80" r="64" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
  <text x="80" y="85" font-family="Plus Jakarta Sans, -apple-system, sans-serif" font-weight="900" font-size="28" fill="#ffffff" text-anchor="middle" filter="url(#shadow)">${accentText || name.slice(0, 4).toUpperCase()}</text>
  <text x="80" y="112" font-family="Plus Jakarta Sans, -apple-system, sans-serif" font-weight="700" font-size="12" fill="rgba(255,255,255,0.85)" text-anchor="middle" letter-spacing="2">HD LIVE</text>
</svg>`;
}

async function downloadLogo(source) {
  const filePath = path.join(CHANNELS_DIR, source.file);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 500) {
    console.log(`[EXISTS] ${source.file} already exists (${fs.statSync(filePath).size} bytes)`);
    return true;
  }
  try {
    const res = await fetch(source.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' } });
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buf);
      console.log(`[SUCCESS] Downloaded ${source.file} (${buf.length} bytes)`);
      return true;
    }
    console.warn(`[FAIL] ${source.url} returned HTTP ${res.status}`);
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${source.url}:`, err.message);
  }
  return false;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('Downloading official channel logos...');
  for (const src of LOGO_SOURCES) {
    const ok = await downloadLogo(src);
    if (!ok && !fs.existsSync(path.join(CHANNELS_DIR, src.file))) {
      // Create branded vector SVG if download fails
      const brandColors = {
        ekattor: ['#c9182b', '#8b0e1b', '71'],
        jamuna: ['#0f3460', '#16213e', 'JAMUNA'],
        desh: ['#d97706', '#b45309', 'DESH'],
        duronto: ['#0284c7', '#0369a1', 'DURONTO'],
        maasranga: ['#e11d48', '#9f1239', 'MAASRANGA'],
        mytv: ['#7c3aed', '#5b21b6', 'MY TV'],
        ntv: ['#059669', '#047857', 'NTV'],
        rtv: ['#dc2626', '#991b1b', 'RTV'],
        somoy: ['#ea580c', '#c2410c', 'SOMOY'],
        independent: ['#2563eb', '#1d4ed8', 'IND'],
        aajtak: ['#b91c1c', '#7f1d1d', 'AAJ TAK'],
        abpnews: ['#d97706', '#92400e', 'ABP'],
        ddsports: ['#1d4ed8', '#1e40af', 'DD']
      };
      const conf = brandColors[src.id] || ['#0f172a', '#1e293b', src.id.toUpperCase()];
      const svg = createBrandedLogoSvg(src.id, conf[0], conf[1], conf[2]);
      const targetFile = src.file.endsWith('.svg') ? src.file : `${src.id}.svg`;
      fs.writeFileSync(path.join(CHANNELS_DIR, targetFile), svg);
      src.file = targetFile;
      console.log(`[GENERATED BRANDED] ${targetFile}`);
    }
    await sleep(1000);
  }

  // Create additional branded SVGs for remaining BD/Sports channels
  const additionalChannels = [
    { file: 'channels.svg', name: 'Channel S', color1: '#0052cc', color2: '#0747a6', text: 'CH-S' },
    { file: 'ekhontv.svg', name: 'Ekhon TV', color1: '#b91c1c', color2: '#7f1d1d', text: 'EKHON' },
    { file: 'greentv.svg', name: 'Green TV', color1: '#15803d', color2: '#14532d', text: 'GREEN' },
    { file: 'madani.svg', name: 'Madani Channel', color1: '#047857', color2: '#064e3b', text: 'MADANI' },
    { file: 'mschannel.svg', name: 'MS Channel Sports', color1: '#dc2626', color2: '#991b1b', text: 'MS HD' }
  ];

  for (const extra of additionalChannels) {
    const svg = createBrandedLogoSvg(extra.name, extra.color1, extra.color2, extra.text);
    fs.writeFileSync(path.join(CHANNELS_DIR, extra.file), svg);
    console.log(`[CREATED] Branded SVG for ${extra.name}`);
  }

  // Build ID to local logo path mapping
  const logoMap = {
    'tv-sports-gtv-live': 'assets/channels/gtv.svg',
    'tv-gazi': 'assets/channels/gtv.svg',
    'tv-sports-tsports': 'assets/channels/tsports.svg',
    'tv-sports-redbull': 'assets/channels/redbull.svg',
    'tv-sports-ms': 'assets/channels/mschannel.svg',
    'tv-boishakhi': 'assets/channels/boishakhi.svg',
    'tv-channel24': 'assets/channels/channel24.svg',
    'tv-news-channel24': 'assets/channels/channel24.svg',
    'tv-channel-s': 'assets/channels/channels.svg',
    'tv-dbc': 'assets/channels/dbc.svg',
    'tv-news-dbc': 'assets/channels/dbc.svg',
    'tv-desh': 'assets/channels/desh.svg',
    'tv-duronto': 'assets/channels/duronto.png',
    'tv-ekattor': 'assets/channels/ekattor.svg',
    'tv-news-ekattor': 'assets/channels/ekattor.svg',
    'tv-ekhon': 'assets/channels/ekhontv.svg',
    'tv-green': 'assets/channels/greentv.svg',
    'tv-jamuna': 'assets/channels/jamuna.svg',
    'tv-maasranga': 'assets/channels/maasranga.jpg',
    'tv-madani-bangla': 'assets/channels/madani.svg',
    'tv-mytv': 'assets/channels/mytv.svg',
    'tv-ntv': 'assets/channels/ntv.svg',
    'tv-ntv-live': 'assets/channels/ntv.svg',
    'tv-rtv': 'assets/channels/rtv.svg',
    'tv-news-somoy': 'assets/channels/somoy.svg',
    'tv-news-independent': 'assets/channels/independent.svg',
    'tv-news-aajtak': 'assets/channels/aajtak.svg',
    'tv-news-abp': 'assets/channels/abpnews.svg',
    'tv-sports-dd': 'assets/channels/ddsports.svg',
    'tv-bd-uxmcphtew9grap': 'assets/channels/channels.svg',
    'tv-bd-mxpvi5qy87ebef': 'assets/channels/dbc.svg',
    'tv-bd-su2edwmfyqsemr': 'assets/channels/ekhontv.svg',
    'tv-bd-29x0d5l70jxbbr': 'assets/channels/greentv.svg',
    'tv-bd-4yev6qh62bmcsw': 'assets/channels/madani.svg',
    'tv-bd-ecpznzhgiuti3f': 'assets/channels/mytv.svg',
    'tv-in-icy3xgo6y92b0g': 'assets/channels/aajtak.svg',
    'tv-in-t1fm6qmri5eiux': 'assets/channels/abpnews.svg'
  };

  // Update content.json and seed files
  const contentFiles = [
    path.join(__dirname, '..', 'data', 'content.json'),
    path.join(__dirname, '..', 'public', 'seed-content.json'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
  ];

  for (const cPath of contentFiles) {
    if (!fs.existsSync(cPath)) continue;
    const data = JSON.parse(fs.readFileSync(cPath, 'utf8'));
    if (!data.liveTv) continue;

    let updatedCount = 0;
    data.liveTv.forEach(ch => {
      // Match by ID
      if (logoMap[ch.id]) {
        ch.logo = logoMap[ch.id];
        updatedCount++;
      } else {
        // Fallback match by title
        const lowerTitle = (ch.title || ch.name || '').toLowerCase();
        if (lowerTitle.includes('gtv') || lowerTitle.includes('gazi')) {
          ch.logo = 'assets/channels/gtv.svg';
          updatedCount++;
        } else if (lowerTitle.includes('t sports')) {
          ch.logo = 'assets/channels/tsports.svg';
          updatedCount++;
        } else if (lowerTitle.includes('red bull')) {
          ch.logo = 'assets/channels/redbull.svg';
          updatedCount++;
        } else if (lowerTitle.includes('ms channel')) {
          ch.logo = 'assets/channels/mschannel.svg';
          updatedCount++;
        } else if (lowerTitle.includes('channel 24')) {
          ch.logo = 'assets/channels/channel24.svg';
          updatedCount++;
        } else if (lowerTitle.includes('somoy')) {
          ch.logo = 'assets/channels/somoy.svg';
          updatedCount++;
        } else if (lowerTitle.includes('jamuna')) {
          ch.logo = 'assets/channels/jamuna.svg';
          updatedCount++;
        } else if (lowerTitle.includes('ntv')) {
          ch.logo = 'assets/channels/ntv.svg';
          updatedCount++;
        } else if (lowerTitle.includes('rtv')) {
          ch.logo = 'assets/channels/rtv.svg';
          updatedCount++;
        } else if (lowerTitle.includes('ekattor')) {
          ch.logo = 'assets/channels/ekattor.svg';
          updatedCount++;
        } else if (lowerTitle.includes('independent')) {
          ch.logo = 'assets/channels/independent.svg';
          updatedCount++;
        } else if (lowerTitle.includes('boishakhi')) {
          ch.logo = 'assets/channels/boishakhi.svg';
          updatedCount++;
        } else if (lowerTitle.includes('desh')) {
          ch.logo = 'assets/channels/desh.svg';
          updatedCount++;
        } else if (lowerTitle.includes('duronto')) {
          ch.logo = 'assets/channels/duronto.png';
          updatedCount++;
        } else if (lowerTitle.includes('maasranga')) {
          ch.logo = 'assets/channels/maasranga.jpg';
          updatedCount++;
        }
      }
    });

    fs.writeFileSync(cPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated ${updatedCount} channel logos in ${path.basename(cPath)}`);
  }
}

main().catch(console.error);
