const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fobs_tv_admin_secret_key_2026';

async function run() {
  const token = jwt.sign({ role: 'admin', loggedInAt: Date.now() }, JWT_SECRET, { expiresIn: '7d' });
  const res = await fetch('http://127.0.0.1:7000/api/admin/moviebox/search?q=goblin', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Success:', data.success, 'Items count:', (data.items || []).length);
  if (data.items && data.items.length > 0) {
    console.log('Sample item:', data.items[0].title);
  } else {
    console.log('Full response:', data);
  }
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
