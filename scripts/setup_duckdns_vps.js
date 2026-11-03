const cp = require('child_process');
const fs = require('fs');

console.log('=== VPS NGINX & DUCKDNS CONFIGURATION PROBE ===\n');

try {
  const sites = cp.execSync('ls -la /etc/nginx/sites-enabled/ 2>/dev/null || ls -la /etc/nginx/conf.d/ 2>/dev/null').toString();
  console.log('Nginx config files:\n', sites);

  // Check current config for default or FOBS
  const confFiles = cp.execSync('find /etc/nginx/ -name "*.conf" -o -name "default" 2>/dev/null').toString().trim().split('\n');
  for (const f of confFiles) {
    if (!f) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('187.127.114.52') || content.includes('proxy_pass') || content.includes('admify')) {
        console.log(`\n--- Config File: ${f} ---`);
        console.log(content.slice(0, 1000));
      }
    } catch (_) {}
  }

  // Check certbot
  try {
    const certbotVer = cp.execSync('certbot --version 2>/dev/null || which certbot 2>/dev/null').toString();
    console.log('\nCertbot status:', certbotVer);
  } catch (e) {
    console.log('\nCertbot not installed or not in PATH');
  }

} catch (err) {
  console.error('Probe error:', err.message);
}
