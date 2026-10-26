const fs = require('fs');
const path = require('path');

const paths = [
  path.join(__dirname, '..', 'public', 'app.js'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'app.js')
];

const regex = /if\s*\(\s*item\.type\s*===\s*'upcoming'\s*\)\s*\{[\s\S]*?coming-remind-pill[\s\S]*?`\s*;\s*\}/;

const replacement = `if (item.type === 'upcoming') {
      return \`
        <div class="media-card" onclick='openUpcomingBookingModal("\${item.id}")'>
          <div class="card-poster-wrap">
            <img src="\${getOptimizedPoster(item.poster)}" alt="\${item.title}" class="card-poster-img" loading="lazy">
            <span class="card-badge-left">Coming Soon</span>
            <span class="card-badge-right" style="background:#11693e;"><i class="fa-solid fa-ticket"></i> Pre-Book</span>
          </div>
          <div class="card-title">\${item.title}</div>
          <div class="card-meta">\${item.year || '2026'} • \${item.genre ? item.genre.split(',')[0].trim() : 'Hindi Dubbed'}</div>
        </div>
      \`;
    }`;

paths.forEach(p => {
  if (fs.existsSync(p)) {
    let c = fs.readFileSync(p, 'utf8');
    if (regex.test(c)) {
      c = c.replace(regex, replacement);
      fs.writeFileSync(p, c, 'utf8');
      console.log(`✓ Successfully updated ${p}`);
    } else {
      console.error(`❌ Could not match regex in ${p}`);
    }
  }
});
