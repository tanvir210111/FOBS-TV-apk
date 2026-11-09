const fs = require('fs');
const cp = require('child_process');

console.log('=== [APPLYING NGINX STREAMING & DOWNLOAD BUFFERLESS OPTIMIZATION] ===');

const confPath = '/etc/nginx/sites-available/fobstv.duckdns.org.conf';

if (!fs.existsSync(confPath)) {
  console.log('Config not found at', confPath);
  process.exit(0);
}

let content = fs.readFileSync(confPath, 'utf8');

const targetStreamBlock = `    # Smooth Buffer-Assisted Video Streaming Playback
    location ~* ^/api/(moviebox/stream|stream) {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        proxy_buffering on;
        proxy_buffers 16 256k;
        proxy_buffer_size 256k;
        proxy_busy_buffers_size 512k;
        proxy_max_temp_file_size 0;
        proxy_cache off;
        proxy_cache_bypass 1;

        proxy_connect_timeout 60s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        send_timeout 3600s;

        tcp_nodelay on;
        tcp_nopush on;
        keepalive_timeout 3600s;
    }

    # High-Throughput Video Download Acceleration
    location ~* ^/api/download {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        proxy_buffering on;
        proxy_buffers 32 512k;
        proxy_buffer_size 512k;
        proxy_busy_buffers_size 1024k;
        proxy_max_temp_file_size 0;

        proxy_connect_timeout 60s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        send_timeout 3600s;

        tcp_nodelay on;
        tcp_nopush on;
        keepalive_timeout 3600s;
    }`;

// If an older stream block exists, replace it
const oldBlockRegex = /(?:# [^\n]*\n\s*)?location ~\* \^\/api\/\(moviebox\/stream\|stream(?:\|download)?\) \{[\s\S]*?tcp_nopush (?:off|on);[\s\S]*?\}(?:\s*(?:# [^\n]*\n\s*)?location ~\* \^\/api\/download \{[\s\S]*?tcp_nopush (?:off|on);[\s\S]*?\})?/;
const oldBlockWithoutCommentRegex = /location ~\* \^\/api\/\(moviebox\/stream\|stream(?:\|download)?\) \{[\s\S]*?tcp_nopush off;[\s\S]*?\}/;

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
