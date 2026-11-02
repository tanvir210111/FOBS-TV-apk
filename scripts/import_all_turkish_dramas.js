const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

// Verified Turkish Drama Catalog on MovieBox (Hindi / Urdu / Bengali Dubbed, 2016 - 2026)
const TURKISH_SERIES = [
  { id: '1247558934647423824', path: 'afili-ask-hindi-oOtRtEEP9u1', title: 'Afili Aşk (Love Trap) [Hindi]', dub: 'Hindi' },
  { id: '3256552465994511320', path: 'kan-cicekleri-hindi-iDHLwnM2zS3', title: 'Kan Çiçekleri (Blood Flowers) [Hindi]', dub: 'Hindi' },
  { id: '7259909624538039616', path: 'alparslan-the-great-seljuks-hindi-AyazhaIsiE8', title: 'Alparslan: The Great Seljuks [Hindi]', dub: 'Hindi' },
  { id: '4989388445157065712', path: 'mehmed-fetihler-sultani-urdu-M8gcdx1szW5', title: 'Mehmed: Fetihler Sultanı [Urdu]', dub: 'Urdu' },
  { id: '8404864321293091424', path: 'dirilis-ertugrul-bengali-aPlxFFNmS0a', title: 'Diriliş: Ertuğrul [Bengali]', dub: 'Bengali' },
  { id: '581344592902195104', path: 'saladin-the-conquerer-of-jerusalem-urdu-MaX14zZyWG', title: 'Kudüs Fatihi Selahaddin Eyyubi [Urdu]', dub: 'Urdu' },
  { id: '892501361135337920', path: 'saladin-the-conquerer-of-jerusalem-bengali-yJqABXgFV31', title: 'Kudüs Fatihi Selahaddin Eyyubi [Bengali]', dub: 'Bengali' },
  { id: '1841822979227796304', path: 'barbaroslar-urdu-O568rpgz3c2', title: 'Barbaroslar: Akdeniz\'in Kılıcı [Urdu]', dub: 'Urdu' },
  { id: '8946492545228571504', path: 'establishment-osman-bengali-Qc3VXhU1TEa', title: 'Kuruluş: Osman [Bengali]', dub: 'Bengali' },
  { id: '7555151083828823576', path: 'payitaht-abdulhamid-urdu-I4dOBCFF609', title: 'Payitaht: Abdülhamid [Urdu]', dub: 'Urdu' },
  { id: '4689621441640367872', path: 'thank-you-next-hindi-4cnfLkZvqA5', title: 'Thank You, Next (Kimler Geldi Kimler Geçti) [Hindi]', dub: 'Hindi' },
  { id: '4871878825522725584', path: 'shahmaran-hindi-q5ICEMUfTN5', title: 'Şahmaran [Hindi]', dub: 'Hindi' },
  { id: '4193779415916102104', path: 'as-the-crow-flies-hindi-dub-bengali-SjIFApmyNZ4', title: 'As the Crow Flies (Kuş Uçuşu) [Hindi & Bengali]', dub: 'Hindi' },
  { id: '8565709128541373512', path: 'rise-of-empires-ottoman-hindi-g2dDyHo2Lca', title: 'Rise of Empires: Ottoman [Hindi]', dub: 'Hindi' },
  { id: '4560477983961665488', path: 'tozkoparan-iskender-hindi-GzNh9lk2Tq5', title: 'Tozkoparan İskender [Hindi]', dub: 'Hindi' },
  { id: '2706073799983877168', path: 'golden-boy-hindi-84Y8uLuQTd3', title: 'Golden Boy (Yalı Çapkını) [Hindi]', dub: 'Hindi' },
  { id: '9220563694105543016', path: 'emanet-urdu-QCufIykh8Za', title: 'Emanet (Legacy) [Urdu]', dub: 'Urdu' },
  { id: '2612327287357932312', path: 'love-doesnt-understand-words-urdu-6x374QauY63', title: 'Aşk Laftan Anlamaz (Pyaar Lafzon Mein Kahan) [Urdu]', dub: 'Urdu' },
  { id: '712065985595016128', path: 'dolunay-urdu-cisZnZIgBQ', title: 'Dolunay (Full Moon) [Urdu]', dub: 'Urdu' },
  { id: '3361138290319284112', path: 'bay-yanlis-urdu-wGbdkAJ7mU4', title: 'Bay Yanlış (Mr. Wrong) [Urdu]', dub: 'Urdu' },
  { id: '1984686467804792208', path: 'meryem-urdu-g4W00fSSBm2', title: 'Meryem [Urdu]', dub: 'Urdu' },
  { id: '7830750270400726088', path: 'cruel-istanbul-urdu-mPimUQZUsk9', title: 'Cruel Istanbul (Zalim İstanbul) [Urdu]', dub: 'Urdu' },
  { id: '6737443942654510536', path: 'price-of-passion-hindi-oGjTvQ0zH18', title: 'Price of Passion (Siyah Beyaz Aşk) [Hindi]', dub: 'Hindi' },
  { id: '4214828610936527512', path: 'endless-love-bengali-gIwoiivXl15', title: 'Endless Love (Kara Sevda) [Bengali]', dub: 'Bengali' },
  { id: '1193927351604838896', path: 'kuzgun-hindi-cMXlAyoccq1', title: 'Kuzgun [Hindi]', dub: 'Hindi' },
  { id: '3690507852684096472', path: 'yaz-sarkisi-hindi-aLxzCj2zCo4', title: 'Yaz Şarkısı (Summer Song) [Hindi]', dub: 'Hindi' },
  { id: '5657685433724159832', path: 'esref-ruya-bengali-YSQ5SM4gWJ6', title: 'Eşref Rüya [Bengali]', dub: 'Bengali' },
  { id: '2512547960051876232', path: 'seven-ne-yapmaz-hindi-YsnhlPLuBZ2', title: 'Seven Ne Yapmaz [Hindi]', dub: 'Hindi' },
  { id: '8307847164764586704', path: 'brave-and-beautiful-hindi-4Swx0eK1IT9', title: 'Brave and Beautiful (Cesur ve Güzel) [Hindi]', dub: 'Hindi' },
  { id: '6324858410559309120', path: 'our-story-hindi-02dcpbXUdx7', title: 'Our Story (Bizim Hikaye) [Hindi]', dub: 'Hindi' },
  { id: '121066189174046744', path: 'a-miracle-hindi-2HfOq92uW8', title: 'A Miracle (Mucize Doktor) [Hindi]', dub: 'Hindi' },
  { id: '6166053747136365888', path: 'tatli-intikam-hindi-sgtUP1GAul7', title: 'Tatlı İntikam (Sweet Revenge) [Hindi]', dub: 'Hindi' },
  { id: '4016614641865476056', path: 'a-nights-tale-hindi-2RAIjdx8IM4', title: 'A Night\'s Tale (Bir Gece Masalı) [Hindi]', dub: 'Hindi' },
  { id: '395008158319740832', path: 'dont-let-go-of-my-hand-urdu-mpXCI8M8bt', title: 'Don\'t Let Go of My Hand (Elimi Bırakma) [Urdu]', dub: 'Urdu' },
  { id: '4088850912448578496', path: 'sen-anlat-karadeniz-urdu-a7VazgNY2S4', title: 'Sen Anlat Karadeniz (Lifeline) [Urdu]', dub: 'Urdu' },
  { id: '5287112947985182264', path: 'crash-hindi-U23NIm42zi6', title: 'Crash (Çarpışma) [Hindi]', dub: 'Hindi' },
  { id: '300193448135639872', path: 'flames-of-fate-hindi-Ms0jQZ7Tam', title: 'Flames of Fate (Alev Alev) [Hindi]', dub: 'Hindi' },
  { id: '8223533722633733064', path: 'hear-me-hindi-SV3ZkN2StN9', title: 'Hear Me (Duy Beni) [Hindi]', dub: 'Hindi' },
  { id: '7818895120744824984', path: 'arafta-hindi-0y70kiBCAj9', title: 'Arafta [Hindi]', dub: 'Hindi' }
];

async function main() {
  console.log(`=== IMPORTING ALL TURKISH DRAMAS (2016-2026) IN HINDI/URDU/BANGLA ===`);
  console.log(`Target series count: ${TURKISH_SERIES.length}\n`);

  const contentFile = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  content.series = content.series || [];

  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < TURKISH_SERIES.length; i++) {
    const item = TURKISH_SERIES[i];
    const sId = item.id;
    const dPath = item.path;
    const internalId = `mb-s-${sId}`;

    try {
      console.log(`[${i + 1}/${TURKISH_SERIES.length}] Processing "${item.title}" (${sId})...`);
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
        : [{ se: 1, maxEp: detail.totalEpisodes || 16 }];

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
        if (!maxEp || maxEp <= 0) maxEp = detail.totalEpisodes || 16;

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
          year: detail.year || '2022',
          episodesCount: seasonEpisodes.length,
          episodes: seasonEpisodes
        });
      }

      const seriesRecord = {
        id: internalId,
        subjectId: sId,
        detailPath: dPath,
        title: item.title,
        year: String(detail.year || '2022'),
        rating: String(detail.rating || '8.5'),
        imdbRating: String(detail.rating || '8.5'),
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
        category: 'Turkish Drama',
        industry: 'Turkish',
        country: 'Turkey',
        language: item.dub,
        dubLanguage: item.dub,
        audioTracks: [audioLabel],
        selectedAudio: audioLabel,
        seasonsCount: seasons.length,
        addedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        releaseDate: `${detail.year || '2022'}-01-01`,
        originalReleaseDate: `${detail.year || '2022'}-01-01`,
        badgeLeft: 'Trending',
        badgeRight: 'Turkish',
        views: 1500,
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
      for (const tSeries of TURKISH_SERIES) {
        const full = content.series.find(s => s.subjectId === tSeries.id);
        if (full) {
          const sIdx = seed.series.findIndex(s => s.subjectId === tSeries.id || s.id === full.id);
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

  console.log('🎉 Done syncing all Turkish dramas!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
