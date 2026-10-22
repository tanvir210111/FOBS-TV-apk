/**
 * FOBS TV - MovieBox Content Sync Script
 * 
 * Usage:
 *   node scripts/sync_moviebox.js --preview
 *   node scripts/sync_moviebox.js --add-top 10
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');

async function syncMovieBox() {
  const args = process.argv.slice(2);
  const isPreview = args.includes('--preview') || args.length === 0;
  const addTopArgIndex = args.indexOf('--add-top');
  const addLimit = addTopArgIndex !== -1 ? parseInt(args[addTopArgIndex + 1], 10) || 5 : 0;

  console.log('Fetching live MovieBox catalog...');
  const sections = await movieboxService.getHomepage();

  console.log(`Found ${sections.length} sections on MovieBox.\n`);

  const allMovies = [];
  const allSeries = [];
  const seenIds = new Set();

  for (const sec of sections) {
    for (const it of sec.items) {
      if (seenIds.has(it.id)) continue;
      seenIds.add(it.id);

      if (it.type === 'series') {
        allSeries.push({ ...it, section: sec.title });
      } else {
        allMovies.push({ ...it, section: sec.title });
      }
    }
  }

  console.log(`Summary:`);
  console.log(`  - Unique Movies Available: ${allMovies.length}`);
  console.log(`  - Unique TV Series Available: ${allSeries.length}\n`);

  if (isPreview && addLimit === 0) {
    console.log('=== LATEST 10 MOVIES ON MOVIEBOX ===');
    allMovies.slice(0, 10).forEach((m, idx) => {
      console.log(`  ${idx + 1}. [${m.section}] ${m.title} (${m.year}) - ID: ${m.id}`);
    });

    console.log('\n=== LATEST 10 SERIES ON MOVIEBOX ===');
    allSeries.slice(0, 10).forEach((s, idx) => {
      console.log(`  ${idx + 1}. [${s.section}] ${s.title} (${s.year}) - ID: ${s.id}`);
    });

    console.log('\n[INFO] To add top movies to content.json, run: node scripts/sync_moviebox.js --add-top 5');
    return;
  }

  if (addLimit > 0) {
    console.log(`Adding top ${addLimit} movies to FOBS TV...`);
    const rawContent = fs.readFileSync(CONTENT_FILE, 'utf8');
    const content = JSON.parse(rawContent);

    let addedCount = 0;
    for (const m of allMovies.slice(0, addLimit)) {
      // Check if already in content.json by title
      const exists = content.movies.some(ex => ex.title.toLowerCase().trim() === m.title.toLowerCase().trim());
      if (exists) {
        console.log(`  - Skipping "${m.title}" (already exists in FOBS TV)`);
        continue;
      }

      console.log(`  - Resolving stream for "${m.title}"...`);
      const media = await movieboxService.resolveMedia(m.subjectId, m.detailPath, 0, 0);
      if (!media || !media.streamUrl) {
        console.log(`    ⚠️ Could not resolve stream for "${m.title}", skipping.`);
        continue;
      }

      const newMovie = {
        id: `m-mb-${m.id}`,
        title: m.title,
        year: m.year || '2026',
        rating: m.rating || '7.5',
        poster: m.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
        backdrop: m.poster,
        genre: 'Action, Thriller',
        language: m.title.toLowerCase().includes('hindi') ? 'Hindi' : 'English',
        industry: m.title.toLowerCase().includes('hindi') ? 'Bollywood' : 'Hollywood',
        tag: 'HD 1080p',
        streamUrl: media.streamUrl,
        servers: [
          { name: `Server 1 (Fast HD ${media.resolution || 1080}p)`, url: media.streamUrl },
          ...(media.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 2} (${q.resolution}p)`,
            url: q.url
          }))
        ],
        subtitles: media.captions || []
      };

      content.movies.unshift(newMovie);
      addedCount++;
      console.log(`    ✅ Added "${m.title}" (${media.resolution}p)`);
    }

    if (addedCount > 0) {
      fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2), 'utf8');
      console.log(`\n🎉 Successfully added ${addedCount} new movies to data/content.json!`);
    } else {
      console.log('\nNo new movies were added (already up-to-date).');
    }
  }
}

syncMovieBox().catch(err => {
  console.error('Error during sync:', err);
});
