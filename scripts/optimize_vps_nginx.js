const fs = require('fs');
const cp = require('child_process');

console.log('=== [APPLYING NGINX STREAMING BUFFERLESS OPTIMIZATION] ===');

const confPath = '/etc/nginx/sites-available/fobstv.duckdns.org.conf';

if (!fs.existsSync(confPath)) {
  console.log('Config not found at', confPath);
  process.exit(0);
}

let content = fs.readFileSync(confPath, 'utf8');

if (content.includes('proxy_buffering off;')) {
  console.log('Nginx streaming optimization is already present in', confPath);
  process.exit(0);
}

// Backup original config
fs.writeFileSync(confPath + '.bak', content, 'utf8');

const streamBlock = `
    # High-Performance Bufferless Video Streaming Optimization
    location ~* ^/api/(moviebox/stream|stream) {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering: zero delay, direct chunk forwarding
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_max_temp_file_size 0;

        # Keep streaming connection alive without 60s dropouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        # Disable Nagle's algorithm for low-latency video chunks
        tcp_nodelay on;
        tcp_nopush off;
    }
`;

// Insert inside server { listen 443 ... } just before location / {
const sslServerIdx = content.indexOf('listen 443 ssl');
if (sslServerIdx !== -1) {
  const locRootIdx = content.indexOf('location / {', sslServerIdx);
  if (locRootIdx !== -1) {
    content = content.slice(0, locRootIdx) + streamBlock + '\n    ' + content.slice(locRootIdx);
    fs.writeFileSync(confPath, content, 'utf8');
    console.log('Successfully inserted stream optimization into Nginx config.');

    try {
      cp.execSync('nginx -t');
      console.log('Nginx config syntax test: PASSED ✅');
      cp.execSync('systemctl reload nginx || nginx -s reload');
      console.log('Nginx reloaded successfully ✅');
    } catch (err) {
      console.error('Nginx syntax test failed! Restoring backup...', err.message);
      fs.copyFileSync(confPath + '.bak', confPath);
      cp.execSync('systemctl reload nginx || nginx -s reload');
    }
  } else {
    console.warn('Could not locate location / inside ssl block.');
  }
} else {
  console.warn('Could not locate listen 443 ssl block.');
}
