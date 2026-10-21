const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const STREAM_URL = 'https://royalfiletolink.koyeb.app/stream/235?hash=cd174f471aaaa0dd';

async function addColonyMovie() {
  console.log('Fetching Colony (2026) data from TMDB (ID: 1375646)...');
  const res = await axios.get('https://api.themoviedb.org/3/movie/1375646', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  const tmdb = res.data;

  // Format duration into "Xh Ym"
  const runtime = tmdb.runtime || 123;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  // Format genres
  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Horror, Action, Science Fiction';

  // Format cast (top 10)
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const colonyMovie = {
    id: `tmdb-m-${tmdb.id}`,
    title: tmdb.title || 'Colony',
    originalTitle: tmdb.original_title || '군체',
    language: 'Korean',
    dubLanguage: 'Hindi',
    year: tmdb.release_date ? tmdb.release_date.split('-')[0] : '2026',
    country: 'Korea',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.1',
    imdbRating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.1',
    poster: tmdb.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
      : 'https://image.tmdb.org/t/p/w500/smxNv18w3zyrMrBC1G0EAuomnTQ.jpg',
    backdrop: tmdb.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : 'https://image.tmdb.org/t/p/original/pGxUbJ1vKuMYeEjKDokFI7DNbSG.jpg',
    description: tmdb.overview || 'Professor Se-jeong is thrust into a bloody nightmare when a rapidly mutating virus is released during a biotech conference causing authorities to seal the facility.',
    audioTracks: [
      'Hindi dub',
      'Original Audio'
    ],
    selectedAudio: 'Hindi dub',
    streamUrl: STREAM_URL,
    cast: cast,
    type: 'movie'
  };

  console.log('Constructed movie entry:');
  console.log(JSON.stringify(colonyMovie, null, 2));

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
    if (!data.movies) data.movies = [];

    // Remove any existing entry for this movie if present
    data.movies = data.movies.filter(m => m.id !== colonyMovie.id && m.title !== 'Colony');

    // Add Colony (2026) as first item in movies list
    data.movies.unshift(colonyMovie);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${filePath} with Colony (2026)`);
  });

  console.log('\n🎉 Successfully added Colony (2026) to all content stores!');
}

addColonyMovie().catch(err => {
  console.error('Error adding Colony movie:', err);
  process.exit(1);
});
