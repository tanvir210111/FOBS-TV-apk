const fs = require('fs');
const cp = require('child_process');

console.log('=== INSPECTING ALL GIT STASHES ===');

const stashesRaw = cp.execSync('git stash list').toString().trim();
if (!stashesRaw) {
  console.log('No stashes found.');
  process.exit(0);
}

const lines = stashesRaw.split('\n');
console.log(`Found ${lines.length} stashes.\n`);

const foundContent = [];

lines.forEach((line, idx) => {
  const stashRef = `stash@{${idx}}`;
  try {
    const fileList = cp.execSync(`git stash show --name-only "${stashRef}" 2>/dev/null`).toString().trim().split('\n');
    const jsonFiles = fileList.filter(f => f.includes('content') || f.endsWith('.json'));

    jsonFiles.forEach(file => {
      try {
        const raw = cp.execSync(`git show "${stashRef}:${file}" 2>/dev/null`).toString();
        const d = JSON.parse(raw);
        const mCount = Array.isArray(d.movies) ? d.movies.length : 0;
        const sCount = Array.isArray(d.series) ? d.series.length : 0;
        console.log(`[FOUND] ${stashRef}:${file} => Movies: ${mCount}, Series: ${sCount}`);
        foundContent.push({ stashRef, file, movies: d.movies || [], series: d.series || [], rawData: d });
      } catch (err) {
        // Not a JSON or parse error
      }
    });
  } catch (e) {
    // Stash show error
  }
});

// Also check current content.json on VPS
const currentFile = 'data/content.json';
let current = { movies: [], series: [], liveTv: [], categories: [], industries: [] };
if (fs.existsSync(currentFile)) {
  try {
    current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    console.log(`\n[CURRENT] ${currentFile} => Movies: ${current.movies?.length || 0}, Series: ${current.series?.length || 0}`);
  } catch(e) {}
}

// Find any series or movies across all stashes that are not in current
const currentMovieTitles = new Set((current.movies || []).map(m => (m.title || '').trim().toLowerCase()));
const currentSeriesTitles = new Set((current.series || []).map(s => (s.title || '').trim().toLowerCase()));

const missingMovies = [];
const missingSeries = [];

foundContent.forEach(item => {
  item.movies.forEach(m => {
    const key = (m.title || '').trim().toLowerCase();
    if (key && !currentMovieTitles.has(key)) {
      currentMovieTitles.add(key);
      missingMovies.push(m);
    }
  });
  item.series.forEach(s => {
    const key = (s.title || '').trim().toLowerCase();
    if (key && !currentSeriesTitles.has(key)) {
      currentSeriesTitles.add(key);
      missingSeries.push(s);
    }
  });
});

console.log(`\n=== UNIQUE CONTENT FOUND IN STASHES ===`);
console.log(`Missing Movies to restore: ${missingMovies.length}`);
missingMovies.forEach(m => console.log('  + Movie:', m.title));

console.log(`Missing Series to restore: ${missingSeries.length}`);
missingSeries.forEach(s => console.log('  + Series:', s.title));

if (missingMovies.length > 0 || missingSeries.length > 0) {
  // Merge into current
  current.movies = [...missingMovies, ...(current.movies || [])];
  current.series = [...missingSeries, ...(current.series || [])];
  
  fs.writeFileSync('data/content.json', JSON.stringify(current), 'utf8');
  fs.writeFileSync('data/content.backup.json', JSON.stringify(current), 'utf8');
  
  console.log(`\nSUCCESS: Merged into data/content.json!`);
  console.log(`New Total Movies: ${current.movies.length}`);
  console.log(`New Total Series: ${current.series.length}`);
  
  // Restart pm2
  try {
    cp.execSync('pm2 restart fobs-tv');
    console.log('PM2 restarted successfully with updated content!');
  } catch(e){}
} else {
  console.log('\nAll content from stashes is already present in data/content.json.');
}
