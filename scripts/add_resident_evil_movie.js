const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const servers = [
  {
    name: 'Server 1 (Fast HD - OK.ru)',
    url: 'https://ok.ru/videoembed/16206540245589?nochat=1'
  },
  {
    name: 'Server 2 (PkSpeed 720p)',
    url: 'https://pkembed.site/embed-qcpchuu6qgrb.html'
  },
  {
    name: 'Server 3 (PkSpeed 360p)',
    url: 'https://pkembed.site/embed-5jqvj9nynvps.html'
  },
  {
    name: 'Server 4 (CloudVideo 720p)',
    url: 'https://do7go.com/e/xsx9mb5u9i2r'
  },
  {
    name: 'Server 5 (CloudVideo 360p)',
    url: 'https://do7go.com/e/rwsw0dxu4ym3'
  },
  {
    name: 'Server 6 (Streamtape 720p)',
    url: 'https://streamtape.to/e/z696Q4BaXYsYPVj'
  },
  {
    name: 'Server 7 (MixDrop 720p)',
    url: 'https://mxdrop.to/e/4ddk04nka9l8jo'
  }
];

async function addResidentEvil() {
  console.log('Fetching Resident Evil data from TMDB (ID: 1423191)...');
  const res = await axios.get('https://api.themoviedb.org/3/movie/1423191', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  const tmdb = res.data;

  const runtime = tmdb.runtime || 95;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Horror, Science Fiction, Adventure';

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const reMovie = {
    id: 'tmdb-m-1423191',
    title: 'Resident Evil (2026)',
    originalTitle: tmdb.original_title || 'Resident Evil',
    language: 'English',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Hallprint',
    tag: 'Hallprint',
    quality: 'Hallprint',
    industry: 'Hollywood',
    year: '2026',
    country: 'USA',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: (tmdb.vote_average || 7.3).toFixed(1),
    imdbRating: (tmdb.vote_average || 7.3).toFixed(1),
    poster: `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`,
    backdrop: `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`,
    description: tmdb.overview,
    audioTracks: ['Hindi dub', 'English (Original)'],
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
      console.log(`Skipping: ${file}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.movies) data.movies = [];

    // Remove existing if already present
    data.movies = data.movies.filter(m => m.id !== 'tmdb-m-1423191');

    // Add to top of movies list
    data.movies.unshift(reMovie);

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully added Resident Evil (2026) to ${file}`);
  }

  console.log('All files updated successfully!');
}

addResidentEvil().catch(err => {
  console.error('Failed to add Resident Evil:', err);
});
