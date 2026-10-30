const axios = require('axios');
const fs = require('fs');
const path = require('path');

const headers = {
  'Origin': 'https://h5.aoneroom.com',
  'Referer': 'https://h5.aoneroom.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Content-Type': 'application/json'
};

// IDs to inspect
const candidateIds = [
  // From filter_2019_korean.js:
  723261668255565544n, // Hotel Del Luna [Hindi]
  1434396042157588608n, // Extraordinary You [Hindi]
  8170408967206749464n, // Touch Your Heart [Hindi]
  7006005772161544424n, // Search: WWW [Hindi]
  2928753290584228336n, // Angel's Last Mission: Love [Hindi]
  1173389097168159544n, // Moment at Eighteen [Hindi]
  5563828843233903248n, // The Tale of Nokdu [Hindi]
  945979168779552072n,  // Catch the Ghost [Hindi]
  865927231854576744n,  // VIP [Hindi]
  2261339428897654528n, // Kingdom [Hindi] S1-S2
  3931818511445672816n, // The Fiery Priest [Hindi] S1
  2317634424239785728n, // Doctor John [Hindi]
  6434131947756684560n, // Beautiful World [Hindi]
  4575260481321141912n, // Melting Me Softly [Hindi]
  367175769514197816n,  // Clean with Passion for Now [Hindi]
  6883154281584018240n, // Welcome 2 Life [Hindi]
  2707840513843021152n, // Doctor Prisoner [Hindi]
  1936301664055559080n, // Melloga Chejil [Hindi] (Be Melodramatic)

  // Movies:
  1017948595728909416n, // Parasite [Hindi]
  3068195004486140736n, // Extreme Job [Hindi]
  6882332840634499648n, // Exit [Hindi]
  3934908057515427376n, // Ashfall [Hindi]
  3285348737266208800n, // The Gangster, the Cop, the Devil [Hindi][CAM]
  7837583627793090400n, // The Divine Fury [Hindi]
  4291762430595712136n, // The Divine Fury [Hindi] (alt)
  4747061917645160464n, // Crazy Romance [Hindi]
  5246929706410198008n, // Money [Hindi]
  8767024167079265568n  // Confession [Hindi]
];

async function inspect(id) {
  try {
    const res = await axios.post('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/detail', {
      subjectId: id.toString()
    }, { headers, timeout: 5000 });
    return res.data?.data?.subject;
  } catch (e) {
    return null;
  }
}

async function run() {
  const verifiedList = [];
  for (const id of candidateIds) {
    const d = await inspect(id);
    if (!d) {
      console.log(`Failed to fetch ${id}`);
      continue;
    }
    console.log(`\n========================================`);
    console.log(`Title: ${d.title}`);
    console.log(`Type: ${d.subjectType === 2 ? 'Series' : 'Movie'}`);
    console.log(`Release Date: ${d.releaseDate}`);
    console.log(`Country/Region: ${d.country || d.region || d.originName || 'N/A'}`);
    console.log(`Genres: ${(d.genreList || []).map(g => g.name).join(', ')}`);
    console.log(`Seasons: ${d.seasons?.length || 0}`);
    console.log(`DetailPath: ${d.detailPath}`);

    verifiedList.push({
      id: d.subjectId,
      title: d.title,
      type: d.subjectType === 2 ? 'series' : 'movie',
      releaseDate: d.releaseDate,
      country: d.country || d.region,
      genres: (d.genreList || []).map(g => g.name).join(', '),
      description: d.description,
      poster: d.cover?.url,
      backdrop: d.posters?.[0]?.url || d.cover?.url,
      detailPath: d.detailPath,
      seasons: d.seasons || []
    });
  }

  fs.writeFileSync(path.join(__dirname, '../scratch/2019_verified_details.json'), JSON.stringify(verifiedList, null, 2), 'utf8');
}

run();
