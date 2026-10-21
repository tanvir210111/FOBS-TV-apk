const fs = require('fs');
const path = require('path');

const hope2026Movie = {
  id: "tmdb-m-1058424",
  title: "Hope",
  originalTitle: "호프",
  language: "Korean",
  dubLanguage: "Hindi",
  year: "2026",
  country: "Korea",
  genre: "Sci-Fi, Mystery, Action",
  duration: "2h 37m",
  category: "Trending Movies",
  rating: "6.9",
  imdbRating: "7.0",
  poster: "https://image.tmdb.org/t/p/w500/6VY1ZKgpsc8CfGsQcCGiYEgHdH0.jpg",
  backdrop: "https://image.tmdb.org/t/p/original/qqHFLg90IUSoTmSMpKOOW5RyqN3.jpg",
  description: "In the remote South Korean village of Hope Harbor, police chief Bum-seok and officer Sung-ae are called to investigate a mysterious creature wreaking havoc on the community. But all is not as it seems, and perceptions can be misleading. What begins as ignorance plants the seed of disaster, escalating through human conflict into a tragedy of cosmic proportions.",
  audioTracks: [
    "Hindi dub",
    "Original Audio"
  ],
  selectedAudio: "Hindi dub",
  streamUrl: "https://hindidrama.net/hindi-dubbed-online/watch-hope-2026#player-sec",
  cast: [
    {
      name: "Hwang Jung-min",
      character: "Go Bum-seok",
      photo: "https://image.tmdb.org/t/p/w185/hKF1uh0iEfuZlBE79CXPw415qyn.jpg"
    },
    {
      name: "Zo In-sung",
      character: "Go Sung-ki",
      photo: "https://image.tmdb.org/t/p/w185/69gbyFI0ET0l0dyjKChlx1Zx269.jpg"
    },
    {
      name: "Hoyeon",
      character: "Lim Sung-ae",
      photo: "https://image.tmdb.org/t/p/w185/AfQFFyGeG9xOQnEJb1Ash1RomkP.jpg"
    },
    {
      name: "Alicia Vikander",
      character: "J'aur",
      photo: "https://image.tmdb.org/t/p/w185/lZu8qiTwiQIN96cuptgqMCCaUtg.jpg"
    },
    {
      name: "Michael Fassbender",
      character: "Ma'veyyo",
      photo: "https://image.tmdb.org/t/p/w185/xvbnUiB2ZBR3QIt595OzNy657Vw.jpg"
    },
    {
      name: "Taylor Russell",
      character: "Ai'dovor",
      photo: "https://image.tmdb.org/t/p/w185/3kW1SvpzyOPPZHxbz7cgR7ilmtQ.jpg"
    },
    {
      name: "Cameron Britton",
      character: "Va'migere",
      photo: "https://image.tmdb.org/t/p/w185/9HFxi8ZnBiby3AQ7tBOPDxXFkCT.jpg"
    },
    {
      name: "Lee Sang-hee",
      character: "Nak-yeon",
      photo: "https://image.tmdb.org/t/p/w185/wOYFSg20yGe48VFALqGAlrLjFHV.jpg"
    },
    {
      name: "Um Mun-suk",
      character: "Yang-bae",
      photo: "https://image.tmdb.org/t/p/w185/niV5OXu1cgKnlIU1Iamp1BVeCdT.jpg"
    }
  ],
  type: "movie"
};

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

  // Remove any previous hope entry (e.g. 2013 id tmdb-m-255709 or title Hope)
  data.movies = data.movies.filter(m => m.id !== 'tmdb-m-255709' && m.id !== hope2026Movie.id);
  
  // Unshift Hope 2026
  data.movies.unshift(hope2026Movie);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Updated ${filePath} with Hope (2026)`);
});

console.log('✅ Hope (2026) updated successfully!');
