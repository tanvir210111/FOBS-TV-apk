const fs = require('fs');

const contentPath = 'data/content.json';
const seedPublicPath = 'public/seed-content.json';
const seedAndroidPath = 'android/app/src/main/assets/public/seed-content.json';

const data = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

// 1. Update Nayyi Navelli
const nayyi = data.movies.find(m => m.id === 'tmdb-m-1654581' || (m.title && m.title.toLowerCase().includes('nayyi')));
if (nayyi) {
  nayyi.streamUrl = 'https://ok.ru/videoembed/16206412843605?nochat=1';
  nayyi.servers = [
    {
      name: 'Server 1 (Fast HD - OK.ru)',
      url: 'https://ok.ru/videoembed/16206412843605?nochat=1'
    },
    {
      name: 'Server 2 (PkSpeed 720p)',
      url: 'https://pkembed.site/embed-89cilaulgils.html'
    },
    {
      name: 'Server 3 (PkSpeed 360p)',
      url: 'https://pkembed.site/embed-3tygggkh875e.html'
    },
    {
      name: 'Server 4 (CloudVideo 720p)',
      url: 'https://do7go.com/e/9g57tf02ojn6'
    },
    {
      name: 'Server 5 (Streamtape 720p)',
      url: 'https://streamtape.to/e/VYDk6k8zWPCKrX2'
    },
    {
      name: 'Server 6 (MixDrop 720p)',
      url: 'https://mxdrop.to/e/9wwpjngxsppp06'
    }
  ];
  console.log('Updated Nayyi Navelli successfully!');
} else {
  console.warn('Nayyi Navelli not found in movies!');
}

// 2. Update Make Me Tingle
const tingle = data.series.find(s => s.id === 'tmdb-s-311648' || (s.title && s.title.toLowerCase().includes('tingle')));
if (tingle) {
  const tingleEps = [
    {
      number: '01',
      title: 'Episode 01 - Episode 1',
      duration: '55m',
      overview: 'Conservative marketer Yeon-su takes on a former blind date as a new client.',
      still: 'https://image.tmdb.org/t/p/w500/pUl5AqX4eVpieIdhtqaZTRxdo93.jpg',
      streamUrl: 'https://kisscloud.online/video/9dada1df65473b498f1f50c9f25beb43',
      audioTracks: {
        'Original Audio': 'https://kisscloud.online/video/9dada1df65473b498f1f50c9f25beb43'
      },
      servers: [
        {
          name: 'Server 1 (Fast HD - KissCloud)',
          url: 'https://kisscloud.online/video/9dada1df65473b498f1f50c9f25beb43'
        }
      ]
    },
    {
      number: '02',
      title: 'Episode 02 - Episode 2',
      duration: '54m',
      overview: 'Marketer Yeon-su clashes with her new client, Dal.',
      still: 'https://image.tmdb.org/t/p/w500/t1CwNUIiksO55nLFUF01GJtNFpt.jpg',
      streamUrl: 'https://kisscloud.online/video/bcba3d64b7e6c74eb7a73be5800d0491',
      audioTracks: {
        'Original Audio': 'https://kisscloud.online/video/bcba3d64b7e6c74eb7a73be5800d0491'
      },
      servers: [
        {
          name: 'Server 1 (Fast HD - KissCloud)',
          url: 'https://kisscloud.online/video/bcba3d64b7e6c74eb7a73be5800d0491'
        }
      ]
    },
    {
      number: '03',
      title: 'Episode 03 - Episode 3',
      duration: '57m',
      overview: 'A heated argument over love leads to an unexpected move by Dal, leaving a confused Yeon-su reeling.',
      still: 'https://image.tmdb.org/t/p/w500/b6xVpaHZoVNjuckq7azkn928GSC.jpg',
      streamUrl: 'https://kisscloud.online/video/205a8cafa5be198a0db7c67b90451497',
      audioTracks: {
        'Original Audio': 'https://kisscloud.online/video/205a8cafa5be198a0db7c67b90451497'
      },
      servers: [
        {
          name: 'Server 1 (Fast HD - KissCloud)',
          url: 'https://kisscloud.online/video/205a8cafa5be198a0db7c67b90451497'
        }
      ]
    },
    {
      number: '04',
      title: 'Episode 04 - Episode 4',
      duration: '50m',
      overview: 'Yeon-su\'s event idea takes shape. Meanwhile, Dal shocks her family with an overly blunt remark.',
      still: 'https://image.tmdb.org/t/p/w500/iI5tXzybcj22Jh1sZjecbRcJb5q.jpg',
      streamUrl: 'https://kisscloud.online/video/6495fc163fb8f2fc0fe7c8a06fc8ed18',
      audioTracks: {
        'Original Audio': 'https://kisscloud.online/video/6495fc163fb8f2fc0fe7c8a06fc8ed18'
      },
      servers: [
        {
          name: 'Server 1 (Fast HD - KissCloud)',
          url: 'https://kisscloud.online/video/6495fc163fb8f2fc0fe7c8a06fc8ed18'
        }
      ]
    }
  ];

  tingle.episodes = tingleEps;
  tingle.streamUrl = tingleEps[0].streamUrl;
  tingle.releasedEpisodes = tingleEps.length;
  console.log('Updated Make Me Tingle successfully with 4 working episodes!');
} else {
  console.warn('Make Me Tingle not found in series!');
}

// Write back to data/content.json and seeds
const updatedJson = JSON.stringify(data, null, 2);
fs.writeFileSync(contentPath, updatedJson, 'utf8');
fs.writeFileSync(seedPublicPath, updatedJson, 'utf8');
fs.writeFileSync(seedAndroidPath, updatedJson, 'utf8');

console.log('Content JSON and both seed files updated successfully!');
