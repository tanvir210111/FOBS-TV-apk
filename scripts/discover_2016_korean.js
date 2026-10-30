const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function search(kw) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search', {
      keyword: kw,
      page: 1,
      perPage: 30,
      subjectType: 0
    }, { headers, timeout: 5000 });
    return res.data?.data?.items || [];
  } catch(e) {
    return [];
  }
}

async function run() {
  const queries = [
    // 2016 top K-Dramas
    "Descendants of the Sun", "Descendants of the Sun hindi",
    "Moon Lovers: Scarlet Heart Ryeo", "Moon Lovers hindi", "Scarlet Heart Ryeo hindi",
    "W Two Worlds", "W Two Worlds hindi", "W - Two Worlds Apart hindi",
    "Signal", "Signal kdrama hindi", "Signal hindi",
    "Uncontrollably Fond", "Uncontrollably Fond hindi",
    "Cheese in the Trap", "Cheese in the Trap hindi",
    "Doctors", "Doctor Crush hindi", "Doctors kdrama hindi",
    "Love in the Moonlight", "Moonlight Drawn by Clouds hindi", "Love in the Moonlight hindi",
    "Cinderella and Four Knights", "Cinderella and the Four Knights hindi", "Cinderella and Four Knights hindi",
    "The K2", "The K2 hindi", "K2 kdrama hindi",
    "Shopping King Louie", "Shopping King Louie hindi",
    "Jealousy Incarnate", "Don't Dare to Dream hindi", "Jealousy Incarnate hindi",
    "Another Miss Oh", "Another Oh Hae Young hindi", "Another Miss Oh hindi",
    "Age of Youth", "Hello My Twenties hindi", "Age of Youth hindi",
    "Remember War of the Son", "Remember War of the Son hindi",
    "Let's Fight Ghost", "Bring It On Ghost hindi", "Let's Fight Ghost hindi",
    "Romantic Doctor Teacher Kim", "Dr Romantic hindi", "Dr. Romantic hindi", "Dr. Romantic S1 hindi",
    "Squad 38", "38 Task Force hindi", "Squad 38 hindi",
    "Beautiful Gong Shim", "Beautiful Gong Shim hindi",
    "Lucky Romance", "Lucky Romance hindi",
    "Goodbye Mr Black", "Goodbye Mr. Black hindi",
    "Come Back Mister", "Come Back Mister hindi",
    "Drinking Solo", "Drinking Solo hindi",
    "Sweet Stranger and Me", "The Man Living in Our House hindi",
    "Solomon's Perjury", "Solomon's Perjury hindi",
    "Night Light", "Night Light kdrama hindi",
    "Madame Antoine", "Madame Antoine hindi",
    "Weightlifting Fairy Kim Bok-joo", "Weightlifting Fairy hindi",

    // 2016 top K-Movies
    "Train to Busan", "Train to Busan hindi",
    "The Handmaiden", "The Handmaiden hindi",
    "The Wailing", "The Wailing hindi",
    "The Age of Shadows", "The Age of Shadows hindi",
    "Asura: The City of Madness", "Asura The City of Madness hindi",
    "A Violent Prosecutor", "A Violent Prosecutor hindi",
    "The Last Princess", "The Last Princess hindi",
    "Master", "Master korea hindi", "Master 2016 hindi",
    "Pandora", "Pandora korea hindi", "Pandora 2016 hindi",
    "Luck-Key", "Luck Key hindi", "Luck-Key hindi",
    "My Annoying Brother", "My Annoying Brother hindi",
    "Operation Chromite", "Operation Chromite hindi",
    "Time Renegades", "Time Renegades hindi",
    "Missing", "Missing 2016 korea hindi",
    "Derailed", "Two Men korea hindi",
    "Canola", "Canola korea hindi",
    "Spirits' Homecoming", "Spirits Homecoming hindi",
    "Vanishing Time", "Vanishing Time A Boy Who Returned hindi",

    // Broad searches
    "korean 2016 hindi", "kdrama 2016 hindi", "k-drama 2016 hindi", "korean movie 2016 hindi",
    "korea 2016 hindi", "2016 hindi korean", "2016 kdrama hindi", "2016 k-drama hindi"
  ];

  const map = new Map();
  console.log(`Starting search across ${queries.length} queries...`);

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const items = await search(q);
    for (const it of items) {
      if (!map.has(it.subjectId)) {
        map.set(it.subjectId, it);
      }
    }
  }

  console.log(`Total unique items found: ${map.size}`);
  const allItems = Array.from(map.values());

  const hindiItems = allItems.filter(it => {
    const title = (it.title || '').toLowerCase();
    const path = (it.detailPath || '').toLowerCase();
    return (title.includes('hindi') || path.includes('hindi')) && !title.includes('disabled');
  });

  console.log(`Total Hindi items: ${hindiItems.length}`);
  fs.writeFileSync(path.join(__dirname, '../scratch/2016_raw_hindi.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();

