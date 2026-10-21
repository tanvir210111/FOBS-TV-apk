const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const KMDL_BASE = 'https://kmdl.eu.org';
const FOLDER_PATH = '/0:/A%20Killer%20Paradox%20%7C%202024%20%7C%207.3%20%F0%9F%8C%90%F0%9F%94%9E/Multi%20Audio%20%7C%20Korean%20%7C%20English%20Dubbed%20%7C%20Hindi%20Dubbed%20%7C%20720p%20%7C%20H.265%20%7C%20WEB-DL/';

async function main() {
  console.log('1. Fetching KMDL files for A Killer Paradox...');
  const kmdlRes = await axios.post(KMDL_BASE + decodeURIComponent(FOLDER_PATH), { page_index: 0, password: '' }, { timeout: 15000 });
  const kmdlFiles = (kmdlRes.data?.data?.files || []).filter(f => f.link);
  console.log(`Found ${kmdlFiles.length} files on KMDL.`);

  // Sort files numerically by name
  kmdlFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  console.log('2. Fetching TMDB TV Details...');
  const tvRes = await axios.get('https://api.themoviedb.org/3/tv/202783', {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits' }
  });
  const tvData = tvRes.data;

  console.log('3. Fetching TMDB Season 1 Details...');
  const seasonRes = await axios.get('https://api.themoviedb.org/3/tv/202783/season/1', {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = seasonRes.data.episodes || [];

  const genreStr = tvData.genres?.map(g => g.name).join(', ') || 'Crime, Mystery, Drama';

  const cast = (tvData.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const episodes = kmdlFiles.map((file, idx) => {
    const numStr = (idx + 1).toString().padStart(2, '0');
    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === (idx + 1));
    const fullStreamUrl = `${KMDL_BASE}${file.link}`;
    const epTitle = `Episode ${numStr}`;
    const duration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '50m';

    return {
      number: numStr,
      title: epTitle,
      duration: duration,
      streamUrl: fullStreamUrl,
      audioTracks: {
        "Hindi dub": fullStreamUrl,
        "Korean Original": fullStreamUrl,
        "English dub": fullStreamUrl
      }
    };
  });

  const seriesEntry = {
    id: "tmdb-s-202783",
    title: "A Killer Paradox",
    originalTitle: tvData.original_name || "살인자ㅇ난감",
    language: "Korean",
    dubLanguage: "Hindi",
    year: tvData.first_air_date ? tvData.first_air_date.split('-')[0] : "2024",
    country: "Korea",
    genre: genreStr,
    seasonsCount: 1,
    category: "Trending Series",
    rating: tvData.vote_average ? tvData.vote_average.toFixed(1) : "7.4",
    imdbRating: "7.3",
    poster: tvData.poster_path ? `https://image.tmdb.org/t/p/w500${tvData.poster_path}` : "https://image.tmdb.org/t/p/w500/i2yYZGT2If8XcCZS9ASF1g13MiT.jpg",
    backdrop: tvData.backdrop_path ? `https://image.tmdb.org/t/p/original${tvData.backdrop_path}` : "https://image.tmdb.org/t/p/original/viQZtznvR20oTTSbXp6MPAWkGB2.jpg",
    description: tvData.overview || "When one accidental killing leads to another, an ordinary young man finds himself stuck in an endless cat-and-mouse chase with a shrewd detective.",
    audioTracks: [
      "Hindi dub",
      "Korean Original",
      "English dub"
    ],
    selectedAudio: "Hindi dub",
    cast: cast,
    episodes: episodes,
    type: "series"
  };

  console.log('Series parsed successfully. Updating content files...');

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

    const existingIdx = data.series.findIndex(s => s.id === seriesEntry.id || s.title === seriesEntry.title);
    if (existingIdx !== -1) {
      console.log(`Replacing existing series at index ${existingIdx} in ${filePath}`);
      data.series[existingIdx] = seriesEntry;
    } else {
      console.log(`Adding series to top of ${filePath}`);
      data.series.unshift(seriesEntry);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Updated ${filePath}`);
  });

  console.log('✅ A Killer Paradox successfully added to all datasets!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
