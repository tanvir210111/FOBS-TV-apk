const axios = require('axios');

async function verify() {
  const res = await axios.get('http://187.127.114.52/api/content', { timeout: 15000 });
  const data = res.data;
  console.log('VPS Content count:', {
    movies: data.movies?.length,
    series: data.series?.length
  });

  const sampleTitles = [
    'Hotel Del Luna [Hindi]',
    'Extraordinary You [Hindi]',
    'Kingdom [Hindi]',
    'Parasite [Hindi]',
    'Extreme Job [Hindi]',
    'Exit [Hindi]'
  ];

  sampleTitles.forEach(t => {
    const foundS = data.series?.find(s => s.title === t);
    const foundM = data.movies?.find(m => m.title === t);
    const found = foundS || foundM;
    console.log(`Found on VPS "${t}":`, !!found, found?.type, 'Servers:', found?.servers?.length || found?.seasons?.[0]?.episodes?.[0]?.servers?.length);
  });

  // Test live stream playback on VPS
  const testStreamUrl = 'http://187.127.114.52/api/moviebox/stream?id=723261668255565544&path=&se=1&ep=1&q=480';
  const streamRes = await axios.get(testStreamUrl, {
    headers: { 'Range': 'bytes=0-1024' },
    timeout: 10000
  });
  console.log('Stream test status:', streamRes.status, 'Content-Range:', streamRes.headers['content-range'], 'Content-Type:', streamRes.headers['content-type']);
}

verify().catch(e => console.error(e.message));
