/**
 * FOBS TV - Industry & Category Standardization Script
 * Correctly assigns Hollywood, Bollywood, South Indian, Korean, Chinese, and Anime
 * based on authentic production origin.
 */

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const catalog = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

// Classification helpers
function classifyMovie(m) {
  const title = (m.title || '').toLowerCase();
  
  // Hollywood movies
  const hollywoodTitles = ['spider-man', 'resident evil', 'street fighter', 'oak street', 'colony'];
  if (hollywoodTitles.some(t => title.includes(t)) || m.country === 'USA' || m.country === 'United States') {
    m.industry = 'Hollywood';
    m.country = 'USA';
    m.category = 'Hollywood (Dubbed) Movies';
    m.language = m.language || 'English';
    return;
  }

  // South Indian movies
  const southTitles = ['jailer', 'pushpa', 'kgf', 'rrr', 'leo', 'devara', 'kalki'];
  if (southTitles.some(t => title.includes(t)) || ['tamil', 'telugu', 'kannada', 'malayalam'].includes((m.language || '').toLowerCase())) {
    m.industry = 'South Indian';
    m.country = 'India';
    m.category = 'South (Dubbed) Movies';
    return;
  }

  // Korean movies
  if (title.includes('korean') || m.country === 'Korea' || (m.language && m.language.toLowerCase() === 'korean')) {
    m.industry = 'Korean';
    m.country = 'Korea';
    m.category = 'Korean (Dubbed) Movies';
    return;
  }

  // Chinese movies
  if (title.includes('chinese') || m.country === 'China' || (m.language && m.language.toLowerCase() === 'chinese')) {
    m.industry = 'Chinese';
    m.country = 'China';
    m.category = 'Chinese (Dubbed) Movies';
    return;
  }

  // Japanese / Anime movies
  if (title.includes('anime') || m.country === 'Japan' || (m.language && m.language.toLowerCase() === 'japanese')) {
    m.industry = 'Japanese';
    m.country = 'Japan';
    m.category = 'Anime Movies (Hindi Dub)';
    return;
  }

  // Bollywood (Indian Hindi) default
  m.industry = 'Bollywood';
  m.country = 'India';
  m.category = 'Bollywood Movies';
  m.language = 'Hindi';
}

function classifySeries(s) {
  const title = (s.title || '').toLowerCase();

  // Hollywood series
  const hollywoodSeries = ['terminal list', 'carrie', 'visionquest'];
  if (hollywoodSeries.some(t => title.includes(t))) {
    s.industry = 'Hollywood';
    s.country = 'USA';
    s.category = 'Hollywood (Dubbed) Series';
    s.badgeLeft = 'Hollywood';
    return;
  }

  // Korean Series (K-Drama)
  const koreanSeries = [
    'taxi driver', 'reply 1988', 'shop for killers', 'reborn rich', 'korean odyssey',
    'good boy', 'hongrang', 'karma', 'mouse', 'modern farmer', 'my bias', 'ordinary jackpot',
    'love in disguise', 'make me tingle', 'take charge of my heart', 'my dearest nemesis',
    'love other than yours', 'our sticky love', 'filing for love'
  ];
  if (koreanSeries.some(t => title.includes(t)) || s.country === 'Korea' || s.industry === 'Korean') {
    s.industry = 'Korean';
    s.country = 'Korea';
    s.category = 'Korean (Dubbed) Series';
    s.badgeLeft = 'K-Drama';
    return;
  }

  // Chinese Series (C-Drama)
  const chineseSeries = [
    'so i love you very much', 'early spring'
  ];
  if (chineseSeries.some(t => title.includes(t)) || s.country === 'China' || s.industry === 'Chinese') {
    s.industry = 'Chinese';
    s.country = 'China';
    s.category = 'Chinese (Dubbed) Series';
    s.badgeLeft = 'C-Drama';
    return;
  }

  // Japanese Live-Action Series
  if (title.includes('viral hit') || title.includes('sins of kujo') || title.includes('kujo')) {
    s.industry = 'Japanese';
    s.country = 'Japan';
    s.category = 'Japanese Series';
    s.badgeLeft = 'Hindi Dub';
    return;
  }

  // Anime / Japanese Series
  const animeSeries = [
    'detective is already dead', 'laid-off cheat', 'grand blue', 'arifureta', 'ramparts of ice',
    'ragna crimson', 'demon school', 'heavy knight', 'legend after my 10', 'konosuba',
    'reincarnated aristocrat', 'mushoku tensei', 'black torch', 're:zero', 'slime',
    'ranma', 'last boss appeared', 'naruto', 'overgeared', 'blue box'
  ];
  if (animeSeries.some(t => title.includes(t)) || s.country === 'Japan' || s.industry === 'Japanese') {
    s.industry = 'Japanese';
    s.country = 'Japan';
    s.category = 'Anime Series (Hindi Dub)';
    s.badgeLeft = 'Anime';
    return;
  }

  s.industry = 'Others';
  s.category = 'Others (Dubbed) Series';
}

console.log('🔄 Classifying Movies...');
catalog.movies.forEach(classifyMovie);

console.log('🔄 Classifying Series...');
catalog.series.forEach(classifySeries);

// Save updated files
fs.writeFileSync(CONTENT_FILE, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(PUBLIC_SEED, JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(ANDROID_SEED, JSON.stringify(catalog, null, 2), 'utf8');

console.log('✅ Industry & Category classification completed and saved!');
