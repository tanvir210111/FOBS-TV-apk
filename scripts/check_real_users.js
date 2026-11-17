const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://fobsApp:Khan%407719@127.0.0.1:27017/fobstv?authSource=fobstv';

async function run() {
  await mongoose.connect(MONGO_URI);
  const users = await mongoose.connection.collection('users').find({}).toArray();
  console.log('Total in DB:', users.length);
  const withEmail = users.filter(u => u.email && !u.email.includes('placeholder.fobstv'));
  console.log('Users with genuine email:', withEmail.length);
  withEmail.forEach(u => {
    console.log(`[REAL] ID: ${u.googleId} | Name: ${u.name} | Email: ${u.email}`);
  });
  const withoutEmail = users.filter(u => !u.email || u.email.includes('placeholder.fobstv'));
  console.log('Users without genuine email (placeholders/guests):', withoutEmail.length);
  withoutEmail.slice(0, 5).forEach(u => {
    console.log(`[PLACEHOLDER] ID: ${u.googleId} | Name: ${u.name} | Email: ${u.email}`);
  });
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
