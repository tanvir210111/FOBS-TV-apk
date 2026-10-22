const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const servers = [
  {
    name: 'Server 1 (Fast HD - PkSpeed 720p)',
    url: 'https://pkembed.site/embed-emvuzcl5oiu7.html'
  },
  {
    name: 'Server 2 (PkSpeed 360p)',
    url: 'https://pkembed.site/embed-g675rsg6i5hd.html'
  },
  {
    name: 'Server 3 (CloudVideo 720p)',
    url: 'https://do7go.com/e/zzk9y29jj17f'
  },
  {
    name: 'Server 4 (CloudVideo 360p)',
    url: 'https://do7go.com/e/99kpzc8i24fp'
  },
  {
    name: 'Server 5 (OK.ru HD)',
    url: 'https://ok.ru/videoembed/16231663995477?nochat=1'
  },
  {
    name: 'Server 6 (Streamtape 720p)',
    url: 'https://streamtape.to/e/Xb8vXOOkQduDMe3'
  },
  {
    name: 'Server 7 (MixDrop 720p)',
    url: 'https://mxdrop.to/e/vkkp7kkob14n40'
  }
];

async function addLustStories3() {
  console.log('Fetching Lust Stories 3 from TMDB (ID: 1451944)...');
  const res = await axios.get('https://api.themoviedb.org/3/movie/1451944', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  const tmdb = res.data;

  const runtime = tmdb.runtime || 165;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Romance, Drama';

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const lsMovie = {
    id: 'tmdb-m-1451944',
    title: 'Lust Stories 3 (2026)',
    originalTitle: tmdb.original_title || 'Lust Stories 3',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    tag: 'HD',
    quality: 'HD',
    industry: 'Bollywood',
    year: '2026',
    country: 'India',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: (tmdb.vote_average || 6.3).toFixed(1),
    imdbRating: (tmdb.vote_average || 6.3).toFixed(1),
    poster: `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`,
    backdrop: `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`,
    description: tmdb.overview,
    audioTracks: ['Hindi (Original)'],
    selectedAudio: 'Hindi (Original)',
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
      console.log(`Skipping: ${file}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.movies) data.movies = [];

    // Remove existing if already present
    data.movies = data.movies.filter(m => m.id !== 'tmdb-m-1451944');

    // Add to top of movies list
    data.movies.unshift(lsMovie);

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully added Lust Stories 3 (2026) to ${file}`);
  }

  console.log('All files updated successfully!');
}

addLustStories3().catch(err => {
  console.error('Failed to add Lust Stories 3:', err);
});
