const axios = require('axios');

async function testMxDrop() {
  const res = await axios.get('https://mxdrop.to/e/ow760vw7f1er0z', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.watch-movies.com.pk/'
    }
  });
  const html = res.data;
  // look for eval(function(p,a,c,k,e,d) or MDCore
  const m = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
  if (m) {
    console.log('Found packed JS in mxdrop!');
    let evalStr = m[0];
    // extract unpacked
    const unpack = new Function('return ' + evalStr.replace(/^eval/, ''));
    const unpacked = unpack();
    console.log('Unpacked sample:', unpacked.substring(0, 300));
    const srcMatch = unpacked.match(/(?:wurl|surl|furl|src|file)\s*=\s*["']([^"']+)["']/i) || unpacked.match(/["'](\/\/[^"']+\.mp4[^"']*)["']/i);
    if (srcMatch) console.log('Extracted video stream URL:', srcMatch[1]);
  } else {
    console.log('No packed JS found, searching for mp4 or m3u8');
    const u = html.match(/https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/gi);
    console.log('Urls:', u);
  }
}

testMxDrop().catch(e => console.error(e.message));
