const fs = require('fs');

const files = [
  'data/content.json',
  'public/seed-content.json',
  'android/app/src/main/assets/public/seed-content.json'
];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  let modified = false;

  for (const m of (c.movies || [])) {
    if (m.tmdbId === 426284 || (m.title && m.title.includes('Blade of the Immortal'))) {
      m.id = 'embed-m-426284';
      m.subjectId = '';
      m.detailPath = '';
      m.streamUrl = 'https://vidlink.pro/movie/426284';
      m.servers = [
        {
          name: 'Server 1 (VidLink Fast HD)',
          url: 'https://vidlink.pro/movie/426284',
          quality: '1080p',
          isDirect: false
        },
        {
          name: 'Server 2 (MultiEmbed HD)',
          url: 'https://multiembed.mov/?video_id=426284&tmdb=1',
          quality: '1080p',
          isDirect: false
        },
        {
          name: 'Server 3 (VidSrc Player)',
          url: 'https://vidsrc.to/embed/movie/426284',
          quality: '1080p',
          isDirect: false
        }
      ];
      modified = true;
      console.log(`Updated Blade of the Immortal in ${f}`);
    }

    if (m.tmdbId === 19486 || (m.title && m.title.includes('Cyborg She'))) {
      m.id = 'embed-m-19486';
      m.subjectId = '';
      m.detailPath = '';
      m.streamUrl = 'https://vidlink.pro/movie/19486';
      m.servers = [
        {
          name: 'Server 1 (VidLink Fast HD)',
          url: 'https://vidlink.pro/movie/19486',
          quality: '1080p',
          isDirect: false
        },
        {
          name: 'Server 2 (MultiEmbed HD)',
          url: 'https://multiembed.mov/?video_id=19486&tmdb=1',
          quality: '1080p',
          isDirect: false
        },
        {
          name: 'Server 3 (VidSrc Player)',
          url: 'https://vidsrc.to/embed/movie/19486',
          quality: '1080p',
          isDirect: false
        }
      ];
      modified = true;
      console.log(`Updated Cyborg She in ${f}`);
    }
  }

  if (modified) {
    fs.writeFileSync(f, JSON.stringify(c));
  }
}

console.log('Finished updating embed movies!');

