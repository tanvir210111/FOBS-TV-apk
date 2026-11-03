const cp = require('child_process');
const fs = require('fs');

console.log('=== AUTOMATED DUCKDNS & SSL SETUP FOR fobstv.duckdns.org ===\n');

try {
  // 1. Create Nginx config for fobstv.duckdns.org
  const nginxConfPath = '/etc/nginx/sites-available/fobstv.duckdns.org.conf';
  const nginxEnabledPath = '/etc/nginx/sites-enabled/fobstv.duckdns.org.conf';

  const nginxConf = `server {
    listen 80;
    listen [::]:80;
    server_name fobstv.duckdns.org;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;

  try {
    fs.writeFileSync(nginxConfPath, nginxConf);
    if (!fs.existsSync(nginxEnabledPath)) {
      try { fs.symlinkSync(nginxConfPath, nginxEnabledPath); } catch (_) { fs.writeFileSync(nginxEnabledPath, nginxConf); }
    } else {
      fs.writeFileSync(nginxEnabledPath, nginxConf);
    }
    console.log('Nginx config created at /etc/nginx/sites-enabled/fobstv.duckdns.org.conf');

    const testRes = cp.execSync('nginx -t 2>&1').toString();
    console.log('nginx -t:\n', testRes);

    cp.execSync('systemctl reload nginx || service nginx reload');
    console.log('Nginx reloaded successfully');

    // 2. Run certbot for fobstv.duckdns.org
    console.log('\nRequesting Let\'s Encrypt SSL via Certbot...');
    const certbotCmd = 'certbot --nginx -d fobstv.duckdns.org --non-interactive --agree-tos -m tanvir210111@gmail.com --redirect';
    try {
      const certbotOut = cp.execSync(certbotCmd, { encoding: 'utf8' });
      console.log('Certbot output:\n', certbotOut);
    } catch (certErr) {
      console.log('Certbot stderr/stdout:\n', certErr.stdout || certErr.stderr || certErr.message);
    }

  } catch (err) {
    console.error('Nginx/Certbot setup note:', err.message);
  }

  // 3. Setup DuckDNS Auto-Updater Cron Job on VPS
  try {
    const cronScriptPath = '/usr/local/bin/duckdns-updater.sh';
    const cronScript = `#!/bin/bash
curl -s "https://www.duckdns.org/update?domains=fobstv&token=e40ea435-33c7-4daa-bae2-05267a670ab4&ip=187.127.114.52" >/dev/null 2>&1
`;
    fs.writeFileSync(cronScriptPath, cronScript, { mode: 0o755 });
    cp.execSync('chmod +x /usr/local/bin/duckdns-updater.sh');

    // Add to crontab if not already present
    const curCrontab = cp.execSync('crontab -l 2>/dev/null || true').toString();
    if (!curCrontab.includes('duckdns-updater')) {
      const newCrontab = curCrontab + '\n*/30 * * * * /usr/local/bin/duckdns-updater.sh\n';
      fs.writeFileSync('/tmp/cron.tmp', newCrontab);
      cp.execSync('crontab /tmp/cron.tmp && rm -f /tmp/cron.tmp');
      console.log('DuckDNS cronjob added to crontab (runs every 30 mins)');
    } else {
      console.log('DuckDNS cronjob already present');
    }
  } catch (crErr) {
    console.log('Cron setup note:', crErr.message);
  }

} catch (e) {
  console.error('Top level error:', e.message);
}
