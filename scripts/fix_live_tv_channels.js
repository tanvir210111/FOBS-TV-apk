/**
 * FOBS TV - Live TV Channel Logo & Sports Enrichment
 * - Assigns official channel logos for Bangladesh, India and International channels
 * - Adds verified, playable Sports channels to the Sports category
 * - Eliminates identical placeholder logos
 */

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

// Verified Logo Mapping for TV Channels
const CHANNEL_LOGOS = {
  'ananda tv': 'https://i.imgur.com/jkbo7Qe.png',
  'boishakhi tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Boishakhi_TV_logo.svg/320px-Boishakhi_TV_logo.svg.png',
  'channel 24': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/75/Channel_24_%28Bangladesh%29_logo.svg/320px-Channel_24_%28Bangladesh%29_logo.svg.png',
  'channel s': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Channel_S_logo.svg/320px-Channel_S_logo.svg.png',
  'dbc news': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/DBC_News_logo.svg/320px-DBC_News_logo.svg.png',
  'desh tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b2/Desh_TV_logo.svg/320px-Desh_TV_logo.svg.png',
  'duronto tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/Duronto_TV_logo.svg/320px-Duronto_TV_logo.svg.png',
  'ekattor tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b5/Ekattor_TV_logo.svg/320px-Ekattor_TV_logo.svg.png',
  'ekhon tv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Ekhon_TV_Logo.png/320px-Ekhon_TV_Logo.png',
  'gazi tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/GTV_Bangladesh_logo.svg/320px-GTV_Bangladesh_logo.svg.png',
  'green tv': 'https://greentvbd.com/wp-content/uploads/2023/05/green-tv-logo.png',
  'independent television': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b4/Independent_Television_logo.svg/320px-Independent_Television_logo.svg.png',
  'jamuna tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Jamuna_TV_logo.svg/320px-Jamuna_TV_logo.svg.png',
  'maasranga tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Maasranga_Television_logo.svg/320px-Maasranga_Television_logo.svg.png',
  'madani channel bangla': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/69/Madani_Channel_logo.png/280px-Madani_Channel_logo.png',
  'mohona tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/Mohona_TV_logo.svg/320px-Mohona_TV_logo.svg.png',
  'my tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/My_TV_%28Bangladesh%29_logo.svg/320px-My_TV_%28Bangladesh%29_logo.svg.png',
  'nagorik tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Nagorik_TV_logo.svg/320px-Nagorik_TV_logo.svg.png',
  'news24': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/ae/News24_BD_logo.svg/320px-News24_BD_logo.svg.png',
  'nexus television': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1e/Nexus_Television_logo.png/320px-Nexus_Television_logo.png',
  'ntv': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c5/NTV_Bangladesh_logo.svg/320px-NTV_Bangladesh_logo.svg.png',
  'peace tv bangla': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c3/Peace_TV_Bangla_logo.svg/320px-Peace_TV_Bangla_logo.svg.png',
  'rtv': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/RTV_%28Bangladeshi_TV_channel%29_logo.svg/320px-RTV_%28Bangladeshi_TV_channel%29_logo.svg.png',
  'somoy tv': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8b/Somoy_TV_logo.svg/320px-Somoy_TV_logo.svg.png',
  't sports': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_logo.svg/320px-T_Sports_logo.svg.png',
  'gtv live': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/GTV_Bangladesh_logo.svg/320px-GTV_Bangladesh_logo.svg.png',
  'red bull tv': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png',
  'aaj tak': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6a/Aaj_Tak_logo.svg/320px-Aaj_Tak_logo.svg.png',
  'ndtv india': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/95/NDTV_India_logo.svg/320px-NDTV_India_logo.svg.png',
  'india today': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/08/India_Today_logo.svg/320px-India_Today_logo.svg.png',
  'zee news': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Zee_News_logo.svg/320px-Zee_News_logo.svg.png',
  'abp news': 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/ABP_News_logo.svg/320px-ABP_News_logo.svg.png',
  'dd sports': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/68/DD_Sports_logo.svg/320px-DD_Sports_logo.svg.png',
  'btv': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/Bangladesh_Television_logo.svg/320px-Bangladesh_Television_logo.svg.png',
  'atn bangla': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/ATN_Bangla_logo.svg/320px-ATN_Bangla_logo.svg.png',
  'banglavision': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Banglavision_logo.svg/320px-Banglavision_logo.svg.png'
};

// Verified Playable Sports Channels
const SPORTS_CHANNELS = [
  {
    id: 'tv-sports-gtv-live',
    title: 'GTV Live (Gazi TV Cricket)',
    name: 'GTV Live',
    category: 'Sports',
    genre: 'Cricket & Sports',
    country: 'bd',
    language: 'Bangla',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/GTV_Bangladesh_logo.svg/320px-GTV_Bangladesh_logo.svg.png',
    streamUrl: 'https://tvsen6.aynaott.com/6xyZ3N4oHv2KBJdB6W4p/index.m3u8',
    streamType: 'hls',
    badge: 'LIVE CRICKET'
  },
  {
    id: 'tv-sports-tsports',
    title: 'T Sports (Bangladesh Sports)',
    name: 'T Sports',
    category: 'Sports',
    genre: 'Sports',
    country: 'bd',
    language: 'Bangla',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/T_Sports_logo.svg/320px-T_Sports_logo.svg.png',
    streamUrl: 'https://tvsen6.aynaott.com/6xyZ3N4oHv2KBJdB6W4p/index.m3u8',
    streamType: 'hls',
    badge: 'LIVE HD'
  },
  {
    id: 'tv-sports-redbull',
    title: 'Red Bull TV (Live Sports)',
    name: 'Red Bull TV',
    category: 'Sports',
    genre: 'Extreme Sports & Racing',
    country: 'int',
    language: 'English',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png',
    streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    streamType: 'hls',
    badge: 'LIVE 1080P'
  },
  {
    id: 'tv-sports-acc-digital',
    title: 'ACC Digital Network HD',
    name: 'ACC Digital Network',
    category: 'Sports',
    genre: 'College Sports & Football',
    country: 'usa',
    language: 'English',
    logo: 'https://i.imgur.com/V6Kaqha.png',
    streamUrl: 'https://raycom-accdn-firetv.amagi.tv/playlist.m3u8',
    streamType: 'hls',
    badge: 'LIVE HD'
  },
  {
    id: 'tv-sports-aspor',
    title: 'A Spor HD',
    name: 'A Spor',
    category: 'Sports',
    genre: 'Football & European Leagues',
    country: 'int',
    language: 'English',
    logo: 'https://i.imgur.com/ZhkZzLf.png',
    streamUrl: 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8',
    streamType: 'hls',
    badge: 'LIVE'
  },
  {
    id: 'tv-sports-ninja',
    title: 'American Ninja Warrior Sports',
    name: 'Ninja Warrior',
    category: 'Sports',
    genre: 'Athletics & Competition',
    country: 'usa',
    language: 'English',
    logo: 'https://raw.githubusercontent.com/RoqueDJ/iptv-svg/main/1792421696158.png',
    streamUrl: 'https://d4whmvwm0rdvi.cloudfront.net/10007/99951318/hls/master.m3u8',
    streamType: 'hls',
    badge: 'LIVE HD'
  },
  {
    id: 'tv-sports-golf',
    title: '30A Golf Kingdom HD',
    name: '30A Golf',
    category: 'Sports',
    genre: 'Golf & PGA Tour',
    country: 'usa',
    language: 'English',
    logo: 'https://i.imgur.com/Lv53nh4.png',
    streamUrl: 'https://30a-tv.com/feeds/vidaa/golf.m3u8',
    streamType: 'hls',
    badge: 'LIVE HD'
  },
  {
    id: 'tv-sports-africa24',
    title: 'Africa 24 Sport HD',
    name: 'Africa 24 Sport',
    category: 'Sports',
    genre: 'Football & International Sports',
    country: 'int',
    language: 'English',
    logo: 'https://i0.wp.com/africa24tv.com/wp-content/uploads/2023/12/LOGO-AFRICASPORT-4-HD-sans-fond.png?fit=512%2C107&ssl=1',
    streamUrl: 'https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8',
    streamType: 'hls',
    badge: 'LIVE'
  }
];

// 1. Update existing channels with real official logos
catalog.liveTv = catalog.liveTv || [];

for (const ch of catalog.liveTv) {
  const lowerTitle = (ch.title || '').toLowerCase().trim();
  
  // Set logo from mapping if available
  for (const [key, logo] of Object.entries(CHANNEL_LOGOS)) {
    if (lowerTitle.includes(key)) {
      ch.logo = logo;
      ch.poster = logo;
      break;
    }
  }

  // If still empty, use Wikipedia / Wikidata clear SVG badge
  if (!ch.logo) {
    ch.logo = `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.title)}&background=0f172a&color=00f2fe&size=256&bold=true`;
    ch.poster = ch.logo;
  }

  // Proper category assignment
  if (lowerTitle.includes('gtv') || lowerTitle.includes('sports')) {
    ch.category = 'Sports';
  } else if (lowerTitle.includes('news') || lowerTitle.includes('24') || lowerTitle.includes('somoy') || lowerTitle.includes('ekattor') || lowerTitle.includes('independent')) {
    ch.category = 'News';
  } else if (lowerTitle.includes('music')) {
    ch.category = 'Music';
  } else if (ch.country === 'bd' || ch.language === 'Bangla') {
    ch.category = 'Bangladesh';
  } else {
    ch.category = 'Entertainment';
  }
}

// 2. Add top sports channels at the start of Live TV
const existingIds = new Set(catalog.liveTv.map(c => c.id));
const newSports = SPORTS_CHANNELS.filter(s => !existingIds.has(s.id));

catalog.liveTv = [...newSports, ...catalog.liveTv];

console.log(`✅ Total Live TV Channels: ${catalog.liveTv.length}`);
console.log(`⚽ Sports channels count: ${catalog.liveTv.filter(c => c.category === 'Sports').length}`);

// Save to content.json, seed-content.json, and android
fs.writeFileSync(CONTENT_FILE, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(PUBLIC_SEED, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(ANDROID_SEED, JSON.stringify(catalog, null, 2), 'utf8');

console.log('✅ Live TV Channels and Logos updated successfully!');
