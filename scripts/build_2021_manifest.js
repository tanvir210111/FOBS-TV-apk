const path = require('path');
const fs = require('fs');
const moviebox = require('../services/movieboxService');

const candidates = [
  // 24 Series
  { title: 'Squid Game [Hindi]', id: '973041525783496480', path: 'squid-game-hindi-k87MYIvxS91', type: 'series', year: '2021', genre: 'Korean Drama, Thriller, Survival, Mystery, Hindi Dubbed' },
  { title: 'Vincenzo [Hindi]', id: '1152403551952454480', path: 'vincenzo-hindi-ORQ7jMg18n1', type: 'series', year: '2021', genre: 'Korean Drama, Crime, Comedy, Law, Hindi Dubbed' },
  { title: 'Happiness [Hindi]', id: '6165139988549091688', path: 'happiness-hindi-qHnLqNcpql7', type: 'series', year: '2021', genre: 'Korean Drama, Thriller, Horror, Apocalyptic, Hindi Dubbed' },
  { title: 'Doom at Your Service [Hindi]', id: '585393350661096376', path: 'doom-at-your-service-hindi-oGvLpdG6fH', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Fantasy, Supernatural, Hindi Dubbed' },
  { title: 'My Name [Hindi]', id: '6480245461130560848', path: 'my-name-hindi-qb5TxlLAHI7', type: 'series', year: '2021', genre: 'Korean Drama, Action, Crime, Revenge, Noir, Hindi Dubbed' },
  { title: 'Hellbound [Hindi]', id: '4854002828039390792', path: 'hellbound-hindi-ss3v7PPnzM5', type: 'series', year: '2021', genre: 'Korean Drama, Dark Fantasy, Supernatural, Thriller, Hindi Dubbed' },
  { title: 'The Silent Sea [Hindi]', id: '7095442763994857600', path: 'the-silent-sea-hindi-Gpgj4RAc9s8', type: 'series', year: '2021', genre: 'Korean Drama, Sci-Fi, Mystery, Thriller, Hindi Dubbed' },
  { title: 'Snowdrop [Hindi]', id: '5578465542022775616', path: 'snowdrop-hindi-uXQDwaKq5E6', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Melodrama, Period, Hindi Dubbed' },
  { title: 'D.P. [Hindi]', id: '6114666095527298712', path: 'd-p-hindi-2h0FyBBeHh7', type: 'series', year: '2021', genre: 'Korean Drama, Military, Action, Drama, Hindi Dubbed' },
  { title: 'Youth of May [Hindi]', id: '5722351893704328120', path: 'youth-of-may-hindi-mzsvX4OqIO6', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Historical, Melodrama, Hindi Dubbed' },
  { title: 'Move to Heaven [Hindi]', id: '2396025205253702760', path: 'move-to-heaven-hindi-aZ0XVnTOZQ2', type: 'series', year: '2021', genre: 'Korean Drama, Life, Emotional, Drama, Hindi Dubbed' },
  { title: 'Yumi\'s Cells [Hindi]', id: '3743110056083084136', path: 'yumis-cells-hindi-8SzgyBZtvs4', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Comedy, Psychological, Hindi Dubbed' },
  { title: 'Work Later, Drink Now [Hindi]', id: '8048865034862298024', path: 'work-later-drink-now-hindi-2jl3ZA0TzA9', type: 'series', year: '2021', genre: 'Korean Drama, Comedy, Life, Friendship, Hindi Dubbed' },
  { title: 'Dark Hole [Hindi]', id: '1518020021778269464', path: 'dark-hole-hindi-ultodLXx8O1', type: 'series', year: '2021', genre: 'Korean Drama, Horror, Mystery, Sci-Fi, Hindi Dubbed' },
  { title: 'The Veil [Hindi]', id: '544550565854988448', path: 'the-veil-hindi-kCauk5W2eE', type: 'series', year: '2021', genre: 'Korean Drama, Action, Spy Thriller, Mystery, Hindi Dubbed' },
  { title: 'Melancholia [Hindi]', id: '2427561753706911048', path: 'melancholia-hindi-gISHp02gkT2', type: 'series', year: '2021', genre: 'Korean Drama, Romance, Drama, School, Hindi Dubbed' },
  { title: 'Dali and the Cocky Prince [Hindi]', id: '1125020468265845712', path: 'dali-and-the-cocky-prince-hindi-MG94zeyB6l1', type: 'series', year: '2021', genre: 'Korean Drama, Romantic Comedy, Art, Hindi Dubbed' },
  { title: 'User Not Found [Hindi]', id: '6033354597702452224', path: 'user-not-found-hindi-iPtsu5lPGb7', type: 'series', year: '2021', genre: 'Korean Drama, High School, Youth, Romance, Hindi Dubbed' },
  { title: 'Red Sleeve [Hindi]', id: '4334101834336979088', path: 'red-sleeve-hindi-eRRLjhpeaa5', type: 'series', year: '2021', genre: 'Korean Drama, Historical, Romance, Royal, Hindi Dubbed' },
  { title: 'Undercover [Hindi]', id: '6720303144787919728', path: 'undercover-hindi-Ovl5huH3r08', type: 'series', year: '2021', genre: 'Korean Drama, Crime, Thriller, Action, Hindi Dubbed' },
  { title: 'High Class [Hindi]', id: '7315630485831911064', path: 'high-class-hindi-GjNgVafFpI8', type: 'series', year: '2021', genre: 'Korean Drama, Mystery, Suspense, Elite Society, Hindi Dubbed' },
  { title: 'One the Woman [Hindi]', id: '5247696435382027176', path: 'one-the-woman-hindi-W9W7BykvEf6', type: 'series', year: '2021', genre: 'Korean Drama, Comedy, Romance, Crime, Mystery, Hindi Dubbed' },
  { title: 'Be My Boyfriend [Hindi]', id: '4001386342470114888', path: 'be-my-boyfriend-hindi-oEenMsioAL4', type: 'series', year: '2021', genre: 'Korean Drama, School, Romance, Youth, Hindi Dubbed' },
  { title: 'Moonshine [Hindi]', id: '8957707048435729216', path: 'moonshine-hindi-yfzWgUnoIFa', type: 'series', year: '2021', genre: 'Korean Drama, Historical, Comedy, Romance, Hindi Dubbed' },

  // 10 Movies
  { title: 'Space Sweepers [Hindi]', id: '2083744798950785960', path: 'space-sweepers-hindi-sWGt8IxzVt2', type: 'movie', year: '2021', genre: 'Korean Movie, Sci-Fi, Action, Space Opera, Hindi Dubbed' },
  { title: 'Night in Paradise [Hindi]', id: '2699303278499741744', path: 'night-in-paradise-hindi-2dcbbWVPod3', type: 'movie', year: '2021', genre: 'Korean Movie, Crime, Gangster Noir, Action, Hindi Dubbed' },
  { title: 'Midnight [Hindi]', id: '2010489557577255040', path: 'midnight-hindi-SP0qE6W3wo2', type: 'movie', year: '2021', genre: 'Korean Movie, Thriller, Slasher, Suspense, Hindi Dubbed' },
  { title: 'Escape from Mogadishu [Hindi]', id: '8504688728575803784', path: 'escape-from-mogadishu-hindi-ePYKcl0zf8a', type: 'movie', year: '2021', genre: 'Korean Movie, Action, Thriller, Historical Drama, Hindi Dubbed' },
  { title: 'The Medium [Hindi]', id: '3945815157028389528', path: 'the-medium-hindi-QKK32AgStH4', type: 'movie', year: '2021', genre: 'Korean Movie, Supernatural Horror, Shamanism, Found Footage, Hindi Dubbed' },
  { title: 'Ghost Mansion [Hindi]', id: '9016839920333247224', path: 'ghost-mansion-hindi-cAbLehNd5Ka', type: 'movie', year: '2021', genre: 'Korean Movie, Horror, Anthological Mystery, Hindi Dubbed' },
  { title: 'Mission Possible [Hindi]', id: '2261804388635268464', path: 'mission-possible-hindi-wWPvJDs55H2', type: 'movie', year: '2021', genre: 'Korean Movie, Action, Comedy, Secret Agent, Hindi Dubbed' },
  { title: 'New Year Blues [Hindi]', id: '929463473338205392', path: 'new-year-blues-hindi-6rOpOF3XE61', type: 'movie', year: '2021', genre: 'Korean Movie, Romance, Romantic Comedy, Multi-Plot, Hindi Dubbed' },
  { title: 'The Cursed: Dead Man\'s Prey [Hindi]', id: '8846631012248551432', path: 'the-cursed-hindi-yTZk40aFvxa', type: 'movie', year: '2021', genre: 'Korean Movie, Horror, Supernatural, Action, Mystery, Hindi Dubbed' },
  { title: 'Time of Memory [Hindi]', id: '3242536145166680080', path: 'time-of-memory-hindi-GTZ2RbHQwR3', type: 'movie', year: '2021', genre: 'Korean Movie, Romance, Fantasy, Melodrama, Hindi Dubbed' }
];

async function run() {
  console.log(`Building manifest for ${candidates.length} items...`);
  const manifest = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`[${i+1}/${candidates.length}] Fetching detail for "${c.title}"...`);
    const d = await moviebox.getDetail(c.id, c.path);

    const poster = d?.cover || d?.posters?.[0] || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800';
    const backdrop = d?.backdrop || poster;
    const description = d?.description || c.title;
    const rating = d?.rating || '8.2';

    let seasons = [];
    if (c.type === 'series') {
      if (Array.isArray(d?.seasons) && d.seasons.length > 0) {
        seasons = d.seasons.map(s => ({
          seasonNumber: s.se,
          maxEp: s.maxEp || 1
        }));
      } else {
        seasons = [{ seasonNumber: 1, maxEp: 16 }];
      }
    }

    manifest.push({
      id: c.id,
      title: c.title,
      type: c.type,
      detailPath: c.path,
      year: c.year,
      country: 'Korea',
      genres: c.genre,
      description: description,
      rating: rating,
      poster: poster,
      backdrop: backdrop,
      seasons: seasons,
      totalEpisodes: seasons.reduce((sum, s) => sum + s.maxEp, 0) || 1
    });
  }

  const outPath = path.join(__dirname, '../scratch/2021_import_manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n🎉 Success! Manifest saved with ${manifest.length} items to ${outPath}`);
}

run();
