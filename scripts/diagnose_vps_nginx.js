const cp = require('child_process');
const fs = require('fs');

console.log('=== [VPS NGINX & STREAMING DIAGNOSTICS] ===');

try {
  const nginxConf = cp.execSync('cat /etc/nginx/sites-enabled/* 2>/dev/null || cat /etc/nginx/conf.d/* 2>/dev/null', { timeout: 5000 }).toString();
  console.log('--- NGINX SITES-ENABLED CONFIG ---');
  console.log(nginxConf);
} catch (e) {
  console.log('Nginx conf read error:', e.message);
}

try {
  const pm2Logs = cp.execSync('pm2 logs --lines 40 --nostream 2>/dev/null', { timeout: 5000 }).toString();
  console.log('--- PM2 RECENT LOGS ---');
  console.log(pm2Logs);
} catch (e) {
  console.log('PM2 logs error:', e.message);
}

try {
  const netstat = cp.execSync('netstat -an | grep :3000 | wc -l 2>/dev/null || ss -tan state established | grep :3000 | wc -l 2>/dev/null', { timeout: 5000 }).toString();
  console.log('Active Node.js :3000 connections:', netstat.trim());
} catch(e) {}
