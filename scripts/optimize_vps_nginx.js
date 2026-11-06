const fs = require('fs');
const cp = require('child_process');

console.log('=== [APPLYING NGINX STREAMING & DOWNLOAD BUFFERLESS OPTIMIZATION] ===');

const confPath = '/etc/nginx/sites-available/fobstv.duckdns.org.conf';

if (!fs.existsSync(confPath)) {
  console.log('Config not found at', confPath);
  process.exit(0);
}

let content = fs.readFileSync(confPath, 'utf8');

const targetStreamBlock = `    # High-Performance Bufferless Video Streaming & Download Optimization
    location ~* ^/api/(moviebox/stream|stream|download) {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering: zero delay, direct chunk forwarding without disk limit
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_max_temp_file_size 0;

        # Keep large video streaming and downloads alive for up to 1 hour
        proxy_connect_timeout 60s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;

        # Disable Nagle's algorithm for instant video packet delivery
        tcp_nodelay on;
        tcp_nopush off;
    }`;

// If an older stream block exists, replace it
const oldBlockRegex = /# High-Performance Bufferless Video Streaming Optimization[\s\S]*?location ~\* \^\/api\/\(moviebox\/stream\|stream\) \{[\s\S]*?tcp_nopush off;\s*\}/;
const oldBlockWithoutCommentRegex = /location ~\* \^\/api\/\(moviebox\/stream\|stream\) \{[\s\S]*?tcp_nopush off;\s*\}/;

if (oldBlockRegex.test(content)) {
  content = content.replace(oldBlockRegex, targetStreamBlock);
  console.log('Updated existing streaming block to include /api/download and 3600s timeout.');
} else if (oldBlockWithoutCommentRegex.test(content)) {
  content = content.replace(oldBlockWithoutCommentRegex, targetStreamBlock);
  console.log('Updated existing streaming block without comment.');
} else {
  // Insert inside server { listen 443 ... } just before location / {
  const sslServerIdx = content.indexOf('listen 443 ssl');
  if (sslServerIdx !== -1) {
    const locRootIdx = content.indexOf('location / {', sslServerIdx);
    if (locRootIdx !== -1) {
      content = content.slice(0, locRootIdx) + targetStreamBlock + '\n\n    ' + content.slice(locRootIdx);
      console.log('Inserted new streaming & download block into Nginx config.');
    } else {
      console.warn('Could not locate location / inside ssl block.');
    }
  } else {
    console.warn('Could not locate listen 443 ssl block.');
  }
}

// Backup original config
fs.writeFileSync(confPath + '.bak', fs.readFileSync(confPath, 'utf8'), 'utf8');

// Write updated config
fs.writeFileSync(confPath, content, 'utf8');

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
