const fs = require('fs');
const path = require('path');
const appDir = path.resolve(__dirname, '..');
const adminService = require(path.join(appDir, 'services', 'adminService'));

function srtToVtt(srtText) {
  let lines = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const vttLines = ['WEBVTT', ''];
  
  for (const line of lines) {
    if (line.includes('-->')) {
      vttLines.push(line.replace(/,/g, '.'));
    } else {
      vttLines.push(line);
    }
  }
  return vttLines.join('\n');
}

const bnSrtPath = path.join(appDir, 'scratch', 'unzipped_bn', 'Hidden Face 2024 Korean WebDL Bangla Subtitle by Fahad AhmED [1.55.34].srt');
const enSrtPath = path.join(appDir, 'scratch', 'unzipped_en', 'Hidden_Face_2024_1080p_Korean_BluRay.srt');

const bnSrt = fs.readFileSync(bnSrtPath, 'utf8');
const enSrt = fs.readFileSync(enSrtPath, 'utf8');

const bnVtt = srtToVtt(bnSrt);
const enVtt = srtToVtt(enSrt);

const subDir = path.join(appDir, 'public', 'subtitles');
const androidSubDir = path.join(appDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'subtitles');

[subDir, androidSubDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'hidden_face_2024_bn.srt'), bnSrt, 'utf8');
  fs.writeFileSync(path.join(dir, 'hidden_face_2024_bn.vtt'), bnVtt, 'utf8');
  fs.writeFileSync(path.join(dir, 'hidden_face_2024_en.srt'), enSrt, 'utf8');
  fs.writeFileSync(path.join(dir, 'hidden_face_2024_en.vtt'), enVtt, 'utf8');
});

console.log('Subtitles from SubSource written and synced successfully!');

// Update metadata in content.json
const content = adminService.readContent();
content.movies = content.movies || [];

const subSourceCaptions = [
  {
    id: 'sub_bn_hf_subsource',
    label: 'বাংলা (SubSource)',
    language: 'bn',
    srclang: 'bn',
    source: 'SubSource',
    src: '/subtitles/hidden_face_2024_bn.vtt',
    url: '/subtitles/hidden_face_2024_bn.vtt',
    format: 'vtt'
  },
  {
    id: 'sub_en_hf_subsource',
    label: 'English (SubSource BluRay)',
    language: 'en',
    srclang: 'en',
    source: 'SubSource',
    src: '/subtitles/hidden_face_2024_en.vtt',
    url: '/subtitles/hidden_face_2024_en.vtt',
    format: 'vtt'
  }
];

content.movies.forEach(m => {
  if (m.id === 'mb-m-809301786023658480-hindi' || m.id === 'mb-m-809301786023658480') {
    m.subtitles = subSourceCaptions;
    m.captions = subSourceCaptions;
    console.log(`Updated subtitles for: ${m.title}`);
  }
});

adminService.writeContent(content);
console.log('Saved to content.json, backup, and local');

// Sync seed files
['public/seed-content.json', 'android/app/src/main/assets/public/seed-content.json'].forEach(p => {
  const full = path.join(appDir, p);
  if (fs.existsSync(full)) {
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      (data.movies || []).forEach(m => {
        if (m.id === 'mb-m-809301786023658480-hindi' || m.id === 'mb-m-809301786023658480') {
          m.subtitles = subSourceCaptions;
          m.captions = subSourceCaptions;
        }
      });
      fs.writeFileSync(full, JSON.stringify(data), 'utf8');
      console.log(`Synced ${p}`);
    } catch(e) {
      console.warn('Seed sync error:', e.message);
    }
  }
});

console.log('=== All SubSource subtitles updated! ===');

