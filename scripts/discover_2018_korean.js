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
    // 2018 top K-Dramas
    "What's Wrong with Secretary Kim", "What's Wrong with Secretary Kim hindi", "Secretary Kim hindi",
    "Mr. Sunshine", "Mr. Sunshine hindi",
    "My ID Is Gangnam Beauty", "Gangnam Beauty hindi",
    "Something in the Rain", "Something in the Rain hindi", "Pretty Noona Who Buys Me Food hindi",
    "Memories of the Alhambra", "Memories of the Alhambra hindi",
    "Are You Human Too", "Are You Human Too hindi",
    "The Smile Has Left Your Eyes", "The Smile Has Left Your Eyes hindi",
    "Lawless Lawyer", "Lawless Lawyer hindi",
    "The Beauty Inside", "The Beauty Inside hindi",
    "Terius Behind Me", "My Secret Terrius", "Terius Behind Me hindi",
    "Welcome to Waikiki", "Welcome to Waikiki hindi", "Eulachacha Waikiki hindi",
    "Life on Mars", "Life on Mars hindi",
    "Still 17", "Thirty But Seventeen", "Still 17 hindi",
    "100 Days My Prince", "100 Days My Prince hindi",
    "Return", "Return hindi",
    "Live", "Live kdrama hindi",
    "My Mister", "My Mister kdrama hindi", "My Mister hindi",
    "Misty", "Misty kdrama hindi", "Misty hindi",
    "Encounter", "Boyfriend kdrama hindi", "Encounter hindi",
    "The Last Empress", "The Last Empress hindi",
    "A Korean Odyssey", "A Korean Odyssey hindi", "Hwayugi hindi",
    "Suits", "Suits korea hindi",
    "Come and Hug Me", "Come and Hug Me hindi",
    "Radio Romance", "Radio Romance hindi",
    "The Great Seducer", "Tempted kdrama hindi", "The Great Seducer hindi",
    "Familiar Wife", "Familiar Wife hindi",
    "The Player", "The Player kdrama hindi",
    "Where Stars Land", "Fox Bride Star hindi",
    "Children of Nobody", "Children of Nobody hindi",
    "Investigation Couple", "Partners for Justice", "Partners for Justice hindi",
    "The Ghost Detective", "The Ghost Detective hindi",
    "Sky Castle", "Sky Castle hindi",
    "Room No. 9", "Room No. 9 hindi",
    "Mother", "Mother kdrama hindi",
    "Cross", "Cross kdrama hindi",
    "Grand Prince", "Grand Prince hindi",
    "Switch Change the World",
    "Less Than Evil", "Less Than Evil hindi",
    "Feel Good to Die", "Feel Good to Die hindi",
    "Rich Man", "Rich Man Poor Woman korea hindi",
    "About Time", "About Time kdrama hindi",
    "About Time hindi",
    "Twelve Nights", "Twelve Nights hindi",
    "Devilish Charm", "Devilish Charm hindi",
    "Clean with Passion for Now", "Clean with Passion for Now hindi",

    // 2018 top K-Movies
    "The Witch: Part 1. The Subversion", "The Witch Part 1 hindi", "The Witch 2018 hindi",
    "Along with the Gods: The Last 49 Days", "Along with the Gods 2 hindi", "Along with the Gods hindi",
    "The Great Battle", "The Great Battle hindi", "Ansi Fortress hindi",
    "Believer", "Believer 2018 hindi", "Dokjeon hindi",
    "On Your Wedding Day", "On Your Wedding Day hindi",
    "Burning", "Burning 2018 hindi",
    "The Spy Gone North", "The Spy Gone North hindi",
    "Rampant", "Rampant hindi",
    "Intimate Strangers", "Intimate Strangers hindi",
    "Unstoppable", "Unstoppable korea hindi", "Unstoppable 2018 hindi",
    "The Negotiation", "The Negotiation hindi",
    "Gonjiam: Haunted Asylum", "Gonjiam Haunted Asylum hindi",
    "Be with You", "Be with You 2018 hindi",
    "Keys to the Heart", "Keys to the Heart hindi",
    "Champion", "Champion 2018 hindi", "Champion ma dong seok hindi",
    "The Accidental Detective 2", "The Accidental Detective 2 hindi",
    "The Drug King", "The Drug King hindi",
    "Default", "Default 2018 hindi", "National Bankruptcy Day hindi",
    "Sunset in My Hometown",
    "Swing Kids", "Swing Kids hindi",
    "Fengshui", "Fengshui hindi",
    "Monstrum", "Monstrum hindi",
    "High Society", "High Society 2018 hindi",
    "Golden Slumber", "Golden Slumber korea hindi",
    "Detective K: Secret of the Living Dead", "Detective K 3 hindi",
    "The Princess and the Matchmaker", "The Princess and the Matchmaker hindi",
    "Night of 7 Years", "Seven Years of Night hindi",
    "Psychokinesis", "Psychokinesis hindi",
    "Illang: The Wolf Brigade", "Illang The Wolf Brigade hindi",
    "Door Lock", "Door Lock hindi",

    // Broad searches
    "korean 2018 hindi", "kdrama 2018 hindi", "k-drama 2018 hindi", "korean movie 2018 hindi",
    "korea 2018 hindi", "2018 hindi korean", "2018 kdrama hindi", "2018 k-drama hindi"
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

  // Filter for items with Hindi in title or detailPath
  const hindiItems = allItems.filter(it => {
    const title = (it.title || '').toLowerCase();
    const path = (it.detailPath || '').toLowerCase();
    return (title.includes('hindi') || path.includes('hindi')) && !title.includes('disabled');
  });

  console.log(`Total Hindi items: ${hindiItems.length}`);
  fs.writeFileSync(path.join(__dirname, '../scratch/2018_raw_hindi.json'), JSON.stringify(hindiItems, null, 2), 'utf8');
}

run();

