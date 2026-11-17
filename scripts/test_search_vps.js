const adminService = require('../services/adminService');
async function test() {
  const r = await adminService.searchMovieBox('goblin');
  console.log('VPS search goblin items length:', (r.items || []).length);

  const rec = await adminService.getMovieBoxRecent('all', false);
  console.log('VPS recent all items length:', (rec.items || []).length);
  process.exit(0);
}
test().catch(e => { console.error('Error:', e); process.exit(1); });
