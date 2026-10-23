const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

async function fetchTmdbSeason(tvId, seasonNum) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${TMDB_API_KEY}`);
    if (res.status === 200) {
      return await res.json();
    }
  } catch (e) {
    console.error(`Error fetching TV ${tvId} Season ${seasonNum}:`, e.message);
  }
  return null;
}

function buildEpisodeServers(tmdbId, seasonNum, epNum, epTitle, duration) {
  const sPad = String(seasonNum).padStart(2, '0');
  const ePad = String(epNum).padStart(2, '0');
  const vidlinkUrl = `https://vidlink.pro/tv/${tmdbId}/${seasonNum}/${epNum}`;
  const multiembedUrl = `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${seasonNum}&e=${epNum}`;
  const vidsrcUrl = `https://vidsrc.to/embed/tv/${tmdbId}/${seasonNum}/${epNum}`;

  return {
    number: ePad,
    season: seasonNum,
    title: epTitle || `Episode ${epNum}`,
    duration: duration ? `${duration}m` : '45m',
    streamUrl: vidlinkUrl,
    servers: [
      {
        name: 'Server 1 (Vidlink Fast)',
        url: vidlinkUrl
      },
      {
        name: 'Server 2 (Multiembed HD)',
        url: multiembedUrl
      },
      {
        name: 'Server 3 (VidSrc)',
        url: vidsrcUrl
      }
    ],
    audioTracks: {
      'Hindi / Multi Audio': vidlinkUrl,
      'Original Audio': multiembedUrl
    }
  };
}

async function fixSeries() {
  console.log('Fetching TMDB data for Sen Çal Kapımı (104877)...');
  const sckS1 = await fetchTmdbSeason(104877, 1);
  const sckS2 = await fetchTmdbSeason(104877, 2);

  const sckSeason1Episodes = (sckS1?.episodes || []).map((ep, idx) => 
    buildEpisodeServers(104877, 1, idx + 1, ep.name, ep.runtime || 120)
  );
  const sckSeason2Episodes = (sckS2?.episodes || []).map((ep, idx) => 
    buildEpisodeServers(104877, 2, idx + 1, ep.name, ep.runtime || 120)
  );

  console.log(`Sen Çal Kapımı: Season 1 has ${sckSeason1Episodes.length} eps, Season 2 has ${sckSeason2Episodes.length} eps`);

  console.log('Fetching TMDB data for Rana Naidu (203202)...');
  const rnS1 = await fetchTmdbSeason(203202, 1);
  const rnS2 = await fetchTmdbSeason(203202, 2);

  const rnSeason1Episodes = (rnS1?.episodes || []).map((ep, idx) => 
    buildEpisodeServers(203202, 1, idx + 1, ep.name, ep.runtime || 50)
  );
  const rnSeason2Episodes = (rnS2?.episodes || []).map((ep, idx) => 
    buildEpisodeServers(203202, 2, idx + 1, ep.name, ep.runtime || 50)
  );

  console.log(`Rana Naidu: Season 1 has ${rnSeason1Episodes.length} eps, Season 2 has ${rnSeason2Episodes.length} eps`);

  console.log('Fetching TMDB data for Dhootha (200946)...');
  const dhS1 = await fetchTmdbSeason(200946, 1);
  const dhSeason1Episodes = (dhS1?.episodes || []).map((ep, idx) => 
    buildEpisodeServers(200946, 1, idx + 1, ep.name, ep.runtime || 45)
  );

  console.log(`Dhootha: Season 1 has ${dhSeason1Episodes.length} eps`);

  // Target content files
  const filePaths = [
    path.join(__dirname, '..', 'data', 'content.json'),
    path.join(__dirname, '..', 'public', 'seed-content.json'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
  ];

  for (const fPath of filePaths) {
    if (!fs.existsSync(fPath)) continue;
    const content = JSON.parse(fs.readFileSync(fPath, 'utf8'));

    // 1. Fix Sen Çal Kapımı (Preserve 140 full episodes if present)
    const sck = content.series.find(s => s.id === 'mb-s-7315143878922094712' || s.id === 'turkish-s-104877' || s.title.includes('Sen Çal Kapımı'));
    if (sck && (!sck.episodes || sck.episodes.length < 100)) {
      sck.seasonsCount = 1;
      sck.seasons = [
        {
          seasonNumber: 1,
          name: 'Season 1 (140 Eps)',
          episodeCount: 140,
          episodes: sck.episodes
        }
      ];
    }


    // 2. Fix Rana Naidu
    const rn = content.series.find(s => s.id === 'mb-s-south-rananaidu' || s.title.includes('Rana Naidu'));
    if (rn) {
      rn.poster = 'https://image.tmdb.org/t/p/w500/4kUF7cO76W4vEx70KVfwmju6Vud.jpg';
      rn.backdrop = 'https://image.tmdb.org/t/p/original/m9m5FpW5q9R37qC8wH5P3A3bQ4z.jpg';
      rn.seasonsCount = 2;
      rn.seasons = [
        {
          seasonNumber: 1,
          name: 'Season 1 (10 Eps)',
          episodeCount: rnSeason1Episodes.length,
          episodes: rnSeason1Episodes
        },
        {
          seasonNumber: 2,
          name: 'Season 2 (8 Eps)',
          episodeCount: rnSeason2Episodes.length,
          episodes: rnSeason2Episodes
        }
      ];
      rn.episodes = rnSeason1Episodes;
      rn.streamUrl = rnSeason1Episodes[0].streamUrl;
      rn.servers = rnSeason1Episodes[0].servers;
      console.log(`Updated Rana Naidu in ${path.basename(fPath)}`);
    }

    // 3. Fix Dhootha
    const dh = content.series.find(s => s.id === 'mb-s-south-dhootha' || s.title.includes('Dhootha'));
    if (dh) {
      dh.poster = 'https://image.tmdb.org/t/p/w500/jMegWqCj8z58na8RG8ytlPJ7gGm.jpg';
      dh.backdrop = 'https://image.tmdb.org/t/p/original/n2Z999X8wW3a2K5jV1hE5v6q2Yn.jpg';
      dh.seasonsCount = 1;
      dh.seasons = [
        {
          seasonNumber: 1,
          name: 'Season 1 (8 Eps)',
          episodeCount: dhSeason1Episodes.length,
          episodes: dhSeason1Episodes
        }
      ];
      dh.episodes = dhSeason1Episodes;
      dh.streamUrl = dhSeason1Episodes[0].streamUrl;
      dh.servers = dhSeason1Episodes[0].servers;
      console.log(`Updated Dhootha in ${path.basename(fPath)}`);
    }

    // 4. Fix So I Love You Very Much
    const sily = content.series.find(s => s.id === 'mb-s-5698833987452421616' || s.title.includes('So I Love You'));
    if (sily) {
      sily.poster = 'https://image.tmdb.org/t/p/w500/b52ToaPKbhB4egJVfzAW3TRJsaH.jpg';
      sily.backdrop = 'https://image.tmdb.org/t/p/original/UF63Lldx2GBx7d83CuD3rXzDgG.jpg';
      console.log(`Updated So I Love You Very Much in ${path.basename(fPath)}`);
    }

    // 5. Ensure EVERY series has valid seasons structure
    content.series.forEach(s => {
      if (!s.seasons || s.seasons.length === 0) {
        s.seasons = [
          {
            seasonNumber: 1,
            name: `Season 1 (${s.episodes ? s.episodes.length : 1} Eps)`,
            episodeCount: s.episodes ? s.episodes.length : 1,
            episodes: s.episodes || []
          }
        ];
      }
    });

    fs.writeFileSync(fPath, JSON.stringify(content, null, 2), 'utf8');
  }

  console.log('All series metadata, seasons, episodes, and posters successfully fixed!');
}

fixSeries().catch(console.error);
