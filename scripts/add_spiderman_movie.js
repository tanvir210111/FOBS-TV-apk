const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const STREAM_URL = 'http://index2.circleftp.net/FILE/English%20&%20Foreign%20Dubbed%20Movies/2026/Spider-Man%20Brand%20New%20Day%20(2026)%20IMAX%201080p%20WEBRip%20[Dual%20Audio]%20[Hindi+English]%20x264/Spider-Man%20Brand%20New%20Day%20(2026)%20IMAX%201080p%20WEBRip%20[Dual%20Audio]%20[Hindi+English]%20x264.mkv';

async function addSpiderManMovie() {
  console.log('Fetching Spider-Man: Brand New Day (2026) data from TMDB (ID: 969681)...');
  const res = await axios.get('https://api.themoviedb.org/3/movie/969681', {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  const tmdb = res.data;

  // Format duration into "Xh Ym"
  const runtime = tmdb.runtime || 145;
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  const durationStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  // Format genres
  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Action, Science Fiction, Adventure';

  // Format cast (top 10)
  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const spiderManMovie = {
    id: `tmdb-m-${tmdb.id}`,
    title: tmdb.title || 'Spider-Man: Brand New Day',
    originalTitle: tmdb.original_title || 'Spider-Man: Brand New Day',
    language: 'English',
    dubLanguage: 'Hindi',
    industry: 'Hollywood',
    year: tmdb.release_date ? tmdb.release_date.split('-')[0] : '2026',
    country: 'USA',
    genre: genresStr,
    duration: durationStr,
    category: 'Trending Movies',
    rating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.5',
    imdbRating: tmdb.vote_average ? tmdb.vote_average.toFixed(1) : '8.5',
    poster: tmdb.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
      : 'https://image.tmdb.org/t/p/w500/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg',
    backdrop: tmdb.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : 'https://image.tmdb.org/t/p/original/r08LxMJCbf1SiJIWeyH9aJmdqwC.jpg',
    description: tmdb.overview || "Fighting crime full-time as Spider-Man in a world that doesn't remember him—and the pressure of seeing his old friends move on without him—sparks a change in Peter Parker he may not have the power to control. But that transformation might also be the only thing that can stop a shocking new threat to the city and those he loves - a powerful villain no one can even see.",
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
  console.log(JSON.stringify(spiderManMovie, null, 2));

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
    data.movies = data.movies.filter(m => m.id !== spiderManMovie.id && !m.title.toLowerCase().includes('brand new day'));

    // Add Spider-Man: Brand New Day (2026) as first item in movies list
    data.movies.unshift(spiderManMovie);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${filePath} with Spider-Man: Brand New Day (2026)`);
  });

  console.log('\n🎉 Successfully added Spider-Man: Brand New Day (2026) to all content stores!');
}

addSpiderManMovie().catch(err => {
  console.error('Error adding Spider-Man movie:', err);
  process.exit(1);
});
