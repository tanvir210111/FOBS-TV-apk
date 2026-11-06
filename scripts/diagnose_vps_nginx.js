const cp = require('child_process');

try {
  const out = cp.execSync('grep -rn "fobstv.duckdns.org" /etc/nginx/ 2>/dev/null', { timeout: 4000 }).toString();
  console.log('--- NGINX FOBS CONF FILES ---');
  console.log(out);

  const file = out.split(':')[0];
  if (file) {
    console.log('--- CONTENT OF ' + file + ' ---');
    console.log(cp.execSync('cat ' + file, { timeout: 4000 }).toString());
  }
} catch(e) {
  console.log('Error:', e.message);
}
