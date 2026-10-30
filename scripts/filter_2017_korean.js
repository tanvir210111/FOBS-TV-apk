const fs = require('fs');
const path = require('path');

const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2017_raw_hindi.json'), 'utf8'));

// Known 2017 Kdramas and Kmovies target keywords
const target2017 = [
  // Kdrama 2017
  { key: 'do bong soon', type: 'series', title: 'Strong Woman Do Bong Soon' },
  { key: 'strong woman do bong', type: 'series', title: 'Strong Woman Do Bong Soon' },
  { key: 'strong girl bong-soon', type: 'series', title: 'Strong Woman Do Bong Soon' },
  { key: 'while you were sleeping', type: 'series', title: 'While You Were Sleeping' },
  { key: 'fight for my way', type: 'series', title: 'Fight for My Way' },
  { key: 'weightlifting fairy', type: 'series', title: 'Weightlifting Fairy Kim Bok Joo' },
  { key: 'because this is my first life', type: 'series', title: 'Because This Is My First Life' },
  { key: 'suspicious partner', type: 'series', title: 'Suspicious Partner' },
  { key: "i'm not a robot", type: 'series', title: "I'm Not a Robot" },
  { key: 'i am not a robot', type: 'series', title: "I'm Not a Robot" },
  { key: 'save me', type: 'series', title: 'Save Me' },
  { key: 'voice', type: 'series', title: 'Voice' },
  { key: 'tunnel', type: 'series', title: 'Tunnel' },
  { key: 'duel', type: 'series', title: 'Duel' },
  { key: 'lookout', type: 'series', title: 'Lookout' },
  { key: 'mad dog', type: 'series', title: 'Mad Dog' },
  { key: 'black', type: 'series', title: 'Black' },
  { key: 'stranger', type: 'series', title: 'Stranger' },
  { key: 'forest of secrets', type: 'series', title: 'Stranger' },
  { key: 'the king in love', type: 'series', title: 'The King in Love' },
  { key: 'my secret romance', type: 'series', title: 'My Secret Romance' },
  { key: 'reunited worlds', type: 'series', title: 'Reunited Worlds' },
  { key: 'hospital ship', type: 'series', title: 'Hospital Ship' },
  { key: 'school 2017', type: 'series', title: 'School 2017' },
  { key: 'chicago typewriter', type: 'series', title: 'Chicago Typewriter' },
  { key: 'bride of habaek', type: 'series', title: 'The Bride of Habaek' },
  { key: 'bride of the water god', type: 'series', title: 'The Bride of Habaek' },
  { key: 'live up to your name', type: 'series', title: 'Live Up to Your Name' },
  { key: 'go back couple', type: 'series', title: 'Go Back Couple' },
  { key: 'two cops', type: 'series', title: 'Two Cops' },
  { key: 'revolutionary love', type: 'series', title: 'Revolutionary Love' },
  { key: 'ruler: master of the mask', type: 'series', title: 'Ruler: Master of the Mask' },
  { key: 'ruler master of the mask', type: 'series', title: 'Ruler: Master of the Mask' },
  { key: 'defendant', type: 'series', title: 'Defendant' },
  { key: 'whisper', type: 'series', title: 'Whisper' },
  { key: 'chief kim', type: 'series', title: 'Chief Kim' },
  { key: 'good manager', type: 'series', title: 'Chief Kim' },
  { key: 'father is strange', type: 'series', title: 'Father Is Strange' },
  { key: 'temperature of love', type: 'series', title: 'Temperature of Love' },
  { key: 'witch at court', type: 'series', title: 'Witch at Court' },
  { key: 'circle', type: 'series', title: 'Circle' },
  { key: 'introverted boss', type: 'series', title: 'Introverted Boss' },
  { key: 'my shy boss', type: 'series', title: 'Introverted Boss' },
  { key: 'the liar and his lover', type: 'series', title: 'The Liar and His Lover' },
  { key: 'jugglers', type: 'series', title: 'Jugglers' },
  { key: 'just between lovers', type: 'series', title: 'Just Between Lovers' },
  { key: 'rain or shine', type: 'series', title: 'Just Between Lovers' },
  { key: 'prison playbook', type: 'series', title: 'Prison Playbook' },
  { key: 'hwarang', type: 'series', title: 'Hwarang' },
  { key: 'goblin', type: 'series', title: 'Goblin' },
  { key: 'the legend of the blue sea', type: 'series', title: 'The Legend of the Blue Sea' },
  { key: 'legend of the blue sea', type: 'series', title: 'The Legend of the Blue Sea' },
  { key: 'a korean odyssey', type: 'series', title: 'A Korean Odyssey' },
  { key: 'criminal minds', type: 'series', title: 'Criminal Minds' },
  { key: 'judge vs. judge', type: 'series', title: 'Judge vs. Judge' },
  { key: 'black knight', type: 'series', title: 'Black Knight: The Man Who Guards Me' },

  // Kmovie 2017
  { key: 'a taxi driver', type: 'movie', title: 'A Taxi Driver' },
  { key: 'taxi driver', type: 'movie', title: 'A Taxi Driver' },
  { key: 'along with the gods', type: 'movie', title: 'Along with the Gods: The Two Worlds' },
  { key: 'along with the gods: the two worlds', type: 'movie', title: 'Along with the Gods: The Two Worlds' },
  { key: 'midnight runners', type: 'movie', title: 'Midnight Runners' },
  { key: 'the outlaws', type: 'movie', title: 'The Outlaws' },
  { key: 'the battleship island', type: 'movie', title: 'The Battleship Island' },
  { key: 'battleship island', type: 'movie', title: 'The Battleship Island' },
  { key: '1987: when the day comes', type: 'movie', title: '1987: When the Day Comes' },
  { key: '1987', type: 'movie', title: '1987: When the Day Comes' },
  { key: 'confidential assignment', type: 'movie', title: 'Confidential Assignment' },
  { key: 'the villainess', type: 'movie', title: 'The Villainess' },
  { key: 'the swindlers', type: 'movie', title: 'The Swindlers' },
  { key: 'steel rain', type: 'movie', title: 'Steel Rain' },
  { key: 'real', type: 'movie', title: 'Real' },
  { key: 'the king', type: 'movie', title: 'The King' },
  { key: 'fabricated city', type: 'movie', title: 'Fabricated City' },
  { key: 'memoir of a murderer', type: 'movie', title: 'Memoir of a Murderer' },
  { key: 'v.i.p.', type: 'movie', title: 'V.I.P.' },
  { key: 'anarchist from colony', type: 'movie', title: 'Anarchist from Colony' },
  { key: 'the fortress', type: 'movie', title: 'The Fortress' },
  { key: 'forgotten', type: 'movie', title: 'Forgotten' },
  { key: 'heart blackened', type: 'movie', title: 'Heart Blackened' },
  { key: 'new trial', type: 'movie', title: 'New Trial' },
  { key: 'i can speak', type: 'movie', title: 'I Can Speak' },
  { key: 'the mercyless', type: 'movie', title: 'The Merciless' },
  { key: 'the merciless', type: 'movie', title: 'The Merciless' },
  { key: 'master', type: 'movie', title: 'Master' },
  { key: 'one line', type: 'movie', title: 'One Line' },
  { key: 'the chase', type: 'movie', title: 'The Chase' },
  { key: 'the prison', type: 'movie', title: 'The Prison' }
];

const matchedResults = [];
const seenIds = new Set();

for (const cand of candidates) {
  const titleLow = (cand.title || '').toLowerCase();
  const pathLow = (cand.detailPath || '').toLowerCase();

  for (const t of target2017) {
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

// Also check all candidates that have releaseDate in 2017
for (const cand of candidates) {
  if (cand.releaseDate && cand.releaseDate.startsWith('2017')) {
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

console.log(`Matched 2017 candidate items: ${matchedResults.length}`);
matchedResults.slice(0, 30).forEach((m, idx) => {
  console.log(`${idx + 1}. [${m.type.toUpperCase()}] ${m.targetTitle} -> "${m.matchedTitle}" (ID: ${m.subjectId}, Release: ${m.releaseDate})`);
});

fs.writeFileSync(path.join(__dirname, '../scratch/2017_matched_candidates.json'), JSON.stringify(matchedResults, null, 2), 'utf8');
