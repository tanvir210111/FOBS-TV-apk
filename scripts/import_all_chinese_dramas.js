const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

const CHINESE_SERIES = [
  { id: '5950672012099159704', path: 'hidden-love-hindi-ud7nJNJ8A57', title: 'Hidden Love (偷偷藏不住) [Hindi]', dub: 'Hindi' },
  { id: '8820669367852626520', path: 'love-between-fairy-and-devil-hindi-MEaOWG4LAva', title: 'Love Between Fairy and Devil (苍兰诀) [Hindi]', dub: 'Hindi' },
  { id: '758366460505902088', path: 'when-i-fly-towards-you-hindi-EsolyOek1U', title: 'When I Fly Towards You (当我飞奔向你) [Hindi]', dub: 'Hindi' },
  { id: '1965402537092071616', path: 'my-girlfriend-is-an-alien-bengali-MmdxjPZybl2', title: 'My Girlfriend Is an Alien [Bengali]', dub: 'Bengali' },
  { id: '5053700679857062272', path: 'my-girlfriend-is-an-alien-hindi-q5m1yua0k16', title: 'My Girlfriend Is an Alien [Hindi] S1', dub: 'Hindi' },
  { id: '7883921518848525448', path: 'my-girlfriend-is-an-alien-hindi-4KM6Zuxroo9', title: 'My Girlfriend Is an Alien [Hindi] S2', dub: 'Hindi' },
  { id: '7555037248405104000', path: 'till-the-end-of-the-moon-hindi-epfd9ul9609', title: 'Till the End of the Moon (长月烬明) [Hindi]', dub: 'Hindi' },
  { id: '1295982060779237904', path: 'love-in-disguise-hindi-ww61uWUBJx1', title: 'Love in Disguise [Hindi]', dub: 'Hindi' },
  { id: '1999846559898370840', path: 'put-your-head-on-my-shoulder-hindi-Qc1jdaKjJn2', title: 'Put Your Head on My Shoulder [Hindi]', dub: 'Hindi' },
  { id: '7569599892294107456', path: 'perfect-and-casual-hindi-4ARQTZyQa19', title: 'Perfect and Casual (完美先生和差不多小姐) [Hindi]', dub: 'Hindi' },
  { id: '6000301376574739616', path: 'lighter-and-princess-hindi-2Rs3TAwrf97', title: 'Lighter & Princess (点燃我，温暖你) [Hindi]', dub: 'Hindi' },
  { id: '4825638261110602960', path: 'as-beautiful-as-you-hindi-yB6KtIpttK5', title: 'As Beautiful as You (你比星光美丽) [Hindi]', dub: 'Hindi' },
  { id: '1374461663327438176', path: 'love-o2o-hindi-USbP4m23xD1', title: 'Love O2O (微微一笑很倾城) [Hindi]', dub: 'Hindi' },
  { id: '566640740688880320', path: 'a-love-so-beautiful-hindi-i14w60GdRF', title: 'A Love So Beautiful [Hindi]', dub: 'Hindi' },
  { id: '6067650409777220448', path: 'a-love-other-than-yours-hindi-wOV0K50Ude7', title: 'A Love Other Than Yours [Hindi]', dub: 'Hindi' },
  { id: '4258766710490154968', path: 'my-bias-my-boss-hindi-C5150bccB45', title: 'My Bias, My Boss (你也有今天) [Hindi]', dub: 'Hindi' },
  { id: '8821250881728531504', path: 'dream-garden-hindi-oappnzcqDva', title: 'Dream Garden (沉睡花园) [Hindi]', dub: 'Hindi' },
  { id: '3919650761721923712', path: 'the-untamed-hindi-SxDodJB2yF4', title: 'The Untamed (陈情令) [Hindi]', dub: 'Hindi' },
  { id: '2743019113495807112', path: 'word-of-honor-hindi-298xaJv3Dg3', title: 'Word of Honor (山河令) [Hindi]', dub: 'Hindi' },
  { id: '121668574980230160', path: 'everyone-loves-me-hindi-ypStvu5fZ8', title: 'Everyone Loves Me (别对我动心) [Hindi]', dub: 'Hindi' },
  { id: '7263336153204900592', path: 'begin-again-hindi-4iSRI7I9yE8', title: 'Begin Again [Hindi]', dub: 'Hindi' },
  { id: '3866497944589419616', path: 'go-ahead-hindi-2zNcKziBCB4', title: 'Go Ahead (以家人之名) [Hindi]', dub: 'Hindi' },
  { id: '460145749905554048', path: 'go-go-squid-hindi-wgQS2YhtZx', title: 'Go Go Squid! (亲爱的，热爱的) [Hindi]', dub: 'Hindi' },
  { id: '7384944248602723992', path: 'you-are-my-glory-hindi-IIrH3QC7xN8', title: 'You Are My Glory (你是我的荣耀) [Hindi]', dub: 'Hindi' },
  { id: '416476006351098432', path: 'fireworks-of-my-heart-hindi-UYIAVDNsLu', title: 'Fireworks of My Heart (我的人间烟火) [Hindi]', dub: 'Hindi' },
  { id: '6778076388953318016', path: 'you-are-my-secret-hindi-ocCxHQ1FH48', title: 'You Are My Secret (私藏浪漫) [Hindi]', dub: 'Hindi' },
  { id: '5138627512037261456', path: 'you-are-desire-hindi-GrjWUZ2YA76', title: 'You Are Desire (白日梦我) [Hindi]', dub: 'Hindi' },
  { id: '8382759629469745416', path: 'only-for-love-hindi-sm8ZWaW7fZ9', title: 'Only for Love (以爱为营) [Hindi]', dub: 'Hindi' },
  { id: '2344383564848037072', path: 'the-early-spring-hindi-mL0TvlHibN2', title: 'The Early Spring (早春晴朗) [Hindi]', dub: 'Hindi' },
  { id: '2525681123934487904', path: 'story-of-yanxi-palace-hindi-ssrIFx4Ez03', title: 'Story of Yanxi Palace (延禧攻略) [Hindi]', dub: 'Hindi' },
  { id: '7956543182215725408', path: 'take-charge-of-my-heart-hindi-oIO9IBe3Lt9', title: 'Take Charge of My Heart (授她以柄) [Hindi]', dub: 'Hindi' },
  { id: '156525782230256080', path: 'love-scenery-hindi-WtWXIaaTyb', title: 'Love Scenery (良辰美景好时光) [Hindi]', dub: 'Hindi' },
  { id: '3106009958144427360', path: 'once-we-get-married-hindi-sgDnE6DyrH3', title: 'Once We Get Married (只是结婚的关系) [Hindi]', dub: 'Hindi' },
  { id: '5904285467654194656', path: 'once-we-get-married-urdu-QCwxOFMG927', title: 'Once We Get Married [Urdu]', dub: 'Urdu' },
  { id: '1747748814284284832', path: 'love-me-love-my-voice-hindi-enImQYTH652', title: 'Love Me, Love My Voice (很想很想你) [Hindi]', dub: 'Hindi' },
  { id: '6773128420735287792', path: 'my-little-happiness-hindi-Uc4wS500l48', title: 'My Little Happiness (我的小确幸) [Hindi]', dub: 'Hindi' },
  { id: '4797712355297822680', path: 'my-little-happiness-bengali-2VYf5uyzpI5', title: 'My Little Happiness [Bengali]', dub: 'Bengali' },
  { id: '874833288387512056', path: 'perfect-crown-hindi-CLmdeDeKC21', title: 'Perfect Crown [Hindi]', dub: 'Hindi' },
  { id: '8048598386112692496', path: 'love-is-sweet-hindi-Uga6W5iFyA9', title: 'Love is Sweet (半是蜜糖半是伤) [Hindi]', dub: 'Hindi' },
  { id: '2340109936560144656', path: 'lie-to-love-hindi-ydmGUI9JRM2', title: 'Lie to Love (良言写意) [Hindi]', dub: 'Hindi' },
  { id: '2067197846347991224', path: 'since-i-met-u-hindi-y3RvAkRMHs2', title: 'Since I Met U (遇见你之后) [Hindi]', dub: 'Hindi' },
  { id: '5557596804348281840', path: 'a-romance-of-the-little-forest-hindi-6naM5lQQxC6', title: 'A Romance Of The Little Forest [Hindi]', dub: 'Hindi' },
  { id: '6618288016421519504', path: 'my-lethal-man-hindi-8aTiBWpPTS7', title: 'My Lethal Man (对他而言危险的他) [Hindi]', dub: 'Hindi' },
  { id: '5497401392438345968', path: 'road-home-hindi-sMRs8mI96y6', title: 'Road Home (归路) [Hindi]', dub: 'Hindi' },
  { id: '3642928735944335256', path: 'our-sticky-love-hindi-6ZZFEhrE6l4', title: 'Our Sticky Love [Hindi]', dub: 'Hindi' },
  { id: '6939540575045961360', path: 'amidst-a-snowstorm-of-love-hindi-U2xlkovaDg8', title: 'Amidst a Snowstorm of Love (在暴雪时分) [Hindi]', dub: 'Hindi' },
  { id: '1960215520657961192', path: 'love-game-in-eastern-fantasy-hindi-Yio4Fu5ONk2', title: 'Love Game in Eastern Fantasy (永夜星河) [Hindi]', dub: 'Hindi' },
  { id: '5838980738489668432', path: 'unforgettable-love-hindi-Myl0liOAkX6', title: 'Unforgettable Love (贺先生的恋恋不忘) [Hindi]', dub: 'Hindi' },
  { id: '9171882840945059200', path: 'sweet-teeth-hindi-qBww7QSjxVa', title: 'Sweet Teeth (世界微尘里) [Hindi]', dub: 'Hindi' },
  { id: '869682023798037784', path: 'my-dearest-nemesis-hindi-CnazjJt9f21', title: 'My Dearest Nemesis [Hindi]', dub: 'Hindi' },
  { id: '4262424030835265728', path: 'aukaat-ke-bahar-hindi-IuGdTlJWR45', title: 'Aukaat Ke Bahar [Hindi]', dub: 'Hindi' },
  { id: '742546769883585176', path: 'the-ordinary-jackpot-hindi-sqo01i4SQS', title: 'The Ordinary Jackpot [Hindi]', dub: 'Hindi' },
  { id: '2349680525465530608', path: 'bon-appetit-your-majesty-hindi-WXTeajPyzN2', title: 'Bon Appetit, Your Majesty (萌妻食神) [Hindi]', dub: 'Hindi' },
  { id: '1131798723912254248', path: 'make-me-tingle-hindi-0yDs3ejEBl1', title: 'Make Me Tingle [Hindi]', dub: 'Hindi' },
  { id: '688568806318432888', path: 'shaque-trust-no-one-hindi-4uOXgYrERO', title: 'Shaque: Trust No One [Hindi]', dub: 'Hindi' },
  { id: '4073919632053261848', path: 'the-ladys-companion-hindi-Ecy2zHTAWQ4', title: 'The Lady\'s Companion [Hindi]', dub: 'Hindi' },
  { id: '8182411463231952776', path: 'brothers-and-sisters-hindi-MUwFdmWwrK9', title: 'Brothers and Sisters [Hindi]', dub: 'Hindi' },
  { id: '4468294183375831184', path: 'qing-shi-jin-lin-gu-yu-lai-hindi-yvfGSPKP4k5', title: 'Qing Shi Jin Lin Gu Yu Lai [Hindi]', dub: 'Hindi' },
  { id: '4773670635371479992', path: 'kong-que-sheng-shi-qing-dong-xin-hindi-mv4otwEsDG5', title: 'Kong Que Sheng Shi Qing Dong Xin [Hindi]', dub: 'Hindi' },
  { id: '846349632752992328', path: 'qing-qing-zi-jin-hindi-OBuVVTZhw01', title: 'Qing qing zi jin (青青子衿) [Hindi]', dub: 'Hindi' },
  { id: '5867055789189333968', path: 'jin-li-shi-ge-ji-shu-huo-hindi-Yquo3j1bpZ6', title: 'Jin li shi ge ji shu huo [Hindi]', dub: 'Hindi' },
  { id: '8535544685773865744', path: 'demi-gods-and-semi-devils-hindi-AYhqRLSSwaa', title: 'Demi-Gods and Semi-Devils (天龙八部) [Hindi]', dub: 'Hindi' }
];

async function main() {
  console.log(`=== IMPORTING ALL CHINESE DRAMAS (2016-2026) IN HINDI/URDU/BANGLA ===`);
  console.log(`Target series count: ${CHINESE_SERIES.length}\n`);

  const contentFile = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  content.series = content.series || [];

  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < CHINESE_SERIES.length; i++) {
    const item = CHINESE_SERIES[i];
    const sId = item.id;
    const dPath = item.path;
    const internalId = `mb-s-${sId}`;

    try {
      console.log(`[${i + 1}/${CHINESE_SERIES.length}] Processing "${item.title}" (${sId})...`);
      const detail = await moviebox.getDetail(sId, dPath);

      if (!detail) {
        console.warn(`  ⚠️ Failed to fetch detail from MovieBox for ${sId}`);
        continue;
      }

      const year = parseInt(detail.year || 0, 10);
      if (year && (year < 2016 || year > 2026)) {
        console.log(`  ⏩ Skipping: Year ${year} is outside 2016-2026`);
        continue;
      }

      const mbSeasons = detail.seasons && detail.seasons.length > 0
        ? detail.seasons
        : [{ se: 1, maxEp: detail.totalEpisodes || 24 }];

      const seasons = [];
      const allEpisodes = [];
      const audioLabel = `${item.dub} Dub`;
      const poster = detail.poster || '';
      const cover = detail.cover || poster;

      for (const mbSea of mbSeasons) {
        const seNum = mbSea.se || 1;
        let maxEp = parseInt(mbSea.maxEp, 10) || 0;
        if (mbSea.allEp) {
          const split = mbSea.allEp.split(',').filter(Boolean).length;
          if (split > maxEp) maxEp = split;
        }
        if (!maxEp || maxEp <= 0) maxEp = detail.totalEpisodes || 24;

        const seasonEpisodes = [];
        for (let ep = 1; ep <= maxEp; ep++) {
          const streamUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${ep}`;
          const epObj = {
            id: `ep-${sId}-${seNum}-${ep}`,
            episode: ep,
            episodeNumber: ep,
            number: String(ep).padStart(2, '0'),
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
          year: detail.year || '2023',
          episodesCount: seasonEpisodes.length,
          episodes: seasonEpisodes
        });
      }

      const seriesRecord = {
        id: internalId,
        subjectId: sId,
        detailPath: dPath,
        title: item.title,
        year: String(detail.year || '2023'),
        rating: String(detail.rating || '8.8'),
        imdbRating: String(detail.rating || '8.8'),
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
        category: 'Chinese Drama',
        industry: 'Chinese',
        country: 'China',
        language: item.dub,
        dubLanguage: item.dub,
        audioTracks: [audioLabel],
        selectedAudio: audioLabel,
        seasonsCount: seasons.length,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: `${detail.year || '2023'}-01-01`,
        originalReleaseDate: `${detail.year || '2023'}-01-01`,
        badgeLeft: 'Trending',
        badgeRight: 'Chinese',
        views: 1600,
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
      for (const cSeries of CHINESE_SERIES) {
        const full = content.series.find(s => s.subjectId === cSeries.id);
        if (full) {
          const sIdx = seed.series.findIndex(s => s.subjectId === cSeries.id || s.id === full.id);
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

  console.log('🎉 Done syncing all Chinese dramas!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
