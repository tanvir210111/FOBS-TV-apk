/**
 * Upload Hidden Face (2024) K-Movie:
 * 1. Hindi Dubbed version
 * 2. Original Audio (Korean) version
 * Both with English Subtitle (esub) and Bangla Subtitle (bsub).
 * Sources from MovieBox API with auto-renewing streams & direct 1080p CDN fallback.
 */

const path = require('path');
const fs = require('fs');
const appDir = path.resolve(__dirname, '..');
const adminService = require(path.join(appDir, 'services', 'adminService'));

const STREAM_URL = '/api/moviebox/stream?id=809301786023658480&path=hidden-face-cegwEMRBMX&se=0&ep=0';
const DIRECT_1080P = 'https://bcdnxw.hakunaymatata.com/resource/7b4f197c33deb00a6cb50cf93e6de111.mp4?sign=e806595b29ffd828bff30efc03da869c&t=1793189642';
const DIRECT_480P = 'https://bcdnxw.hakunaymatata.com/bt/8b28eac5736a2f52877063d0f07fa179.mp4?sign=6081718226e45c242862c7747bfda9c5&t=1793189642';
const DIRECT_360P = 'https://bcdnxw.hakunaymatata.com/bt/16cd6a04e7830f5abf77fdd74322bd95.mp4?sign=c8cdbcb3ee53df8657504496decbd5a5&t=1793189642';

const POSTER_URL = 'https://pbcdnw.aoneroom.com/image/2026/01/26/edce96c1213101da712dd8c9fdce3c30.jpg';
const BACKDROP_URL = 'https://pbcdnw.aoneroom.com/image/2026/01/26/edce96c1213101da712dd8c9fdce3c30.jpg';

const SUBTITLES_HINDI = [
  {
    id: 'sub_bn_hf_hindi',
    label: 'বাংলা (Bangla)',
    language: 'bn',
    srclang: 'bn',
    src: '/subtitles/hidden_face_2024_bn.vtt',
    url: '/subtitles/hidden_face_2024_bn.vtt',
    format: 'vtt'
  },
  {
    id: 'sub_en_hf_hindi',
    label: 'English',
    language: 'en',
    srclang: 'en',
    src: '/subtitles/hidden_face_2024_en.vtt',
    url: '/subtitles/hidden_face_2024_en.vtt',
    format: 'vtt'
  }
];

const SUBTITLES_ORIG = [
  {
    id: 'sub_bn_hf_orig',
    label: 'বাংলা (Bangla)',
    language: 'bn',
    srclang: 'bn',
    src: '/subtitles/hidden_face_2024_bn.vtt',
    url: '/subtitles/hidden_face_2024_bn.vtt',
    format: 'vtt'
  },
  {
    id: 'sub_en_hf_orig',
    label: 'English',
    language: 'en',
    srclang: 'en',
    src: '/subtitles/hidden_face_2024_en.vtt',
    url: '/subtitles/hidden_face_2024_en.vtt',
    format: 'vtt'
  }
];

const hindiMovie = {
  id: 'mb-m-809301786023658480-hindi',
  subjectId: '809301786023658480-hindi',
  detailPath: 'hidden-face-cegwEMRBMX',
  title: 'Hidden Face [Hindi]',
  year: '2024',
  rating: '6.8',
  imdbRating: '6.2',
  poster: POSTER_URL,
  backdrop: BACKDROP_URL,
  cover: BACKDROP_URL,
  banner: POSTER_URL,
  genre: 'Mystery / Thriller / Romance',
  duration: '1h 55m',
  category: 'Korean (Dubbed) Movies',
  industry: 'Korean',
  language: 'Hindi',
  dubLanguage: 'Hindi Dubbed',
  audioTracks: ['Hindi Dubbed', 'Original (Korean)'],
  selectedAudio: 'Hindi Dubbed',
  badgeLeft: 'Hindi Dub',
  badgeRight: '1080p',
  streamUrl: STREAM_URL,
  directStreamUrl: DIRECT_1080P,
  resolution: 1080,
  description: 'Watch Hidden Face (2024) full Korean movie in Hindi dubbed with HD 1080p quality, English & Bangla Subtitles. Seong-jin, a conductor, and Su-yeon, a cellist, are engaged. Su-yeon disappears, leaving a video. Mi-joo replaces Su-yeon and develops a secret relationship with Seong-jin. They feel watched as their bond deepens.',
  subtitles: SUBTITLES_HINDI,
  captions: SUBTITLES_HINDI,
  servers: [
    {
      name: 'Server 1 (Direct CDN 1080p - Hindi Dub)',
      url: DIRECT_1080P,
      quality: '1080p',
      audio: 'Hindi dub',
      isDirect: true
    },
    {
      name: 'Server 2 (Auto-Renewing MovieBox Stream)',
      url: STREAM_URL,
      quality: '1080p',
      audio: 'Hindi dub'
    },
    {
      name: 'Server 3 (Direct CDN 480p Fast)',
      url: DIRECT_480P,
      quality: '480p',
      audio: 'Hindi dub',
      isDirect: true
    }
  ],
  type: 'movie',
  releaseDate: '2024-11-20',
  addedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  views: 940
};

const originalMovie = {
  id: 'mb-m-809301786023658480',
  subjectId: '809301786023658480',
  detailPath: 'hidden-face-cegwEMRBMX',
  title: 'Hidden Face (2024)',
  year: '2024',
  rating: '6.8',
  imdbRating: '6.2',
  poster: POSTER_URL,
  backdrop: BACKDROP_URL,
  cover: BACKDROP_URL,
  banner: POSTER_URL,
  genre: 'Mystery / Thriller / Romance',
  duration: '1h 55m',
  category: 'Korean Drama',
  industry: 'Korean',
  language: 'Korean',
  dubLanguage: 'Original (Korean)',
  audioTracks: ['Original (Korean)', 'Hindi Dubbed'],
  selectedAudio: 'Original (Korean)',
  badgeLeft: 'Korean',
  badgeRight: '1080p',
  streamUrl: STREAM_URL,
  directStreamUrl: DIRECT_1080P,
  resolution: 1080,
  description: 'Hidden Face (2024) Korean Movie with Original Audio & Multi-Subtitles (বাংলা ও English). Seong-jin, an orchestra conductor, and Su-yeon, a cellist, are engaged. When Su-yeon mysteriously disappears, Mi-joo steps in as her replacement. As an illicit attraction ignites, they sense an invisible presence watching them from within the shadows.',
  subtitles: SUBTITLES_ORIG,
  captions: SUBTITLES_ORIG,
  servers: [
    {
      name: 'Server 1 (Direct CDN 1080p - Original Audio)',
      url: DIRECT_1080P,
      quality: '1080p',
      audio: 'Original',
      isDirect: true
    },
    {
      name: 'Server 2 (Auto-Renewing MovieBox Stream)',
      url: STREAM_URL,
      quality: '1080p',
      audio: 'Original'
    },
    {
      name: 'Server 3 (Direct CDN 480p Fast)',
      url: DIRECT_480P,
      quality: '480p',
      audio: 'Original',
      isDirect: true
    }
  ],
  type: 'movie',
  releaseDate: '2024-11-20',
  addedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  views: 1120
};

async function main() {
  console.log('=== UPLOADING HIDDEN FACE (K-MOVIE) TO FOBS TV ===\n');

  const content = adminService.readContent();
  content.movies = content.movies || [];

  // Remove existing entries with matching IDs if present
  content.movies = content.movies.filter(m => 
    m.id !== hindiMovie.id && 
    m.id !== originalMovie.id &&
    !(m.title === 'Hidden Face [Hindi]' && m.year === '2024') &&
    !(m.title === 'Hidden Face (2024)' && m.year === '2024')
  );

  // Prepend to movies array so they appear prominently
  content.movies.unshift(originalMovie);
  content.movies.unshift(hindiMovie);

  console.log(`Updated content.movies count: ${content.movies.length}`);

  // Write content via adminService (handles content.json, backup, local)
  adminService.writeContent(content);
  console.log('Successfully wrote to data/content.json, backup, and local files!');

  // Sync with seed-content.json
  const seedPath = path.join(appDir, 'public', 'seed-content.json');
  if (fs.existsSync(seedPath)) {
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      seed.movies = seed.movies || [];
      seed.movies = seed.movies.filter(m => 
        m.id !== hindiMovie.id && 
        m.id !== originalMovie.id
      );
      seed.movies.unshift(originalMovie);
      seed.movies.unshift(hindiMovie);
      fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), 'utf8');
      console.log('Updated public/seed-content.json');

      const androidSeedPath = path.join(appDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');
      if (fs.existsSync(androidSeedPath)) {
        fs.copyFileSync(seedPath, androidSeedPath);
        console.log('Synced with android/app/src/main/assets/public/seed-content.json');
      }
    } catch (e) {
      console.warn('Seed content update notice:', e.message);
    }
  }

  console.log('\n=== UPLOAD COMPLETED SUCCESSFULLY! ===');
  console.log('1. [Hindi Dubbed]: Hidden Face [Hindi] (2024)');
  console.log('2. [Original Audio]: Hidden Face (2024)');
  console.log('3. Subtitles: Bangla (bsub) & English (esub) attached to both!');
}

main().catch(console.error);

