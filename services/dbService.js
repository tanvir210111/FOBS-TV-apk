/**
 * FOBS TV - Database & Real-Time Engine Service
 * Powered by MongoDB (Persistence) & Redis (Real-Time In-Memory Engine)
 */

const mongoose = require('mongoose');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fobstv';
const REDIS_URI = process.env.REDIS_URI || 'redis://127.0.0.1:6379';
const BOOKINGS_FILE = path.join(__dirname, '..', 'data', 'bookings.json');
const COMMENTS_FILE = path.join(__dirname, '..', 'data', 'comments.json');
const REPORTS_FILE = path.join(__dirname, '..', 'data', 'reports.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const USERS_LOCAL_FILE = path.join(__dirname, '..', 'data', 'users.local.json');
const DEVICES_FILE = path.join(__dirname, '..', 'data', 'devices.json');
const DEVICES_LOCAL_FILE = path.join(__dirname, '..', 'data', 'devices.local.json');

function getLocalUsersMap() {
  try {
    if (fs.existsSync(USERS_LOCAL_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_LOCAL_FILE, 'utf8'));
      if (data && Object.keys(data).length > 0) return data;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading users file:', e.message);
  }
  return {};
}

function saveLocalUsersMap(map) {
  try {
    fs.writeFileSync(USERS_LOCAL_FILE, JSON.stringify(map, null, 2), 'utf8');
    fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving users file:', e.message);
  }
}

function getDevicesMap() {
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

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Unknown';
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1 min ago';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  return `${Math.floor(diffSec / 86400)} days ago`;
}

function parseDeviceModel(ua, platform) {
  if (!ua) return platform || 'Android Device';
  if (ua.includes('SM-')) {
    const match = ua.match(/SM-[A-Z0-9]+/i);
    if (match) return `Samsung (${match[0]})`;
  }
  if (ua.includes('Redmi') || ua.includes('POCO') || ua.includes('M2')) {
    const match = ua.match(/(Redmi[^\s;)]+|POCO[^\s;)]+)/i);
    if (match) return `Xiaomi (${match[0]})`;
  }
  if (ua.includes('Pixel')) {
    const match = ua.match(/Pixel\s*[0-9a-zA-Z]+/i);
    if (match) return `Google ${match[0]}`;
  }
  if (ua.includes('CPH') || ua.includes('RMX')) {
    const match = ua.match(/(CPH[0-9]+|RMX[0-9]+)/i);
    if (match) return `Realme/Oppo (${match[0]})`;
  }
  if (ua.includes('Android')) return 'Android Mobile';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('iPhone')) return 'Apple iPhone';
  return platform || 'Android Device';
}

function recordDevice({ deviceId, ip = '', userAgent = '', platform = 'Android', appVersion = '' }) {
  if (!deviceId || String(deviceId).length < 3) return;
  const isV318 = appVersion === '3.1.8' || appVersion === 'v3.1.8' || (typeof appVersion === 'string' && appVersion.includes('3.1.8'));
  try {
    const devices = getDevicesMap();
    const cleanId = String(deviceId).trim();
    const existing = devices[cleanId] || { id: cleanId, firstSeen: new Date().toISOString() };
    existing.lastActive = new Date().toISOString();
    if (ip && (!existing.ip || existing.ip === '127.0.0.1')) existing.ip = ip.replace('::ffff:', '');
    if (userAgent && !existing.userAgent) existing.userAgent = userAgent;
    existing.platform = platform || existing.platform || 'Android App';
    existing.appVersion = isV318 ? '3.1.8' : (appVersion || 'Older Version');
    devices[cleanId] = existing;
    
    fs.writeFileSync(DEVICES_LOCAL_FILE, JSON.stringify(devices, null, 2), 'utf8');
    try {
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    } catch(e) {}
  } catch (e) {}
}

function tryRecoverEmailFromGoogleId(googleId, name) {
  if (!googleId || !name) return null;
  const hash = String(googleId).replace(/^usr_usr_/, '').replace(/^usr_/, '');
  if (!/^[a-f0-9]{14,32}$/i.test(hash)) return null;

  const rawClean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!rawClean || rawClean.length < 3) return null;

  const words = name.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const variants = [
    rawClean,
    words.join(''),
    words.join('.'),
    words.join('_')
  ];
  if (words.length > 1) {
    variants.push(words.slice().reverse().join(''));
    variants.push(words.slice().reverse().join('.'));
  }

  const prefixSet = new Set(variants);
  const targetPrefix = hash.substring(0, 14);

  for (const v of prefixSet) {
    const test1 = v + '@gmail.com';
    if (crypto.createHash('md5').update(test1).digest('hex').startsWith(targetPrefix)) {
      return test1;
    }
    for (let n = 0; n <= 9999; n++) {
      const testN = v + n + '@gmail.com';
      if (crypto.createHash('md5').update(testN).digest('hex').startsWith(targetPrefix)) {
        return testN;
      }
    }
    for (let y = 1980; y <= 2026; y++) {
      const testY = v + y + '@gmail.com';
      if (crypto.createHash('md5').update(testY).digest('hex').startsWith(targetPrefix)) {
        return testY;
      }
    }
  }
  return null;
}

async function getUserStats() {
  const usersMap = getLocalUsersMap();
  const devicesMap = getDevicesMap();
  let rawRegisteredUsers = Object.values(usersMap);

  if (isMongoConnected && User) {
    try {
      const dbUsers = await User.find({}).lean();
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        const map = new Map();
        const normalizeKey = (u) => {
          let gid = (u.googleId || '').replace(/^usr_usr_/, 'usr_');
          let oid = u._id ? u._id.toString() : '';
          let em = (u.email && u.email.includes('@') && u.email !== 'Google User') ? u.email.trim().toLowerCase() : '';
          return gid || em || oid;
        };

        for (const u of rawRegisteredUsers) {
          const k = normalizeKey(u);
          if (k) map.set(k, { ...u });
        }

        for (const u of dbUsers) {
          const k = normalizeKey(u);
          if (!k) continue;
          if (map.has(k)) {
            const existing = map.get(k);
            const resolvedEmail = (u.email && u.email.includes('@') && u.email !== 'Google User')
              ? u.email.trim().toLowerCase()
              : (existing.email && existing.email.includes('@') && existing.email !== 'Google User' ? existing.email : (u.email || existing.email || ''));
            const resolvedName = (u.name && u.name !== 'Registered Member' && u.name !== 'User')
              ? u.name
              : (existing.name || u.name || 'Registered Member');
            map.set(k, {
              ...existing,
              ...u,
              email: resolvedEmail,
              name: resolvedName,
              watchlist: Array.isArray(u.watchlist) && u.watchlist.length > 0 ? u.watchlist : (existing.watchlist || []),
              history: Array.isArray(u.history) && u.history.length > 0 ? u.history : (existing.history || []),
              lastLogin: (new Date(u.lastLogin || 0) > new Date(existing.lastLogin || 0)) ? u.lastLogin : (existing.lastLogin || u.lastLogin)
            });
          } else {
            map.set(k, { ...u });
          }
        }
        rawRegisteredUsers = Array.from(map.values());
      }
    } catch (e) {}
  }

  // Self-Healing: Search for missing user emails across DB collections & local records
  for (const u of rawRegisteredUsers) {
    let email = (u.email || u.userEmail || u.mail || '').trim().toLowerCase();
    if (!email || !email.includes('@') || email === 'google user') {
      // 1. Try finding in MongoDB User by exact name match
      if (isMongoConnected && User && u.name && u.name !== 'Registered Member' && u.name !== 'User') {
        try {
          const matched = await User.findOne({
            name: new RegExp('^' + u.name.trim() + '$', 'i'),
            email: { $regex: /@/ }
          }).lean();
          if (matched && matched.email && matched.email.includes('@')) {
            email = matched.email.trim().toLowerCase();
            u.email = email;
          }
        } catch(e) {}
      }

      // 2. Try finding in Feedback collection
      if ((!email || !email.includes('@')) && isMongoConnected && Feedback) {
        try {
          const fb = await Feedback.findOne({
            $or: [
              { googleId: u.googleId },
              { name: new RegExp('^' + (u.name || '').trim() + '$', 'i') }
            ],
            email: { $regex: /@/ }
          }).lean();
          if (fb && fb.email && fb.email.includes('@')) {
            email = fb.email.trim().toLowerCase();
            u.email = email;
          }
        } catch(e) {}
      }

      // 3. Try finding in Report collection
      if ((!email || !email.includes('@')) && isMongoConnected && Report) {
        try {
          const rep = await Report.findOne({
            $or: [
              { userId: u.googleId },
              { userName: new RegExp('^' + (u.name || '').trim() + '$', 'i') }
            ],
            userEmail: { $regex: /@/ }
          }).lean();
          if (rep && rep.userEmail && rep.userEmail.includes('@')) {
            email = rep.userEmail.trim().toLowerCase();
            u.email = email;
          }
        } catch(e) {}
      }

      // 4. Try recovering email by matching MD5 hash of googleId with name permutations
      if ((!email || !email.includes('@')) && u.googleId && u.name) {
        try {
          const recovered = tryRecoverEmailFromGoogleId(u.googleId, u.name);
          if (recovered) {
            email = recovered;
            u.email = recovered;
          }
        } catch(e) {}
      }
    }

    // Persist healed email back to usersMap & Mongo
    if (email && email.includes('@') && email !== 'google user' && u.googleId) {
      u.email = email;
      const targetGid = u.googleId;
      if (usersMap[targetGid]) {
        usersMap[targetGid].email = email;
        try { saveLocalUsersMap(usersMap); } catch(e) {}
      }
    }
  }

  const rawDevices = Object.values(devicesMap);
  const V318_RELEASE_TIMESTAMP = new Date('2026-11-10T09:15:00.000Z').getTime();

  // STRICT FILTER FOR v3.1.8: Only devices actually running v3.1.8 AND active on/after v3.1.8 release
  const devices = rawDevices.filter(d => {
    const isVer318 = d.appVersion === '3.1.8' || (d.appVersion && d.appVersion.includes('3.1.8'));
    const isTime318 = new Date(d.lastActive || d.firstSeen || 0).getTime() >= V318_RELEASE_TIMESTAMP;
    return isVer318 && isTime318;
  });

  // STRICT FILTER FOR v3.1.8: Only registered members who actually opened/logged in on v3.1.8 on/after release
  const registeredUsers = rawRegisteredUsers.filter(u => {
    const isAdmin = (u.email === 'tanvir210111@gmail.com');
    const isVer318 = u.appVersion === '3.1.8' || (u.appVersion && u.appVersion.includes('3.1.8'));
    const isTime318 = new Date(u.lastLogin || u.createdAt || 0).getTime() >= V318_RELEASE_TIMESTAMP;
    return isAdmin || (isVer318 && isTime318);
  });

  const totalRegistered = registeredUsers.length;
  const totalDevices = devices.length;
  const totalUsers = totalRegistered + totalDevices;

  // Combine registered Google users + active mobile app devices
  const combinedList = [
    ...registeredUsers.map(u => {
      const lastActiveTime = u.lastLogin || u.createdAt || new Date().toISOString();
      const isOnline = (Date.now() - new Date(lastActiveTime).getTime() < 10 * 60 * 1000);
      const isRecent = (Date.now() - new Date(lastActiveTime).getTime() < 60 * 60 * 1000);
      const cleanIp = u.ip ? u.ip.replace('::ffff:', '') : 'Encrypted';
      return {
        id: u._id || u.googleId,
        googleId: u.googleId || '',
        name: u.name || 'Registered Member',
        email: (u.email && u.email !== 'Google User') ? u.email : '',
        picture: u.picture || '',
        type: 'Registered Member',
        platform: 'Google Account',
        deviceModel: 'Google Authenticated',
        ip: cleanIp,
        appVersion: '3.1.8',
        versionVerified: true,
        watchlistCount: Array.isArray(u.watchlist) ? u.watchlist.length : 0,
        historyCount: Array.isArray(u.history) ? u.history.length : 0,
        createdAt: u.createdAt || lastActiveTime,
        lastActive: lastActiveTime,
        lastActiveAgo: formatRelativeTime(lastActiveTime),
        isOnline,
        status: isOnline ? 'Online Now' : (isRecent ? 'Active Recently' : 'Offline')
      };
    }),
    ...devices.map(d => {
      const lastActiveTime = d.lastActive || d.firstSeen || new Date().toISOString();
      const isOnline = (Date.now() - new Date(lastActiveTime).getTime() < 10 * 60 * 1000);
      const isRecent = (Date.now() - new Date(lastActiveTime).getTime() < 60 * 60 * 1000);
      const cleanIp = d.ip ? d.ip.replace('::ffff:', '') : (d.id || 'Mobile App');
      const devModel = parseDeviceModel(d.userAgent, d.platform);
      return {
        id: d.id,
        deviceId: d.id,
        name: `${devModel}`,
        email: cleanIp.startsWith('1') || cleanIp.startsWith('2') || cleanIp.includes('.') ? `IP: ${cleanIp}` : cleanIp,
        ip: cleanIp,
        userAgent: d.userAgent || '',
        deviceModel: devModel,
        picture: '',
        type: 'App Installation',
        platform: d.platform || 'Android App',
        appVersion: '3.1.8',
        versionVerified: true,
        watchlistCount: 0,
        historyCount: 0,
        createdAt: d.firstSeen || lastActiveTime,
        lastActive: lastActiveTime,
        lastActiveAgo: formatRelativeTime(lastActiveTime),
        isOnline,
        status: isOnline ? 'Online Now' : (isRecent ? 'Active Recently' : 'Offline')
      };
    })
  ];

  combinedList.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

  const compliantDevices = devices.length;
  const outdatedDevices = 0;

  return {
    totalUsers,
    totalRegistered,
    totalDevices,
    compliantDevices,
    outdatedDevices,
    devices,
    users: combinedList
  };
}

let isMongoConnected = false;
let isRedisConnected = false;

// Fallback in-memory stores if DBs are connecting/offline
const memoryActiveViewers = new Map(); // mediaId -> Map(viewerId -> timestamp)
const memoryTotalViews = new Map();    // mediaId -> count
const memoryUsers = new Map();         // googleId -> userDoc


// ----------------------------------------------------
// 1. MONGODB CONNECTION & SCHEMAS
// ----------------------------------------------------
const WatchlistItemSchema = new mongoose.Schema({
  mediaId: { type: String, required: true },
  title: { type: String, required: true },
  poster: { type: String, default: '' },
  type: { type: String, default: 'movie' }, // 'movie' | 'series' | 'liveTv'
  rating: { type: String, default: '' },
  year: { type: String, default: '' },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const WatchHistoryItemSchema = new mongoose.Schema({
  mediaId: { type: String, required: true },
  title: { type: String, required: true },
  poster: { type: String, default: '' },
  type: { type: String, default: 'movie' },
  seasonNumber: { type: Number, default: 1 },
  episodeNumber: { type: Number, default: 1 },
  progressSeconds: { type: Number, default: 0 },
  durationSeconds: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true },
  picture: { type: String, default: '' },
  appVersion: { type: String, default: '3.1.1' },
  watchlist: [WatchlistItemSchema],
  history: [WatchHistoryItemSchema],
  bookings: [{
    mediaId: { type: String, required: true },
    title: { type: String, default: '' },
    bookedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

const FeedbackSchema = new mongoose.Schema({
  googleId: { type: String, default: 'guest' },
  name: { type: String, default: 'Anonymous' },
  email: { type: String, default: '' },
  type: { type: String, default: 'general' }, // 'feedback' | 'bug' | 'request'
  message: { type: String, required: true },
  rating: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now }
});

const BookingSchema = new mongoose.Schema({
  mediaId: { type: String, required: true, index: true },
  title: { type: String, default: '' },
  userId: { type: String, default: 'anonymous' },
  name: { type: String, default: 'Viewer' },
  createdAt: { type: Date, default: Date.now }
});

const CommentSchema = new mongoose.Schema({
  mediaId: { type: String, required: true, index: true },
  userId: { type: String, default: 'anonymous' },
  userName: { type: String, default: 'Viewer' },
  userAvatar: { type: String, default: '' },
  text: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  likes: { type: Number, default: 0 },
  replies: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

let User = null;
let Feedback = null;
let Booking = null;
let Comment = null;
const memoryFeedback = [];

async function initMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000
    });
    isMongoConnected = true;
    User = mongoose.model('User', UserSchema);
    Feedback = mongoose.model('Feedback', FeedbackSchema);
    Booking = mongoose.model('Booking', BookingSchema);
    Comment = mongoose.model('Comment', CommentSchema);
    Report = mongoose.model('Report', ReportSchema);
    console.log('🍃 MongoDB connected successfully: fobstv database online');
  } catch (err) {
    console.warn(`⚠️ MongoDB connection warning (${err.message}). Using resilient fallback.`);
    isMongoConnected = false;
  }
}

// ----------------------------------------------------
// 2. REDIS CONNECTION & REAL-TIME VIEW ENGINE
// ----------------------------------------------------
let redis = null;

function initRedis() {
  try {
    redis = new Redis(REDIS_URI, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('⚠️ Redis unreachable, running resilient in-memory real-time viewer tracking.');
          return null; // Stop retrying, use in-memory
        }
        return Math.min(times * 1000, 3000);
      },
      connectTimeout: 4000
    });

    redis.on('connect', () => {
      isRedisConnected = true;
      console.log('⚡ Redis connected successfully: Real-time viewer counter active');
    });

    redis.on('error', (err) => {
      isRedisConnected = false;
    });
  } catch (err) {
    isRedisConnected = false;
  }
}

// Heartbeat interval threshold: viewer considered active if pinged in last 60 seconds
const ACTIVE_THRESHOLD_MS = 60 * 1000;

/**
 * Record a heartbeat from a viewer watching mediaId
 */
async function recordViewerHeartbeat(mediaId, viewerId) {
  if (!mediaId || !viewerId) return { activeViewers: 1, totalViews: 1 };
  const now = Date.now();

  // 1. Redis Real-Time Tracker
  if (isRedisConnected && redis) {
    try {
      const activeKey = `active_viewers:${mediaId}`;
      const totalViewsKey = `media_total_views`;

      const pipeline = redis.pipeline();
      // Add current viewer with current timestamp as score
      pipeline.zadd(activeKey, now, viewerId);
      // Remove stale viewers inactive for > 60 seconds
      pipeline.zremrangebyscore(activeKey, 0, now - ACTIVE_THRESHOLD_MS);
      // Count current active viewers
      pipeline.zcard(activeKey);
      // Set key TTL to 2 hours so inactive keys auto-expire
      pipeline.expire(activeKey, 7200);
      // Increment total lifetime views for this media
      pipeline.hincrby(totalViewsKey, mediaId, 1);
      // Get current total views
      pipeline.hget(totalViewsKey, mediaId);

      const results = await pipeline.exec();
      const activeViewers = (results && results[2] && results[2][1]) || 1;
      const totalViews = parseInt((results && results[5] && results[5][1]) || '1', 10);

      return {
        activeViewers: Math.max(1, activeViewers),
        totalViews: Math.max(activeViewers, totalViews)
      };
    } catch (err) {
      // Fallback below
    }
  }

  // 2. In-Memory Resilient Fallback
  if (!memoryActiveViewers.has(mediaId)) {
    memoryActiveViewers.set(mediaId, new Map());
  }
  const viewersMap = memoryActiveViewers.get(mediaId);
  viewersMap.set(viewerId, now);

  // Clean stale viewers
  for (const [vId, pingTime] of viewersMap.entries()) {
    if (now - pingTime > ACTIVE_THRESHOLD_MS) {
      viewersMap.delete(vId);
    }
  }

  const activeCount = Math.max(1, viewersMap.size);
  const currentTotal = (memoryTotalViews.get(mediaId) || 0) + 1;
  memoryTotalViews.set(mediaId, currentTotal);

  return {
    activeViewers: activeCount,
    totalViews: Math.max(activeCount, currentTotal)
  };
}

/**
 * Get active viewers and total views for a specific media
 */
async function getMediaViews(mediaId) {
  if (!mediaId) return { activeViewers: 0, totalViews: 0 };
  const now = Date.now();

  if (isRedisConnected && redis) {
    try {
      const activeKey = `active_viewers:${mediaId}`;
      const totalViewsKey = `media_total_views`;

      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(activeKey, 0, now - ACTIVE_THRESHOLD_MS);
      pipeline.zcard(activeKey);
      pipeline.hget(totalViewsKey, mediaId);

      const results = await pipeline.exec();
      const activeViewers = (results && results[1] && results[1][1]) || 0;
      const totalViews = parseInt((results && results[2] && results[2][1]) || '0', 10);

      return {
        activeViewers,
        totalViews: Math.max(activeViewers, totalViews)
      };
    } catch (e) {}
  }

  const viewersMap = memoryActiveViewers.get(mediaId);
  let active = 0;
  if (viewersMap) {
    for (const [vId, pingTime] of viewersMap.entries()) {
      if (now - pingTime <= ACTIVE_THRESHOLD_MS) active++;
    }
  }
  const total = memoryTotalViews.get(mediaId) || active;
  return { activeViewers: active, totalViews: total };
}

// ----------------------------------------------------
// 3. USER MANAGEMENT (PERSISTENCE)
// ----------------------------------------------------

async function findOrCreateUser({ googleId, email, name, picture, appVersion = '3.1.8' }) {
  const now = new Date();
  const cleanEmail = (email || '').toLowerCase().trim();

  if (isMongoConnected && User) {
    try {
      let user = await User.findOne({ googleId });
      if (!user) {
        user = new User({
          googleId,
          email: cleanEmail,
          name: name || (cleanEmail && cleanEmail.includes('@') ? cleanEmail.split('@')[0] : 'User'),
          picture: picture || '',
          appVersion: appVersion || '3.1.8',
          watchlist: [],
          history: [],
          createdAt: now,
          lastLogin: now
        });
        await user.save();
      } else {
        if (cleanEmail && cleanEmail.includes('@')) {
          user.email = cleanEmail;
        }
        user.name = name || user.name;
        user.picture = picture || user.picture;
        user.appVersion = appVersion || user.appVersion || '3.1.8';
        user.lastLogin = now;
        await user.save();
      }
      return user.toObject();
    } catch (err) {
      console.warn('⚠️ MongoDB User error (' + err.message + '). Falling back to resilient disk storage.');
      isMongoConnected = false;
    }
  }

  // Resilient JSON Disk & In-Memory Storage
  const usersMap = getLocalUsersMap();
  let user = usersMap[googleId] || memoryUsers.get(googleId);
  if (!user) {
    user = {
      _id: 'usr_' + (googleId || Date.now()),
      googleId,
      email: cleanEmail,
      name: name || (cleanEmail && cleanEmail.includes('@') ? cleanEmail.split('@')[0] : 'User'),
      picture: picture || '',
      appVersion: appVersion || '3.1.8',
      watchlist: [],
      history: [],
      createdAt: now,
      lastLogin: now
    };
  } else {
    user.lastLogin = now;
    if (cleanEmail && cleanEmail.includes('@')) user.email = cleanEmail;
    if (name) user.name = name;
    if (picture) user.picture = picture;
    user.appVersion = appVersion || user.appVersion || '3.1.8';
  }
  memoryUsers.set(googleId, user);
  usersMap[googleId] = user;
  saveLocalUsersMap(usersMap);
  return user;
}

async function syncUserEmail({ userId, email, name, appVersion }) {
  if (!userId || !email || !email.includes('@')) return false;
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = (name && name.trim()) ? name.trim() : cleanEmail.split('@')[0];

  const usersMap = getLocalUsersMap();
  const altKey1 = userId;
  const altKey2 = userId.startsWith('usr_') ? userId.replace(/^usr_/, '') : ('usr_' + userId);
  const altKey3 = userId.startsWith('usr_usr_') ? userId.replace(/^usr_usr_/, 'usr_') : ('usr_' + userId);

  let targetKey = usersMap[altKey1] ? altKey1 : (usersMap[altKey2] ? altKey2 : (usersMap[altKey3] ? altKey3 : altKey1));
  let user = usersMap[targetKey];

  if (user) {
    user.email = cleanEmail;
    if (cleanName && (!user.name || user.name === 'User' || user.name === 'Registered Member')) user.name = cleanName;
    if (appVersion) user.appVersion = appVersion;
    user.lastLogin = new Date().toISOString();
    usersMap[targetKey] = user;
    saveLocalUsersMap(usersMap);
  } else {
    usersMap[targetKey] = {
      _id: targetKey.startsWith('usr_') ? targetKey : ('usr_' + targetKey),
      googleId: targetKey,
      email: cleanEmail,
      name: cleanName,
      appVersion: appVersion || '3.1.8',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      watchlist: [],
      history: []
    };
    saveLocalUsersMap(usersMap);
  }

  if (isMongoConnected && User) {
    try {
      await User.updateOne(
        { $or: [{ googleId: altKey1 }, { googleId: altKey2 }, { googleId: altKey3 }, { _id: targetKey }] },
        { 
          $set: { 
            email: cleanEmail, 
            name: cleanName,
            appVersion: appVersion || '3.1.8',
            lastLogin: new Date()
          } 
        }
      );
    } catch(e) {}
  }
  return true;
}

async function getUserById(googleId) {
  if (isMongoConnected && User) {
    try {
      const user = await User.findOne({ googleId });
      if (user) return user.toObject();
    } catch (err) {
      console.warn('⚠️ MongoDB getUserById error:', err.message);
      isMongoConnected = false;
    }
  }
  const usersMap = getLocalUsersMap();
  return usersMap[googleId] || memoryUsers.get(googleId) || null;
}

async function toggleWatchlist(googleId, mediaItem) {
  if (isMongoConnected && User) {
    try {
      const user = await User.findOne({ googleId });
      if (user) {
        const index = user.watchlist.findIndex(w => w.mediaId === mediaItem.mediaId);
        let added = false;
        if (index > -1) {
          user.watchlist.splice(index, 1); // remove
        } else {
          user.watchlist.unshift({
            mediaId: mediaItem.mediaId,
            title: mediaItem.title || 'Untitled',
            poster: mediaItem.poster || '',
            type: mediaItem.type || 'movie',
            rating: mediaItem.rating || '',
            year: mediaItem.year || '',
            addedAt: new Date()
          });
          added = true;
        }
        await user.save();
        return { added, watchlist: user.watchlist };
      }
    } catch (err) {
      console.warn('⚠️ MongoDB toggleWatchlist error:', err.message);
      isMongoConnected = false;
    }
  }

  const usersMap = getLocalUsersMap();
  let user = usersMap[googleId] || memoryUsers.get(googleId);
  if (!user) {
    user = {
      googleId,
      email: '',
      name: 'User',
      watchlist: [],
      history: []
    };
  }
  if (!Array.isArray(user.watchlist)) user.watchlist = [];

  const index = user.watchlist.findIndex(w => w.mediaId === mediaItem.mediaId);
  let added = false;
  if (index > -1) {
    user.watchlist.splice(index, 1);
  } else {
    user.watchlist.unshift({ ...mediaItem, addedAt: new Date() });
    added = true;
  }
  memoryUsers.set(googleId, user);
  usersMap[googleId] = user;
  saveLocalUsersMap(usersMap);
  return { added, watchlist: user.watchlist };
}

async function updateWatchHistory(googleId, historyItem) {
  const updateData = {
    mediaId: historyItem.mediaId,
    title: historyItem.title || 'Untitled',
    poster: historyItem.poster || '',
    type: historyItem.type || 'movie',
    seasonNumber: parseInt(historyItem.seasonNumber || 1, 10),
    episodeNumber: parseInt(historyItem.episodeNumber || 1, 10),
    progressSeconds: Math.round(historyItem.progressSeconds || 0),
    durationSeconds: Math.round(historyItem.durationSeconds || 0),
    completed: Boolean(historyItem.progressSeconds && historyItem.durationSeconds && (historyItem.progressSeconds / historyItem.durationSeconds > 0.9)),
    updatedAt: new Date()
  };

  if (isMongoConnected && User) {
    try {
      const user = await User.findOne({ googleId });
      if (user) {
        const index = user.history.findIndex(h => h.mediaId === updateData.mediaId);
        if (index > -1) {
          user.history.splice(index, 1);
        }
        user.history.unshift(updateData);
        if (user.history.length > 50) user.history.pop(); // Keep top 50
        await user.save();
        return user.history;
      }
    } catch (err) {
      console.warn('⚠️ MongoDB updateWatchHistory error:', err.message);
      isMongoConnected = false;
    }
  }

  const usersMap = getLocalUsersMap();
  let user = usersMap[googleId] || memoryUsers.get(googleId);
  if (!user) {
    user = {
      googleId,
      email: '',
      name: 'User',
      watchlist: [],
      history: []
    };
  }
  if (!Array.isArray(user.history)) user.history = [];

  const index = user.history.findIndex(h => h.mediaId === updateData.mediaId);
  if (index > -1) user.history.splice(index, 1);
  user.history.unshift(updateData);
  if (user.history.length > 50) user.history.pop();
  memoryUsers.set(googleId, user);
  usersMap[googleId] = user;
  saveLocalUsersMap(usersMap);
  return user.history;
}

// ----------------------------------------------------
// 4. REAL-TIME FEEDBACK & NOTIFICATIONS (PERSISTENCE)
// ----------------------------------------------------

async function saveFeedback({ googleId = 'guest', name = 'User', email = '', type = 'feedback', message = '', rating = 5 }) {
  const doc = {
    googleId,
    name,
    email,
    type,
    message,
    rating: parseInt(rating || 5, 10),
    createdAt: new Date()
  };

  if (isMongoConnected && Feedback) {
    const feedbackDoc = new Feedback(doc);
    await feedbackDoc.save();
    return feedbackDoc.toObject();
  }

  memoryFeedback.unshift(doc);
  if (memoryFeedback.length > 100) memoryFeedback.pop();
  return doc;
}

const REQUESTS_FILE = path.join(__dirname, '..', 'data', 'requests.json');

function readRequestsFile() {
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}
  return [];
}

function writeRequestsFile(list) {
  try {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing requests.json in dbService:', e);
  }
}

async function saveMediaRequest(data) {
  const doc = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    googleId: data.googleId || 'guest',
    userName: data.userName || data.userEmail || 'FOBS TV App User',
    title: data.title,
    type: data.type || 'Movie',
    year: data.year || '',
    language: data.language || 'Hindi Dubbed',
    notes: data.notes || '',
    status: 'Pending',
    createdAt: new Date().toISOString()
  };

  const list = readRequestsFile();
  list.unshift(doc);
  if (list.length > 500) list.pop();
  writeRequestsFile(list);

  return doc;
}

function getMediaRequests(googleId = null) {
  const list = readRequestsFile();
  if (googleId && googleId !== 'guest') {
    return list.filter(r => r.googleId === googleId);
  }
  return list;
}

function getSystemNotifications() {
  try {
    const notifPath = path.join(__dirname, '..', 'data', 'notifications.json');
    if (fs.existsSync(notifPath)) {
      const saved = JSON.parse(fs.readFileSync(notifPath, 'utf8'));
      if (Array.isArray(saved) && saved.length > 0) {
        return saved;
      }
    }
  } catch (e) {}

  return [
    {
      id: 'notif_1',
      title: 'Welcome to FOBS TV v2.8.5! 🚀',
      message: 'Experience ultra-fast buffering, Hindi Dubbed Movies, Turkish Series and Live Cricket streams.',
      time: 'Just now',
      unread: true,
      tag: 'System'
    },
    {
      id: 'notif_2',
      title: 'Cloud Sync & Watch History Active 🍃',
      message: 'Sign in with your Google Account to automatically sync Watchlist and Watch History across all your phones and TV devices.',
      time: '2 hours ago',
      unread: true,
      tag: 'Update'
    },
    {
      id: 'notif_3',
      title: 'New Content Added 🎬',
      message: 'Love Next Door, Vincenzo, Hope, and A Shop for Killers Hindi dub now available in Full HD 1080p.',
      time: 'Yesterday',
      unread: false,
      tag: 'New'
    }
  ];
}

// ----------------------------------------------------
// 7. REAL-TIME BOOKINGS ENGINE (MONGODB + PERSISTENT FALLBACK)
// ----------------------------------------------------

function getLocalBookingsMap() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading bookings file:', e.message);
  }
  return {};
}

function saveLocalBookingsMap(map) {
  try {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving bookings file:', e.message);
  }
}

async function getAllBookings() {
  const localMap = getLocalBookingsMap();
  const resultMap = { ...localMap };

  if (isMongoConnected && Booking) {
    try {
      const counts = await Booking.aggregate([
        { $group: { _id: "$mediaId", count: { $sum: 1 } } }
      ]);
      counts.forEach(c => {
        if (c._id) {
          resultMap[c._id] = Math.max(resultMap[c._id] || 0, c.count);
        }
      });
    } catch (err) {
      console.warn('MongoDB aggregate bookings error:', err.message);
    }
  }
  return resultMap;
}

async function getMediaBookings(mediaId) {
  if (!mediaId) return 0;
  const localMap = getLocalBookingsMap();
  let count = localMap[mediaId] || 0;

  if (isMongoConnected && Booking) {
    try {
      const mongoCount = await Booking.countDocuments({ mediaId: String(mediaId) });
      count = Math.max(count, mongoCount);
    } catch (err) {
      console.warn('MongoDB count bookings error:', err.message);
    }
  }
  return count;
}

async function recordMediaBooking(mediaId, { userId = 'anonymous', name = 'Viewer', title = '' } = {}) {
  if (!mediaId) return 0;
  const cleanId = String(mediaId).trim();

  // 1. Update local persistent storage
  const localMap = getLocalBookingsMap();
  const nextCount = (localMap[cleanId] || 0) + 1;
  localMap[cleanId] = nextCount;
  saveLocalBookingsMap(localMap);

  // 2. Save to MongoDB
  if (isMongoConnected && Booking) {
    try {
      const doc = new Booking({
        mediaId: cleanId,
        title: title || cleanId,
        userId: userId || 'anonymous',
        name: name || 'Viewer',
        createdAt: new Date()
      });
      await doc.save();

      // If user is authenticated, attach to user document bookings array
      if (userId && userId !== 'anonymous' && User) {
        await User.findOneAndUpdate(
          { googleId: userId },
          { $push: { bookings: { mediaId: cleanId, title: title || cleanId, bookedAt: new Date() } } }
        ).catch(() => {});
      }

      const totalMongo = await Booking.countDocuments({ mediaId: cleanId });
      return Math.max(nextCount, totalMongo);
    } catch (err) {
      console.warn('MongoDB record booking error:', err.message);
    }
  }

  return nextCount;
}

// ----------------------------------------------------
// 8. REAL-TIME COMMENTS & REVIEWS ENGINE (MONGODB + PERSISTENT JSON)
// ----------------------------------------------------

function getLocalCommentsMap() {
  try {
    if (fs.existsSync(COMMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading comments file:', e.message);
  }
  return {};
}

function saveLocalCommentsMap(map) {
  try {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving comments file:', e.message);
  }
}

async function getMediaComments(mediaId) {
  if (!mediaId) return [];
  const cleanId = String(mediaId).trim();

  if (isMongoConnected && Comment) {
    try {
      const mongoDocs = await Comment.find({ mediaId: cleanId }).sort({ createdAt: -1 }).limit(100).lean();
      if (mongoDocs && mongoDocs.length > 0) {
        return mongoDocs.map(d => ({
          id: d._id ? d._id.toString() : d.id,
          mediaId: d.mediaId,
          userId: d.userId,
          userName: d.userName,
          userAvatar: d.userAvatar,
          text: d.text,
          imageUrl: d.imageUrl || '',
          likes: d.likes || 0,
          replies: d.replies || [],
          createdAt: d.createdAt
        }));
      }
    } catch (err) {
      console.warn('MongoDB get comments error:', err.message);
    }
  }

  // Fallback to local comments map
  const localMap = getLocalCommentsMap();
  const list = localMap[cleanId] || [];
  return list;
}

async function addMediaComment(mediaId, { userId = 'anonymous', userName = 'Viewer', userAvatar = '', text = '', imageUrl = '' } = {}) {
  if (!mediaId || !text) return null;
  const cleanId = String(mediaId).trim();
  const commentObj = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    mediaId: cleanId,
    userId: userId || 'anonymous',
    userName: userName || 'Viewer',
    userAvatar: userAvatar || '',
    text: text.trim(),
    imageUrl: imageUrl || '',
    likes: 0,
    createdAt: new Date().toISOString()
  };

  // 1. Save to local fallback file
  const localMap = getLocalCommentsMap();
  if (!localMap[cleanId]) localMap[cleanId] = [];
  localMap[cleanId].unshift(commentObj);
  saveLocalCommentsMap(localMap);

  // 2. Save to MongoDB
  if (isMongoConnected && Comment) {
    try {
      const doc = new Comment({
        mediaId: cleanId,
        userId: commentObj.userId,
        userName: commentObj.userName,
        userAvatar: commentObj.userAvatar,
        text: commentObj.text,
        imageUrl: commentObj.imageUrl,
        likes: 0,
        createdAt: new Date()
      });
      const saved = await doc.save();
      commentObj.id = saved._id.toString();
    } catch (err) {
      console.warn('MongoDB save comment error:', err.message);
    }
  }

  return commentObj;
}

async function likeComment(mediaId, commentId) {
  if (!mediaId || !commentId) return { success: false };
  const cleanId = String(mediaId).trim();
  let updatedLikes = 1;

  // Local map update
  const localMap = getLocalCommentsMap();
  const list = localMap[cleanId] || [];
  const found = list.find(c => String(c.id) === String(commentId));
  if (found) {
    found.likes = (found.likes || 0) + 1;
    updatedLikes = found.likes;
    saveLocalCommentsMap(localMap);
  }

  // MongoDB update
  if (isMongoConnected && Comment) {
    try {
      if (mongoose.Types.ObjectId.isValid(commentId)) {
        const doc = await Comment.findByIdAndUpdate(commentId, { $inc: { likes: 1 } }, { new: true });
        if (doc) updatedLikes = doc.likes;
      }
    } catch (e) {}
  }

  return { success: true, likes: updatedLikes };
}

async function getAllMediaComments(limit = 150) {
  let allComments = [];

  if (isMongoConnected && Comment) {
    try {
      const mongoDocs = await Comment.find().sort({ createdAt: -1 }).limit(limit).lean();
      if (mongoDocs && mongoDocs.length > 0) {
        allComments = mongoDocs.map(c => ({
          id: c._id.toString(),
          mediaId: c.mediaId,
          userId: c.userId,
          userName: c.userName,
          userAvatar: c.userAvatar,
          text: c.text,
          imageUrl: c.imageUrl,
          likes: c.likes || 0,
          replies: c.replies || [],
          createdAt: c.createdAt
        }));
      }
    } catch (e) {
      console.warn('MongoDB get all comments error:', e.message);
    }
  }

  // Also include local map comments
  const localMap = getLocalCommentsMap();
  for (const [mediaId, comments] of Object.entries(localMap)) {
    if (Array.isArray(comments)) {
      for (const c of comments) {
        if (!allComments.some(x => String(x.id) === String(c.id))) {
          allComments.push({
            ...c,
            mediaId
          });
        }
      }
    }
  }

  allComments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return allComments.slice(0, limit);
}

async function deleteMediaComment(mediaId, commentId) {
  if (!commentId) return { success: false, error: 'commentId required' };

  if (isMongoConnected && Comment) {
    try {
      if (mongoose.Types.ObjectId.isValid(commentId)) {
        await Comment.findByIdAndDelete(commentId);
      }
    } catch (e) {}
  }

  const localMap = getLocalCommentsMap();
  let found = false;

  if (mediaId && localMap[mediaId]) {
    localMap[mediaId] = localMap[mediaId].filter(c => String(c.id) !== String(commentId));
    found = true;
  } else {
    for (const mId of Object.keys(localMap)) {
      if (Array.isArray(localMap[mId])) {
        const origLen = localMap[mId].length;
        localMap[mId] = localMap[mId].filter(c => String(c.id) !== String(commentId));
        if (localMap[mId].length !== origLen) found = true;
      }
    }
  }

  saveLocalCommentsMap(localMap);
  return { success: true };
}

async function addMediaCommentReply(mediaId, commentId, replyText, author = 'FOBS TV Admin') {
  if (!commentId || !replyText) return { success: false, error: 'commentId and replyText required' };
  const replyObj = {
    id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    author: author || 'FOBS TV Admin',
    role: 'admin',
    text: String(replyText).trim(),
    createdAt: new Date().toISOString()
  };

  // 1. Update in MongoDB
  if (isMongoConnected && Comment) {
    try {
      if (mongoose.Types.ObjectId.isValid(commentId)) {
        await Comment.findByIdAndUpdate(commentId, {
          $push: { replies: replyObj }
        });
      }
    } catch (e) {
      console.warn('MongoDB reply error:', e.message);
    }
  }

  // 2. Update in local comments map
  const localMap = getLocalCommentsMap();
  let found = false;
  if (mediaId && localMap[mediaId]) {
    const c = localMap[mediaId].find(x => String(x.id) === String(commentId));
    if (c) {
      if (!Array.isArray(c.replies)) c.replies = [];
      c.replies.push(replyObj);
      found = true;
    }
  }
  if (!found) {
    for (const mId of Object.keys(localMap)) {
      if (Array.isArray(localMap[mId])) {
        const c = localMap[mId].find(x => String(x.id) === String(commentId));
        if (c) {
          if (!Array.isArray(c.replies)) c.replies = [];
          c.replies.push(replyObj);
          found = true;
          break;
        }
      }
    }
  }

  saveLocalCommentsMap(localMap);
  return { success: true, reply: replyObj };
}


// ----------------------------------------------------
// VIDEO ISSUE REPORTS (MongoDB + Local Disk JSON)
// ----------------------------------------------------
const ReportSchema = new mongoose.Schema({
  mediaId: { type: String, required: true, index: true },
  mediaTitle: { type: String, default: '' },
  reason: { type: String, required: true },
  details: { type: String, default: '' },
  season: { type: Number, default: 0 },
  episode: { type: Number, default: 0 },
  audioTrack: { type: String, default: '' },
  streamUrl: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  userName: { type: String, default: 'Guest' },
  ip: { type: String, default: '' },
  status: { type: String, default: 'pending', index: true }, // 'pending' | 'resolved'
  createdAt: { type: Date, default: Date.now }
});

let Report = null;

function getLocalReports() {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')) || [];
    }
  } catch (e) {}
  return [];
}

function saveLocalReports(reports) {
  try {
    const dir = path.dirname(REPORTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving reports file:', e.message);
  }
}

async function saveReport(data) {
  const reportObj = {
    id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    mediaId: data.mediaId || 'unknown',
    mediaTitle: data.mediaTitle || 'Untitled',
    reason: data.reason || 'Playback Issue',
    details: data.details || '',
    season: parseInt(data.season || 0, 10),
    episode: parseInt(data.episode || 0, 10),
    audioTrack: data.audioTrack || '',
    streamUrl: data.streamUrl || '',
    userEmail: data.userEmail || '',
    userName: data.userName || 'Guest User',
    ip: data.ip || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  // 1. Save locally
  const reports = getLocalReports();
  reports.unshift(reportObj);
  saveLocalReports(reports);

  // 2. Save in MongoDB if online
  if (isMongoConnected && Report) {
    try {
      const doc = new Report(reportObj);
      await doc.save();
    } catch (e) {
      console.warn('MongoDB report save warning:', e.message);
    }
  }

  return reportObj;
}

async function getAllReports() {
  if (isMongoConnected && Report) {
    try {
      const docs = await Report.find().sort({ createdAt: -1 }).lean();
      if (docs && docs.length > 0) return docs;
    } catch (e) {}
  }
  return getLocalReports();
}

async function resolveReport(reportId) {
  const reports = getLocalReports();
  const target = reports.find(r => r.id === reportId || r._id === reportId);
  if (target) {
    target.status = 'resolved';
    target.resolvedAt = new Date().toISOString();
    saveLocalReports(reports);
  }

  if (isMongoConnected && Report) {
    try {
      await Report.updateOne(
        { $or: [{ id: reportId }, { _id: mongoose.Types.ObjectId.isValid(reportId) ? reportId : null }] },
        { status: 'resolved', resolvedAt: new Date() }
      );
    } catch (e) {}
  }

  return { success: true };
}

async function deleteReport(reportId) {
  let reports = getLocalReports();
  reports = reports.filter(r => r.id !== reportId && r._id !== reportId);
  saveLocalReports(reports);

  if (isMongoConnected && Report) {
    try {
      await Report.deleteOne({ $or: [{ id: reportId }, { _id: mongoose.Types.ObjectId.isValid(reportId) ? reportId : null }] });
    } catch (e) {}
  }

  return { success: true };
}

/**
 * Purge all users and devices from older app versions, keeping ONLY v3.1.8 users
 */
async function purgeOldVersionUsers(targetVersion = '3.1.8') {
  // v3.1.8 was released today, Nov 10, 2026 at 3:15 PM (+06:00) / 09:15:00 UTC
  const v318Threshold = new Date('2026-11-10T09:15:00.000Z').getTime();

  let mongoDeleted = 0;
  if (isMongoConnected && User) {
    try {
      const deleteResult = await User.deleteMany({
        $and: [
          { email: { $ne: 'tanvir210111@gmail.com' } },
          {
            $or: [
              { appVersion: { $ne: targetVersion } },
              { lastLogin: { $lt: new Date(v318Threshold) } },
              { createdAt: { $lt: new Date(v318Threshold) } }
            ]
          }
        ]
      });
      mongoDeleted = deleteResult.deletedCount || 0;
    } catch (e) {
      console.warn('Error purging MongoDB users:', e.message);
    }
  }

  // Purge local users
  const usersMap = getLocalUsersMap();
  const keptUsers = {};
  let deletedUsers = 0;

  for (const [key, u] of Object.entries(usersMap)) {
    const isAdmin = (u.email === 'tanvir210111@gmail.com');
    const isV318Time = new Date(u.lastLogin || u.createdAt || 0).getTime() >= v318Threshold;
    const isV318Ver = (u.appVersion === targetVersion);

    if (isAdmin || (isV318Time && isV318Ver)) {
      keptUsers[key] = u;
    } else {
      deletedUsers++;
    }
  }

  memoryUsers.clear();
  for (const [k, v] of Object.entries(keptUsers)) {
    memoryUsers.set(k, v);
  }
  saveLocalUsersMap(keptUsers);

  // Purge old devices
  const devicesMap = getDevicesMap();
  const keptDevices = {};
  let deletedDevices = 0;

  for (const [id, d] of Object.entries(devicesMap)) {
    const isV318Time = new Date(d.lastActive || d.firstSeen || 0).getTime() >= v318Threshold;
    const isV318Ver = (d.appVersion === targetVersion);

    if (isV318Time && isV318Ver) {
      keptDevices[id] = d;
    } else {
      deletedDevices++;
    }
  }

  try {
    fs.writeFileSync(DEVICES_LOCAL_FILE, JSON.stringify(keptDevices, null, 2), 'utf8');
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(keptDevices, null, 2), 'utf8');
  } catch (e) {}

  return {
    success: true,
    targetVersion,
    deletedUsers: deletedUsers + mongoDeleted,
    keptUsers: Object.keys(keptUsers).length,
    deletedDevices,
    keptDevices: Object.keys(keptDevices).length
  };
}

// Initialize connections
initMongoDB();
initRedis();

module.exports = {
  recordDevice,
  getUserStats,
  findOrCreateUser,
  syncUserEmail,
  purgeOldVersionUsers,
  getUserById,
  toggleWatchlist,
  updateWatchHistory,
  saveFeedback,
  saveMediaRequest,
  getMediaRequests,
  getSystemNotifications,
  recordViewerHeartbeat,
  getMediaViews,
  getAllBookings,
  getMediaBookings,
  recordMediaBooking,
  getMediaComments,
  getAllMediaComments,
  deleteMediaComment,
  addMediaCommentReply,
  addMediaComment,
  likeComment,
  saveReport,
  getAllReports,
  resolveReport,
  deleteReport,
  isMongoConnected: () => isMongoConnected,
  isRedisConnected: () => isRedisConnected
};


