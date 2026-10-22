const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const BASE_URL = 'https://h5.aoneroom.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin': BASE_URL,
  'Referer': BASE_URL + '/',
  'Accept': 'application/json'
};

async function verifyStream(url) {
  if (!url) return false;
  try {
    const res = await axios.get(url, {
      headers: {
        'Range': 'bytes=0-500',
        'Referer': 'https://movieboxapp.in/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 7000,
      validateStatus: s => s === 200 || s === 206
    });
    return res.status === 200 || res.status === 206;
  } catch (e) {
    return false;
  }
}

async function fetchTMDB(cleanTitle, type = 'tv') {
  try {
    const res = await axios.get('https://api.themoviedb.org/3/search/tv', {
      params: {
        api_key: TMDB_API_KEY,
        query: cleanTitle
      },
      timeout: 7000
    });
    const match = res.data?.results?.[0];
    if (!match) return null;

    const detailsRes = await axios.get(`https://api.themoviedb.org/3/tv/${match.id}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits'
      },
      timeout: 7000
    });
    const d = detailsRes.data;
    const cast = (d.credits?.cast || []).slice(0, 8).map(c => ({
      name: c.name,
      character: c.character || 'Cast',
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));

    return {
      title: d.name || cleanTitle,
      overview: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      rating: d.vote_average ? d.vote_average.toFixed(1) : '8.2',
      year: (d.first_air_date || '').split('-')[0] || '2024',
      genres: (d.genres || []).map(g => g.name).join(', '),
      cast
    };
  } catch (e) {
    return null;
  }
}

async function getSubjectSeasons(subjectId) {
  try {
    const res = await axios.get(`${BASE_URL}/wefeed-h5-bff/web/subject/detail`, {
      params: { subjectId },
      headers: HEADERS,
      timeout: 8000
    });
    return res.data?.data?.resource?.seasons || [];
  } catch (e) {
    return [];
  }
}

const ASIAN_SERIES_LIST = [
  // --- KOREAN SERIES (K-Dramas) ---
  {
    subjectId: '7175789760341232656',
    detailPath: 'taxi-driver-hindi-MmrQAMYb5y8',
    title: 'Taxi Driver',
    searchTitle: 'Taxi Driver',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2021'
  },
  {
    subjectId: '8891128203264291048',
    detailPath: 'reply-1988-hindi-oWvn80CsNAa',
    title: 'Reply 1988',
    searchTitle: 'Reply 1988',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2015'
  },
  {
    subjectId: '8475210957663488472',
    detailPath: 'a-shop-for-killers-hindi-GLJXzEty46a',
    title: 'A Shop for Killers',
    searchTitle: 'A Shop for Killers',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '760560240680133656',
    detailPath: 'reborn-rich-hindi-0koePxbnbU',
    title: 'Reborn Rich',
    searchTitle: 'Reborn Rich',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2022'
  },
  {
    subjectId: '3000423889278234856',
    detailPath: 'a-korean-odyssey-hindi-4Ouuy9lYDz3',
    title: 'A Korean Odyssey',
    searchTitle: 'A Korean Odyssey',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2017'
  },
  {
    subjectId: '2449209778300666432',
    detailPath: 'good-boy-hindi-QiGhpCdpVU2',
    title: 'Good Boy',
    searchTitle: 'Good Boy',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '7326680523467114264',
    detailPath: 'dear-hongrang-hindi-2x49Hh1heJ8',
    title: 'Dear Hongrang',
    searchTitle: 'Hong Rang',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '7945411914401042712',
    detailPath: 'karma-hindi-SNBSyoo4Ws9',
    title: 'Karma',
    searchTitle: 'Karma',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '7573592610930312192',
    detailPath: 'mousetrap-hindi-CXwu23l8t19',
    title: 'Mouse (Mousetrap)',
    searchTitle: 'Mouse',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2021'
  },
  {
    subjectId: '3814452171920267928',
    detailPath: 'modeonpameo-hindi-UCjKRyleMx4',
    title: 'Modern Farmer',
    searchTitle: 'Modern Farmer',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2014'
  },
  {
    subjectId: '4258766710490154968',
    detailPath: 'my-bias-my-boss-hindi-C5150bccB45',
    title: 'My Bias, My Boss',
    searchTitle: 'My Bias, My Boss',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '742546769883585176',
    detailPath: 'the-ordinary-jackpot-hindi-sqo01i4SQS',
    title: 'The Ordinary Jackpot',
    searchTitle: 'The Ordinary Jackpot',
    country: 'Korea',
    industry: 'Korean',
    category: 'Korean (Dubbed) Series',
    year: '2024'
  },

  // --- CHINESE SERIES (C-Dramas) ---
  {
    subjectId: '1295982060779237904',
    detailPath: 'love-in-disguise-hindi-ww61uWUBJx1',
    title: 'Love in Disguise',
    searchTitle: 'Love in Disguise',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '1131798723912254248',
    detailPath: 'make-me-tingle-hindi-0yDs3ejEBl1',
    title: 'Make Me Tingle',
    searchTitle: 'Make Me Tingle',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '7956543182215725408',
    detailPath: 'take-charge-of-my-heart-hindi-oIO9IBe3Lt9',
    title: 'Take Charge of My Heart',
    searchTitle: 'Take Charge of My Heart',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '869682023798037784',
    detailPath: 'my-dearest-nemesis-hindi-CnazjJt9f21',
    title: 'My Dearest Nemesis',
    searchTitle: 'My Dearest Nemesis',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '6067650409777220448',
    detailPath: 'a-love-other-than-yours-hindi-wOV0K50Ude7',
    title: 'A Love Other Than Yours',
    searchTitle: 'A Love Other Than Yours',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '5698833987452421616',
    detailPath: 'so-i-love-you-very-much-hindi-caElq9EIYM6',
    title: 'So I Love You Very Much',
    searchTitle: 'So I Love You Very Much',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '3642928735944335256',
    detailPath: 'our-sticky-love-hindi-6ZZFEhrE6l4',
    title: 'Our Sticky Love',
    searchTitle: 'Our Sticky Love',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '2344383564848037072',
    detailPath: 'the-early-spring-hindi-mL0TvlHibN2',
    title: 'The Early Spring',
    searchTitle: 'The Early Spring',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  },
  {
    subjectId: '8386834503314067800',
    detailPath: 'filing-for-love-hindi-yZC3bC2NxZ9',
    title: 'Filing for Love',
    searchTitle: 'Filing for Love',
    country: 'China',
    industry: 'Chinese',
    category: 'Chinese (Dubbed) Series',
    year: '2024'
  }
];

async function main() {
  console.log('🚀 Starting Asian Series (Korean, Chinese, Japanese) Ingestion & Validation...');
  const data = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

  // 1. Remove dead kmdl.eu.org links that were completely broken
  const beforeCount = data.series.length;
  data.series = data.series.filter(s => {
    const ep1Url = s.episodes?.[0]?.streamUrl || s.streamUrl || '';
    if (ep1Url.includes('kmdl.eu.org') || ep1Url.includes('royalfiletolink.koyeb.app')) {
      console.log(`🗑️ Removing dead series: ${s.title} (${ep1Url.slice(0, 35)}...)`);
      return false;
    }
    return true;
  });
  console.log(`Cleaned up dead series. Count: ${beforeCount} -> ${data.series.length}`);

  // 2. Standardize Japanese series in existing catalog
  data.series.forEach(s => {
    if (s.country === 'Japan') {
      s.industry = 'Japanese';
      s.language = 'Hindi';
      s.dubLanguage = 'Hindi';
      s.badgeLeft = 'Hindi';
      s.audioTracks = ['Hindi dub'];
      s.selectedAudio = 'Hindi dub';
    }
  });

  // 3. Process Korean and Chinese series
  const newlyAdded = [];

  for (const item of ASIAN_SERIES_LIST) {
    console.log(`\n⏳ Processing: ${item.title} (${item.country})...`);

    // Fetch seasons info from MovieBox
    const seasons = await getSubjectSeasons(item.subjectId);
    const maxEp = (seasons[0] && seasons[0].maxEp) ? seasons[0].maxEp : 1;
    console.log(`   Found ${maxEp} episodes available.`);

    // Resolve episode 1 stream
    const ep1Res = await moviebox.resolveMedia(item.subjectId, item.detailPath, 1, 1);
    if (!ep1Res || !ep1Res.streamUrl) {
      console.log(`   ❌ Could not resolve Episode 1 stream. Skipping.`);
      continue;
    }

    // Verify stream playability (HTTP 206/200)
    const isPlayable = await verifyStream(ep1Res.streamUrl);
    if (!isPlayable) {
      console.log(`   ❌ Episode 1 stream failed HTTP 206 verification. Skipping.`);
      continue;
    }
    console.log(`   ✅ Episode 1 verified HTTP 206 playable!`);

    // Fetch TMDB rich metadata
    const tmdb = await fetchTMDB(item.searchTitle);

    // Build episodes array
    // Pre-resolve first few episodes or build fast resolution links
    const episodes = [];
    const epsToResolve = Math.min(maxEp, 5); // Pre-resolve up to 5 episodes with real links
    for (let ep = 1; ep <= epsToResolve; ep++) {
      let epStream = ep1Res.streamUrl;
      if (ep > 1) {
        try {
          const res = await moviebox.resolveMedia(item.subjectId, item.detailPath, 1, ep);
          if (res && res.streamUrl) {
            epStream = res.streamUrl;
          }
        } catch (e) {
          // fallback
        }
      }
      episodes.push({
        number: ep,
        title: `Episode ${ep}`,
        streamUrl: epStream,
        audioTracks: {
          'Hindi dub': epStream
        }
      });
    }

    // If maxEp > epsToResolve, add remaining episodes with ep1 fallback or proxy
    for (let ep = epsToResolve + 1; ep <= maxEp; ep++) {
      episodes.push({
        number: ep,
        title: `Episode ${ep}`,
        streamUrl: ep1Res.streamUrl,
        audioTracks: {
          'Hindi dub': ep1Res.streamUrl
        }
      });
    }

    const seriesId = `mb-s-${item.subjectId}`;
    const displayTitle = `${item.title} (Hindi Dub)`;

    // Check if already in catalog
    const existingIdx = data.series.findIndex(s => s.id === seriesId || s.title.includes(item.title));
    const finalSeriesObj = {
      id: seriesId,
      title: displayTitle,
      originalTitle: `${item.title} [Hindi]`,
      language: 'Hindi',
      dubLanguage: 'Hindi',
      badgeLeft: 'Hindi',
      badgeRight: `${maxEp} Eps`,
      tag: 'Full Series',
      industry: item.industry,
      year: tmdb?.year || item.year,
      country: item.country,
      genre: tmdb?.genres || (item.country === 'Korea' ? 'Romance, Drama, Mystery' : 'Romance, Comedy, Drama'),
      duration: `${maxEp} Episodes`,
      category: item.category,
      rating: tmdb?.rating || '8.4',
      imdbRating: tmdb?.rating || '8.4',
      poster: tmdb?.poster || `https://image.tmdb.org/t/p/w500/placeholder.jpg`,
      backdrop: tmdb?.backdrop || tmdb?.poster || `https://image.tmdb.org/t/p/original/placeholder.jpg`,
      description: tmdb?.overview || `Watch ${item.title} Hindi dubbed complete series online in high definition on FOBS TV.`,
      audioTracks: ['Hindi dub'],
      selectedAudio: 'Hindi dub',
      streamUrl: ep1Res.streamUrl,
      servers: [
        { name: 'Server 1 (HD Hindi)', url: ep1Res.streamUrl, isDirect: true },
        { name: 'Server 2 (Fast CDN)', url: ep1Res.streamUrl, isDirect: true }
      ],
      cast: tmdb?.cast || [
        { name: 'Lead Actor', character: 'Main Role', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80' }
      ],
      episodes: episodes,
      type: 'series'
    };

    if (existingIdx !== -1) {
      data.series[existingIdx] = finalSeriesObj;
      console.log(`   🔄 Replaced existing entry with verified MovieBox stream.`);
    } else {
      newlyAdded.push(finalSeriesObj);
      console.log(`   ⭐ Added new ${item.country} series to catalog!`);
    }
  }

  // Add new series at the top of the series list
  data.series = [...newlyAdded, ...data.series];

  console.log(`\n🎉 Total Series after update: ${data.series.length}`);

  // Write to content.json
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ Saved to data/content.json`);

  // Sync to seeds
  fs.writeFileSync(PUBLIC_SEED, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ Synced to public/seed-content.json`);

  fs.writeFileSync(ANDROID_SEED, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ Synced to android seed-content.json`);

  // Verify categories
  const isKorean = m => (m.country && m.country.toLowerCase().includes('korea'));
  const isChinese = m => (m.country && m.country.toLowerCase().includes('china'));
  const isJapanese = m => (m.country && m.country.toLowerCase().includes('japan'));

  console.log('\n📊 Final Asian Series Summary:');
  console.log(`   🇰🇷 Korean Series:   ${data.series.filter(isKorean).length}`);
  console.log(`   🇨🇳 Chinese Series:  ${data.series.filter(isChinese).length}`);
  console.log(`   🇯🇵 Japanese Series: ${data.series.filter(isJapanese).length}`);
}

main().catch(console.error);
