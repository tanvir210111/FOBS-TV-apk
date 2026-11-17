const adminService = require('../services/adminService');

async function testLive() {
  const titles = [
    { q: 'Sen Cal Kapimi [Hindi]', type: 'series' },
    { q: 'Solo Leveling [Hindi]', type: 'series' },
    { q: 'Devara [Hindi]', type: 'movie' },
    { q: 'Squid Game [Hindi]', type: 'series' }
  ];

  for (const t of titles) {
    try {
      const res = await adminService.autoDetectMedia(t.q, t.type);
      console.log(`[LIVE AUTO-DETECT] "${t.q}" -> Industry: "${res.data?.industry}", Category: "${res.data?.category}", Title: "${res.data?.title}"`);
    } catch (e) {
      console.error(`Error on ${t.q}:`, e.message);
    }
  }
  process.exit(0);
}

testLive();
