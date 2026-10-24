/**
 * FOBS TV - Master Content & Stream Sync Script
 * 
 * Synchronizes and validates all movies, series (all seasons & episodes), 
 * and Live TV channels across data/content.json, public/seed-content.json,
 * and android/app/src/main/assets/public/seed-content.json.
 */

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

console.log('🚀 Running Master VPS Content & Stream Sync...');

if (!fs.existsSync(CONTENT_FILE)) {
  console.error('❌ data/content.json not found!');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

// 1. Process Series
let fixedEmptySeries = 0;
let fixedUndefinedStreams = 0;
let totalEpisodesFixed = 0;

data.series.forEach((s) => {
  // If s.seasons exists with episodes, always keep s.episodes cleanly synced with season 1
  if (s.seasons && s.seasons.length > 0 && s.seasons[0].episodes && s.seasons[0].episodes.length > 0) {
    s.episodes = s.seasons[0].episodes;
    fixedEmptySeries++;

    // Special handling for Sen Çal Kapımı (missing streamUrl on season episodes)
    if (s.title && s.title.includes('Sen Çal Kapımı')) {
      s.seasons.forEach((season) => {
        (season.episodes || []).forEach((ep, idx) => {
          const epNum = ep.episode || (idx + 1);
          if (!ep.streamUrl) {
            ep.streamUrl = ep.servers?.[0]?.url || 
                           ep.audioTracks?.['Hindi dub'] || 
                           `/api/moviebox/stream?id=7315143878922094712&path=love-is-in-the-air-hindi-EMidHb4rnI8&se=1&ep=${epNum}`;
            fixedUndefinedStreams++;
          }
          if (!ep.servers || ep.servers.length <= 1) {
            ep.servers = [
              {
                name: 'Server 1 (MovieBox Hindi HD)',
                url: ep.streamUrl,
                isDirect: true
              },
              {
                name: 'Server 2 (Auto-Renewing VPS MovieBox Stream)',
                url: `/api/moviebox/stream?id=7315143878922094712&path=love-is-in-the-air-hindi-EMidHb4rnI8&se=1&ep=${epNum}`,
                isDirect: true
              },
              {
                name: 'Server 3 (MultiEmbed HD)',
                url: `https://multiembed.mov/?video_id=104877&tmdb=1&s=1&e=${epNum}`,
                isDirect: false
              }
            ];
          }
        });
      });
      // Resync top-level episodes
      s.episodes = s.seasons[0].episodes;
    }

    // Ensure all episodes across all seasons have valid streamUrl and servers
    s.seasons.forEach((season) => {
      (season.episodes || []).forEach((ep, idx) => {
        if (!ep.streamUrl && ep.servers && ep.servers.length > 0) {
          ep.streamUrl = ep.servers[0].url;
          fixedUndefinedStreams++;
        }
        totalEpisodesFixed++;
      });
    });

    // Ensure s.episodes has matching streamUrl
    if (s.episodes && s.episodes.length > 0) {
      s.episodes.forEach((ep) => {
        if (!ep.streamUrl && ep.servers && ep.servers.length > 0) {
          ep.streamUrl = ep.servers[0].url;
        }
      });
      s.streamUrl = s.episodes[0].streamUrl;
      s.servers = s.episodes[0].servers;
    }
  } else if (s.episodes && s.episodes.length > 0) {
    // Has episodes but no seasons structure
    s.seasons = [
      {
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: s.episodes.length,
        episodes: s.episodes
      }
    ];
    s.seasonsCount = 1;
    s.streamUrl = s.episodes[0].streamUrl;
    s.servers = s.episodes[0].servers;
  }
});

console.log(`\nSeries Sync Summary:`);
console.log(`- Fixed empty top-level series: ${fixedEmptySeries}`);
console.log(`- Fixed undefined stream URLs: ${fixedUndefinedStreams}`);
console.log(`- Total series episodes verified: ${totalEpisodesFixed}`);

// 2. Validate Movies
console.log(`\nValidating Movies (${data.movies.length})...`);
data.movies.forEach((m) => {
  if (!m.streamUrl && m.servers && m.servers.length > 0) {
    m.streamUrl = m.servers[0].url;
  }
});

// 3. Validate Live TV
console.log(`Validating Live TV Channels (${data.liveTv.length})...`);
data.liveTv.forEach((ch) => {
  if (!ch.streamUrl && ch.servers && ch.servers.length > 0) {
    ch.streamUrl = ch.servers[0].url;
  }
});

// 4. Save synced data across all locations
const jsonString = JSON.stringify(data, null, 2);

fs.writeFileSync(CONTENT_FILE, jsonString, 'utf8');
console.log(`✅ Saved updated content to ${CONTENT_FILE}`);

fs.writeFileSync(PUBLIC_SEED, jsonString, 'utf8');
console.log(`✅ Saved updated content to ${PUBLIC_SEED}`);

if (fs.existsSync(path.dirname(ANDROID_SEED))) {
  fs.writeFileSync(ANDROID_SEED, jsonString, 'utf8');
  console.log(`✅ Saved updated content to ${ANDROID_SEED}`);
}

console.log('\n🎉 Master content sync completed successfully!');
