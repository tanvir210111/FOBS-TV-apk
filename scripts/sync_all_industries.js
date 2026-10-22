const fs = require('fs');
const path = require('path');
const movieboxService = require('../services/movieboxService');
const syncService = require('../services/syncService');

const DATA_FILE = path.join(__dirname, '..', 'data', 'content.json');

async function main() {
  console.log('Fetching MovieBox Homepage sections...');
  const sections = await movieboxService.getHomepage();
  console.log(`Received ${sections.length} sections from MovieBox.`);

  const contentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!contentData.movies) contentData.movies = [];
  if (!contentData.series) contentData.series = [];

  // Helper to add series
  async function addSeriesFromSection(sectionTitle, maxItems = 4) {
    const sec = sections.find(s => s.title.toLowerCase().includes(sectionTitle.toLowerCase()));
    if (!sec) {
      console.log(`Section "${sectionTitle}" not found.`);
      return;
    }
    console.log(`Processing up to ${maxItems} series from "${sec.title}"...`);
    let count = 0;
    for (const item of sec.items) {
      if (count >= maxItems) break;
      const cleanTitle = item.title.replace(/\[.*?\]|\(.*?\)/g, '').trim().toLowerCase();
      if (contentData.series.some(s => s.title.toLowerCase().includes(cleanTitle))) {
        continue;
      }

      console.log(`  Resolving series: ${item.title} (ID: ${item.subjectId})...`);
      let media = await movieboxService.resolveMedia(item.subjectId, item.detailPath, 1, 1);
      if (!media || !media.streamUrl) {
        media = await movieboxService.resolveMedia(item.subjectId, item.detailPath, 0, 0);
      }
      if (!media || !media.streamUrl) {
        console.log(`    ⚠️ No stream for ${item.title}`);
        continue;
      }

      const isLive = await syncService.verifyStreamUrl(media.streamUrl);
      if (!isLive) {
        console.log(`    ❌ Stream not playable for ${item.title}`);
        continue;
      }

      // Seasons check
      let seasons = [];
      let allEpisodes = [];
      try {
        const axios = require('axios');
        const detailRes = await axios.get(`https://h5.aoneroom.com/wefeed-h5-bff/web/subject/detail?subjectId=${item.subjectId}`, { timeout: 6000 });
        const mbSeasons = detailRes.data?.data?.resource?.seasons || [];
        if (mbSeasons.length > 0) {
          for (const s of mbSeasons) {
            const seNum = s.se || 1;
            const maxEp = Math.min(s.maxEp || 8, 8);
            const seasonEps = [];
            for (let ep = 1; ep <= maxEp; ep++) {
              const epMedia = await movieboxService.resolveMedia(item.subjectId, item.detailPath, seNum, ep);
              if (epMedia && epMedia.streamUrl) {
                seasonEps.push({
                  number: ep,
                  title: `Episode ${ep}`,
                  streamUrl: epMedia.streamUrl,
                  audioTracks: { 'Hindi dub': epMedia.streamUrl }
                });
              }
            }
            if (seasonEps.length > 0) {
              seasons.push({
                seasonNumber: seNum,
                title: `Season ${seNum}`,
                episodes: seasonEps
              });
            }
          }
        }
      } catch (e) {}

      if (seasons.length > 0) {
        allEpisodes = seasons[0].episodes;
      } else {
        allEpisodes = [
          { number: 1, title: 'Episode 1', streamUrl: media.streamUrl, audioTracks: { 'Hindi dub': media.streamUrl } }
        ];
      }

      const tmdb = await syncService.enrichFromTMDB(item.title, 'series', item.year);
      const isBollywood = /indian drama|bollywood/i.test(sec.title);
      const isSouth = /south/i.test(sec.title);
      const industry = isBollywood ? 'Bollywood' : (isSouth ? 'South Indian' : 'Others');
      const category = isBollywood ? 'Bollywood Series' : (isSouth ? 'South Indian Series' : 'Others Series');

      const seriesObj = {
        id: `mb-s-${item.id}`,
        title: `${item.title.replace(/\[Hindi\]/i, '').trim()} [Hindi]`,
        originalTitle: item.title,
        language: 'Hindi',
        dubLanguage: 'Hindi',
        badgeLeft: 'Hindi',
        badgeRight: 'Series',
        tag: 'HD 720p',
        industry,
        year: tmdb?.year || item.year || '2025',
        country: 'India',
        genre: tmdb?.genres || 'Drama, Series',
        duration: '42m/ep',
        category,
        rating: tmdb?.rating || item.rating || '8.2',
        imdbRating: tmdb?.rating || item.rating || '8.2',
        poster: tmdb?.poster || item.poster,
        backdrop: tmdb?.backdrop || item.poster,
        description: tmdb?.overview || `High definition Hindi stream of ${item.title}. Available now on FOBS TV.`,
        audioTracks: ['Hindi dub'],
        selectedAudio: 'Hindi dub',
        streamUrl: media.streamUrl,
        servers: [
          { name: 'Server 1 (Fast HD 720p)', url: media.streamUrl },
          ...(media.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 2} (${q.resolution}p)`,
            url: q.url
          }))
        ],
        cast: tmdb?.cast || [],
        seasonsCount: seasons.length > 0 ? seasons.length : 1,
        seasons: seasons.length > 0 ? seasons : undefined,
        episodes: allEpisodes,
        type: 'series'
      };

      contentData.series.unshift(seriesObj);
      count++;
      console.log(`    ✅ Successfully added ${industry} Series: "${seriesObj.title}" (${allEpisodes.length} eps, ${seasons.length || 1} seasons)`);
    }
  }

  // Helper to add movies
  async function addMoviesFromSection(sectionTitle, maxItems = 4) {
    const sec = sections.find(s => s.title.toLowerCase().includes(sectionTitle.toLowerCase()) && s.items.length > 5);
    if (!sec) {
      console.log(`Movie Section "${sectionTitle}" not found.`);
      return;
    }
    console.log(`Processing up to ${maxItems} movies from "${sec.title}"...`);
    let count = 0;
    for (const item of sec.items) {
      if (count >= maxItems) break;
      const cleanTitle = item.title.replace(/\[.*?\]|\(.*?\)/g, '').trim().toLowerCase();
      if (contentData.movies.some(m => m.title.toLowerCase().includes(cleanTitle))) {
        continue;
      }

      console.log(`  Resolving movie: ${item.title} (ID: ${item.subjectId})...`);
      let media = await movieboxService.resolveMedia(item.subjectId, item.detailPath, 0, 0);
      if (!media || !media.streamUrl) {
        console.log(`    ⚠️ No stream for ${item.title}`);
        continue;
      }

      const isLive = await syncService.verifyStreamUrl(media.streamUrl);
      if (!isLive) {
        console.log(`    ❌ Stream not playable for ${item.title}`);
        continue;
      }

      const tmdb = await syncService.enrichFromTMDB(item.title, 'movie', item.year);
      const isBollywood = /bollywood/i.test(sec.title);
      const isSouth = /south/i.test(sec.title);
      const industry = isBollywood ? 'Bollywood' : (isSouth ? 'South Indian' : 'Others');
      const category = isBollywood ? 'Bollywood Movies' : (isSouth ? 'South Indian Movies' : 'Others Movies');

      const movieObj = {
        id: `mb-m-${item.id}`,
        title: `${item.title.replace(/\[Hindi\]/i, '').trim()} [Hindi]`,
        originalTitle: item.title,
        language: 'Hindi',
        dubLanguage: 'Hindi',
        badgeLeft: 'Hindi',
        badgeRight: 'Movie',
        tag: 'HD 720p',
        quality: 'HD 720p',
        industry,
        year: tmdb?.year || item.year || '2025',
        country: 'India',
        genre: tmdb?.genres || 'Action, Drama',
        duration: '2h 10m',
        category,
        rating: tmdb?.rating || item.rating || '8.0',
        imdbRating: tmdb?.rating || item.rating || '8.0',
        poster: tmdb?.poster || item.poster,
        backdrop: tmdb?.backdrop || item.poster,
        description: tmdb?.overview || `High definition Hindi dubbed stream of ${item.title}. Available now on FOBS TV.`,
        audioTracks: ['Hindi dub'],
        selectedAudio: 'Hindi dub',
        streamUrl: media.streamUrl,
        servers: [
          { name: 'Server 1 (Fast HD 720p)', url: media.streamUrl },
          ...(media.qualities || []).slice(1).map((q, i) => ({
            name: `Server ${i + 2} (${q.resolution}p)`,
            url: q.url
          }))
        ],
        cast: tmdb?.cast || [],
        type: 'movie'
      };

      contentData.movies.unshift(movieObj);
      count++;
      console.log(`    ✅ Successfully added ${industry} Movie: "${movieObj.title}"`);
    }
  }

  // Add Bollywood Series
  await addSeriesFromSection('Indian Dramas', 5);
  // Add South Indian Movies
  await addMoviesFromSection('South Indian', 5);

  fs.writeFileSync(DATA_FILE, JSON.stringify(contentData, null, 2), 'utf8');
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'seed-content.json'), JSON.stringify(contentData, null, 2), 'utf8');
  console.log('✅ Updated data/content.json and public/seed-content.json with Bollywood and South Indian titles.');
}

main().catch(err => console.error('Error:', err));
