/**
 * FOBS TV - Populate Latest Coming Soon Titles from MovieBox with TMDB Enrichment
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moviebox = require('../services/movieboxService');

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'public', 'seed-content.json');
const ANDROID_SEED = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'seed-content.json');

const TMDB_KEY = '6e766190399843a3e1d85b68eaa3de69';

async function fetchTMDB(query) {
  try {
    const cleanTitle = query
      .replace(/\[\s*hindi\s*dub(bed)?\s*\]/gi, '')
      .replace(/\[\s*hindi\s*\]/gi, '')
      .replace(/\(\s*hindi\s*\)/gi, '')
      .replace(/:\s*ViRaLiN\s*dOoOoNg\.\.!!/gi, '')
      .trim();

    const res = await axios.get('https://api.themoviedb.org/3/search/multi', {
      params: { api_key: TMDB_KEY, query: cleanTitle },
      timeout: 7000
    });
    const match = res.data?.results?.[0];
    if (!match) return null;

    const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
    const detailRes = await axios.get(`https://api.themoviedb.org/3/${mediaType}/${match.id}`, {
      params: { api_key: TMDB_KEY, append_to_response: 'credits' },
      timeout: 7000
    });
    const d = detailRes.data;

    const releaseDate = d.release_date || d.first_air_date || '';
    const dateObj = releaseDate ? new Date(releaseDate) : null;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const releaseMonth = dateObj && !isNaN(dateObj.getTime()) ? months[dateObj.getMonth()] : 'Nov';
    const releaseDay = dateObj && !isNaN(dateObj.getTime()) ? String(dateObj.getDate()).padStart(2, '0') : '15';

    return {
      overview: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      rating: d.vote_average ? d.vote_average.toFixed(1) : '8.0',
      genres: (d.genres || []).map(g => g.name).join(', ') || 'Action, Drama',
      releaseMonth,
      releaseDay,
      cast: (d.credits?.cast || []).slice(0, 8).map(c => ({
        name: c.name,
        character: c.character || 'Cast',
        photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
      }))
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('🔍 Fetching latest Coming Soon items from MovieBox...');
  const sections = await moviebox.getHomepage();
  const comingSection = sections.find(s => s.title.toLowerCase().includes('soon') || s.title.toLowerCase().includes('upcoming'));

  const mbItems = comingSection ? comingSection.items : [];
  console.log(`Found ${mbItems.length} Coming Soon items from MovieBox.`);

  const contentData = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  const currentUpcoming = contentData.upcoming || [];

  const newUpcomingList = [];

  for (const item of mbItems) {
    console.log(`Processing: "${item.title}"...`);
    const tmdb = await fetchTMDB(item.title);

    const titleWithTag = item.title.includes('[Hindi]') ? item.title : `${item.title} [Hindi]`;
    const poster = tmdb?.poster || item.poster;
    const backdrop = tmdb?.backdrop || item.poster;

    newUpcomingList.push({
      id: `mb-up-${item.id || item.subjectId}`,
      subjectId: String(item.id || item.subjectId),
      title: titleWithTag,
      year: item.year || '2026',
      genre: tmdb?.genres || 'Action, Thriller, Drama',
      language: 'Hindi',
      dubLanguage: 'Hindi Dubbed',
      badgeLeft: 'Hindi',
      badgeRight: 'Coming Soon',
      releaseMonth: tmdb?.releaseMonth || 'Nov',
      releaseDay: tmdb?.releaseDay || '20',
      rating: tmdb?.rating || item.rating || '8.0',
      imdbRating: tmdb?.rating || item.rating || '8.0',
      poster: poster,
      backdrop: backdrop,
      description: tmdb?.overview || `Watch ${item.title} upcoming release in Hindi audio exclusively on FOBS TV. Pre-book your ticket now to receive real-time release notifications.`,
      cast: tmdb?.cast && tmdb.cast.length > 0 ? tmdb.cast : [
        {
          name: 'Lead Actor',
          character: 'Protagonist',
          photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
        }
      ],
      type: 'upcoming'
    });
  }

  // Also preserve top anticipated 2026 upcoming blockbusters
  const anticipated = [
    {
      id: 'upcoming-avengers-doomsday',
      title: 'Avengers: Doomsday [Hindi]',
      language: 'Hindi',
      dubLanguage: 'Hindi Dubbed',
      year: '2026',
      country: 'USA',
      genre: 'Action, Adventure, Sci-Fi',
      releaseMonth: 'May',
      releaseDay: '01',
      rating: '9.5',
      imdbRating: '9.5',
      poster: 'https://image.tmdb.org/t/p/w500/jzPwsojjFStf5lR5Nm07w2hH56G.jpg',
      backdrop: 'https://image.tmdb.org/t/p/original/g3gpP5YDbA85DsA0bt5mgGQIe5q.jpg',
      description: 'Beloved heroes from distinct universes are set on a deadly collision course and face an existential threat unlike anything they\'ve ever encountered.',
      badgeLeft: 'Hindi',
      badgeRight: 'Coming Soon',
      type: 'upcoming'
    },
    {
      id: 'upcoming-war-2',
      title: 'War 2 [Hindi]',
      language: 'Hindi',
      dubLanguage: 'Hindi',
      year: '2026',
      country: 'India',
      genre: 'Action, Thriller',
      releaseMonth: 'Aug',
      releaseDay: '14',
      rating: '9.2',
      imdbRating: '9.2',
      poster: 'https://image.tmdb.org/t/p/w500/pEFRgdfijIPjQZ6uLVTJ96bg4Cd.jpg',
      backdrop: 'https://image.tmdb.org/t/p/original/mXLOH94s7A1i1o5KkX9aUq8bM5.jpg',
      description: 'The second installment in the War franchise bringing together India\'s biggest action superstars in a high-octane espionage thriller.',
      badgeLeft: 'Hindi',
      badgeRight: 'Coming Soon',
      type: 'upcoming'
    }
  ];

  for (const ant of anticipated) {
    if (!newUpcomingList.some(u => u.title.includes(ant.title.replace(' [Hindi]', '')))) {
      newUpcomingList.push(ant);
    }
  }

  console.log(`\n✅ Total updated Coming Soon titles: ${newUpcomingList.length}`);
  contentData.upcoming = newUpcomingList;

  fs.writeFileSync(CONTENT_FILE, JSON.stringify(contentData, null, 2), 'utf8');
  console.log(`✅ Saved ${CONTENT_FILE}`);

  fs.writeFileSync(PUBLIC_SEED, JSON.stringify(contentData, null, 2), 'utf8');
  console.log(`✅ Saved ${PUBLIC_SEED}`);

  fs.writeFileSync(ANDROID_SEED, JSON.stringify(contentData, null, 2), 'utf8');
  console.log(`✅ Saved ${ANDROID_SEED}`);
}

main().catch(console.error);
