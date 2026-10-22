const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

const servers = [
  {
    name: 'Server 1 (HD Player - HDFriday)',
    url: 'https://irada438esc.com/play/tt40855841'
  },
  {
    name: 'Server 2 (Super Player - HDFriday)',
    url: 'https://streamimdb.ru/embed/movie/tt40855841'
  }
];

async function addNayyiNavelli() {
  console.log('Fetching Nayyi Navelli data from TMDB (ID: 1654581)...');
  const res = await fetch(`https://api.themoviedb.org/3/movie/1654581?api_key=${TMDB_API_KEY}&append_to_response=credits`);
  const tmdb = await res.json();

  const runtime = tmdb.runtime || 133;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Adventure, Fantasy, Comedy, Drama';

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const movie = {
    id: 'tmdb-m-1654581',
    title: 'Nayyi Navelli (2026)',
    originalTitle: tmdb.original_title || 'नय्यी नवेल्ली',
    language: 'Hindi',
    dubLanguage: 'Hindi (Original)',
    badgeLeft: 'Hindi',
    badgeRight: 'HD Print',
    tag: 'HD Print',
    quality: 'HD 1080p',
    industry: 'Bollywood',
    year: '2026',
    country: 'India',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: '8.2',
    imdbRating: '8.2',
    poster: `https://image.tmdb.org/t/p/w500${tmdb.poster_path || '/aZEKuzGt7ObqoKjTM4kcMd0klYy.jpg'}`,
    backdrop: `https://image.tmdb.org/t/p/original${tmdb.backdrop_path || '/3aXMkyp0Pv2WGyvm2NUdtMXwY2P.jpg'}`,
    description: tmdb.overview || "A new bride's arrival turns a turbulent household in Meerut into a picture of domestic harmony, until her brother-in-law grows convinced that his seemingly perfect sister-in-law is secretly a witch.",
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
      console.log(`Skipping non-existent: ${file}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.movies) data.movies = [];

    // Remove existing if already present
    data.movies = data.movies.filter(m => m.id !== 'tmdb-m-1654581');

    // Add to the very top of movies list
    data.movies.unshift(movie);

    // Also update featured
    data.featured = movie;

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully added Nayyi Navelli (2026) to ${file}`);
  }

  console.log('All files updated successfully!');
}

addNayyiNavelli().catch(console.error);
