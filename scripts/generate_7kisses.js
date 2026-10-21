const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const KMDL_BASE = 'https://kmdl.eu.org';
const FOLDER_PATH = '/0:/7%20First%20Kisses%20%7C%202016%20%7C%206.2%20%F0%9F%8C%90/Hindi%20Fan%20Dubbed%20%7C%20720p%20%7C%20H.264%20%7C%20WEB-Rip/';

async function main() {
  console.log('1. Fetching KMDL files...');
  const kmdlRes = await axios.post(KMDL_BASE + decodeURIComponent(FOLDER_PATH), { page_index: 0, password: '' }, { timeout: 15000 });
  const kmdlFiles = (kmdlRes.data?.data?.files || []).filter(f => f.link);
  console.log(`Found ${kmdlFiles.length} files on KMDL.`);

  // Sort by episode name/number
  kmdlFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  console.log('2. Fetching TMDB TV Details...');
  const tvRes = await axios.get('https://api.themoviedb.org/3/tv/68879', {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits,external_ids' }
  });
  const tvData = tvRes.data;

  console.log('3. Fetching TMDB Season 1 Details...');
  const seasonRes = await axios.get('https://api.themoviedb.org/3/tv/68879/season/1', {
    params: { api_key: TMDB_API_KEY }
  });
  const tmdbEpisodes = seasonRes.data.episodes || [];

  const genreStr = tvData.genres?.map(g => g.name).join(', ') || 'Romance, Comedy';

  const cast = (tvData.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const episodes = kmdlFiles.map((file, idx) => {
    const numStr = (idx + 1).toString().padStart(2, '0');
    const tmdbEp = tmdbEpisodes.find(e => e.episode_number === (idx + 1));
    const fullStreamUrl = `${KMDL_BASE}${file.link}`;
    const epTitle = tmdbEp && tmdbEp.name ? `Episode ${numStr}: ${tmdbEp.name}` : `Episode ${numStr}`;
    const duration = tmdbEp?.runtime ? `${tmdbEp.runtime}m` : '10m';

    return {
      number: numStr,
      title: epTitle,
      duration: duration,
      streamUrl: fullStreamUrl,
      audioTracks: {
        "Hindi (Fan Dubbed)": fullStreamUrl,
        "Hindi dub": fullStreamUrl,
        "Original Audio": fullStreamUrl
      }
    };
  });

  const seriesEntry = {
    id: "tmdb-s-68879",
    title: "7 First Kisses",
    originalTitle: tvData.original_name || "첫키스만 일곱번째",
    language: "Korean",
    dubLanguage: "Hindi (Fan Dubbed)",
    year: tvData.first_air_date ? tvData.first_air_date.split('-')[0] : "2016",
    country: "Korea",
    genre: genreStr,
    seasonsCount: 1,
    category: "Trending Series",
    rating: "6.2",
    imdbRating: "6.2",
    poster: tvData.poster_path ? `https://image.tmdb.org/t/p/w500${tvData.poster_path}` : "https://image.tmdb.org/t/p/w500/mggbtPg9GHFfOqlzAL40u5Kdkep.jpg",
    backdrop: tvData.backdrop_path ? `https://image.tmdb.org/t/p/original${tvData.backdrop_path}` : "https://image.tmdb.org/t/p/original/iszqScVheXhMMjxRZr8tbVu9EU9.jpg",
    description: tvData.overview || "Min Soo Jin meets a goddess who allows her to choose one guy among seven as her first kiss.",
    audioTracks: [
      "Hindi (Fan Dubbed)",
      "Original Audio"
    ],
    selectedAudio: "Hindi (Fan Dubbed)",
    cast: cast,
    episodes: episodes,
    type: "series"
  };

  console.log('Generated Series Entry:');
  console.log(JSON.stringify({ ...seriesEntry, episodes: seriesEntry.episodes.map(e => ({ number: e.number, title: e.title, duration: e.duration, streamUrl: e.streamUrl.substring(0, 60) + '...' })) }, null, 2));

  fs.writeFileSync(path.join(__dirname, '7_first_kisses.json'), JSON.stringify(seriesEntry, null, 2), 'utf8');
  console.log('Saved to scripts/7_first_kisses.json');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
