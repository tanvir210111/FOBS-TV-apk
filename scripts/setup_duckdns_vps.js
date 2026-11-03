const cp = require('child_process');
const fs = require('fs');

console.log('=== AUTOMATED DUCKDNS & SSL SETUP FOR fobstv.duckdns.org ===\n');

try {
  // 1. Create Nginx config for fobstv.duckdns.org with acme-challenge
  const nginxConfPath = '/etc/nginx/sites-available/fobstv.duckdns.org.conf';
  const nginxEnabledPath = '/etc/nginx/sites-enabled/fobstv.duckdns.org.conf';

  // Ensure acme-challenge dir exists
  const acmeDir = '/home/FOBS-TV-apk/public/.well-known/acme-challenge';
  if (!fs.existsSync(acmeDir)) {
    fs.mkdirSync(acmeDir, { recursive: true });
  }

  const certExists = fs.existsSync('/etc/letsencrypt/live/fobstv.duckdns.org/fullchain.pem');

  let nginxConf = '';
  if (certExists) {
    nginxConf = `server {
    listen 80;
    listen [::]:80;
    server_name fobstv.duckdns.org;

    location ^~ /.well-known/acme-challenge/ {
        root /home/FOBS-TV-apk/public;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name fobstv.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/fobstv.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fobstv.duckdns.org/privkey.pem;

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
  } else {
    nginxConf = `server {
    listen 80;
    listen [::]:80;
    server_name fobstv.duckdns.org;

    client_max_body_size 100M;

    location ^~ /.well-known/acme-challenge/ {
        root /home/FOBS-TV-apk/public;
        allow all;
    }

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
  }

  fs.writeFileSync(nginxConfPath, nginxConf);
  if (!fs.existsSync(nginxEnabledPath)) {
    try { fs.symlinkSync(nginxConfPath, nginxEnabledPath); } catch (_) { fs.writeFileSync(nginxEnabledPath, nginxConf); }
  } else {
    fs.writeFileSync(nginxEnabledPath, nginxConf);
  }

  cp.execSync('systemctl reload nginx || service nginx reload');
  console.log('Nginx reloaded with ACME support');

  if (!certExists) {
    console.log('Requesting Let\'s Encrypt SSL via certbot webroot...');
    try {
      // Try apt install python3-certbot-nginx first, or use webroot
      try { cp.execSync('apt-get update -y && apt-get install -y python3-certbot-nginx 2>&1'); } catch (_) {}
      
      const certCmd = 'certbot certonly --webroot -w /home/FOBS-TV-apk/public -d fobstv.duckdns.org --non-interactive --agree-tos -m tanvir210111@gmail.com 2>&1 || certbot --nginx -d fobstv.duckdns.org --non-interactive --agree-tos -m tanvir210111@gmail.com 2>&1';
      const out = cp.execSync(certCmd).toString();
      console.log('Certbot result:\n', out);

      if (fs.existsSync('/etc/letsencrypt/live/fobstv.duckdns.org/fullchain.pem')) {
        console.log('✅ SSL certificate successfully obtained!');
        // Re-write with SSL server block
        const sslConf = `server {
    listen 80;
    listen [::]:80;
    server_name fobstv.duckdns.org;

    location ^~ /.well-known/acme-challenge/ {
        root /home/FOBS-TV-apk/public;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name fobstv.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/fobstv.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fobstv.duckdns.org/privkey.pem;

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
        fs.writeFileSync(nginxConfPath, sslConf);
        fs.writeFileSync(nginxEnabledPath, sslConf);
        cp.execSync('nginx -t && (systemctl reload nginx || service nginx reload)');
        console.log('✅ Nginx successfully reloaded with HTTPS / SSL!');
      }
    } catch (cErr) {
      console.log('Certbot error:\n', cErr.stdout || cErr.stderr || cErr.message);
    }
  } else {
    console.log('SSL certificate already exists and active!');
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
