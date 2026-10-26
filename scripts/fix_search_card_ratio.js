const fs = require('fs');
const path = require('path');

console.log('=== FIXING SEARCH RESULTS CARD ASPECT RATIO & STRETCHING ===\n');

// 1. Files to update
const appJsPaths = [
  path.join(__dirname, '..', 'public', 'app.js'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'app.js')
];

const styleCssPaths = [
  path.join(__dirname, '..', 'public', 'style.css'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'style.css')
];

// Target in app.js
const targetUpcomingBlock = `    if (item.type === 'upcoming') {
      return \`
        <div class="coming-card" style="width: 100%; margin-bottom: 8px;" onclick='openUpcomingBookingModal("\${item.id}")'>
          <div class="coming-thumb-box">
            <img src="\${item.poster}" alt="\${item.title}" class="coming-thumb-img" loading="lazy">
            <span class="card-badge-left">Coming Soon</span>
          </div>
          <div class="coming-details">
            <div class="coming-title">\${item.title}</div>
            <div class="coming-meta">\${item.year || '2026'} • \${item.genre ? item.genre.split(',')[0].trim() : 'Hindi Dubbed'}</div>
            <button class="coming-remind-pill" style="margin-top: 6px;"><i class="fa-solid fa-ticket"></i> Pre-Book</button>
          </div>
        </div>
      \`;
    }`;

const replacementUpcomingBlock = `    if (item.type === 'upcoming') {
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

appJsPaths.forEach(p => {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    if (content.includes(targetUpcomingBlock)) {
      content = content.replace(targetUpcomingBlock, replacementUpcomingBlock);
      fs.writeFileSync(p, content, 'utf8');
      console.log(`✓ Updated search upcoming card in ${p}`);
    } else {
      console.log(`⚠️ Target block not found in ${p}`);
    }
  }
});

// Target in style.css: add .coming-thumb-box and .coming-thumb-img rules
const cssAddition = `
/* Search Results & Grid Coming Soon Card Fallback */
.coming-thumb-box {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 8px 8px 0 0;
  overflow: hidden;
  background-color: var(--bg-card, #141724);
}

.coming-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
`;

styleCssPaths.forEach(p => {
  if (fs.existsSync(p)) {
    let css = fs.readFileSync(p, 'utf8');
    if (!css.includes('.coming-thumb-box')) {
      css += cssAddition;
      fs.writeFileSync(p, css, 'utf8');
      console.log(`✓ Added .coming-thumb-box and .coming-thumb-img CSS in ${p}`);
    }
  }
});

console.log('\n=== FIX APPLIED SUCCESSFULLY ===');
