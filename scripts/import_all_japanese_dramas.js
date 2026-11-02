const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

const JAPANESE_SERIES = [
  { id: '1372737044979613864', path: 'alice-in-borderland-hindi-EQwrWtj9pD1', title: 'Alice in Borderland (今際の国のアリス) [Hindi]', dub: 'Hindi' },
  { id: '6000415223809722544', path: 'yu-yu-hakusho-hindi-8GhZeWQXf97', title: 'Yu Yu Hakusho (幽☆遊☆白书) [Hindi]', dub: 'Hindi' },
  { id: '5374509463669983144', path: 'house-of-ninjas-hindi-K3Wtc2fj1p6', title: 'House of Ninjas (忍びの家) [Hindi]', dub: 'Hindi' },
  { id: '3038612373557889200', path: 'first-love-hindi-EYwQMPmSsC3', title: 'First Love: Hatsukoi (初恋) [Hindi]', dub: 'Hindi' },
  { id: '8454331662959264824', path: 'fishbowl-wives-hindi-QCaVFXzVw4a', title: 'Fishbowl Wives (金鱼妻) [Hindi]', dub: 'Hindi' },
  { id: '3395272552376402488', path: 'like-a-dragon-yakuza-hindi-82Th6iPnO24', title: 'Like a Dragon: Yakuza (龍が如く) [Hindi]', dub: 'Hindi' },
  { id: '8880326555399061632', path: 'erased-hindi-qtEQUVmZZza', title: 'ERASED (僕だけがいない街) [Hindi]', dub: 'Hindi' },
  { id: '8284083737244191240', path: 'mechanical-marie-hindi-yBc61LRbXR9', title: 'Mechanical Marie (機械仕掛けのマリー) [Hindi]', dub: 'Hindi' },
  { id: '1866743088148874256', path: 'tokyo-swindlers-hindi-qLjxXTAHTd2', title: 'Tokyo Swindlers (地面師たち) [Hindi]', dub: 'Hindi' },
  { id: '575889271471620616', path: 'beyond-goodbye-hindi-ccVOuzTzxG', title: 'Beyond Goodbye (さよならのつづき) [Hindi]', dub: 'Hindi' },
  { id: '4781797956888527144', path: 'trillion-game-hindi-IeuYKzuGeH5', title: 'TRILLION GAME (トリリオンゲーム) [Hindi]', dub: 'Hindi' },
  { id: '2499923228492198416', path: 'the-drops-of-god-hindi-kg1FElQFFY2', title: 'The Drops of God (神の雫) [Hindi]', dub: 'Hindi' },
  { id: '5408622494284677440', path: 'romantics-anonymous-hindi-sCaXi40yxr6', title: 'Romantics Anonymous (匿名浪漫) [Hindi]', dub: 'Hindi' },
  { id: '834228706225934632', path: 'hana-kimi-hindi-kEfFZb8MCZ', title: 'Hana-Kimi (花ざかりの君たちへ) [Hindi]', dub: 'Hindi' },
  { id: '386908943605453560', path: 'kamen-rider-gavv-hindi-aJyIgVU2As', title: 'Kamen Rider Gavv (仮面ライダーガヴ) [Hindi]', dub: 'Hindi' },
  { id: '8560586692309177672', path: 'nippon-sangoku-the-three-nations-of-the-crimson-sun-hindi-6Jfq5lPznca', title: 'Nippon Sangoku: The Three Nations of the Crimson Sun [Hindi]', dub: 'Hindi' },
  { id: '4585605580068379856', path: 'one-piece-hindi-46WUdLz7Ks5', title: 'One Piece Live Action [Hindi]', dub: 'Hindi' },
  { id: '4161595041439515328', path: 'atfollowers-bengali-urGi0sg9qX4', title: '@Followers (フォロワーズ) [Bengali]', dub: 'Bengali' }
];

async function main() {
  const contentFile = path.join(__dirname, '../data/content.json');
  console.log('Loading content.json...');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

  content.series = content.series || [];

  // Update existing Sins of Kujo and Viral Hit categories to Japanese Drama
  for (const s of content.series) {
    if (s.title && (s.title.includes('Sins of Kujo') || s.title.includes('Viral Hit'))) {
      s.category = 'Japanese Drama';
      s.industry = 'Japanese';
      s.country = 'Japan';
      s.badgeRight = 'Japanese';
      console.log(`  Updated existing metadata for: ${s.title}`);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < JAPANESE_SERIES.length; i++) {
    const item = JAPANESE_SERIES[i];
    const internalId = `mb-s-${item.id}`;
    const sId = item.id;
    const dPath = item.path;

    console.log(`[${i + 1}/${JAPANESE_SERIES.length}] Fetching: ${item.title}...`);

    try {
      const detail = await moviebox.getDetail(sId, dPath);
      if (!detail) {
        console.error(`  ⚠️ Detail not found for ${item.title}`);
        continue;
      }

      const poster = detail.poster || '';
      const cover = detail.backdrop || poster;
      const audioLabel = item.dub || 'Hindi';

      const seasons = [];
      const allEpisodes = [];

      const rawSeasons = detail.seasons && detail.seasons.length > 0 ? detail.seasons : [{ se: 1, maxEp: 1 }];

      for (let sIdx = 0; sIdx < rawSeasons.length; sIdx++) {
        const rawSeason = rawSeasons[sIdx];
        const seNum = rawSeason.se || (sIdx + 1);
        let epList = [];

        if (Array.isArray(rawSeason.episodes) && rawSeason.episodes.length > 0) {
          epList = rawSeason.episodes.map(e => (typeof e === 'object' ? (e.ep || e.episodeNumber || 1) : e));
        } else {
          const maxEp = rawSeason.maxEp || 1;
          for (let e = 1; e <= maxEp; e++) epList.push(e);
        }

        const seasonEpisodes = [];
        for (const ep of epList) {
          const streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}`;
          const epObj = {
            id: `${internalId}_s${seNum}_e${ep}`,
            episode: ep,
            episodeNumber: ep,
            season: seNum,
            seasonNumber: seNum,
            title: `Episode ${ep}`,
            name: `Episode ${ep}`,
            duration: '45m',
            still: poster,
            stillPath: poster,
            streamUrl: streamUrl,
            audioTracks: [audioLabel],
            selectedAudio: audioLabel,
            servers: [
              {
                name: `Server 1 (${audioLabel} - Auto-Renewing 720p)`,
                url: streamUrl,
                quality: '720p',
                audio: audioLabel,
                isDirect: true
              },
              {
                name: `Server 2 (Auto Failover 480p)`,
                url: `${streamUrl}&q=480`,
                quality: '480p',
                audio: audioLabel,
                isDirect: true
              }
            ]
          };
          seasonEpisodes.push(epObj);
          allEpisodes.push(epObj);
        }

        seasons.push({
          season: seNum,
          seasonNumber: seNum,
          name: `Season ${seNum}`,
          title: `Season ${seNum}`,
          year: detail.year || '2024',
          episodesCount: seasonEpisodes.length,
          episodes: seasonEpisodes
        });
      }

      const seriesRecord = {
        id: internalId,
        subjectId: sId,
        detailPath: dPath,
        title: item.title,
        year: String(detail.year || '2024'),
        rating: String(detail.rating || '8.2'),
        imdbRating: String(detail.rating || '8.2'),
        poster: poster,
        backdrop: cover,
        cover: cover,
        duration: `${allEpisodes.length} Episodes`,
        streamUrl: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
        servers: [
          {
            name: `Server 1 (${audioLabel} - Auto-Renewing 720p)`,
            url: `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=1`,
            quality: '720p',
            audio: audioLabel,
            isDirect: true
          }
        ],
        episodesCount: allEpisodes.length,
        category: 'Japanese Drama',
        industry: 'Japanese',
        country: 'Japan',
        language: item.dub,
        dubLanguage: item.dub,
        audioTracks: [audioLabel],
        selectedAudio: audioLabel,
        seasonsCount: seasons.length,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: `${detail.year || '2024'}-01-01`,
        originalReleaseDate: `${detail.year || '2024'}-01-01`,
        badgeLeft: 'Trending',
        badgeRight: 'Japanese',
        views: 1800,
        seasons: seasons,
        episodes: allEpisodes,
        description: detail.description || `${item.title} streaming in HD on FOBS TV.`,
        type: 'series'
      };

      const existingIdx = content.series.findIndex(s => s.id === internalId || s.subjectId === sId);
      if (existingIdx !== -1) {
        content.series[existingIdx] = seriesRecord;
        updatedCount++;
        console.log(`  🔄 Updated: ${item.title} (${allEpisodes.length} eps)`);
      } else {
        content.series.unshift(seriesRecord);
        addedCount++;
        console.log(`  ✨ Added: ${item.title} (${allEpisodes.length} eps)`);
      }
    } catch (err) {
      console.error(`  ❌ Error on ${item.title}:`, err.message);
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Added: ${addedCount}, Updated: ${updatedCount}, Total Series: ${content.series.length}`);

  // Write content.json and backup
  console.log('Writing to data/content.json and data/content.backup.json...');
  fs.writeFileSync(contentFile, JSON.stringify(content));
  const backupFile = path.join(__dirname, '../data/content.backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(content));

  // Sync to seed files
  const seedPaths = [
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];
  for (const sp of seedPaths) {
    if (fs.existsSync(sp)) {
      console.log(`Syncing to ${sp}...`);
      const seed = JSON.parse(fs.readFileSync(sp, 'utf8'));
      seed.series = seed.series || [];
      for (const jSeries of JAPANESE_SERIES) {
        const full = content.series.find(s => s.subjectId === jSeries.id);
        if (full) {
          const sIdx = seed.series.findIndex(s => s.subjectId === jSeries.id || s.id === full.id);
          if (sIdx !== -1) {
            seed.series[sIdx] = full;
          } else {
            seed.series.unshift(full);
          }
        }
      }
      fs.writeFileSync(sp, JSON.stringify(seed));
      console.log(`  Updated seed file: ${sp}`);
    }
  }

  console.log('🎉 Done syncing all Japanese dramas!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
