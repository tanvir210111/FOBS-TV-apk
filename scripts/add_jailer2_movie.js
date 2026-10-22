const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const servers = [
  {
    name: 'Server 1 (Fast HD - OK.ru)',
    url: 'https://ok.ru/videoembed/16194734787157?nochat=1'
  },
  {
    name: 'Server 2 (PkSpeed 720p)',
    url: 'https://pkembed.site/embed-quggka0tac6d.html'
  },
  {
    name: 'Server 3 (PkSpeed 360p)',
    url: 'https://pkembed.site/embed-0ot5b8dayz34.html'
  },
  {
    name: 'Server 4 (CloudVideo 720p)',
    url: 'https://do7go.com/e/psq4ykhq96ta'
  },
  {
    name: 'Server 5 (CloudVideo 360p)',
    url: 'https://do7go.com/e/8wsik4sfioi4'
  },
  {
    name: 'Server 6 (Streamtape 720p)',
    url: 'https://streamtape.to/e/8Z7BZmGjJAHoKD2'
  },
  {
    name: 'Server 7 (MixDrop 720p)',
    url: 'https://mxdrop.to/e/owwq3p3pil9mgm'
  }
];

async function addJailer2() {
  console.log('Fetching Jailer 2 data from TMDB (ID: 1234139)...');
  const res = await axios.get('https://api.themoviedb.org/3/movie/1234139', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  const tmdb = res.data;

  const runtime = tmdb.runtime || 163;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Action, Crime, Comedy';

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const jailer2Movie = {
    id: 'tmdb-m-1234139',
    title: 'Jailer 2 (2026)',
    originalTitle: tmdb.original_title || 'ஜெயிலர் 2',
    language: 'Tamil',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Hallprint',
    tag: 'Hallprint',
    quality: 'Hallprint',
    industry: 'South Indian',
    year: '2026',
    country: 'India',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: (tmdb.vote_average || 8.0).toFixed(1),
    imdbRating: (tmdb.vote_average || 8.0).toFixed(1),
    poster: `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`,
    backdrop: `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`,
    description: tmdb.overview,
    audioTracks: ['Hindi dub', 'Tamil (Original)'],
    selectedAudio: 'Hindi dub',
    streamUrl: servers[0].url,
    servers: servers,
    cast: cast,
    type: 'movie'
  };

  const targetFiles = [
    path.join(__dirname, '..', 'data', 'content.json'),
    path.join(__dirname, '..', 'public', 'seed-content.json'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
  ];

  for (const file of targetFiles) {
    if (!fs.existsSync(file)) {
      console.log(`Skipping non-existent: ${file}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.movies) data.movies = [];

    // Remove existing if already present
    data.movies = data.movies.filter(m => m.id !== 'tmdb-m-1234139');

    // Add to the very top of movies list
    data.movies.unshift(jailer2Movie);

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully added Jailer 2 (2026) to ${file}`);
  }

  console.log('All files updated successfully!');
}

addJailer2().catch(err => {
  console.error('Failed to add Jailer 2:', err);
});
