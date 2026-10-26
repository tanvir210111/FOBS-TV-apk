const fs = require('fs');
const cp = require('child_process');

console.log('=== SEARCHING NGINX & PM2 LOGS FOR RECENT ADMIN IMPORTS ===\n');

const logs = [
  '/var/log/nginx/access.log',
  '/var/log/nginx/access.log.1',
  process.env.HOME + '/.pm2/logs/fobs-tv-out.log',
  process.env.HOME + '/.pm2/logs/fobs-tv-out-0.log',
  process.env.HOME + '/.pm2/logs/fobs-tv-out-1.log',
  process.env.HOME + '/.pm2/logs/fobs-tv-out-10.log'
];

const foundDetailPaths = new Set();
const foundSearches = new Set();

logs.forEach(logFile => {
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        // Look for moviebox/detail?id=...&path=...
        const detailMatch = line.match(/\/api\/admin\/moviebox\/detail\?([^ \t\r\n"]+)/);
        if (detailMatch) {
          foundDetailPaths.add(detailMatch[1]);
        }
        // Look for moviebox/search?query=...
        const searchMatch = line.match(/\/api\/admin\/moviebox\/search\?([^ \t\r\n"]+)/);
        if (searchMatch) {
          foundSearches.add(decodeURIComponent(searchMatch[1]));
        }
      });
    } catch(e) {}
  }
});

console.log('=== 1. SEARCH QUERIES RUN IN ADMIN PANEL ===');
if (foundSearches.size === 0) console.log('None found in logs.');
else foundSearches.forEach(s => console.log('  🔍 Search:', s));

console.log('\n=== 2. DETAILS & IMPORTS OPENED IN ADMIN PANEL ===');
if (foundDetailPaths.size === 0) console.log('None found in logs.');
else {
  foundDetailPaths.forEach(p => {
    const params = new URLSearchParams(p);
    const id = params.get('id') || params.get('subjectId');
    const path = params.get('path') || params.get('detailPath');
    console.log(`  🎬 ID: ${id} | Path: ${path}`);
  });
}
