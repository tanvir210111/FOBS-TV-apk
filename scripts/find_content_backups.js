const fs = require('fs');
const cp = require('child_process');
const path = require('path');

console.log('=== 1. CHECKING FILES IN DATA DIRECTORY ===');
const dataDir = path.join(__dirname, '..', 'data');
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  files.forEach(f => {
    const full = path.join(dataDir, f);
    try {
      const stat = fs.statSync(full);
      if (f.endsWith('.json') || f.includes('bak')) {
        try {
          const d = JSON.parse(fs.readFileSync(full, 'utf8'));
          console.log(f, '(' + (stat.size / 1024 / 1024).toFixed(2) + ' MB) => Movies:', d.movies ? d.movies.length : 'none', 'Series:', d.series ? d.series.length : 'none');
        } catch (e) {
          console.log(f, '(' + (stat.size / 1024 / 1024).toFixed(2) + ' MB) => Not valid JSON (' + e.message + ')');
        }
      }
    } catch(e){}
  });
}

console.log('\n=== 2. SEARCHING FOR ALL CONTENT FILES IN PROJECT ===');
try {
  const out = cp.execSync('find /home/FOBS-TV-apk -name "*content*" -o -name "*.bak*" 2>/dev/null').toString().trim();
  const list = out.split('\n');
  list.forEach(p => {
    if (!p || p.includes('/node_modules/') || p.includes('/.git/')) return;
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) {
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (d.movies || d.series) {
            console.log(p, '=> Movies:', d.movies ? d.movies.length : 0, 'Series:', d.series ? d.series.length : 0);
          }
        } catch(e) {
          console.log(p, '=> Parse error:', e.message.substring(0, 50));
        }
      }
    } catch(e){}
  });
} catch(e) {
  console.log('Find error:', e.message);
}

console.log('\n=== 3. CHECKING GIT STASH ===');
try {
  const stash = cp.execSync('git stash list').toString().trim();
  console.log(stash || 'No git stash found');
  if (stash) {
    const stashes = stash.split('\n');
    stashes.forEach((s, idx) => {
      try {
        const fileContent = cp.execSync('git show stash@{' + idx + '}:data/content.json 2>/dev/null').toString();
        const d = JSON.parse(fileContent);
        console.log('stash@{' + idx + '}:data/content.json => Movies:', d.movies ? d.movies.length : 0, 'Series:', d.series ? d.series.length : 0);
      } catch(e){}
    });
  }
} catch(e) {
  console.log('Stash error:', e.message);
}

console.log('\n=== 4. CHECKING DANGLING BLOBS ===');
try {
  const fsck = cp.execSync('git fsck --lost-found 2>/dev/null').toString().trim();
  const blobs = fsck.match(/blob ([a-f0-9]+)/g) || [];
  console.log('Found', blobs.length, 'dangling blobs');
  blobs.forEach(b => {
    const hash = b.split(' ')[1];
    try {
      const raw = cp.execSync('git show ' + hash + ' 2>/dev/null').toString();
      if (raw.includes('"series"') && raw.includes('"movies"')) {
        const d = JSON.parse(raw);
        console.log('Dangling blob', hash, '=> Movies:', d.movies ? d.movies.length : 0, 'Series:', d.series ? d.series.length : 0);
      }
    } catch(e){}
  });
} catch(e) {
  console.log('Blob search error:', e.message);
}
