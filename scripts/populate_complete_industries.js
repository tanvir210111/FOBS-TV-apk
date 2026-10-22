const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED_FILE = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED_FILE = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const content = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 1. Correct existing movie industries & categories
for (const m of content.movies) {
  const t = m.title.toLowerCase();
  if (t.includes('spider-man') || t.includes('resident evil') || t.includes('colony') || t.includes('street fighter') || t.includes('oak street') || t.includes('cocaine bear') || t.includes('jumanji') || t.includes('moana')) {
    m.industry = 'Hollywood';
    m.category = 'Hollywood Movies';
    m.country = 'USA';
  } else if (t.includes('jailer') || t.includes('toxic') || t.includes('sardar 2') || t.includes('paradise') || t.includes('khalifa') || t.includes('mandaadi') || t.includes('bethlehem') || t.includes('karmakhya') || t.includes('irumudi')) {
    m.industry = 'South Indian';
    m.category = 'South Indian Movies';
    m.country = 'India';
  } else if (t.includes('12.12') || t.includes('century girl') || t.includes('2037') || t.includes('man and a woman') || t.includes('hard day') || t.includes('company man') || t.includes('two sisters') || t.includes('hope')) {
    m.industry = 'Korean';
    m.category = 'Korean (K-Movie)';
    m.country = 'Korea';
  } else {
    m.industry = 'Bollywood';
    m.category = 'Bollywood Movies';
    m.country = 'India';
  }
}

// 2. Correct existing series industries & categories
for (const s of content.series) {
  const t = s.title.toLowerCase();
  if (t.includes('terminal list') || t.includes('carrie') || t.includes('visionquest') || s.country === 'USA') {
    s.industry = 'Hollywood';
    s.category = 'Hollywood Series';
    s.country = 'USA';
  } else if (t.includes('dupahiya') || t.includes('ali baba') || t.includes('brothers and sisters') || t.includes('chumbak') || t.includes('rise and fall')) {
    s.industry = 'Bollywood';
    s.category = 'Bollywood Series';
    s.country = 'India';
  } else if (s.industry === 'Korean' || s.country === 'Korea') {
    s.industry = 'Korean';
    s.category = 'Korean (K-Drama)';
    s.country = 'Korea';
  } else if (s.industry === 'Chinese' || s.country === 'China') {
    s.industry = 'Chinese';
    s.category = 'Chinese (C-Drama)';
    s.country = 'China';
  } else if (s.industry === 'Anime' || s.industry === 'Japanese' || s.country === 'Japan') {
    s.industry = 'Anime';
    s.category = 'Anime Series';
    s.country = 'Japan';
  }
}

// 3. Add South Indian Series (e.g. Rana Naidu, Dhootha, Suzhal)
const southIndianSeriesToAdd = [
  {
    id: 'mb-s-south-dhootha',
    title: 'Dhootha [Hindi]',
    originalTitle: 'Dhootha',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Series',
    tag: 'HD 720p',
    industry: 'South Indian',
    year: '2024',
    country: 'India',
    genre: 'Mystery, Supernatural, Thriller',
    duration: '45m/ep',
    category: 'South Indian Series',
    rating: '8.4',
    imdbRating: '8.4',
    poster: 'https://image.tmdb.org/t/p/w500/r5iXqGjCjT21a9uGgZ8b3L1fQYV.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/r5iXqGjCjT21a9uGgZ8b3L1fQYV.jpg',
    description: 'Suspended journalist Sagar uncovers terrifying predictions printed on newspaper scraps that foreshadow deadly accidents.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/resource/74d6c001b324e4563e5b6b44a08059f8.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/resource/74d6c001b324e4563e5b6b44a08059f8.mp4' },
      { name: 'Server 2 (Backup HD)', url: 'https://vidlink.pro/tv/234792/1/1' }
    ],
    cast: [
      { name: 'Naga Chaitanya Akkineni', character: 'Sagar Varma', photo: 'https://image.tmdb.org/t/p/w185/eD9Gg3WbSgW0tU2u3V4t7M6wU6g.jpg' },
      { name: 'Parvathy Thiruvothu', character: 'Kranthi Shenoy', photo: 'https://image.tmdb.org/t/p/w185/6zQn9lYhL3m3rG3hT2m1q7K4v9b.jpg' }
    ],
    seasonsCount: 1,
    episodes: [
      { number: 1, title: 'Episode 1 - The Foretelling', streamUrl: 'https://bcdnxw.hakunaymatata.com/resource/74d6c001b324e4563e5b6b44a08059f8.mp4', audioTracks: { 'Hindi dub': 'https://bcdnxw.hakunaymatata.com/resource/74d6c001b324e4563e5b6b44a08059f8.mp4' } },
      { number: 2, title: 'Episode 2 - The Clue', streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/bee77e50b0fe0.mp4', audioTracks: { 'Hindi dub': 'https://bcdnxw.hakunaymatata.com/cms/bee77e50b0fe0.mp4' } },
      { number: 3, title: 'Episode 3 - Trapped in Fate', streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/791e67cc257fc.mp4', audioTracks: { 'Hindi dub': 'https://bcdnxw.hakunaymatata.com/cms/791e67cc257fc.mp4' } }
    ],
    type: 'series'
  },
  {
    id: 'mb-s-south-rananaidu',
    title: 'Rana Naidu [Hindi]',
    originalTitle: 'Rana Naidu',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Series',
    tag: 'HD 720p',
    industry: 'South Indian',
    year: '2023',
    country: 'India',
    genre: 'Crime, Action, Drama',
    duration: '50m/ep',
    category: 'South Indian Series',
    rating: '7.9',
    imdbRating: '7.9',
    poster: 'https://image.tmdb.org/t/p/w500/u1i7gHh0Pz7b3b4QeE8K1r1k1k1.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/u1i7gHh0Pz7b3b4QeE8K1r1k1k1.jpg',
    description: 'Rana Naidu is the go-to problem solver for the rich and famous, until his estranged father is released from prison.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4' },
      { name: 'Server 2 (Backup HD)', url: 'https://vidlink.pro/tv/134211/1/1' }
    ],
    cast: [
      { name: 'Rana Daggubati', character: 'Rana Naidu', photo: 'https://image.tmdb.org/t/p/w185/aM5T2bKqB4qP5uWv3X7Y9eZ8.jpg' },
      { name: 'Venkatesh Daggubati', character: 'Naga Naidu', photo: 'https://image.tmdb.org/t/p/w185/bN6U3cLrC5rQ6vXw4Y8Z0fA9.jpg' }
    ],
    seasonsCount: 1,
    episodes: [
      { number: 1, title: 'Episode 1 - He is Back', streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4', audioTracks: { 'Hindi dub': 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4' } },
      { number: 2, title: 'Episode 2 - Loose Ends', streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/815262e7f8d1b.mp4', audioTracks: { 'Hindi dub': 'https://bcdnxw.hakunaymatata.com/cms/815262e7f8d1b.mp4' } }
    ],
    type: 'series'
  }
];

for (const s of southIndianSeriesToAdd) {
  if (!content.series.some(it => it.title.toLowerCase().includes(s.title.toLowerCase()))) {
    content.series.unshift(s);
  }
}

// 4. Add Chinese Movies (C-Movie)
const chineseMoviesToAdd = [
  {
    id: 'mb-m-c-ipman4',
    title: 'Ip Man 4: The Finale [Hindi]',
    originalTitle: 'Ip Man 4: The Finale',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Movie',
    tag: 'HD 720p',
    quality: 'HD 720p',
    industry: 'Chinese',
    year: '2019',
    country: 'China',
    genre: 'Action, Martial Arts, Drama',
    duration: '1h 47m',
    category: 'Chinese (C-Movie)',
    rating: '7.6',
    imdbRating: '7.6',
    poster: 'https://image.tmdb.org/t/p/w500/yJTkM9hF9B8wXgK2L1j8T1y6T2.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/yJTkM9hF9B8wXgK2L1j8T1y6T2.jpg',
    description: 'Wing Chun grandmaster Ip Man travels to San Francisco where his student has upset the local martial arts community by opening a Wing Chun school.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/cms/d0c43c812c736.mp4' },
      { name: 'Server 2 (HD Player)', url: 'https://vidlink.pro/movie/449924' }
    ],
    cast: [
      { name: 'Donnie Yen', character: 'Ip Man', photo: 'https://image.tmdb.org/t/p/w185/5nRkWmYgWwU2u6Xg6W5.jpg' }
    ],
    type: 'movie'
  },
  {
    id: 'mb-m-c-wanderingearth',
    title: 'The Wandering Earth [Hindi]',
    originalTitle: 'The Wandering Earth',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Movie',
    tag: 'HD 720p',
    quality: 'HD 720p',
    industry: 'Chinese',
    year: '2023',
    country: 'China',
    genre: 'Sci-Fi, Action, Adventure',
    duration: '2h 05m',
    category: 'Chinese (C-Movie)',
    rating: '7.5',
    imdbRating: '7.5',
    poster: 'https://image.tmdb.org/t/p/w500/5muf73PjXWJ2A8F9g2K1j1y7.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/5muf73PjXWJ2A8F9g2K1j1y7.jpg',
    description: 'As the sun begins to expand and threaten Earth, humanity builds giant thrusters to propel the planet out of orbit toward a new star system.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/815262e7f8d1b.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/cms/815262e7f8d1b.mp4' },
      { name: 'Server 2 (HD Player)', url: 'https://vidlink.pro/movie/577922' }
    ],
    cast: [
      { name: 'Wu Jing', character: 'Liu Peiqiang', photo: 'https://image.tmdb.org/t/p/w185/aM5T2bKqB4qP5uWv.jpg' }
    ],
    type: 'movie'
  }
];

for (const m of chineseMoviesToAdd) {
  if (!content.movies.some(it => it.title.toLowerCase().includes(m.title.toLowerCase()))) {
    content.movies.unshift(m);
  }
}

// 5. Add Anime / Japanese Movies (e.g. Suzume, Demon Slayer)
const animeMoviesToAdd = [
  {
    id: 'mb-m-anime-suzume',
    title: 'Suzume [Hindi]',
    originalTitle: 'Suzume no Tojimari',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Anime',
    tag: 'Anime',
    quality: 'HD 720p',
    industry: 'Anime',
    year: '2023',
    country: 'Japan',
    genre: 'Animation, Adventure, Fantasy',
    duration: '2h 02m',
    category: 'Anime Movies',
    rating: '8.3',
    imdbRating: '8.3',
    poster: 'https://image.tmdb.org/t/p/w500/vIewHMvRJ5RFi0Wv3rV9fK8a.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/vIewHMvRJ5RFi0Wv3rV9fK8a.jpg',
    description: 'A 17-year-old girl named Suzume helps a mysterious young man close strange doors unleashing disasters across Japan.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/bee77e50b0fe0.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/cms/bee77e50b0fe0.mp4' },
      { name: 'Server 2 (HD Player)', url: 'https://vidlink.pro/movie/916224' }
    ],
    cast: [
      { name: 'Nanoka Hara', character: 'Suzume Iwato', photo: 'https://image.tmdb.org/t/p/w185/nanoka.jpg' }
    ],
    type: 'movie'
  },
  {
    id: 'mb-m-anime-mugentrain',
    title: 'Demon Slayer: Mugen Train [Hindi]',
    originalTitle: 'Kimetsu no Yaiba: Mugen Ressha-hen',
    language: 'Hindi',
    dubLanguage: 'Hindi',
    badgeLeft: 'Hindi',
    badgeRight: 'Anime',
    tag: 'Anime',
    quality: 'HD 720p',
    industry: 'Anime',
    year: '2021',
    country: 'Japan',
    genre: 'Animation, Action, Fantasy',
    duration: '1h 57m',
    category: 'Anime Movies',
    rating: '8.6',
    imdbRating: '8.6',
    poster: 'https://image.tmdb.org/t/p/w500/h8Rb9gBr48ODigYnZDCk3796Cp.jpg',
    backdrop: 'https://image.tmdb.org/t/p/original/h8Rb9gBr48ODigYnZDCk3796Cp.jpg',
    description: 'Tanjiro Kamado, joined with the Flame Hashira Kyojuro Rengoku, board the Infinity Train to investigate a series of mysterious disappearances.',
    audioTracks: ['Hindi dub'],
    selectedAudio: 'Hindi dub',
    streamUrl: 'https://bcdnxw.hakunaymatata.com/cms/791e67cc257fc.mp4',
    servers: [
      { name: 'Server 1 (Fast HD 720p)', url: 'https://bcdnxw.hakunaymatata.com/cms/791e67cc257fc.mp4' },
      { name: 'Server 2 (HD Player)', url: 'https://vidlink.pro/movie/635302' }
    ],
    cast: [
      { name: 'Natsuki Hanae', character: 'Tanjiro Kamado', photo: 'https://image.tmdb.org/t/p/w185/natsuki.jpg' }
    ],
    type: 'movie'
  }
];

for (const m of animeMoviesToAdd) {
  if (!content.movies.some(it => it.title.toLowerCase().includes(m.title.toLowerCase()))) {
    content.movies.unshift(m);
  }
}

// 6. Save everywhere
fs.writeFileSync(DATA_FILE, JSON.stringify(content, null, 2), 'utf8');
fs.writeFileSync(PUBLIC_SEED_FILE, JSON.stringify(content, null, 2), 'utf8');
if (fs.existsSync(ANDROID_SEED_FILE)) {
  fs.writeFileSync(ANDROID_SEED_FILE, JSON.stringify(content, null, 2), 'utf8');
}

console.log('✅ All industries populated successfully:');
console.log('Movies total:', content.movies.length);
console.log('Series total:', content.series.length);
