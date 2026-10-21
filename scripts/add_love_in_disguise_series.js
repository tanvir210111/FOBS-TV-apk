const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const EPISODE_LINKS = [
  {
    number: '01',
    streamUrl: 'https://royalfiletolink.koyeb.app/stream/243?hash=ab67cfc4f9e3d313'
  },
  {
    number: '02',
    streamUrl: 'https://royalfiletolink.koyeb.app/stream/251?hash=c8af49290037f08f'
  }
];

async function addLoveInDisguise() {
  console.log('Fetching Love in Disguise (2026) TV details from TMDB (ID: 303745)...');
  const tvRes = await axios.get('https://api.themoviedb.org/3/tv/303745', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });
  const tv = tvRes.data;

  console.log('Fetching Season 1 episodes from TMDB...');
  const s1Res = await axios.get('https://api.themoviedb.org/3/tv/303745/season/1', {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = s1Res.data.episodes || [];

  const genreStr = (tv.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Crime, Action & Adventure';

  const cast = (tv.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const episodes = EPISODE_LINKS.map((linkItem, idx) => {
    const epNum = idx + 1;
    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === epNum);
    const duration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '64m';
    const still = tmdbEp?.still_path
      ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}`
      : (tv.backdrop_path ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}` : '');
    const overview = tmdbEp?.overview || `Episode ${linkItem.number} of Love in Disguise.`;

    return {
      number: linkItem.number,
      title: tmdbEp?.name ? `Episode ${linkItem.number} - ${tmdbEp.name}` : `Episode ${linkItem.number}`,
      duration: duration,
      overview: overview,
      still: still,
      streamUrl: linkItem.streamUrl,
      audioTracks: {
        'Hindi dub': linkItem.streamUrl,
        'Original Audio': linkItem.streamUrl
      }
    };
  });

  const seriesEntry = {
    id: `tmdb-s-${tv.id}`,
    title: 'Love in Disguise (Ongoing)',
    originalTitle: tv.original_name || '나의 유죄인간',
    language: 'Korean',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'ONGOING',
    isOngoing: true,
    status: 'Ongoing',
    year: tv.first_air_date ? tv.first_air_date.split('-')[0] : '2026',
    country: 'Korea',
    genre: genreStr,
    seasonsCount: 1,
    releasedEpisodes: episodes.length,
    totalEpisodes: tv.number_of_episodes || 12,
    category: 'Trending Series',
    rating: tv.vote_average ? tv.vote_average.toFixed(1) : '8.5',
    imdbRating: '8.5',
    poster: tv.poster_path
      ? `https://image.tmdb.org/t/p/w500${tv.poster_path}`
      : 'https://image.tmdb.org/t/p/w500/kSAXIAovLC4z7Wp2Hy8oqLmpkox.jpg',
    backdrop: tv.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tv.backdrop_path}`
      : 'https://image.tmdb.org/t/p/original/32g5MD6eHPAZ5NAgkNAURb4eupm.jpg',
    description: `[Ongoing Series - 2 Episodes Released] ${tv.overview || "Taekang Group's successor, Yoon Yi-jun, is the prime suspect of a shocking murder. To uncover the truth, Kang Jae-hee goes undercover as a male secretary to keep an eye on Yi-jun."}`,
    audioTracks: [
      'Hindi dub',
      'Original Audio'
    ],
    selectedAudio: 'Hindi dub',
    cast: cast,
    episodes: episodes,
    type: 'series'
  };

  console.log('Constructed series entry:');
  console.log(JSON.stringify({ ...seriesEntry, episodes: `[${seriesEntry.episodes.length} episodes]` }, null, 2));

  const targetFiles = [
    path.join(__dirname, '..', 'data', 'content.json'),
    path.join(__dirname, '..', 'public', 'seed-content.json'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
  ];

  targetFiles.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.series) data.series = [];

    // Remove any previous entry for Love in Disguise
    data.series = data.series.filter(s => s.id !== seriesEntry.id && !s.title.toLowerCase().includes('love in disguise'));

    // Unshift Love in Disguise as first series
    data.series.unshift(seriesEntry);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${filePath} with Love in Disguise (Ongoing)`);
  });

  console.log('\n🎉 Successfully added Love in Disguise (Ongoing) to all content files!');
}

addLoveInDisguise().catch(err => {
  console.error('Error adding Love in Disguise:', err);
  process.exit(1);
});
