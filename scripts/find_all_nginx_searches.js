const fs = require('fs');
const cp = require('child_process');

console.log('=== SEARCHING ALL NGINX LOGS FOR USER SEARCH QUERIES ===\n');

try {
  const nginxFiles = cp.execSync('ls /var/log/nginx/ 2>/dev/null').toString().trim().split('\n');
  console.log('Nginx log files found:', nginxFiles);

  const searches = new Set();
  nginxFiles.forEach(file => {
    if (!file) return;
    const fullPath = '/var/log/nginx/' + file;
    try {
      if (file.endsWith('.gz')) return; // skip compressed
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach(l => {
        // search?q=... or search?query=...
        const m = l.match(/\/api\/admin\/moviebox\/search\?[^ \t\r\n"]+/);
        if (m) {
          const params = new URLSearchParams(m[0].split('?')[1]);
          const q = params.get('q') || params.get('query');
          if (q) searches.add(decodeURIComponent(q));
        }
      });
    } catch(e){}
  });

  console.log('\n=== UNIQUE SEARCHES FOUND ===');
  if (searches.size === 0) {
    console.log('No /api/admin/moviebox/search queries found in /var/log/nginx.');
  } else {
    searches.forEach(s => console.log('  🔍 ' + s));
  }
} catch(e) {
  console.error('Error:', e.message);
}
