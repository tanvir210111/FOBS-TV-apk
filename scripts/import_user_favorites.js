/**
 * Script to import all MCU Hindi Dubbed, Dev Popular Bengali Movies,
 * Bollywood Classics (Kal Ho Naa Ho, Koi Mil Gaya, K3G, Krrish 1&3), and Fukrey All Parts.
 */

const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');
const adminService = require('../services/adminService');

const TARGETS = [
  // --- Bollywood Classics ---
  { query: 'Kal Ho Naa Ho [Hindi]', fallbackQuery: 'Kal Ho Naa Ho', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Kal Ho Naa Ho' },
  { query: 'Koi... Mil Gaya [Hindi]', fallbackQuery: 'Koi Mil Gaya', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Koi... Mil Gaya' },
  { query: 'Kabhi Khushi Kabhie Gham...', fallbackQuery: 'Kabhi Khushi Kabhie Gham', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Kabhi Khushi Kabhie Gham' },
  { query: 'Krrish [Hindi]', fallbackQuery: 'Krrish', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Krrish' },
  { query: 'Krrish 3 [Hindi]', fallbackQuery: 'Krrish 3', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Krrish 3' },

  // --- Fukrey Franchise ---
  { query: 'Fukrey [Hindi]', fallbackQuery: 'Fukrey', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Fukrey' },
  { query: 'Fukrey Returns [Hindi]', fallbackQuery: 'Fukrey Returns', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Fukrey Returns' },
  { query: 'Fukrey 3 [Hindi]', fallbackQuery: 'Fukrey 3', category: 'Bollywood', industry: 'Bollywood', isHindi: true, displayTitle: 'Fukrey 3' },

  // --- Dev Popular Bengali Movies ---
  { query: 'Mountain of the Moon', fallbackQuery: 'Chander Pahar', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Chander Pahar' },
  { query: 'The Amazon Expedition', fallbackQuery: 'Amazon Obhijaan', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Amazon Obhijaan' },
  { query: 'Paglu [Bengali]', fallbackQuery: 'Paglu', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Paglu' },
  { query: 'Paglu 2', fallbackQuery: 'Paglu 2', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Paglu 2' },
  { query: 'Challenge [Bengali]', fallbackQuery: 'Challenge', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Challenge' },
  { query: 'Challenge 2', fallbackQuery: 'Challenge 2', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Challenge 2' },
  { query: 'Khoka 420 [Bengali]', fallbackQuery: 'Khoka 420', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Khoka 420' },
  { query: 'Rangbaaz [Bengali]', fallbackQuery: 'Rangbaaz Dev', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Rangbaaz' },
  { query: 'Yoddha the Warrior', fallbackQuery: 'Yoddha', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Yoddha: The Warrior' },
  { query: 'Golondaaj', fallbackQuery: 'Golondaaj Dev', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Golondaaj' },
  { query: 'Tonic Film', fallbackQuery: 'Tonic 2021', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Tonic' },
  { query: 'Bagha Jatin', fallbackQuery: 'Bagha Jatin Dev', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Bagha Jatin' },
  { query: 'Pradhan [Bengali]', fallbackQuery: 'Pradhan', category: 'Bengali', industry: 'Tollywood', isHindi: false, displayTitle: 'Pradhan' },

  // --- MCU (Marvel Cinematic Universe - All Hindi Dubbed) ---
  { query: 'Iron Man 2 [Hindi]', fallbackQuery: 'Iron Man 2', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Iron Man 2 [Hindi]' },
  { query: 'Iron Man 3 [Hindi]', fallbackQuery: 'Iron Man 3', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Iron Man 3 [Hindi]' },
  { query: 'The Incredible Hulk [Hindi]', fallbackQuery: 'The Incredible Hulk', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'The Incredible Hulk [Hindi]' },
  { query: 'Thor [Hindi]', fallbackQuery: 'Thor 2011', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Thor [Hindi]' },
  { query: 'Thor: The Dark World [Hindi]', fallbackQuery: 'Thor The Dark World', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Thor: The Dark World [Hindi]' },
  { query: 'Thor: Ragnarok', fallbackQuery: 'Thor Ragnarok', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Thor: Ragnarok [Hindi]' },
  { query: 'Thor: Love and Thunder [Hindi]', fallbackQuery: 'Thor Love and Thunder', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Thor: Love and Thunder [Hindi]' },
  { query: 'Captain America [Hindi]', fallbackQuery: 'Captain America The First Avenger', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Captain America: The First Avenger [Hindi]' },
  { query: 'Captain America: The Winter Soldier', fallbackQuery: 'The Winter Soldier', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Captain America: The Winter Soldier [Hindi]' },
  { query: 'Captain America: Civil War [Hindi]', fallbackQuery: 'Captain America Civil War', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Captain America: Civil War [Hindi]' },
  { query: 'The Avengers [Hindi]', fallbackQuery: 'The Avengers 2012', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'The Avengers [Hindi]' },
  { query: 'Avengers: Age of Ultron [Hindi]', fallbackQuery: 'Avengers Age of Ultron', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Avengers: Age of Ultron [Hindi]' },
  { query: 'Avengers: Infinity War [Hindi]', fallbackQuery: 'Avengers Infinity War', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Avengers: Infinity War [Hindi]' },
  { query: 'Avengers: Endgame [Hindi]', fallbackQuery: 'Avengers Endgame', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Avengers: Endgame [Hindi]' },
  { query: 'Guardians of the Galaxy [Hindi]', fallbackQuery: 'Guardians of the Galaxy 2014', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Guardians of the Galaxy [Hindi]' },
  { query: 'Guardians of the Galaxy Vol. 2', fallbackQuery: 'Guardians of the Galaxy 2', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Guardians of the Galaxy Vol. 2 [Hindi]' },
  { query: 'Guardians of the Galaxy Vol. 3 [Hindi]', fallbackQuery: 'Guardians of the Galaxy 3', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Guardians of the Galaxy Vol. 3 [Hindi]' },
  { query: 'Ant-Man [Hindi]', fallbackQuery: 'Ant-Man 2015', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Ant-Man [Hindi]' },
  { query: 'Ant-Man and the Wasp [Hindi]', fallbackQuery: 'Ant-Man and the Wasp', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Ant-Man and the Wasp [Hindi]' },
  { query: 'Ant-Man and the Wasp: Quantumania [Hindi]', fallbackQuery: 'Ant-Man and the Wasp Quantumania', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Ant-Man and the Wasp: Quantumania [Hindi]' },
  { query: 'Doctor Strange [Hindi]', fallbackQuery: 'Doctor Strange 2016', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Doctor Strange [Hindi]' },
  { query: 'Doctor Strange in the Multiverse of Madness', fallbackQuery: 'Doctor Strange Multiverse', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Doctor Strange in the Multiverse of Madness [Hindi]' },
  { query: 'Spider-Man: Far from Home [Hindi]', fallbackQuery: 'Spider-Man Far From Home', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Spider-Man: Far From Home [Hindi]' },
  { query: 'Spider-Man: No Way Home [Hindi]', fallbackQuery: 'Spider-Man No Way Home', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Spider-Man: No Way Home [Hindi]' },
  { query: 'Black Panther [Hindi]', fallbackQuery: 'Black Panther 2018', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Black Panther [Hindi]' },
  { query: 'Black Panther: Wakanda Forever', fallbackQuery: 'Wakanda Forever', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Black Panther: Wakanda Forever [Hindi]' },
  { query: 'Captain Marvel [Hindi]', fallbackQuery: 'Captain Marvel', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Captain Marvel [Hindi]' },
  { query: 'The Marvels', fallbackQuery: 'The Marvels 2023', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'The Marvels [Hindi]' },
  { query: 'Black Widow [Hindi]', fallbackQuery: 'Black Widow 2021', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Black Widow [Hindi]' },
  { query: 'Shang-Chi and the Legend of the Ten Rings [Hindi]', fallbackQuery: 'Shang-Chi', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Shang-Chi and the Legend of the Ten Rings [Hindi]' },
  { query: 'Eternals [Hindi]', fallbackQuery: 'Eternals 2021', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Eternals [Hindi]' },
  { query: 'Deadpool & Wolverine [Hindi]', fallbackQuery: 'Deadpool Wolverine', category: 'Marvel', industry: 'Hollywood', isHindi: true, displayTitle: 'Deadpool & Wolverine [Hindi]' }
];

async function run() {
  console.log('=== STARTING BATCH IMPORT OF USER FAVORITES ===\n');
  console.log(`Total titles queued: ${TARGETS.length}`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`\n[${i + 1}/${TARGETS.length}] Searching: "${t.query}"...`);

    try {
      let results = await movieboxService.search(t.query);
      if (!results || results.length === 0) {
        if (t.fallbackQuery) {
          console.log(`  Trying fallback query: "${t.fallbackQuery}"...`);
          results = await movieboxService.search(t.fallbackQuery);
        }
      }

      if (!results || results.length === 0) {
        console.warn(`  ⚠️ Could not find any result for "${t.query}"`);
        failCount++;
        continue;
      }

      // Pick best matching movie
      let movieItem = results.find(r => r.type === 'movie' || !r.title.toLowerCase().includes('season'));
      if (!movieItem) movieItem = results[0];

      console.log(`  ✓ Found match: "${movieItem.title}" (${movieItem.year}) [ID: ${movieItem.id}]`);

      // Import via adminService.importFromMovieBox
      const payload = {
        type: 'movie',
        subjectId: movieItem.id || movieItem.subjectId,
        detailPath: movieItem.detailPath,
        title: t.displayTitle || movieItem.title,
        year: movieItem.year || '2022',
        rating: movieItem.rating || '8.0',
        poster: movieItem.poster,
        category: t.category,
        industry: t.industry,
        isHindi: t.isHindi
      };

      const imported = await adminService.importFromMovieBox(payload);
      if (imported && imported.success) {
        console.log(`  🎉 Successfully imported: "${imported.item.title}"`);
        successCount++;
      } else {
        console.warn(`  ❌ Import returned unsuccessful for "${t.query}"`);
        failCount++;
      }
    } catch (err) {
      console.error(`  ❌ Error importing "${t.query}":`, err.message);
      failCount++;
    }

    // Gentle delay to respect rate limits
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n=============================================');
  console.log(`SUMMARY: ${successCount} Imported Successfully, ${failCount} Failed.`);
  const finalContent = adminService.readContent();
  console.log(`Current Total Movies in Catalog: ${finalContent.movies.length}`);
  console.log(`Current Total Series in Catalog: ${finalContent.series.length}`);
  console.log('=============================================\n');

  process.exit(0);
}

run();
