const fs = require('fs');
const path = require('path');

const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '../scratch/2018_raw_hindi.json'), 'utf8'));

// Known 2018 Kdramas and Kmovies list (English titles, aliases)
const target2018 = [
  // Kdrama 2018
  { key: "what's wrong with secretary kim", type: 'series', title: "What's Wrong with Secretary Kim" },
  { key: 'secretary kim', type: 'series', title: "What's Wrong with Secretary Kim" },
  { key: 'mr. sunshine', type: 'series', title: 'Mr. Sunshine' },
  { key: 'mr sunshine', type: 'series', title: 'Mr. Sunshine' },
  { key: 'gangnam beauty', type: 'series', title: 'My ID Is Gangnam Beauty' },
  { key: 'my id is gangnam beauty', type: 'series', title: 'My ID Is Gangnam Beauty' },
  { key: 'something in the rain', type: 'series', title: 'Something in the Rain' },
  { key: 'pretty noona who buys me food', type: 'series', title: 'Something in the Rain' },
  { key: 'memories of the alhambra', type: 'series', title: 'Memories of the Alhambra' },
  { key: 'are you human too', type: 'series', title: 'Are You Human Too?' },
  { key: 'the smile has left your eyes', type: 'series', title: 'The Smile Has Left Your Eyes' },
  { key: 'smile has left your eyes', type: 'series', title: 'The Smile Has Left Your Eyes' },
  { key: 'lawless lawyer', type: 'series', title: 'Lawless Lawyer' },
  { key: 'the beauty inside', type: 'series', title: 'The Beauty Inside' },
  { key: 'beauty inside', type: 'series', title: 'The Beauty Inside' },
  { key: 'terius behind me', type: 'series', title: 'Terius Behind Me' },
  { key: 'my secret terrius', type: 'series', title: 'My Secret Terrius' },
  { key: 'welcome to waikiki', type: 'series', title: 'Welcome to Waikiki' },
  { key: 'eulachacha waikiki', type: 'series', title: 'Welcome to Waikiki' },
  { key: 'life on mars', type: 'series', title: 'Life on Mars' },
  { key: 'still 17', type: 'series', title: 'Still 17' },
  { key: 'thirty but seventeen', type: 'series', title: 'Still 17' },
  { key: '100 days my prince', type: 'series', title: '100 Days My Prince' },
  { key: 'return', type: 'series', title: 'Return' },
  { key: 'live', type: 'series', title: 'Live' },
  { key: 'my mister', type: 'series', title: 'My Mister' },
  { key: 'misty', type: 'series', title: 'Misty' },
  { key: 'encounter', type: 'series', title: 'Encounter' },
  { key: 'the last empress', type: 'series', title: 'The Last Empress' },
  { key: 'a korean odyssey', type: 'series', title: 'A Korean Odyssey' },
  { key: 'hwayugi', type: 'series', title: 'A Korean Odyssey' },
  { key: 'suits', type: 'series', title: 'Suits' },
  { key: 'come and hug me', type: 'series', title: 'Come and Hug Me' },
  { key: 'radio romance', type: 'series', title: 'Radio Romance' },
  { key: 'the great seducer', type: 'series', title: 'The Great Seducer' },
  { key: 'tempted', type: 'series', title: 'Tempted' },
  { key: 'familiar wife', type: 'series', title: 'Familiar Wife' },
  { key: 'the player', type: 'series', title: 'The Player' },
  { key: 'where stars land', type: 'series', title: 'Where Stars Land' },
  { key: 'fox bride star', type: 'series', title: 'Where Stars Land' },
  { key: 'children of nobody', type: 'series', title: 'Children of Nobody' },
  { key: 'partners for justice', type: 'series', title: 'Partners for Justice' },
  { key: 'investigation couple', type: 'series', title: 'Partners for Justice' },
  { key: 'the ghost detective', type: 'series', title: 'The Ghost Detective' },
  { key: 'ghost detective', type: 'series', title: 'The Ghost Detective' },
  { key: 'sky castle', type: 'series', title: 'Sky Castle' },
  { key: 'room no. 9', type: 'series', title: 'Room No. 9' },
  { key: 'room no 9', type: 'series', title: 'Room No. 9' },
  { key: 'mother', type: 'series', title: 'Mother' },
  { key: 'cross', type: 'series', title: 'Cross' },
  { key: 'grand prince', type: 'series', title: 'Grand Prince' },
  { key: 'less than evil', type: 'series', title: 'Less Than Evil' },
  { key: 'feel good to die', type: 'series', title: 'Feel Good to Die' },
  { key: 'rich man', type: 'series', title: 'Rich Man' },
  { key: 'about time', type: 'series', title: 'About Time' },
  { key: 'twelve nights', type: 'series', title: 'Twelve Nights' },
  { key: 'devilish charm', type: 'series', title: 'Devilish Charm' },
  { key: 'clean with passion for now', type: 'series', title: 'Clean with Passion for Now' },
  { key: 'my strange hero', type: 'series', title: 'My Strange Hero' },
  { key: 'the guest', type: 'series', title: 'The Guest' },
  { key: 'hand: the guest', type: 'series', title: 'The Guest' },
  { key: 'voice 2', type: 'series', title: 'Voice 2' },
  { key: 'sketch', type: 'series', title: 'Sketch' },
  { key: 'the undateables', type: 'series', title: 'The Undateables' },
  { key: 'your honor', type: 'series', title: 'Your Honor' },
  { key: 'mama fairy and the woodcutter', type: 'series', title: 'Mama Fairy and the Woodcutter' },
  { key: 'bad papa', type: 'series', title: 'Bad Papa' },
  { key: 'the third charm', type: 'series', title: 'The Third Charm' },
  { key: 'mistress', type: 'series', title: 'Mistress' },
  { key: 'wugwan', type: 'series', title: 'The Guest' },

  // Kmovie 2018
  { key: 'the witch: part 1', type: 'movie', title: 'The Witch: Part 1. The Subversion' },
  { key: 'the witch part 1', type: 'movie', title: 'The Witch: Part 1. The Subversion' },
  { key: 'the witch 1', type: 'movie', title: 'The Witch: Part 1. The Subversion' },
  { key: 'along with the gods: the last 49 days', type: 'movie', title: 'Along with the Gods: The Last 49 Days' },
  { key: 'along with the gods 2', type: 'movie', title: 'Along with the Gods: The Last 49 Days' },
  { key: 'along with the gods: the two worlds', type: 'movie', title: 'Along with the Gods: The Two Worlds' },
  { key: 'the great battle', type: 'movie', title: 'The Great Battle' },
  { key: 'believer', type: 'movie', title: 'Believer' },
  { key: 'on your wedding day', type: 'movie', title: 'On Your Wedding Day' },
  { key: 'burning', type: 'movie', title: 'Burning' },
  { key: 'the spy gone north', type: 'movie', title: 'The Spy Gone North' },
  { key: 'rampant', type: 'movie', title: 'Rampant' },
  { key: 'intimate strangers', type: 'movie', title: 'Intimate Strangers' },
  { key: 'unstoppable', type: 'movie', title: 'Unstoppable' },
  { key: 'the negotiation', type: 'movie', title: 'The Negotiation' },
  { key: 'gonjiam', type: 'movie', title: 'Gonjiam: Haunted Asylum' },
  { key: 'be with you', type: 'movie', title: 'Be with You' },
  { key: 'keys to the heart', type: 'movie', title: 'Keys to the Heart' },
  { key: 'champion', type: 'movie', title: 'Champion' },
  { key: 'the accidental detective 2', type: 'movie', title: 'The Accidental Detective 2' },
  { key: 'the drug king', type: 'movie', title: 'The Drug King' },
  { key: 'default', type: 'movie', title: 'Default' },
  { key: 'swing kids', type: 'movie', title: 'Swing Kids' },
  { key: 'fengshui', type: 'movie', title: 'Fengshui' },
  { key: 'monstrum', type: 'movie', title: 'Monstrum' },
  { key: 'high society', type: 'movie', title: 'High Society' },
  { key: 'golden slumber', type: 'movie', title: 'Golden Slumber' },
  { key: 'detective k: secret of the living dead', type: 'movie', title: 'Detective K: Secret of the Living Dead' },
  { key: 'detective k 3', type: 'movie', title: 'Detective K: Secret of the Living Dead' },
  { key: 'the princess and the matchmaker', type: 'movie', title: 'The Princess and the Matchmaker' },
  { key: 'night of 7 years', type: 'movie', title: 'Seven Years of Night' },
  { key: 'seven years of night', type: 'movie', title: 'Seven Years of Night' },
  { key: 'psychokinesis', type: 'movie', title: 'Psychokinesis' },
  { key: 'illang: the wolf brigade', type: 'movie', title: 'Illang: The Wolf Brigade' },
  { key: 'illang', type: 'movie', title: 'Illang: The Wolf Brigade' },
  { key: 'door lock', type: 'movie', title: 'Door Lock' }
];

const matchedResults = [];
const seenIds = new Set();

for (const cand of candidates) {
  const titleLow = (cand.title || '').toLowerCase();
  const pathLow = (cand.detailPath || '').toLowerCase();

  for (const t of target2018) {
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

// Also check all candidates that have releaseDate in 2018
for (const cand of candidates) {
  if (cand.releaseDate && cand.releaseDate.startsWith('2018')) {
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

console.log(`Matched 2018 Korean/2018 candidate items: ${matchedResults.length}`);
matchedResults.slice(0, 30).forEach((m, idx) => {
  console.log(`${idx + 1}. [${m.type.toUpperCase()}] ${m.targetTitle} -> "${m.matchedTitle}" (ID: ${m.subjectId}, Release: ${m.releaseDate})`);
});

fs.writeFileSync(path.join(__dirname, '../scratch/2018_matched_candidates.json'), JSON.stringify(matchedResults, null, 2), 'utf8');
