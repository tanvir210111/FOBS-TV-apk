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
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function getLocalUsersMap() {
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
    fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving users file:', e.message);
  }
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

async function findOrCreateUser({ googleId, email, name, picture }) {
  const now = new Date();

  if (isMongoConnected && User) {
    try {
      let user = await User.findOne({ googleId });
      if (!user) {
        user = new User({
          googleId,
          email,
          name,
          picture,
          watchlist: [],
          history: [],
          createdAt: now,
          lastLogin: now
        });
        await user.save();
      } else {
        user.name = name || user.name;
        user.picture = picture || user.picture;
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
      email: (email || '').toLowerCase().trim(),
      name: name || 'User',
      picture: picture || '',
      watchlist: [],
      history: [],
      createdAt: now,
      lastLogin: now
    };
  } else {
    user.lastLogin = now;
    if (name) user.name = name;
    if (picture) user.picture = picture;
  }
  memoryUsers.set(googleId, user);
  usersMap[googleId] = user;
  saveLocalUsersMap(usersMap);
  return user;
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

// Initialize connections
initMongoDB();
initRedis();

module.exports = {
  findOrCreateUser,
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
  addMediaComment,
  likeComment,
  isMongoConnected: () => isMongoConnected,
  isRedisConnected: () => isRedisConnected
};


