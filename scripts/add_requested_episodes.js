const fs = require('fs');
const path = require('path');
const moviebox = require('../services/movieboxService');

async function main() {
  console.log('=== ADDING REQUESTED EPISODES ===\n');
  const contentPath = path.join(__dirname, '../data/content.json');
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  function formatCaptions(rawCaptions, se, ep) {
    if (!Array.isArray(rawCaptions)) return [];
    return rawCaptions.map((c, idx) => ({
      id: `s${se}ep${ep}_sub_${(c.lanName || c.language || 'sub').replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0980-\u09FF]/g, '_')}_${idx}`,
      label: c.lanName || c.language || 'English',
      language: (c.language || c.lanName || 'English').toLowerCase(),
      srclang: (c.language || c.lanName || 'English').toLowerCase(),
      src: c.url,
      url: c.url,
      format: 'srt'
    }));
  }

  // 1. Dive into You [Original Audio] (Episodes 11, 12)
  console.log('1. Processing Dive into You [Original Audio] (Episodes 11 & 12)...');
  const dive = content.series.find(s => s.id === 'mb-s-3870036899930730728');
  if (dive) {
    const sId = '3870036899930730728';
    const dPath = 'dive-to-you-G56UVRdOSB4';
    const still = dive.poster || (dive.episodes && dive.episodes[0]?.still) || '';

    for (const ep of [11, 12]) {
      console.log(`  Fetching metadata for Ep ${ep}...`);
      const resolved = await moviebox.resolveMedia(sId, dPath, 1, ep);
      const caps = formatCaptions(resolved?.captions, 1, ep);
      const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=${ep}`;

      const epObj = {
        number: String(ep).padStart(2, '0'),
        episode: ep,
        episodeNumber: ep,
        season: 1,
        seasonNumber: 1,
        title: `Episode ${ep}`,
        name: `Episode ${ep}`,
        duration: '45m',
        still: still,
        stillPath: still,
        streamUrl: autoRenewUrl,
        audioTracks: ['Original Audio'],
        selectedAudio: 'Original Audio',
        servers: [
          {
            name: `Server 1 (Original Audio - Auto-Renewing 720p)`,
            url: autoRenewUrl,
            quality: '720p',
            audio: 'Original Audio',
            isDirect: true
          },
          {
            name: `Server 2 (Auto Failover)`,
            url: autoRenewUrl,
            quality: '480p',
            audio: 'Original Audio',
            isDirect: true
          }
        ],
        captions: caps
      };

      dive.episodes = (dive.episodes || []).filter(e => e.episode !== ep && e.episodeNumber !== ep);
      dive.episodes.push(epObj);
    }

    dive.episodes.sort((a, b) => (a.episode || a.episodeNumber) - (b.episode || b.episodeNumber));
    if (dive.seasons && dive.seasons[0]) {
      dive.seasons[0].episodes = dive.episodes;
      dive.seasons[0].episodesCount = dive.episodes.length;
    }
    dive.episodesCount = dive.episodes.length;
    dive.duration = `${dive.episodes.length} Episodes`;
    dive.addedAt = new Date().toISOString();
    console.log(`  ✅ Dive into You now has ${dive.episodes.length} episodes!`);
  } else {
    console.warn('  ❌ Dive into You not found!');
  }

  // 2. 100 Days of Deception [Original Audio] (Episode 8)
  console.log('\n2. Processing 100 Days of Deception [Original Audio] (Episode 8)...');
  const dec = content.series.find(s => s.id === 'mb-s-5844444070034161864');
  if (dec) {
    const sId = '5844444070034161864';
    const dPath = '100-days-of-deception-Mw4TijbCJX6';
    const still = dec.poster || (dec.episodes && dec.episodes[0]?.still) || '';
    const ep = 8;

    console.log(`  Fetching metadata for Ep ${ep}...`);
    const resolved = await moviebox.resolveMedia(sId, dPath, 1, ep);
    const caps = formatCaptions(resolved?.captions, 1, ep);
    const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=${ep}`;

    const epObj = {
      number: String(ep).padStart(2, '0'),
      episode: ep,
      episodeNumber: ep,
      season: 1,
      seasonNumber: 1,
      title: `Episode ${ep}`,
      name: `Episode ${ep}`,
      duration: '45m',
      still: still,
      stillPath: still,
      streamUrl: autoRenewUrl,
      audioTracks: ['Original Audio'],
      selectedAudio: 'Original Audio',
      servers: [
        {
          name: `Server 1 (Original Audio - Auto-Renewing 720p)`,
          url: autoRenewUrl,
          quality: '720p',
          audio: 'Original Audio',
          isDirect: true
        },
        {
          name: `Server 2 (Auto Failover)`,
          url: autoRenewUrl,
          quality: '480p',
          audio: 'Original Audio',
          isDirect: true
        }
      ],
      captions: caps
    };

    dec.episodes = (dec.episodes || []).filter(e => e.episode !== ep && e.episodeNumber !== ep);
    dec.episodes.push(epObj);
    dec.episodes.sort((a, b) => (a.episode || a.episodeNumber) - (b.episode || b.episodeNumber));
    if (dec.seasons && dec.seasons[0]) {
      dec.seasons[0].episodes = dec.episodes;
      dec.seasons[0].episodesCount = dec.episodes.length;
    }
    dec.episodesCount = dec.episodes.length;
    dec.duration = `${dec.episodes.length} Episodes`;
    dec.addedAt = new Date().toISOString();
    console.log(`  ✅ 100 Days of Deception now has ${dec.episodes.length} episodes!`);
  } else {
    console.warn('  ❌ 100 Days of Deception not found!');
  }

  // 3. Doctor X: Age of the White Mafia (Episodes 7 & 8)
  console.log('\n3. Processing Doctor X: Age of the White Mafia (Episodes 7 & 8)...');
  const doc = content.series.find(s => s.id === 'mb-s-8175590432395742648');
  if (doc) {
    const sId = '8175590432395742648';
    const dPath = 'doctor-x-age-of-the-white-mafia-QkR7Hh2iWJ9';
    const still = doc.poster || (doc.episodes && doc.episodes[0]?.still) || '';

    for (const ep of [7, 8]) {
      console.log(`  Fetching metadata for Ep ${ep}...`);
      const resolved = await moviebox.resolveMedia(sId, dPath, 1, ep);
      const caps = formatCaptions(resolved?.captions, 1, ep);
      const autoRenewUrl = `/api/moviebox/stream?id=${sId}&path=${encodeURIComponent(dPath)}&se=1&ep=${ep}`;

      const epObj = {
        number: String(ep).padStart(2, '0'),
        episode: ep,
        episodeNumber: ep,
        season: 1,
        seasonNumber: 1,
        title: `Episode ${ep}`,
        name: `Episode ${ep}`,
        duration: '45m',
        still: still,
        stillPath: still,
        streamUrl: autoRenewUrl,
        audioTracks: ['Original Audio'],
        selectedAudio: 'Original Audio',
        servers: [
          {
            name: `Server 1 (Original Audio - Auto-Renewing 720p)`,
            url: autoRenewUrl,
            quality: '720p',
            audio: 'Original Audio',
            isDirect: true
          },
          {
            name: `Server 2 (Auto Failover)`,
            url: autoRenewUrl,
            quality: '480p',
            audio: 'Original Audio',
            isDirect: true
          }
        ],
        captions: caps
      };

      doc.episodes = (doc.episodes || []).filter(e => e.episode !== ep && e.episodeNumber !== ep);
      doc.episodes.push(epObj);
    }

    doc.episodes.sort((a, b) => (a.episode || a.episodeNumber) - (b.episode || b.episodeNumber));
    if (doc.seasons && doc.seasons[0]) {
      doc.seasons[0].episodes = doc.episodes;
      doc.seasons[0].episodesCount = doc.episodes.length;
    }
    doc.episodesCount = doc.episodes.length;
    doc.duration = `${doc.episodes.length} Episodes`;
    doc.addedAt = new Date().toISOString();
    console.log(`  ✅ Doctor X now has ${doc.episodes.length} episodes!`);
  } else {
    console.warn('  ❌ Doctor X not found!');
  }

  // Save to content.json and backup
  console.log('\nWriting updated catalog to data/content.json and data/content.backup.json...');
  fs.writeFileSync(contentPath, JSON.stringify(content));
  const backupPath = path.join(__dirname, '../data/content.backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(content));

  // Sync to seed files
  const seedPaths = [
    path.join(__dirname, '../public/seed-content.json'),
    path.join(__dirname, '../android/app/src/main/assets/public/seed-content.json')
  ];
  for (const sp of seedPaths) {
    if (fs.existsSync(sp)) {
      const seed = JSON.parse(fs.readFileSync(sp, 'utf8'));
      for (const updatedS of [dive, dec, doc]) {
        if (!updatedS) continue;
        const idx = seed.series.findIndex(s => s.id === updatedS.id);
        if (idx !== -1) {
          seed.series[idx] = updatedS;
        } else {
          seed.series.unshift(updatedS);
        }
      }
      fs.writeFileSync(sp, JSON.stringify(seed));
      console.log(`  Updated seed file: ${sp}`);
    }
  }

  console.log('\n🎉 ALL REQUESTED EPISODES ADDED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
