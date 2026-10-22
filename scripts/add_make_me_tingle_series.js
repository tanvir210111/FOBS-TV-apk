const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';

async function addMakeMeTingle() {
  console.log('Fetching Make Me Tingle data from TMDB (ID: 311648)...');
  const res = await fetch(`https://api.themoviedb.org/3/tv/311648?api_key=${TMDB_API_KEY}&append_to_response=credits`);
  const tmdb = await res.json();

  const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/311648/season/1?api_key=${TMDB_API_KEY}`);
  const seasonData = await seasonRes.json();

  const genresStr = (tmdb.genres || []).map(g => g.name).join(', ') || 'Comedy, Drama, Romance';

  const cast = (tmdb.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || '',
    photo: c.profile_path
      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  }));

  const episodes = [
    {
      epNum: 1,
      streamUrl: 'https://hdfriday2.casa/episodes/make-me-tingle-1x1/'
    },
    {
      epNum: 2,
      streamUrl: 'https://irada438esc.com/play/tt47661704?ep=2'
    },
    {
      epNum: 3,
      streamUrl: 'https://irada438esc.com/play/tt47661704?ep=3'
    },
    {
      epNum: 4,
      streamUrl: 'https://hdfriday2.casa/episodes/make-me-tingle-1x4/'
    }
  ].map(({ epNum, streamUrl }) => {
    const tmdbEp = (seasonData.episodes || []).find(e => e.episode_number === epNum) || {};
    const pad = epNum.toString().padStart(2, '0');
    return {
      number: pad,
      title: `Episode ${pad} - ${tmdbEp.name || `Episode ${epNum}`}`,
      duration: `${tmdbEp.runtime || 55}m`,
      overview: tmdbEp.overview || `Episode ${epNum} of Make Me Tingle.`,
      still: tmdbEp.still_path
        ? `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}`
        : `https://image.tmdb.org/t/p/w500${tmdb.backdrop_path}`,
      streamUrl: streamUrl,
      servers: [
        {
          name: 'Server 1 (Fast HD - 1080p)',
          url: 'https://irada438esc.com/play/tt47661704'
        },
        {
          name: 'Server 2 (HD Player)',
          url: streamUrl
        },
        {
          name: 'Server 3 (Super Player)',
          url: `https://streamimdb.ru/embed/tv/tt47661704/S01E0${epNum}`
        }
      ],
      audioTracks: {
        'Original Audio': 'https://irada438esc.com/play/tt47661704'
      }
    };
  });

  const series = {
    id: 'tmdb-s-311648',
    title: 'Make Me Tingle (Ongoing)',
    originalTitle: tmdb.original_name || '내가 떨릴 수 있게',
    language: 'Korean',
    dubLanguage: 'Original Audio',
    badgeLeft: 'K-Drama',
    badgeRight: 'ONGOING',
    isOngoing: true,
    status: 'Ongoing',
    year: '2026',
    country: 'Korea',
    genre: genresStr,
    seasonsCount: 1,
    releasedEpisodes: 4,
    totalEpisodes: tmdb.number_of_episodes || 10,
    category: 'Trending Series',
    rating: '8.4',
    imdbRating: '8.4',
    poster: `https://image.tmdb.org/t/p/w500${tmdb.poster_path || '/e4MlbtE02So4D5DJy197DbiAxqs.jpg'}`,
    backdrop: `https://image.tmdb.org/t/p/original${tmdb.backdrop_path || '/voAufY8Jv3AVfG15sxY5H6XWFKr.jpg'}`,
    description: `[Ongoing K-Drama - 4 Episodes Released] ${tmdb.overview || 'A marketer with traditional views on love and marriage tries to navigate a connection with an adult toy company CEO with different values.'}`,
    audioTracks: ['Original Audio'],
    selectedAudio: 'Original Audio',
    streamUrl: 'https://irada438esc.com/play/tt47661704',
    servers: [
      {
        name: 'Server 1 (Fast HD - 1080p)',
        url: 'https://irada438esc.com/play/tt47661704'
      },
      {
        name: 'Server 2 (HD Player)',
        url: 'https://hdfriday2.casa/episodes/make-me-tingle-1x1/'
      },
      {
        name: 'Server 3 (Super Player)',
        url: 'https://streamimdb.ru/embed/tv/tt47661704/S01E01'
      }
    ],
    cast: cast,
    episodes: episodes,
    type: 'series'
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
    if (!data.series) data.series = [];

    // Remove existing if already present
    data.series = data.series.filter(s => s.id !== 'tmdb-s-311648');

    // Add to top of series list
    data.series.unshift(series);

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully added Make Me Tingle (2026) with 4 episodes to ${file}`);
  }

  console.log('All series data updated successfully!');
}

addMakeMeTingle().catch(console.error);
