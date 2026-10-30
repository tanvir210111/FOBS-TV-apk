const path = require('path');
const fs = require('fs');
const moviebox = require('../services/movieboxService');

const candidates = [
  // 2020 K-Dramas (Hindi Dubbed)
  { title: 'Itaewon Class [Hindi]', id: '8604365255839465912', path: 'itaewon-class-hindi-UG7Z4vd5Cfa', type: 'series', year: '2020', genre: 'Korean Drama, Revenge, Life, Romance, Hindi Dubbed' },
  { title: 'It\'s Okay to Not Be Okay [Hindi]', id: '8745366970582927136', path: 'its-okay-to-not-be-okay-hindi-4QLB9L9S1qa', type: 'series', year: '2020', genre: 'Korean Drama, Psychological, Romance, Drama, Hindi Dubbed' },
  { title: 'The King: Eternal Monarch [Hindi]', id: '5502432109643923784', path: 'the-king-eternal-monarch-hindi-exdpbXecty6', type: 'series', year: '2020', genre: 'Korean Drama, Fantasy, Romance, Sci-Fi, Hindi Dubbed' },
  { title: 'Flower of Evil [Hindi]', id: '348982352472932496', path: 'flower-of-evil-hindi-i7ne81glMp', type: 'series', year: '2020', genre: 'Korean Drama, Thriller, Mystery, Romance, Hindi Dubbed' },
  { title: 'Start-Up [Hindi]', id: '6919086059586815776', path: 'start-up-hindi-su4cZaeu7f8', type: 'series', year: '2020', genre: 'Korean Drama, Business, Comedy, Romance, Hindi Dubbed' },
  { title: 'True Beauty [Hindi]', id: '2938647593859040840', path: 'true-beauty-hindi-A09utPi25v3', type: 'series', year: '2020', genre: 'Korean Drama, Comedy, Romance, Youth, Hindi Dubbed' },
  { title: 'The Penthouse: War in Life [Hindi]', id: '6418395531181523640', path: 'the-penthouse-war-in-life-hindi-GnBX4EOj8E7', type: 'series', year: '2020', genre: 'Korean Drama, Suspense, Revenge, Crime, Hindi Dubbed' },
  { title: 'Kairos [Hindi]', id: '6978733182414193296', path: 'kairos-hindi-Q85zRdFFwj8', type: 'series', year: '2020', genre: 'Korean Drama, Sci-Fi, Mystery, Thriller, Hindi Dubbed' },
  { title: 'Find Me in Your Memory [Hindi]', id: '6096923551267701560', path: 'find-me-in-your-memory-hindi-a9WXbaqYng7', type: 'series', year: '2020', genre: 'Korean Drama, Romance, Melodrama, Mystery, Hindi Dubbed' },
  { title: '18 Again [Hindi]', id: '1845860451960211288', path: '18-again-hindi-YEzWFnK3mc2', type: 'series', year: '2020', genre: 'Korean Drama, Fantasy, Romance, Life, Comedy, Hindi Dubbed' },
  { title: 'More Than Friends [Hindi]', id: '5433681026243593128', path: 'more-than-friends-hindi-cctOLzDjot6', type: 'series', year: '2020', genre: 'Korean Drama, Romance, Life, Youth, Hindi Dubbed' },
  { title: 'Live On [Hindi]', id: '8458174411538161128', path: 'live-on-hindi-UEOBMHLwO4a', type: 'series', year: '2020', genre: 'Korean Drama, School, Romance, Youth, Hindi Dubbed' },
  { title: 'To All the Guys Who Loved Me [Hindi]', id: '8399268940978996672', path: 'to-all-the-guys-who-loved-me-hindi-KTsKyRVJs0a', type: 'series', year: '2020', genre: 'Korean Drama, Romantic Comedy, Fantasy, Hindi Dubbed' },
  { title: 'The Cursed [Hindi]', id: '1463079624761557816', path: 'the-cursed-hindi-OtI0hg3V4K1', type: 'series', year: '2020', genre: 'Korean Drama, Supernatural, Thriller, Mystery, Hindi Dubbed' },
  { title: '365: Repeat the Year [Hindi]', id: '6752136549032674584', path: '365-repeat-the-year-hindi-MAYM8q8RM28', type: 'series', year: '2020', genre: 'Korean Drama, Time Travel, Mystery, Thriller, Hindi Dubbed' },
  { title: 'Welcome [Hindi]', id: '1128763562329080880', path: 'welcome-hindi-AmS6jvrKnl1', type: 'series', year: '2020', genre: 'Korean Drama, Comedy, Romance, Fantasy, Hindi Dubbed' },
  { title: 'SF8 [Hindi]', id: '5632969845240121416', path: 'sf8-hindi-ufMTyZO37I6', type: 'series', year: '2020', genre: 'Korean Drama, Sci-Fi, Anthology, Drama, Hindi Dubbed' },
  { title: 'Basement Company [Hindi]', id: '3875708938431726576', path: 'basement-company-hindi-CdZWShRMiC4', type: 'series', year: '2020', genre: 'Korean Drama, Workplace, Comedy, Romance, Hindi Dubbed' },
  { title: 'Mr. Queen [Hindi]', id: '7786918209294664336', path: 'mr-queen-hindi-kiqRUPpaeh9', type: 'series', year: '2020', genre: 'Korean Drama, Historical, Comedy, Romance, Fantasy, Hindi Dubbed' },
  { title: 'A Love So Beautiful [Hindi]', id: '566640740688880320', path: 'a-love-so-beautiful-hindi-i14w60GdRF', type: 'series', year: '2020', genre: 'Korean Drama, Romance, School, Youth, Hindi Dubbed' },

  // 2020 K-Movies (Hindi Dubbed)
  { title: 'Peninsula [Hindi]', id: '4069841762469268664', path: 'peninsula-hindi-s4HXlwWUDQ4', type: 'movie', year: '2020', genre: 'Korean Movie, Zombie Action, Thriller, Apocalyptic, Hindi Dubbed' },
  { title: '#Alive [Hindi]', id: '2891056594555470800', path: 'alive-hindi-ufOR9Bk4zr3', type: 'movie', year: '2020', genre: 'Korean Movie, Zombie Survival, Thriller, Horror, Hindi Dubbed' },
  { title: 'The Call [Hindi]', id: '6208312990681678920', path: 'the-call-hindi-2bf23ID8Co7', type: 'movie', year: '2020', genre: 'Korean Movie, Sci-Fi Mystery, Psychological Thriller, Hindi Dubbed' },
  { title: 'Time to Hunt [Hindi]', id: '8304873947884127336', path: 'time-to-hunt-hindi-YAzZF4tpuT9', type: 'movie', year: '2020', genre: 'Korean Movie, Dystopian Action, Crime Thriller, Hindi Dubbed' },
  { title: 'Deliver Us from Evil [Hindi]', id: '3623526364529183168', path: 'deliver-us-from-evil-hindi-ceaNDEVMFj4', type: 'movie', year: '2020', genre: 'Korean Movie, Hardboiled Action, Gangster Noir, Crime, Hindi Dubbed' },
  { title: 'Secret Zoo [Hindi]', id: '9113239294671553368', path: 'secret-zoo-hindi-Ii6RYjqJcRa', type: 'movie', year: '2020', genre: 'Korean Movie, Comedy, Family, Adventure, Hindi Dubbed' },
  { title: 'Hitman: Agent Jun [Hindi]', id: '1776537496348673616', path: 'hitman-agent-jun-hindi-if5T8SKye72', type: 'movie', year: '2020', genre: 'Korean Movie, Action, Comedy, Secret Agent, Webtoon, Hindi Dubbed' },
  { title: 'The Closet [Hindi]', id: '6099762833888084368', path: 'the-closet-hindi-qFQzhkFYAg7', type: 'movie', year: '2020', genre: 'Korean Movie, Supernatural Horror, Mystery, Thriller, Hindi Dubbed' },
  { title: 'Hypnotic Dance Club [Hindi]', id: '3590571802021479400', path: 'hypnotic-dance-club-hindi-Emp1l68Reh4', type: 'movie', year: '2020', genre: 'Korean Movie, Mystery, Drama, Hindi Dubbed' }
];

async function run() {
  console.log(`Building 2020 manifest for ${candidates.length} items...`);
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

  const outPath = path.join(__dirname, '../scratch/2020_import_manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n🎉 Success! 2020 Manifest saved with ${manifest.length} items to ${outPath}`);
}

run();
