const fs = require('fs');
const path = require('path');
const axios = require('axios');
const appDir = path.resolve(__dirname, '..');
const mb = require(path.join(appDir, 'services', 'movieboxService'));
const subtitleService = require(path.join(appDir, 'services', 'subtitleService'));
const adminService = require(path.join(appDir, 'services', 'adminService'));

async function main() {
  console.log('=== Adding The Remarried Empress with Bangla Subtitles ===');
  const subjectId = '579116273137862480';
  const detailPath = 'the-remarried-empress-aVOAhKemMG';

  // 1. Fetch details
  const detail = await mb.getDetail(subjectId, detailPath);
  console.log('Got detail:', detail.title, 'Total episodes:', detail.totalEpisodes);

  const subDir = path.join(appDir, 'public', 'subtitles');
  const androidSubDir = path.join(appDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'subtitles');
  [subDir, androidSubDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const episodes = [];

  for (let ep = 1; ep <= 4; ep++) {
    console.log(`\nProcessing Episode ${ep}...`);
    const media = await mb.resolveMedia(subjectId, detailPath, 1, ep);
    const enCap = media.captions.find(c => (c.language || '').toLowerCase().includes('en') || (c.lan || '').toLowerCase().includes('en'));

    const bnFileName = `the_remarried_empress_s1_ep${ep}_bn.vtt`;
    const enFileName = `the_remarried_empress_s1_ep${ep}_en.vtt`;

    let bnVtt = '';
    let enVtt = '';

    if (enCap && enCap.url) {
      console.log(`Downloading and translating subtitle for Ep ${ep}...`);
      try {
        const enRes = await axios.get(enCap.url, { responseType: 'text', timeout: 10000 });
        enVtt = subtitleService.srtToVtt(enRes.data);
        fs.writeFileSync(path.join(subDir, enFileName), enVtt, 'utf8');
        fs.writeFileSync(path.join(androidSubDir, enFileName), enVtt, 'utf8');
      } catch (err) {
        console.warn(`Could not save English subtitle for Ep ${ep}:`, err.message);
      }

      try {
        bnVtt = await subtitleService.getOrTranslateToBangla(enCap.url, `the_remarried_empress_s1_ep${ep}_bn`);
        if (bnVtt) {
          fs.writeFileSync(path.join(subDir, bnFileName), bnVtt, 'utf8');
          fs.writeFileSync(path.join(androidSubDir, bnFileName), bnVtt, 'utf8');
          console.log(`✓ Saved Bangla VTT for Episode ${ep} (${bnVtt.length} bytes)`);
        }
      } catch (err) {
        console.warn(`Translation error Ep ${ep}:`, err.message);
      }
    }

    const captions = [
      {
        id: `remarried_ep${ep}_sub_bn`,
        label: 'বাংলা (Bangla SubSource)',
        language: 'bn',
        srclang: 'bn',
        source: 'SubSource / Verified',
        src: `/subtitles/${bnFileName}`,
        url: `/subtitles/${bnFileName}`,
        format: 'vtt'
      },
      {
        id: `remarried_ep${ep}_sub_en`,
        label: 'English (Official)',
        language: 'en',
        srclang: 'en',
        source: 'MovieBox / Official',
        src: `/subtitles/${enFileName}`,
        url: `/subtitles/${enFileName}`,
        format: 'vtt'
      }
    ];

    episodes.push({
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      season: 1,
      title: `Episode ${ep}`,
      duration: '55 min',
      still: detail.cover || detail.poster || 'https://pbcdnw.aoneroom.com/image/2026/11/03/6e3ae85e6bc59b34d165d6239054789e.jpg',
      stillPath: detail.cover || detail.poster || 'https://pbcdnw.aoneroom.com/image/2026/11/03/6e3ae85e6bc59b34d165d6239054789e.jpg',
      streamUrl: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}`,
      directStreamUrl: media.streamUrl,
      servers: [
        {
          name: 'Server 1 (Auto-Renewing 1080p HD)',
          url: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=${ep}`,
          quality: '1080p',
          audio: 'Korean (Original)',
          isDirect: true
        },
        {
          name: 'Server 2 (Direct Fast CDN 1080p)',
          url: media.streamUrl,
          quality: '1080p',
          audio: 'Korean (Original Audio)',
          isDirect: true
        }
      ],
      qualities: media.qualities || [],
      captions: captions,
      subtitles: captions
    });
  }

  const seriesObj = {
    id: `mb-s-${subjectId}`,
    subjectId: subjectId,
    detailPath: detailPath,
    title: 'The Remarried Empress',
    nativeTitle: '재혼 황후',
    type: 'series',
    category: 'Korean Series',
    industry: 'Korean',
    language: 'Korean',
    dubLanguage: 'Original Audio + Bangla Subtitle',
    hasBanglaSub: true,
    year: '2026',
    rating: '9.4',
    imdbRating: '9.4',
    poster: 'https://pbcdnw.aoneroom.com/image/2026/11/03/6e3ae85e6bc59b34d165d6239054789e.jpg',
    backdrop: 'https://pbcdnw.aoneroom.com/image/2026/11/03/6e3ae85e6bc59b34d165d6239054789e.jpg',
    cover: 'https://pbcdnw.aoneroom.com/image/2026/11/03/6e3ae85e6bc59b34d165d6239054789e.jpg',
    duration: '4 Episodes',
    episodesCount: 4,
    seasonsCount: 1,
    description: 'Navier Ellie Trovi was an empress perfect in every way -- intelligent, courageous, and socially adept. However, the Emperor wants a mistress, not a queen. When Navier is forced to divorce, she chooses to remarry Heinrey, king of the neighboring Western Empire!',
    badgeLeft: 'Trending #1',
    badgeRight: 'Bangla Sub',
    views: 8940,
    streamUrl: `/api/moviebox/stream?id=${subjectId}&path=${detailPath}&se=1&ep=1`,
    directStreamUrl: episodes[0]?.directStreamUrl,
    servers: episodes[0]?.servers || [],
    seasons: [
      {
        seasonNumber: 1,
        season: 1,
        title: 'Season 1',
        name: 'Season 1',
        year: '2026',
        episodesCount: 4,
        episodes: episodes
      }
    ],
    createdAt: new Date().toISOString(),
    addedAt: new Date().toISOString()
  };

  // Add to content.json
  const content = adminService.readContent();
  content.series = content.series || [];

  // Remove duplicate if exists
  content.series = content.series.filter(s => String(s.subjectId) !== String(subjectId) && s.id !== `mb-s-${subjectId}`);

  // Insert at top of series list
  content.series.unshift(seriesObj);

  // Set as top featured if desired or leave current
  adminService.writeContent(content);
  console.log('✓ Successfully added The Remarried Empress to content.json, content.backup.json, and content.local.json');

  // Update seed files
  ['public/seed-content.json', 'android/app/src/main/assets/public/seed-content.json'].forEach(p => {
    const full = path.join(appDir, p);
    if (fs.existsSync(full)) {
      try {
        const seed = JSON.parse(fs.readFileSync(full, 'utf8'));
        seed.series = seed.series || [];
        seed.series = seed.series.filter(s => String(s.subjectId) !== String(subjectId) && s.id !== `mb-s-${subjectId}`);
        seed.series.unshift(seriesObj);
        fs.writeFileSync(full, JSON.stringify(seed), 'utf8');
        console.log(`✓ Synced seed file: ${p}`);
      } catch (e) {
        console.warn(`Error updating ${p}:`, e.message);
      }
    }
  });

  console.log('\n=== DONE: The Remarried Empress with Bangla Subtitle added successfully! ===');
}

main().catch(console.error);

