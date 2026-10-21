const fs = require('fs');
const path = require('path');

const hopeMovie = {
  id: "tmdb-m-255709",
  title: "Hope",
  originalTitle: "소원",
  language: "Korean",
  dubLanguage: "Hindi",
  year: "2013",
  country: "Korea",
  genre: "Drama",
  duration: "2h 03m",
  category: "Trending Movies",
  rating: "8.4",
  imdbRating: "8.2",
  poster: "https://image.tmdb.org/t/p/w500/x9yjkm9gIz5qI5fJMUTfBnWiB2o.jpg",
  backdrop: "https://image.tmdb.org/t/p/original/cri20wZDTl1X5QpxlWCSJ4HSpTF.jpg",
  description: "After 8-year-old So-won narrowly survives a brutal sexual assault, her family labors to help her heal while coping with their own rage and grief.",
  audioTracks: [
    "Hindi dub",
    "Original Audio"
  ],
  selectedAudio: "Hindi dub",
  streamUrl: "https://hindidrama.net/hindi-dubbed-online/watch-hope-2026#player-sec",
  cast: [
    {
      name: "Sul Kyung-gu",
      character: "Dong-hoon",
      photo: "https://image.tmdb.org/t/p/w185/teD7AMzfNl4qhQO2b6MAWwLtPVn.jpg"
    },
    {
      name: "Uhm Ji-won",
      character: "Mi-hee",
      photo: "https://image.tmdb.org/t/p/w185/icqDRYRw9T99ZIHYCxTUrl0s6aS.jpg"
    },
    {
      name: "Lee Re",
      character: "So-won",
      photo: "https://image.tmdb.org/t/p/w185/5KU4nUOdQxgcvRoOEOQtAaRFbTY.jpg"
    },
    {
      name: "Kim Sang-ho",
      character: "Gwang-sik",
      photo: "https://image.tmdb.org/t/p/w185/zV7FlWdIfnl9UxqW5Bw8W77YjiU.jpg"
    },
    {
      name: "Kim Hae-sook",
      character: "Psychiatrist Jung-sook",
      photo: "https://image.tmdb.org/t/p/w185/dt5bmKeG7qbvDwHrxFZFxiGc9fZ.jpg"
    },
    {
      name: "Ra Mi-ran",
      character: "Young-suk's Mother",
      photo: "https://image.tmdb.org/t/p/w185/45jkWK6vQpQo32FsbGMSDrZig62.jpg"
    },
    {
      name: "Kwon Tae-won",
      character: "Detective Squad Chief",
      photo: "https://image.tmdb.org/t/p/w185/c0i2M1l9sLM10dFARfy1MLM3mSE.jpg"
    },
    {
      name: "Kang Shin-chul",
      character: "Prosecutor",
      photo: "https://image.tmdb.org/t/p/w185/jlgzApoXgacITXIZzz8TOJ2JfVr.jpg"
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

  const existingIdx = data.movies.findIndex(m => m.id === hopeMovie.id || m.title.toLowerCase() === 'hope');
  if (existingIdx !== -1) {
    console.log(`Replacing existing movie in ${filePath}`);
    data.movies[existingIdx] = hopeMovie;
  } else {
    console.log(`Adding Hope movie to top of ${filePath}`);
    data.movies.unshift(hopeMovie);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Updated ${filePath}`);
});

console.log('✅ Hope (2013) movie added successfully!');
