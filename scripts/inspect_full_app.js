const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function inspectFullApp() {
  console.log('====================================================');
  console.log('🔍 FULL APPLICATION COMPREHENSIVE HEALTH INSPECTION');
  console.log('====================================================\n');

  let totalIssues = 0;

  // 1. Inspect Content Database (data/content.json)
  console.log('--- [1/6] Inspecting data/content.json ---');
  const contentPath = path.join(__dirname, '..', 'data', 'content.json');
  if (!fs.existsSync(contentPath)) {
    console.error('❌ data/content.json missing!');
    totalIssues++;
    return;
  }

  let content;
  try {
    content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    console.log('✅ JSON parsing successful');
  } catch (e) {
    console.error('❌ JSON parsing failed:', e.message);
    totalIssues++;
    return;
  }

  console.log(`- Featured Title: "${content.featured?.title || 'None'}"`);
  console.log(`- Movies Count: ${content.movies?.length || 0}`);
  console.log(`- Series Count: ${content.series?.length || 0}`);
  console.log(`- Live TV Channels Count: ${content.liveTv?.length || 0}`);
  console.log(`- Upcoming Items Count: ${content.upcoming?.length || 0}`);

  // Inspect Series
  let seriesPosterErrors = 0;
  let seriesEpisodeErrors = 0;
  let seriesSeasonErrors = 0;
  for (const s of content.series || []) {
    if (!s.poster || s.poster.includes('undefined') || s.poster.includes('placeholder')) seriesPosterErrors++;
    if (!s.episodes || s.episodes.length === 0) seriesEpisodeErrors++;
    if (!s.seasons || s.seasons.length === 0) seriesSeasonErrors++;
  }
  console.log(`- Series Check: ${seriesPosterErrors} broken posters, ${seriesEpisodeErrors} missing episodes, ${seriesSeasonErrors} missing seasons`);
  if (seriesPosterErrors > 0 || seriesEpisodeErrors > 0) totalIssues++;

  // Inspect Movies
  let moviePosterErrors = 0;
  let movieStreamErrors = 0;
  for (const m of content.movies || []) {
    if (!m.poster || m.poster.includes('undefined')) moviePosterErrors++;
    if (!m.streamUrl && !m.driveUrl && (!m.servers || m.servers.length === 0)) movieStreamErrors++;
  }
  console.log(`- Movies Check: ${moviePosterErrors} broken posters, ${movieStreamErrors} missing streams`);
  if (moviePosterErrors > 0 || movieStreamErrors > 0) totalIssues++;

  // 2. Inspect In-App Update System
  console.log('\n--- [2/6] Inspecting App Update Configuration ---');
  const appUpdate = content.appUpdate;
  console.log('App Update Config:', {
    enabled: appUpdate?.enabled,
    latestVersionCode: appUpdate?.latestVersionCode,
    latestVersionName: appUpdate?.latestVersionName,
    forceUpdate: appUpdate?.forceUpdate,
    downloadUrl: appUpdate?.downloadUrl
  });

  const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const matchVerCode = appJsContent.match(/const CURRENT_APP_VERSION_CODE = (\d+);/);
  const currentVerCode = matchVerCode ? parseInt(matchVerCode[1], 10) : null;
  console.log(`- Current Client Code in app.js: CURRENT_APP_VERSION_CODE = ${currentVerCode}`);

  if (appUpdate?.latestVersionCode <= currentVerCode) {
    console.warn(`⚠️ WARNING: latestVersionCode (${appUpdate?.latestVersionCode}) is NOT greater than CURRENT_APP_VERSION_CODE (${currentVerCode}). Older apps running code ${currentVerCode} will NOT trigger the update popup!`);
    totalIssues++;
  } else {
    console.log(`✅ latestVersionCode (${appUpdate?.latestVersionCode}) > client versionCode (${currentVerCode}). Update popup triggers properly!`);
  }

  // 3. Inspect Live TV Assets
  console.log('\n--- [3/6] Inspecting Live TV Channel Logos ---');
  const logosDir = path.join(__dirname, '..', 'public', 'assets', 'channels');
  if (fs.existsSync(logosDir)) {
    const logoFiles = fs.readdirSync(logosDir);
    console.log(`✅ Local channel logos directory exists with ${logoFiles.length} bundled logo files.`);
  } else {
    console.error('❌ Channel logos directory missing!');
    totalIssues++;
  }

  // 4. Inspect Services & FFmpeg
  console.log('\n--- [4/6] Inspecting Backend Services & FFmpeg ---');
  try {
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log(`✅ ffmpeg-static found at: ${ffmpegPath}`);
    } else {
      console.warn('⚠️ ffmpeg-static path missing or not found on disk');
    }
  } catch (e) {
    console.error('❌ ffmpeg-static load error:', e.message);
    totalIssues++;
  }

  try {
    const liveTvService = require('../services/liveTvService');
    const bdChs = await liveTvService.getChannelsByCountry('bd');
    console.log(`✅ liveTvService returned ${bdChs?.length || 0} Bangladesh channels.`);
  } catch (e) {
    console.error('❌ liveTvService error:', e.message);
    totalIssues++;
  }

  // 5. Inspect HTML & DOM ID Alignment
  console.log('\n--- [5/6] Inspecting HTML & DOM Element Selectors ---');
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const requiredIds = [
    'appUpdateModal', 'btnStartUpdate', 'headerUpdateBtn', 'updateBadgePill',
    'updateModalTitle', 'updateModalDesc', 'currentVersionTag', 'latestVersionTag',
    'mainVideoPlayer', 'mainEmbedPlayer', 'videoLoader', 'playerTopHeader',
    'landscapePlayerUI', 'lsProgressWrapper', 'lsProgressFilled', 'lsProgressThumb',
    'seasonSelectorContainer', 'currentSeasonText', 'seasonDropdownMenu',
    'commentsTabBtn', 'commentsView',
    'homeView', 'movieView', 'seriesView', 'livetvView', 'sectionDetailView'
  ];

  let missingIds = 0;
  for (const id of requiredIds) {
    if (!htmlContent.includes(`id="${id}"`)) {
      console.error(`❌ Missing DOM element in index.html: #${id}`);
      missingIds++;
    }
  }
  if (missingIds === 0) {
    console.log(`✅ All ${requiredIds.length} critical UI DOM elements are present in index.html.`);
  } else {
    totalIssues += missingIds;
  }

  // 6. Inspect Seed Content Synchronicity
  console.log('\n--- [6/6] Inspecting Seed Content Synchronicity ---');
  const seedPaths = [
    path.join(__dirname, '..', 'public', 'seed-content.json'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json')
  ];
  for (const sp of seedPaths) {
    if (fs.existsSync(sp)) {
      const stat = fs.statSync(sp);
      console.log(`✅ Seed content exists at ${path.relative(path.join(__dirname, '..'), sp)} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      console.error(`❌ Seed content missing at ${sp}`);
      totalIssues++;
    }
  }

  console.log('\n====================================================');
  console.log(`🏁 INSPECTION COMPLETE: Total Issues Found = ${totalIssues}`);
  console.log('====================================================');
}

inspectFullApp();
