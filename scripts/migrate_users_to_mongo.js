const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://fobsApp:Khan%407719@127.0.0.1:27017/fobstv?authSource=fobstv';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB fobstv successfully!');

  const usersColl = mongoose.connection.collection('users');

  let u1 = {}, u2 = {};
  const f1 = path.join(__dirname, '..', 'data', 'users.json');
  const f2 = path.join(__dirname, '..', 'data', 'users.local.json');

  try { u1 = JSON.parse(fs.readFileSync(f1, 'utf8')); } catch(e){}
  try { u2 = JSON.parse(fs.readFileSync(f2, 'utf8')); } catch(e){}

  const merged = { ...u1, ...u2 };
  console.log('Total unique JSON users to migrate:', Object.keys(merged).length);

  let inserted = 0, updated = 0;
  for (const [key, u] of Object.entries(merged)) {
    if (!u) continue;
    const googleId = u.googleId || key;
    const email = (u.email || '').toLowerCase().trim();
    const name = u.name || (email && email.includes('@') ? email.split('@')[0] : 'User');

    const doc = {
      googleId: String(googleId),
      email: email || `${googleId}@placeholder.fobstv`,
      name: name,
      picture: u.picture || '',
      appVersion: u.appVersion || '3.2.0',
      watchlist: Array.isArray(u.watchlist) ? u.watchlist : [],
      history: Array.isArray(u.history) ? u.history : [],
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      lastLogin: u.lastLogin ? new Date(u.lastLogin) : new Date()
    };

    const res = await usersColl.updateOne(
      { googleId: doc.googleId },
      { $set: doc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) inserted++;
    else updated++;
  }

  const finalCount = await usersColl.countDocuments();
  console.log(`Migration complete! Inserted: ${inserted}, Updated: ${updated}, Total in MongoDB: ${finalCount}`);
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration error:', e.message);
  process.exit(1);
});
