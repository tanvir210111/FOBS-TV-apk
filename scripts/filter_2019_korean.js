const fs = require('fs');
const path = require('path');

const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2019_all_hindi_candidates.json'), 'utf8'));

// Known 2019 Kdramas and Kmovies list (English titles, aliases)
const target2019 = [
  // Kdrama 2019
  { key: 'hotel del luna', type: 'series', title: 'Hotel Del Luna' },
  { key: 'vagabond', type: 'series', title: 'Vagabond' },
  { key: 'extraordinary you', type: 'series', title: 'Extraordinary You' },
  { key: 'arthdal chronicles', type: 'series', title: 'Arthdal Chronicles' },
  { key: 'touch your heart', type: 'series', title: 'Touch Your Heart' },
  { key: 'he is psychometric', type: 'series', title: 'He Is Psychometric' },
  { key: 'her private life', type: 'series', title: 'Her Private Life' },
  { key: 'abyss', type: 'series', title: 'Abyss' },
  { key: 'search: www', type: 'series', title: 'Search: WWW' },
  { key: 'search www', type: 'series', title: 'Search: WWW' },
  { key: "angel's last mission", type: 'series', title: "Angel's Last Mission: Love" },
  { key: 'angels last mission', type: 'series', title: "Angel's Last Mission: Love" },
  { key: 'rookie historian', type: 'series', title: 'Rookie Historian Goo Hae-ryung' },
  { key: 'at eighteen', type: 'series', title: 'At Eighteen' },
  { key: 'moment of eighteen', type: 'series', title: 'Moment of Eighteen' },
  { key: 'when the camellia blooms', type: 'series', title: 'When the Camellia Blooms' },
  { key: 'my country: the new age', type: 'series', title: 'My Country: The New Age' },
  { key: 'the tale of nokdu', type: 'series', title: 'The Tale of Nokdu' },
  { key: 'tale of nokdu', type: 'series', title: 'The Tale of Nokdu' },
  { key: 'catch the ghost', type: 'series', title: 'Catch the Ghost' },
  { key: 'vip', type: 'series', title: 'VIP' },
  { key: 'psychopath diary', type: 'series', title: 'Psychopath Diary' },
  { key: 'kingdom', type: 'series', title: 'Kingdom' },
  { key: 'romance is a bonus book', type: 'series', title: 'Romance Is a Bonus Book' },
  { key: 'the fiery priest', type: 'series', title: 'The Fiery Priest' },
  { key: 'fiery priest', type: 'series', title: 'The Fiery Priest' },
  { key: 'doctor john', type: 'series', title: 'Doctor John' },
  { key: 'watcher', type: 'series', title: 'Watcher' },
  { key: 'strangers from hell', type: 'series', title: 'Strangers from Hell' },
  { key: 'leverage', type: 'series', title: 'Leverage' },
  { key: 'beautiful world', type: 'series', title: 'Beautiful World' },
  { key: 'my first first love', type: 'series', title: 'My First First Love' },
  { key: 'love alarm', type: 'series', title: 'Love Alarm' },
  { key: 'class of lies', type: 'series', title: 'Class of Lies' },
  { key: 'kill it', type: 'series', title: 'Kill It' },
  { key: 'item', type: 'series', title: 'Item' },
  { key: 'haechi', type: 'series', title: 'Haechi' },
  { key: 'possessed', type: 'series', title: 'Possessed' },
  { key: 'the crowned clown', type: 'series', title: 'The Crowned Clown' },
  { key: 'crowned clown', type: 'series', title: 'The Crowned Clown' },
  { key: 'graceful family', type: 'series', title: 'Graceful Family' },
  { key: 'pegasus market', type: 'series', title: 'Pegasus Market' },
  { key: 'melting me softly', type: 'series', title: 'Melting Me Softly' },
  { key: 'clean with passion', type: 'series', title: 'Clean with Passion for Now' },
  { key: 'welcome 2 life', type: 'series', title: 'Welcome 2 Life' },
  { key: 'doctor prisoner', type: 'series', title: 'Doctor Prisoner' },
  { key: 'partners for justice', type: 'series', title: 'Partners for Justice' },
  { key: 'investigation couple', type: 'series', title: 'Partners for Justice' },
  { key: 'be melodramatic', type: 'series', title: 'Be Melodramatic' },
  { key: 'the great show', type: 'series', title: 'The Great Show' },
  { key: 'woman of 9.9 billion', type: 'series', title: 'Woman of 9.9 Billion' },
  { key: 'diary of a prosecutor', type: 'series', title: 'Diary of a Prosecutor' },
  { key: 'my absolute boyfriend', type: 'series', title: 'My Absolute Boyfriend' },
  { key: 'confession', type: 'series', title: 'Confession' },
  { key: 'level up', type: 'series', title: 'Level Up' },
  { key: 'chocolate', type: 'series', title: 'Chocolate' },

  // Kmovie 2019
  { key: 'parasite', type: 'movie', title: 'Parasite' },
  { key: 'extreme job', type: 'movie', title: 'Extreme Job' },
  { key: 'exit', type: 'movie', title: 'Exit' },
  { key: 'ashfall', type: 'movie', title: 'Ashfall' },
  { key: 'the gangster, the cop, the devil', type: 'movie', title: 'The Gangster, The Cop, The Devil' },
  { key: 'gangster, the cop', type: 'movie', title: 'The Gangster, The Cop, The Devil' },
  { key: 'the divine fury', type: 'movie', title: 'The Divine Fury' },
  { key: 'divine fury', type: 'movie', title: 'The Divine Fury' },
  { key: 'tazza: one eyed jack', type: 'movie', title: 'Tazza: One Eyed Jack' },
  { key: 'tazza: one eyed', type: 'movie', title: 'Tazza: One Eyed Jack' },
  { key: 'the bad guys: reign of chaos', type: 'movie', title: 'The Bad Guys: Reign of Chaos' },
  { key: 'bad guys: reign of chaos', type: 'movie', title: 'The Bad Guys: Reign of Chaos' },
  { key: 'kim ji-young', type: 'movie', title: 'Kim Ji-young: Born 1982' },
  { key: 'kim ji young', type: 'movie', title: 'Kim Ji-young: Born 1982' },
  { key: 'tune in for love', type: 'movie', title: 'Tune in for Love' },
  { key: 'inseparable bros', type: 'movie', title: 'Inseparable Bros' },
  { key: 'metamorphosis', type: 'movie', title: 'Metamorphosis' },
  { key: 'svaha', type: 'movie', title: 'Svaha: The Sixth Finger' },
  { key: 'the battle: roar to victory', type: 'movie', title: 'The Battle: Roar to Victory' },
  { key: 'the beast', type: 'movie', title: 'The Beast' },
  { key: 'long live the king', type: 'movie', title: 'Long Live the King' },
  { key: 'juror 8', type: 'movie', title: 'Juror 8' },
  { key: 'innocent witness', type: 'movie', title: 'Innocent Witness' },
  { key: 'miss & mrs. cops', type: 'movie', title: 'Miss & Mrs. Cops' },
  { key: 'girl cops', type: 'movie', title: 'Miss & Mrs. Cops' },
  { key: 'mal-mo-e', type: 'movie', title: 'Mal-Mo-E: The Secret Mission' },
  { key: 'no mercy', type: 'movie', title: 'No Mercy' },
  { key: 'the culprit', type: 'movie', title: 'The Culprit' },
  { key: 'the dude in me', type: 'movie', title: 'The Dude in Me' },
  { key: 'cheer up mr. lee', type: 'movie', title: 'Cheer Up, Mr. Lee' },
  { key: 'hit-and-run squad', type: 'movie', title: 'Hit-and-Run Squad' },
  { key: 'jo pil-ho', type: 'movie', title: 'Jo Pil-ho: The Dawning Rage' },
  { key: 'bring me home', type: 'movie', title: 'Bring Me Home' },
  { key: 'crazy romance', type: 'movie', title: 'Crazy Romance' },
  { key: 'black money', type: 'movie', title: 'Black Money' },
  { key: 'man of men', type: 'movie', title: 'Man of Men' }
];

const matchedResults = [];
const seenIds = new Set();

for (const cand of candidates) {
  const titleLow = (cand.title || '').toLowerCase();
  const pathLow = (cand.detailPath || '').toLowerCase();

  for (const t of target2019) {
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

console.log(`Matched 2019 Korean Hindi items: ${matchedResults.length}`);
matchedResults.forEach((m, idx) => {
  console.log(`${idx + 1}. [${m.type.toUpperCase()}] ${m.targetTitle} -> "${m.matchedTitle}" (ID: ${m.subjectId}, Release: ${m.releaseDate})`);
});

fs.writeFileSync(path.join(__dirname, '../scratch/2019_matched_korean.json'), JSON.stringify(matchedResults, null, 2), 'utf8');
