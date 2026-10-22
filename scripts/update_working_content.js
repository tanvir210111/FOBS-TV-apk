const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, '..', 'data', 'content.json'),
  path.join(__dirname, '..', 'public', 'seed-content.json'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
];

const nayyiNavelliUpdate = {
  streamUrl: 'https://pub-4179591129284219ab297f131533b4e5.r2.dev/Nayyi%20Navelli%20(2026)%20Hindi%20HDTC%20%5Bwww.hdmovie4.com%5D%20-%201080P.mkv',
  servers: [
    {
      name: 'Server 1 (Fast HD - 1080p)',
      url: 'https://pub-4179591129284219ab297f131533b4e5.r2.dev/Nayyi%20Navelli%20(2026)%20Hindi%20HDTC%20%5Bwww.hdmovie4.com%5D%20-%201080P.mkv'
    },
    {
      name: 'Server 2 (Fast HD - 720p)',
      url: 'https://pub-4179591129284219ab297f131533b4e5.r2.dev/Nayyi%20Navelli%20(2026)%20Hindi%20HDTC%20%5Bwww.hdmovie4.com%5D%20-%20720P.mkv'
    },
    {
      name: 'Server 3 (HD Player)',
      url: 'https://vidlink.pro/movie/1654581'
    },
    {
      name: 'Server 4 (Super Player)',
      url: 'https://autoembed.co/movie/imdb/tt40855841'
    }
  ],
  badgeRight: 'Hallprint',
  tag: 'Hallprint',
  quality: 'Hallprint'
};

const makeMeTingleEpisodes = [
  {
    number: "01",
    title: "Episode 01 - Episode 1",
    duration: "55m",
    overview: "Conservative marketer Yeon-su takes on a former blind date as a new client.",
    still: "https://image.tmdb.org/t/p/w500/pUl5AqX4eVpieIdhtqaZTRxdo93.jpg",
    streamUrl: "https://vidlink.pro/tv/311648/1/1",
    servers: [
      { name: "Server 1 (Fast HD - 1080p)", url: "https://vidlink.pro/tv/311648/1/1" },
      { name: "Server 2 (HD Player)", url: "https://autoembed.co/tv/imdb/tt47661704-1-1" },
      { name: "Server 3 (Super Player)", url: "https://vidsrc.to/embed/tv/311648/1/1" }
    ],
    audioTracks: {
      "Original Audio": "https://vidlink.pro/tv/311648/1/1"
    }
  },
  {
    number: "02",
    title: "Episode 02 - Episode 2",
    duration: "54m",
    overview: "Marketer Yeon-su clashes with her new client, Dal.",
    still: "https://image.tmdb.org/t/p/w500/t1CwNUIiksO55nLFUF01GJtNFpt.jpg",
    streamUrl: "https://vidlink.pro/tv/311648/1/2",
    servers: [
      { name: "Server 1 (Fast HD - 1080p)", url: "https://vidlink.pro/tv/311648/1/2" },
      { name: "Server 2 (HD Player)", url: "https://autoembed.co/tv/imdb/tt47661704-1-2" },
      { name: "Server 3 (Super Player)", url: "https://vidsrc.to/embed/tv/311648/1/2" }
    ],
    audioTracks: {
      "Original Audio": "https://vidlink.pro/tv/311648/1/2"
    }
  },
  {
    number: "03",
    title: "Episode 03 - Episode 3",
    duration: "57m",
    overview: "A heated argument over love leads to an unexpected move by Dal, leaving a confused Yeon-su reeling.",
    still: "https://image.tmdb.org/t/p/w500/b6xVpaHZoVNjuckq7azkn928GSC.jpg",
    streamUrl: "https://vidlink.pro/tv/311648/1/3",
    servers: [
      { name: "Server 1 (Fast HD - 1080p)", url: "https://vidlink.pro/tv/311648/1/3" },
      { name: "Server 2 (HD Player)", url: "https://autoembed.co/tv/imdb/tt47661704-1-3" },
      { name: "Server 3 (Super Player)", url: "https://vidsrc.to/embed/tv/311648/1/3" }
    ],
    audioTracks: {
      "Original Audio": "https://vidlink.pro/tv/311648/1/3"
    }
  },
  {
    number: "04",
    title: "Episode 04 - Episode 4",
    duration: "50m",
    overview: "Yeon-su's event idea takes shape. Meanwhile, Dal shocks her family with an overly blunt remark.",
    still: "https://image.tmdb.org/t/p/w500/iI5tXzybcj22Jh1sZjecbRcJb5q.jpg",
    streamUrl: "https://vidlink.pro/tv/311648/1/4",
    servers: [
      { name: "Server 1 (Fast HD - 1080p)", url: "https://vidlink.pro/tv/311648/1/4" },
      { name: "Server 2 (HD Player)", url: "https://autoembed.co/tv/imdb/tt47661704-1-4" },
      { name: "Server 3 (Super Player)", url: "https://vidsrc.to/embed/tv/311648/1/4" }
    ],
    audioTracks: {
      "Original Audio": "https://vidlink.pro/tv/311648/1/4"
    }
  }
];

targetFiles.forEach(fp => {
  if (!fs.existsSync(fp)) {
    console.warn('File not found:', fp);
    return;
  }
  const content = JSON.parse(fs.readFileSync(fp, 'utf8'));

  // Update Nayyi Navelli
  const nn = content.movies.find(m => m.id === 'tmdb-m-1654581' || m.title.toLowerCase().includes('navelli'));
  if (nn) {
    Object.assign(nn, nayyiNavelliUpdate);
    console.log('Updated Nayyi Navelli in:', fp);
  }

  // Update Make Me Tingle
  const mmt = content.series.find(s => s.id === 'tmdb-s-311648' || s.title.toLowerCase().includes('tingle'));
  if (mmt) {
    mmt.streamUrl = 'https://vidlink.pro/tv/311648/1/1';
    mmt.servers = [
      { name: 'Server 1 (Fast HD - 1080p)', url: 'https://vidlink.pro/tv/311648/1/1' },
      { name: 'Server 2 (HD Player)', url: 'https://autoembed.co/tv/imdb/tt47661704-1-1' },
      { name: 'Server 3 (Super Player)', url: 'https://vidsrc.to/embed/tv/311648/1/1' }
    ];
    mmt.episodes = makeMeTingleEpisodes;
    console.log('Updated Make Me Tingle in:', fp);
  }

  fs.writeFileSync(fp, JSON.stringify(content, null, 2), 'utf8');
});

console.log('All files updated successfully!');
