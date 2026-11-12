const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
const files = [
  path.join(dir, 'custom_catalog.local.json'),
  path.join(dir, 'custom_catalog.backup.json'),
  path.join(dir, 'content.json'),
  path.join(dir, 'content.backup.json'),
  path.join(dir, 'content.local.json')
];

const ep5 = {
  id: 'mb-s-579116273137862480_s1_e5',
  episode: 5,
  season: 1,
  title: 'Episode 5',
  streamUrl: '/api/moviebox/stream?id=579116273137862480&path=the-remarried-empress-aVOAhKemMG&se=1&ep=5'
};

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Array.isArray(data.series)) {
      data.series = data.series.filter(s => s.id !== 'mb-s-1789038705722774000' && !s.title.includes('Remarried Empress [Hindi]'));

      const korIdx = data.series.findIndex(s => s.id === 'mb-s-579116273137862480' || s.title === 'The Remarried Empress');
      let kor = null;
      if (korIdx !== -1) {
        kor = data.series.splice(korIdx, 1)[0];
      }

      if (kor) {
        kor.episodes = (kor.episodes || []).filter(e => e.episode !== 5);
        kor.episodes.push(ep5);
        kor.episodes.sort((a, b) => a.episode - b.episode);
        if (kor.seasons && kor.seasons[0]) {
          kor.seasons[0].episodes = (kor.seasons[0].episodes || []).filter(e => e.episode !== 5);
          kor.seasons[0].episodes.push(ep5);
          kor.seasons[0].episodes.sort((a, b) => a.episode - b.episode);
          kor.seasons[0].episodesCount = kor.seasons[0].episodes.length;
        }
        kor.episodesCount = 5;
        kor.totalEpisodes = 5;
        kor.duration = '5 Episodes';
        kor.addedAt = '2099-01-01T00:00:00.000Z'; // Permanent top rank!
        kor.createdAt = '2099-01-01T00:00:00.000Z';
        kor.releaseDate = '2099-01-01';

        data.series.unshift(kor);
        data.featured = JSON.parse(JSON.stringify(kor));
      }
    }
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    console.log('✓ Fixed 5 episodes & unshifted in:', f);
  } catch (err) {
    console.error('Error on', f, err.message);
  }
});

