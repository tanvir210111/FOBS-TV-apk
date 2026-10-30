const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Accept': 'application/json'
};

const candidateList = [
  // Series
  { title: 'Squid Game [Hindi]', id: '973041525783496480', path: 'squid-game-hindi-k87MYIvxS91', type: 'series', year: '2021', genre: 'Korean Drama, Thriller, Survival, Hindi Dubbed' },
  { title: 'Vincenzo [Hindi]', id: '1152403551952454480', path: 'vincenzo-hindi-ORQ7jMg18n1', type: 'series', year: '2021', genre: 'Korean Drama, Crime, Comedy, Hindi Dubbed' },
  { title: 'Happiness [Hindi]', id: '6165139988549091688', path: 'happiness-hindi-qHnLqNcpql7', type: 'series', year: '2021', genre: 'Korean Drama, Thriller, Horror, Hindi Dubbed' },
  { title: 'Doom at Your Service [Hindi]', id: '585393350661096376', path: 'doom-at-your-service-hindi-oGvLpdG6fH', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Fantasy, Hindi Dubbed' },
  { title: 'My Name [Hindi]', id: '6480245461130560848', path: 'my-name-hindi-qb5TxlLAHI7', type: 'series', year: '2021', genre: 'Korean Drama, Action, Crime, Hindi Dubbed' },
  { title: 'Hellbound [Hindi]', id: '4854002828039390792', path: 'hellbound-hindi-ss3v7PPnzM5', type: 'series', year: '2021', genre: 'Korean Drama, Dark Fantasy, Supernatural, Hindi Dubbed' },
  { title: 'The Silent Sea [Hindi]', id: '7095442763994857600', path: 'the-silent-sea-hindi-Gpgj4RAc9s8', type: 'series', year: '2021', genre: 'Korean Drama, Sci-Fi, Mystery, Hindi Dubbed' },
  { title: 'Snowdrop [Hindi]', id: '5578465542022775616', path: 'snowdrop-hindi-uXQDwaKq5E6', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Melodrama, Hindi Dubbed' },
  { title: 'D.P. [Hindi]', id: '6114666095527298712', path: 'd-p-hindi-2h0FyBBeHh7', type: 'series', year: '2021', genre: 'Korean Drama, Military, Action, Hindi Dubbed' },
  { title: 'Youth of May [Hindi]', id: '5722351893704328120', path: 'youth-of-may-hindi-mzsvX4OqIO6', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Historical, Hindi Dubbed' },
  { title: 'Move to Heaven [Hindi]', id: '2396025205253702760', path: 'move-to-heaven-hindi-aZ0XVnTOZQ2', type: 'series', year: '2021', genre: 'Korean Drama, Life, Emotional, Hindi Dubbed' },
  { title: 'Yumi\'s Cells [Hindi]', id: '3743110056083084136', path: 'yumis-cells-hindi-8SzgyBZtvs4', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Comedy, Hindi Dubbed' },
  { title: 'Work Later, Drink Now [Hindi]', id: '8048865034862298024', path: 'work-later-drink-now-hindi-2jl3ZA0TzA9', type: 'series', year: '2021', genre: 'Korean Drama, Comedy, Life, Hindi Dubbed' },
  { title: 'Dark Hole [Hindi]', id: '1518020021778269464', path: 'dark-hole-hindi-ultodLXx8O1', type: 'series', year: '2021', genre: 'Korean Drama, Horror, Mystery, Hindi Dubbed' },
  { title: 'The Veil [Hindi]', id: '544550565854988448', path: 'the-veil-hindi-kCauk5W2eE', type: 'series', year: '2021', genre: 'Korean Drama, Action, Spy Thriller, Hindi Dubbed' },
  { title: 'Melancholia [Hindi]', id: '2427561753706911048', path: 'melancholia-hindi-gISHp02gkT2', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Drama, Hindi Dubbed' },
  { title: 'Dali and the Cocky Prince [Hindi]', id: '1125020468265845712', path: 'dali-and-the-cocky-prince-hindi-MG94zeyB6l1', type: 'series', year: '2021', genre: 'Korean Drama, Romantic Comedy, Hindi Dubbed' },
  { title: 'User Not Found [Hindi]', id: '6033354597702452224', path: 'user-not-found-hindi-iPtsu5lPGb7', type: 'series', year: '2021', genre: 'Korean Drama, High School, Youth, Hindi Dubbed' },
  { title: 'Red Sleeve [Hindi]', id: '4334101834336979088', path: 'red-sleeve-hindi-eRRLjhpeaa5', type: 'series', year: '2021', genre: 'Korean Drama, Historical, Romance, Hindi Dubbed' },
  { title: 'Undercover [Hindi]', id: '6720303144787919728', path: 'undercover-hindi-Ovl5huH3r08', type: 'series', year: '2021', genre: 'Korean Drama, Crime, Thriller, Hindi Dubbed' },
  { title: 'High Class [Hindi]', id: '7315630485831911064', path: 'high-class-hindi-GjNgVafFpI8', type: 'series', year: '2021', genre: 'Korean Drama, Mystery, Suspense, Hindi Dubbed' },
  { title: 'One the Woman [Hindi]', id: '5247696435382027176', path: 'one-the-woman-hindi-W9W7BykvEf6', type: 'series', year: '2021', genre: 'Korean Drama, Comedy, Romance, Crime, Hindi Dubbed' },
  { title: 'Be My Boyfriend [Hindi]', id: '4001386342470114888', path: 'be-my-boyfriend-hindi-oEenMsioAL4', type: 'series', year: '2021', genre: 'Korean Drama, School, Romance, Hindi Dubbed' },
  { title: 'Moonshine [Hindi]', id: '8957707048435729216', path: 'moonshine-hindi-yfzWgUnoIFa', type: 'series', year: '2021', genre: 'Korean Drama, Historical, Comedy, Romance, Hindi Dubbed' },

  // Movies
  { title: 'Space Sweepers [Hindi]', id: '2083744798950785960', path: 'space-sweepers-hindi-sWGt8IxzVt2', type: 'movie', year: '2021', genre: 'Korean Movie, Sci-Fi, Action, Hindi Dubbed' },
  { title: 'Night in Paradise [Hindi]', id: '2699303278499741744', path: 'night-in-paradise-hindi-2dcbbWVPod3', type: 'movie', year: '2021', genre: 'Korean Movie, Crime, Gangster Noir, Hindi Dubbed' },
  { title: 'Midnight [Hindi]', id: '2010489557577255040', path: 'midnight-hindi-SP0qE6W3wo2', type: 'movie', year: '2021', genre: 'Korean Movie, Thriller, Slasher, Hindi Dubbed' },
  { title: 'Escape from Mogadishu [Hindi]', id: '8504688728575803784', path: 'escape-from-mogadishu-hindi-ePYKcl0zf8a', type: 'movie', year: '2021', genre: 'Korean Movie, Action, Thriller, Hindi Dubbed' },
  { title: 'The Medium [Hindi]', id: '3945815157028389528', path: 'the-medium-hindi-QKK32AgStH4', type: 'movie', year: '2021', genre: 'Korean Movie, Supernatural Horror, Found Footage, Hindi Dubbed' },
  { title: 'Ghost Mansion [Hindi]', id: '9016839920333247224', path: 'ghost-mansion-hindi-cAbLehNd5Ka', type: 'movie', year: '2021', genre: 'Korean Movie, Horror, Anthological Mystery, Hindi Dubbed' },
  { title: 'Mission Possible [Hindi]', id: '2261804388635268464', path: 'mission-possible-hindi-wWPvJDs55H2', type: 'movie', year: '2021', genre: 'Korean Movie, Action, Comedy, Secret Agent, Hindi Dubbed' },
  { title: 'New Year Blues [Hindi]', id: '929463473338205392', path: 'new-year-blues-hindi-6rOpOF3XE61', type: 'movie', year: '2021', genre: 'Korean Movie, Romance, Comedy, Hindi Dubbed' },
  { title: 'The Cursed: Dead Man\'s Prey [Hindi]', id: '8846631012248551432', path: 'the-cursed-hindi-yTZk40aFvxa', type: 'movie', year: '2021', genre: 'Korean Movie, Horror, Supernatural, Hindi Dubbed' },
  { title: 'Time of Memory [Hindi]', id: '3242536145166680080', path: 'time-of-memory-hindi-GTZ2RbHQwR3', type: 'movie', year: '2021', genre: 'Korean Movie, Romance, Fantasy, Hindi Dubbed' }
];

async function checkItem(c) {
  const isSeries = c.type === 'series';
  const se = isSeries ? 1 : 0;
  const ep = isSeries ? 1 : 0;

  try {
    const url = `https://h5.aoneroom.com/wefeed-h5-bff/web/subject/download?subjectId=${c.id}&se=${se}&ep=${ep}`;
    const res = await axios.get(url, {
      headers: {
        ...headers,
        Referer: `https://h5.aoneroom.com/movies/${c.path}`
      },
      timeout: 6000
    });
    const downloads = res.data?.data?.downloads || [];
    const captions = res.data?.data?.captions || [];

    // Let's also fetch subject detail to find total seasons & episodes
    let detailData = null;
    try {
      const detUrl = `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/detail?subjectId=${c.id}&detailPath=${c.path}`;
      const detRes = await axios.get(detUrl, { headers, timeout: 5000 });
      detailData = detRes.data?.data;
    } catch (e) {}

    return {
      title: c.title,
      id: c.id,
      path: c.path,
      type: c.type,
      year: c.year,
      genre: c.genre,
      downloadsCount: downloads.length,
      captionsCount: captions.length,
      resolutions: downloads.map(d => d.resolution),
      cover: detailData?.cover?.url || detailData?.image?.url || '',
      description: detailData?.description || detailData?.intro || c.title,
      rating: detailData?.imdbRatingValue || '8.2',
      duration: detailData?.duration ? `${Math.floor(detailData.duration / 60)}h ${detailData.duration % 60}m` : (isSeries ? '55m' : '1h 55m'),
      seasonCount: detailData?.seasonCount || 1,
      episodeCount: detailData?.episodeCount || (isSeries ? 16 : 1),
      seasonsDetail: detailData?.seasons || []
    };
  } catch (e) {
    return {
      title: c.title,
      error: e.message
    };
  }
}

async function run() {
  console.log(`Auditing ${candidateList.length} candidate titles...`);
  const results = [];

  for (let i = 0; i < candidateList.length; i++) {
    const c = candidateList[i];
    const res = await checkItem(c);
    results.push(res);
    console.log(`[${i+1}/${candidateList.length}] ${c.title} -> DLs: ${res.downloadsCount || 0}, Subs: ${res.captionsCount || 0}, Res: ${(res.resolutions || []).join('/')}, Eps: ${res.episodeCount || 1}`);
  }

  fs.writeFileSync(path.join(__dirname, '../scratch/2021_korean_audit_complete.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\nAudit complete! Saved to scratch/2021_korean_audit_complete.json');
}

run();
