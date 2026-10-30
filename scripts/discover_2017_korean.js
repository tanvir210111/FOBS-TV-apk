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
    // 2017 Top K-Dramas
    "Strong Woman Do Bong Soon", "Strong Woman Do Bong Soon hindi", "Strong Girl Bong-soon hindi", "Do Bong Soon hindi",
    "While You Were Sleeping", "While You Were Sleeping hindi",
    "Fight for My Way", "Fight for My Way hindi",
    "Weightlifting Fairy Kim Bok Joo", "Weightlifting Fairy Kim Bok Joo hindi",
    "Because This Is My First Life", "Because This Is My First Life hindi",
    "Suspicious Partner", "Suspicious Partner hindi",
    "I'm Not a Robot", "I am Not a Robot hindi", "I'm Not a Robot hindi",
    "Save Me", "Save Me kdrama hindi", "Save Me hindi",
    "Voice", "Voice kdrama hindi", "Voice 1 hindi",
    "Tunnel", "Tunnel kdrama hindi", "Tunnel hindi",
    "Duel", "Duel kdrama hindi",
    "Lookout", "The Guardians kdrama hindi",
    "Mad Dog", "Mad Dog kdrama hindi", "Mad Dog hindi",
    "Black", "Black kdrama hindi",
    "Stranger", "Forest of Secrets", "Stranger kdrama hindi",
    "The King in Love", "The King in Love hindi",
    "My Secret Romance", "My Secret Romance hindi",
    "Reunited Worlds", "Reunited Worlds hindi",
    "Hospital Ship", "Hospital Ship hindi",
    "School 2017", "School 2017 hindi",
    "Chicago Typewriter", "Chicago Typewriter hindi",
    "The Bride of Habaek", "Bride of the Water God", "The Bride of Habaek hindi",
    "Live Up to Your Name", "Live Up to Your Name hindi",
    "Go Back Couple", "Go Back Couple hindi",
    "Two Cops", "Two Cops hindi",
    "Revolutionary Love", "Revolutionary Love hindi",
    "Criminal Minds korea", "Criminal Minds korea hindi",
    "Ruler: Master of the Mask", "Ruler Master of the Mask hindi",
    "Defendant", "Defendant kdrama hindi", "Defendant hindi",
    "Whisper", "Whisper kdrama hindi",
    "Chief Kim", "Good Manager kdrama hindi", "Good Manager hindi",
    "Father Is Strange", "Father Is Strange hindi",
    "Temperature of Love", "Temperature of Love hindi",
    "Witch at Court", "Witch at Court hindi",
    "Circle Two Worlds Connected", "Circle kdrama hindi",
    "Introverted Boss", "My Shy Boss hindi", "Introverted Boss hindi",
    "The Liar and His Lover", "The Liar and His Lover hindi",
    "Jugglers", "Jugglers hindi",
    "Just Between Lovers", "Rain or Shine kdrama hindi",
    "Prison Playbook", "Prison Playbook hindi",
    "Hwarang", "Hwarang hindi",
    "Goblin", "Goblin hindi", "Guardian The Lonely and Great God hindi",
    "The Legend of the Blue Sea", "Legend of the Blue Sea hindi",

    // 2017 Top K-Movies
    "A Taxi Driver", "A Taxi Driver korea hindi", "Taxi Driver 2017 hindi",
    "Along with the Gods: The Two Worlds", "Along with the Gods 1 hindi", "Along with the Gods hindi",
    "Midnight Runners", "Midnight Runners hindi",
    "The Outlaws", "The Outlaws hindi", "Crime City hindi",
    "The Battleship Island", "The Battleship Island hindi",
    "1987: When the Day Comes", "1987 When the Day Comes hindi",
    "Confidential Assignment", "Confidential Assignment hindi",
    "The Villainess", "The Villainess hindi",
    "The Swindlers", "The Swindlers hindi",
    "Steel Rain", "Steel Rain hindi",
    "Real", "Real kim soo hyun hindi",
    "The King", "The King 2017 hindi",
    "Fabricated City", "Fabricated City hindi",
    "Memoir of a Murderer", "Memoir of a Murderer hindi",
    "V.I.P.", "VIP 2017 movie hindi",
    "Anarchist from Colony", "Anarchist from Colony hindi",
    "The Fortress", "The Fortress korea hindi",
    "Forgotten", "Forgotten 2017 hindi", "Forgotten korea hindi",
    "Heart Blackened", "Heart Blackened hindi",
    "New Trial", "New Trial korea hindi",
    "I Can Speak", "I Can Speak hindi",

    // Broad searches
    "korean 2017 hindi", "kdrama 2017 hindi", "k-drama 2017 hindi", "korean movie 2017 hindi",
    "korea 2017 hindi", "2017 hindi korean", "2017 kdrama hindi", "2017 k-drama hindi"
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
  fs.writeFileSync(path.join(__dirname, '../scratch/2017_raw_hindi.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();

