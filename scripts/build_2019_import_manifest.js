const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');

async function run() {
  const verified = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_verified_korean_hindi_list.json'), 'utf8'));

  // Also manually add Exit [Hindi] (ID: 6882332840634499648) which is the famous 2019 Korean Exit movie
  const exitDetail = await movieboxService.getDetail('6882332840634499648');
  if (exitDetail) {
    verified.push(exitDetail);
  }

  // Titles that are definitely NOT Korean or NOT 2019
  const blacklistIds = new Set([
    '2445324832742015696', // Jurassic World
    '9092663463566000296', // Black Water: Abyss
    '4325161280089769520', // Watcher (Hollywood)
    '5898211357400392040', // The Watcher (Hollywood)
    '1250424936259355984', // Transformers
    '7147213651240699592', // Money Heist
    '1800337344654891368', // The Beast
    '8608676612730668024', // The Beast 2024
    '1931175659242489392', // Exit (2018 Hollywood)
    '7147213651240699592', // Money Heist
    '6537386087751864312', // The Price of Confession (2025)
    '8767024167079265568', // Confession (2022)
    '3562209976892489856', // Possessed (2009)
    '3000423889278234856', // A Korean Odyssey (2017)
    '7956322164809286464', // Partners for Justice S1 (2018)
    '1166655655210633168', // Kingdom (Bollywood)
    '9134199284831847984', // Kingdom (Anime)
    '367175769514197816'   // Clean with Passion for Now (2018)
  ]);

  const cleanList = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of verified) {
    if (blacklistIds.has(String(item.subjectId))) continue;
    if (item.category.includes('Hollywood') || item.category.includes('Bollywood') || item.category.includes('Turkish')) continue;
    if (item.title.toLowerCase().includes('transformers') || item.title.toLowerCase().includes('jurassic')) continue;

    const key = item.title.toLowerCase().replace(/\[hindi\]|\(hindi\)|\[cam\]|s\d+(-s\d+)?/gi, '').replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(key) || seenIds.has(item.subjectId)) continue;
    seenTitles.add(key);
    seenIds.add(item.subjectId);

    // Format properly
    let title = item.title;
    if (!title.includes('[Hindi]')) {
      title = `${title} [Hindi]`;
    }

    cleanList.push({
      id: item.subjectId,
      title: title,
      type: item.type,
      year: item.year || '2019',
      rating: item.rating || '8.2',
      genres: item.genre || (item.type === 'series' ? 'Korean Drama, Hindi Dubbed' : 'Korean Movie, Drama, Hindi Dubbed'),
      poster: item.poster,
      backdrop: item.cover || item.poster,
      description: item.description,
      detailPath: item.detailPath,
      seasons: item.seasons || [{ seasonNumber: 1, maxEp: item.totalEpisodes || 1 }]
    });
  }

  console.log(`\nFiltered Final 2019 Korean Manifest Count: ${cleanList.length}`);
  const sList = cleanList.filter(x => x.type === 'series');
  const mList = cleanList.filter(x => x.type === 'movie');
  console.log(`- 2019 K-Dramas (Series): ${sList.length}`);
  sList.forEach((s, idx) => console.log(`   ${idx + 1}. ${s.title} (${s.year}) - Eps: ${s.seasons[0]?.maxEp || 16}`));
  console.log(`- 2019 K-Movies: ${mList.length}`);
  mList.forEach((m, idx) => console.log(`   ${idx + 1}. ${m.title} (${m.year})`));

  fs.writeFileSync(path.join(__dirname, '../scratch/2019_final_manifest.json'), JSON.stringify(cleanList, null, 2), 'utf8');
}

run();
