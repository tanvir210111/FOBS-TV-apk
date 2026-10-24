const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

const SUBJECT_ID = '5698833987452421616';
const DETAIL_PATH = 'so-i-love-you-very-much-hindi-caElq9EIYM6';
const TMDB_TV_ID = 129053;

const POSTER = 'https://image.tmdb.org/t/p/w500/fXbuAVAn5ITohJG145BDoGJHO2W.jpg';
const BACKDROP = 'https://image.tmdb.org/t/p/original/oosMlnURVl08jWTqd6iWPqljhmV.jpg';
const OVERVIEW = 'Sang Wu Yan, a college senior who dreams of becoming a broadcaster, falls in love at first sight with Su Nian Qin, a talented visually impaired songwriter. Watch Crush (So I Love You Very Much) Hindi dubbed complete series online on FOBS TV.';

const CAST = [
  { name: 'Lin Yanjun', character: 'Su Nianqin', photo: 'https://image.tmdb.org/t/p/w185/52VctBgken0e1zbnSCfdgALyiCQ.jpg' },
  { name: 'Wan Peng', character: 'Sang Wuyan', photo: 'https://image.tmdb.org/t/p/w185/swgC6JHDJbvmTl4JoRdbfqf2hF.jpg' },
  { name: 'Li Jiahao', character: 'Wei Hao', photo: 'https://image.tmdb.org/t/p/w185/1RP0ZwHzHRO6DdProTAAkNCcRxG.jpg' },
  { name: 'Chen Meiyi', character: 'Cheng Yin', photo: 'https://image.tmdb.org/t/p/w185/lCzCrR0pmh2l1NgkvqpgomGQrCu.jpg' },
  { name: 'Niu Yukun', character: 'Xu Qian', photo: 'https://image.tmdb.org/t/p/w185/l9kvAlxp3zED1XDf647It3lRe0M.jpg' },
  { name: 'Jiaqi Li', character: 'Yu Xiaolu', photo: 'https://image.tmdb.org/t/p/w185/hMInFVSTBJmu3JIUt9Ji1RNIiX0.jpg' }
];

for (const fpath of targetFiles) {
  if (!fs.existsSync(fpath)) continue;
  const catalog = JSON.parse(fs.readFileSync(fpath, 'utf8'));

  const item = (catalog.series || []).find(s => s.id === 'mb-s-5698833987452421616' || (s.title && s.title.toLowerCase().includes('so i love you very much')));
  if (item) {
    item.title = 'Crush [Hindi]';
    item.originalTitle = '原来我很爱你 (Crush / So I Love You Very Much)';
    item.poster = POSTER;
    item.backdrop = BACKDROP;
    item.description = OVERVIEW;
    item.cast = CAST;
    item.industry = 'Chinese';
    item.category = 'Chinese (C-Drama)';
    item.country = 'China';
    item.badgeLeft = 'C-Drama';
    item.badgeRight = (item.episodes ? item.episodes.length : 24) + ' Eps';
    item.subjectId = SUBJECT_ID;
    item.detailPath = DETAIL_PATH;
    item.tmdbId = TMDB_TV_ID;

    // Update episode metadata and servers
    const updateEps = (eps) => {
      (eps || []).forEach((ep, idx) => {
        const epNum = ep.episode || (idx + 1);
        ep.title = `Episode ${epNum}`;
        ep.still = ep.still || BACKDROP;
        ep.overview = `Episode ${epNum} of Crush (原来我很爱你) in Hindi Dubbed.`;
        
        const directUrl = ep.streamUrl || ep.servers?.[0]?.url || item.streamUrl;
        ep.servers = [
          { name: 'Server 1 (MovieBox Direct)', url: directUrl },
          { name: 'Server 2 (Auto-Renewing Stream)', url: `/api/moviebox/stream?id=${SUBJECT_ID}&path=${DETAIL_PATH}&se=1&ep=${epNum}` },
          { name: 'Server 3 (MultiEmbed HD Failover)', url: `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${epNum}` },
          { name: 'Server 4 (AutoEmbed HD)', url: `https://autoembed.co/tv/tmdb/${TMDB_TV_ID}/1/${epNum}` }
        ];
        ep.audioTracks = {
          'Hindi dub': directUrl,
          'Original Audio': `https://multiembed.mov/?video_id=${TMDB_TV_ID}&tmdb=1&s=1&e=${epNum}`
        };
      });
    };

    if (item.episodes) updateEps(item.episodes);
    if (item.seasons) {
      item.seasons.forEach(s => updateEps(s.episodes));
    }

    fs.writeFileSync(fpath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`✅ Successfully updated title to "Crush [Hindi]" in: ${fpath}`);
  } else {
    console.log(`⚠️ Item not found in: ${fpath}`);
  }
}
