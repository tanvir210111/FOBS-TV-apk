const fs = require('fs');
const path = require('path');

console.log('=== FIXING APP USERS TRACKING & DISPLAY ===\n');

// 1. Patch services/dbService.js
const dbPath = path.join(__dirname, '..', 'services', 'dbService.js');
let dbCode = fs.readFileSync(dbPath, 'utf8');

// Ensure DEVICES_FILE is defined
if (!dbCode.includes('DEVICES_FILE =')) {
  dbCode = dbCode.replace(
    'const DEVICES_LOCAL_FILE =',
    "const DEVICES_FILE = path.join(__dirname, '..', 'data', 'devices.json');\nconst DEVICES_LOCAL_FILE ="
  );
}

// Replace getDevicesMap and recordDevice and getUserStats
const oldUserStatsBlockRegex = /function getDevicesMap\(\)[\s\S]*?async function getUserStats\(\)[\s\S]*?lastLogin: u\.lastLogin \|\| u\.createdAt\s*\}\)\)\s*\};\s*\}/;

const newUserStatsBlock = `function getDevicesMap() {
  try {
    if (fs.existsSync(DEVICES_LOCAL_FILE)) {
      const data = JSON.parse(fs.readFileSync(DEVICES_LOCAL_FILE, 'utf8'));
      if (data && Object.keys(data).length > 0) return data;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function recordDevice({ deviceId, ip = '', userAgent = '', platform = 'Android' }) {
  if (!deviceId || String(deviceId).length < 3) return;
  try {
    const devices = getDevicesMap();
    const cleanId = String(deviceId).trim();
    const existing = devices[cleanId] || { id: cleanId, firstSeen: new Date().toISOString() };
    existing.lastActive = new Date().toISOString();
    if (ip && (!existing.ip || existing.ip === '127.0.0.1')) existing.ip = ip;
    if (userAgent && !existing.userAgent) existing.userAgent = userAgent;
    existing.platform = platform || existing.platform || 'Android App';
    devices[cleanId] = existing;
    
    // Save to both files
    fs.writeFileSync(DEVICES_LOCAL_FILE, JSON.stringify(devices, null, 2), 'utf8');
    try {
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    } catch(e) {}
  } catch (e) {}
}

async function getUserStats() {
  const usersMap = getLocalUsersMap();
  const devicesMap = getDevicesMap();
  const registeredUsers = Object.values(usersMap);
  const devices = Object.values(devicesMap);

  const totalRegistered = registeredUsers.length;
  const totalDevices = devices.length;
  const totalUsers = Math.max(totalRegistered + totalDevices, totalDevices, totalRegistered, 1);

  // Combine registered Google users + active mobile app devices
  const combinedList = [
    ...registeredUsers.map(u => ({
      id: u._id || u.googleId,
      name: u.name || 'Registered Member',
      email: u.email || 'Google User',
      picture: u.picture || '',
      type: 'Registered Member',
      platform: 'Google Account',
      watchlistCount: Array.isArray(u.watchlist) ? u.watchlist.length : 0,
      historyCount: Array.isArray(u.history) ? u.history.length : 0,
      createdAt: u.createdAt || u.lastLogin || new Date().toISOString(),
      lastActive: u.lastLogin || u.createdAt || new Date().toISOString(),
      status: 'Active Member'
    })),
    ...devices.map(d => {
      const isOnline = d.lastActive && (Date.now() - new Date(d.lastActive).getTime() < 15 * 60 * 1000);
      return {
        id: d.id,
        name: \`Mobile App User (\${d.platform || 'Android'})\`,
        email: d.ip ? \`IP: \${d.ip.replace('::ffff:', '')}\` : d.id,
        picture: '',
        type: 'App Installation',
        platform: d.platform || 'Android App',
        watchlistCount: 0,
        historyCount: 0,
        createdAt: d.firstSeen || d.lastActive || new Date().toISOString(),
        lastActive: d.lastActive || d.firstSeen || new Date().toISOString(),
        status: isOnline ? 'Online Now' : 'Active'
      };
    })
  ];

  // Sort by last active descending
  combinedList.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

  return {
    totalUsers,
    totalRegistered,
    totalDevices: Math.max(totalDevices, 1),
    users: combinedList
  };
}`;

if (oldUserStatsBlockRegex.test(dbCode)) {
  dbCode = dbCode.replace(oldUserStatsBlockRegex, newUserStatsBlock);
  fs.writeFileSync(dbPath, dbCode, 'utf8');
  console.log('✓ services/dbService.js updated');
} else {
  console.log('⚠️ Could not match oldUserStatsBlockRegex in dbService.js');
}

// 2. Patch server.js to auto-record device on /api/content and /api/app-ping
const serverPath = path.join(__dirname, '..', 'server.js');
let serverCode = fs.readFileSync(serverPath, 'utf8');

const contentRouteTarget = "app.get('/api/content', async (req, res) => {\n  try {\n    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');";
const contentRouteReplacement = `app.get('/api/content', async (req, res) => {
  try {
    // Auto-record active app viewer
    try {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '';
      const vId = req.headers['x-viewer-id'] || req.query.vId || (clientIp ? 'app_' + clientIp.replace(/[^a-zA-Z0-9]/g, '_') : null);
      if (vId) {
        dbService.recordDevice({
          deviceId: vId,
          ip: clientIp,
          userAgent: req.headers['user-agent'] || '',
          platform: (req.headers['user-agent'] && req.headers['user-agent'].includes('Android')) ? 'Android App' : 'Mobile App'
        });
      }
    } catch(e) {}

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');`;

if (serverCode.includes(contentRouteTarget)) {
  serverCode = serverCode.replace(contentRouteTarget, contentRouteReplacement);
  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log('✓ server.js /api/content device tracking added');
}

// 3. Patch public/admin/admin.js
const adminJsPath = path.join(__dirname, '..', 'public', 'admin', 'admin.js');
let adminJsCode = fs.readFileSync(adminJsPath, 'utf8');

// Add users to switchTab
if (!adminJsCode.includes("users: ['Audience & App Users'")) {
  adminJsCode = adminJsCode.replace(
    "notifications: ['Broadcast Announcements', 'Instant notification alerts pushed to all mobile devices']",
    "users: ['Audience & App Users', 'Real-time registered members, active mobile devices, and installations'],\n    notifications: ['Broadcast Announcements', 'Instant notification alerts pushed to all mobile devices']"
  );
}

// Call loadUsers in switchTab
if (!adminJsCode.includes("if (tabName === 'users') loadUsers();")) {
  adminJsCode = adminJsCode.replace(
    "if (tabName === 'moviebox' && document.getElementById('mb-results').children.length === 0) {",
    "if (tabName === 'users') loadUsers();\n  if (tabName === 'moviebox' && document.getElementById('mb-results').children.length === 0) {"
  );
}

// Call loadUsers in verifyAuth
if (!adminJsCode.includes("loadNotifications();\n      loadUsers();")) {
  adminJsCode = adminJsCode.replace(
    "loadNotifications();",
    "loadNotifications();\n      loadUsers();"
  );
}

// Update loadUsers rendering
const oldLoadUsersRegex = /async function loadUsers\(\)[\s\S]*?tbody\.innerHTML = users\.map\(u => \{[\s\S]*?\}\)\.join\(''\);\s*\}\s*catch \(err\) \{[\s\S]*?\}\s*\}/;

const newLoadUsers = `async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading users and mobile app devices...</td></tr>';

  try {
    const res = await apiFetch('/api/admin/users');
    const users = (res && res.users) || [];

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-mobile-screen"></i> No active users recorded yet. Launching the mobile app will automatically register your device here!</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const avatar = u.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(u.name || u.id || 'User');
      const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A';
      const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleString() : (u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'N/A');
      const isOnline = u.status === 'Online Now' || (u.lastActive && (Date.now() - new Date(u.lastActive).getTime() < 15 * 60 * 1000));
      return \`
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="\${avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.15);" />
              <div>
                <strong style="color:var(--text-primary); font-size:14px;">\${escapeHtml(u.name || 'App Viewer')}</strong>
                <div style="font-size:11px; color:var(--text-muted);">\${escapeHtml(u.type || u.platform || 'Android Device')}</div>
              </div>
            </div>
          </td>
          <td style="color:var(--text-secondary); font-family:monospace; font-size:12px;">\${escapeHtml(u.email || u.id || 'N/A')}</td>
          <td><span class="badge" style="background:rgba(59,130,246,0.15); color:#3B82F6;"><i class="fa-brands fa-android"></i> \${escapeHtml(u.platform || 'Android App')}</span></td>
          <td><span class="badge" style="background:rgba(139,92,246,0.15); color:#8B5CF6;">\${u.watchlistCount || 0} items</span></td>
          <td style="color:var(--text-muted); font-size:12px;">\${joined}</td>
          <td style="color:var(--text-muted); font-size:12px;">\${lastActive}</td>
          <td>
            <span class="badge \${isOnline ? 'text-success' : 'text-info'}" style="background:\${isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)'};">
              <i class="fa-solid fa-circle" style="font-size:8px;"></i> \${isOnline ? 'Online Now' : 'Active'}
            </span>
          </td>
        </tr>
      \`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = \`<tr><td colspan="7" class="text-center py-4 text-danger">Failed to load users: \${err.message}</td></tr>\`;
  }
}`;

if (oldLoadUsersRegex.test(adminJsCode)) {
  adminJsCode = adminJsCode.replace(oldLoadUsersRegex, newLoadUsers);
  fs.writeFileSync(adminJsPath, adminJsCode, 'utf8');
  console.log('✓ public/admin/admin.js updated');
} else {
  console.log('⚠️ Could not match oldLoadUsersRegex in admin.js');
}

// 4. Patch public/admin/index.html table headers and badge
const htmlPath = path.join(__dirname, '..', 'public', 'admin', 'index.html');
let htmlCode = fs.readFileSync(htmlPath, 'utf8');

htmlCode = htmlCode.replace(
  '<span class="badge" id="badge-users-count">0</span>',
  '<span class="badge-count" id="badge-users-count">0</span>'
);

htmlCode = htmlCode.replace(
  '<th>User / Avatar</th>\n                <th>Email / User ID</th>\n                <th>Watchlist</th>\n                <th>History</th>',
  '<th>User / Device</th>\n                <th>Email / Device IP</th>\n                <th>Platform</th>\n                <th>Watchlist</th>'
);

fs.writeFileSync(htmlPath, htmlCode, 'utf8');
console.log('✓ public/admin/index.html updated');

console.log('\n=== ALL APP USERS PATCHES APPLIED SUCCESSFULLY ===');
