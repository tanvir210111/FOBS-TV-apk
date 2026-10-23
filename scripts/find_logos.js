const fs = require('fs');

async function testUrl(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 200) {
      return true;
    }
  } catch (e) {}
  return false;
}

async function main() {
  const candidates = {
    'red_bull': [
      'https://static.cdnlogo.com/logos/r/27/red-bull.svg',
      'https://upload.wikimedia.org/wikipedia/en/f/f5/RedBullEnergyDrink.svg',
      'https://upload.wikimedia.org/wikipedia/commons/d/d9/Red_Bull_TV_logo.svg'
    ],
    'channel24': [
      'https://upload.wikimedia.org/wikipedia/en/7/75/Channel_24_%28Bangladesh%29_logo.svg',
      'https://raw.githubusercontent.com/iptv-org/epg/master/sites/tvguide.com/logos/Channel24BD.png'
    ],
    'ms_channel': [
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=200&q=80',
      'https://i.imgur.com/ZhkZzLf.png'
    ]
  };

  for (const [key, list] of Object.entries(candidates)) {
    for (const u of list) {
      const ok = await testUrl(u);
      console.log(key, ok ? 'SUCCESS' : 'FAIL', u);
      if (ok) break;
    }
  }
}

main();
