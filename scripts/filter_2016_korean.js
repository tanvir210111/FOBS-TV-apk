const fs = require('fs');
const path = require('path');

const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2016_raw_hindi.json'), 'utf8'));

// Known 2016 Kdramas and Kmovies target keywords
const target2016 = [
  // Kdrama 2016
  { key: 'descendants of the sun', type: 'series', title: 'Descendants of the Sun' },
  { key: 'moon lovers', type: 'series', title: 'Moon Lovers: Scarlet Heart Ryeo' },
  { key: 'scarlet heart ryeo', type: 'series', title: 'Moon Lovers: Scarlet Heart Ryeo' },
  { key: 'w two worlds', type: 'series', title: 'W - Two Worlds Apart' },
  { key: 'w - two worlds', type: 'series', title: 'W - Two Worlds Apart' },
  { key: 'signal', type: 'series', title: 'Signal' },
  { key: 'uncontrollably fond', type: 'series', title: 'Uncontrollably Fond' },
  { key: 'cheese in the trap', type: 'series', title: 'Cheese in the Trap' },
  { key: 'doctors', type: 'series', title: 'Doctors' },
  { key: 'doctor crush', type: 'series', title: 'Doctors' },
  { key: 'love in the moonlight', type: 'series', title: 'Love in the Moonlight' },
  { key: 'moonlight drawn by clouds', type: 'series', title: 'Love in the Moonlight' },
  { key: 'cinderella and the four knights', type: 'series', title: 'Cinderella with Four Knights' },
  { key: 'cinderella with four knights', type: 'series', title: 'Cinderella with Four Knights' },
  { key: 'cinderella and four knights', type: 'series', title: 'Cinderella with Four Knights' },
  { key: 'the k2', type: 'series', title: 'The K2' },
  { key: 'k2', type: 'series', title: 'The K2' },
  { key: 'shopping king louie', type: 'series', title: 'Shopping King Louie' },
  { key: 'shopping king louis', type: 'series', title: 'Shopping King Louie' },
  { key: 'jealousy incarnate', type: 'series', title: 'Jealousy Incarnate' },
  { key: "don't dare to dream", type: 'series', title: 'Jealousy Incarnate' },
  { key: 'another miss oh', type: 'series', title: 'Another Miss Oh' },
  { key: 'another oh hae young', type: 'series', title: 'Another Miss Oh' },
  { key: 'age of youth', type: 'series', title: 'Age of Youth' },
  { key: 'hello my twenties', type: 'series', title: 'Age of Youth' },
  { key: 'remember war of the son', type: 'series', title: 'Remember: War of the Son' },
  { key: 'remember: war of the son', type: 'series', title: 'Remember: War of the Son' },
  { key: "let's fight ghost", type: 'series', title: "Let's Fight Ghost" },
  { key: 'bring it on ghost', type: 'series', title: "Let's Fight Ghost" },
  { key: 'romantic doctor', type: 'series', title: 'Dr. Romantic' },
  { key: 'dr. romantic', type: 'series', title: 'Dr. Romantic' },
  { key: 'dr romantic', type: 'series', title: 'Dr. Romantic' },
  { key: 'squad 38', type: 'series', title: 'Squad 38' },
  { key: '38 task force', type: 'series', title: 'Squad 38' },
  { key: 'beautiful gong shim', type: 'series', title: 'Beautiful Gong Shim' },
  { key: 'lucky romance', type: 'series', title: 'Lucky Romance' },
  { key: 'goodbye mr black', type: 'series', title: 'Goodbye Mr. Black' },
  { key: 'come back mister', type: 'series', title: 'Come Back Mister' },
  { key: 'drinking solo', type: 'series', title: 'Drinking Solo' },
  { key: 'sweet stranger and me', type: 'series', title: 'Sweet Stranger and Me' },
  { key: 'the man living in our house', type: 'series', title: 'Sweet Stranger and Me' },
  { key: "solomon's perjury", type: 'series', title: "Solomon's Perjury" },
  { key: 'night light', type: 'series', title: 'Night Light' },
  { key: 'madame antoine', type: 'series', title: 'Madame Antoine' },
  { key: 'the good wife', type: 'series', title: 'The Good Wife' },
  { key: 'fantastic', type: 'series', title: 'Fantastic' },
  { key: 'monster', type: 'series', title: 'Monster' },

  // Kmovie 2016
  { key: 'train to busan', type: 'movie', title: 'Train to Busan' },
  { key: 'the handmaiden', type: 'movie', title: 'The Handmaiden' },
  { key: 'the wailing', type: 'movie', title: 'The Wailing' },
  { key: 'the age of shadows', type: 'movie', title: 'The Age of Shadows' },
  { key: 'age of shadows', type: 'movie', title: 'The Age of Shadows' },
  { key: 'asura: the city of madness', type: 'movie', title: 'Asura: The City of Madness' },
  { key: 'asura the city of madness', type: 'movie', title: 'Asura: The City of Madness' },
  { key: 'a violent prosecutor', type: 'movie', title: 'A Violent Prosecutor' },
  { key: 'violent prosecutor', type: 'movie', title: 'A Violent Prosecutor' },
  { key: 'the last princess', type: 'movie', title: 'The Last Princess' },
  { key: 'master', type: 'movie', title: 'Master' },
  { key: 'pandora', type: 'movie', title: 'Pandora' },
  { key: 'luck-key', type: 'movie', title: 'Luck-Key' },
  { key: 'luck key', type: 'movie', title: 'Luck-Key' },
  { key: 'my annoying brother', type: 'movie', title: 'My Annoying Brother' },
  { key: 'operation chromite', type: 'movie', title: 'Operation Chromite' },
  { key: 'time renegades', type: 'movie', title: 'Time Renegades' },
  { key: 'derailed', type: 'movie', title: 'Derailed' },
  { key: 'canola', type: 'movie', title: 'Canola' },
  { key: 'vanishing time', type: 'movie', title: 'Vanishing Time: A Boy Who Returned' }
];

const matchedResults = [];
const seenIds = new Set();

for (const cand of candidates) {
  const titleLow = (cand.title || '').toLowerCase();
  const pathLow = (cand.detailPath || '').toLowerCase();

  for (const t of target2016) {
    if (titleLow.includes(t.key) || pathLow.includes(t.key.replace(/[^a-z0-9]/g, '-'))) {
      if (!seenIds.has(cand.subjectId)) {
        seenIds.add(cand.subjectId);
        matchedResults.push({
          targetTitle: t.title,
          matchedTitle: cand.title,
          type: cand.subjectType === 2 ? 'series' : 'movie',
          subjectId: cand.subjectId,
          detailPath: cand.detailPath,
          releaseDate: cand.releaseDate,
          cover: cand.cover
        });
      }
    }
  }
}

// Also check all candidates that have releaseDate starting with 2016
for (const cand of candidates) {
  if (cand.releaseDate && cand.releaseDate.startsWith('2016')) {
    if (!seenIds.has(cand.subjectId)) {
      seenIds.add(cand.subjectId);
      matchedResults.push({
        targetTitle: cand.title,
        matchedTitle: cand.title,
        type: cand.subjectType === 2 ? 'series' : 'movie',
        subjectId: cand.subjectId,
        detailPath: cand.detailPath,
        releaseDate: cand.releaseDate,
        cover: cand.cover
      });
    }
  }
}

console.log(`Matched 2016 candidate items: ${matchedResults.length}`);
matchedResults.slice(0, 30).forEach((m, idx) => {
  console.log(`${idx + 1}. [${m.type.toUpperCase()}] ${m.targetTitle} -> "${m.matchedTitle}" (ID: ${m.subjectId}, Release: ${m.releaseDate})`);
});

fs.writeFileSync(path.join(__dirname, '../scratch/2016_matched_candidates.json'), JSON.stringify(matchedResults, null, 2), 'utf8');
