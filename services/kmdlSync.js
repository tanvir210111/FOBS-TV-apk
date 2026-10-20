const axios = require('axios');

const TMDB_API_KEY = '6e766190399843a3e1d85b68eaa3de69';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';
const KMDL_BASE = 'https://kmdl.eu.org';

// Clean KMDL folder name (e.g. "12.12: The Day | 2023 | 7.7 🌐")
function parseKmdlName(name) {
  if (!name) return { title: '', year: '' };
  
  // Remove emojis and split by pipe
  const cleaned = name.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '').trim();
  const parts = cleaned.split('|').map(s => s.trim());
  
  const title = parts[0] || name;
  const year = parts[1] && /^\d{4}$/.test(parts[1]) ? parts[1] : '';
  const rating = parts[2] || '7.5';

  return { title, year, rating };
}

// Fetch TMDB Metadata for Movie
async function getTmdbMovieMetadata(title, year) {
  try {
    const res = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: {
        api_key: TMDB_API_KEY,
        query: title,
        year: year || undefined
      },
      timeout: 6000
    });

    const match = res.data?.results?.[0];
    if (!match) return null;

    return {
      title: match.title,
      description: match.overview,
      poster: match.poster_path ? `${TMDB_IMAGE_BASE}${match.poster_path}` : null,
      backdrop: match.backdrop_path ? `${TMDB_BACKDROP_BASE}${match.backdrop_path}` : null,
      rating: match.vote_average ? match.vote_average.toFixed(1) : '7.5',
      year: match.release_date ? match.release_date.split('-')[0] : year,
      tmdbId: match.id
    };
  } catch (err) {
    console.error(`TMDB Movie fetch error for "${title}":`, err.message);
    return null;
  }
}

// Fetch TMDB Metadata for TV Series
async function getTmdbTvMetadata(title, year) {
  try {
    const res = await axios.get('https://api.themoviedb.org/3/search/tv', {
      params: {
        api_key: TMDB_API_KEY,
        query: title,
        first_air_date_year: year || undefined
      },
      timeout: 6000
    });

    const match = res.data?.results?.[0];
    if (!match) return null;

    return {
      title: match.name,
      description: match.overview,
      poster: match.poster_path ? `${TMDB_IMAGE_BASE}${match.poster_path}` : null,
      backdrop: match.backdrop_path ? `${TMDB_BACKDROP_BASE}${match.backdrop_path}` : null,
      rating: match.vote_average ? match.vote_average.toFixed(1) : '8.0',
      year: match.first_air_date ? match.first_air_date.split('-')[0] : year,
      tmdbId: match.id
    };
  } catch (err) {
    console.error(`TMDB TV fetch error for "${title}":`, err.message);
    return null;
  }
}

// Resolve KMDL video files for a Movie folder
async function resolveKmdlMovieFile(folderPath) {
  try {
    const res = await axios.post(`${KMDL_BASE}${folderPath}`, { page_index: 0, password: '' }, { timeout: 8000 });
    const files = res.data?.data?.files || [];

    // Check direct video in folder
    const directVideo = files.find(f => f.link);
    if (directVideo && directVideo.link) {
      return `${KMDL_BASE}${directVideo.link}`;
    }

    // Check subfolder (e.g. "Dual Audio", "Multi Audio")
    const subFolder = files.find(f => f.mimeType === 'application/vnd.google-apps.folder');
    if (subFolder) {
      const subRes = await axios.post(`${KMDL_BASE}${folderPath}${encodeURIComponent(subFolder.name)}/`, { page_index: 0, password: '' }, { timeout: 8000 });
      const subFiles = subRes.data?.data?.files || [];
      const video = subFiles.find(f => f.link);
      if (video && video.link) {
        return `${KMDL_BASE}${video.link}`;
      }
    }
  } catch (err) {
    console.error(`KMDL video file resolve error for ${folderPath}:`, err.message);
  }
  return null;
}

// Resolve KMDL series episodes for a Drama folder
async function resolveKmdlSeriesEpisodes(folderPath) {
  try {
    const res = await axios.post(`${KMDL_BASE}${folderPath}`, { page_index: 0, password: '' }, { timeout: 8000 });
    const files = res.data?.data?.files || [];

    let episodeFiles = files.filter(f => f.link);

    // If files are nested inside a subfolder (e.g. "Dual Audio | Korean | Hindi Dubbed...")
    if (episodeFiles.length === 0) {
      const subFolder = files.find(f => f.mimeType === 'application/vnd.google-apps.folder');
      if (subFolder) {
        const subRes = await axios.post(`${KMDL_BASE}${folderPath}${encodeURIComponent(subFolder.name)}/`, { page_index: 0, password: '' }, { timeout: 8000 });
        episodeFiles = (subRes.data?.data?.files || []).filter(f => f.link);
      }
    }

    if (episodeFiles.length > 0) {
      return episodeFiles.map((f, idx) => {
        const numStr = (idx + 1).toString().padStart(2, '0');
        return {
          number: numStr,
          title: f.name.replace(/\.[^/.]+$/, ''),
          duration: '45m-60m',
          streamUrl: `${KMDL_BASE}${f.link}`
        };
      });
    }
  } catch (err) {
    console.error(`KMDL episodes resolve error for ${folderPath}:`, err.message);
  }
  return [];
}

// Full Pipeline: Sync Movies & Series from KMDL + TMDB
async function syncFromKmdlAndTmdb(moviesCount = 8, seriesCount = 5) {
  console.log('🚀 Starting KMDL + TMDB pipeline sync...');
  const syncedMovies = [];
  const syncedSeries = [];

  // 1. Process Movies from KMDL Folder 1:/
  try {
    const kmdlMoviesRes = await axios.post(`${KMDL_BASE}/1:/`, { page_index: 0, password: '' }, { timeout: 8000 });
    const movieFolders = (kmdlMoviesRes.data?.data?.files || []).slice(0, moviesCount);

    for (const folder of movieFolders) {
      const parsed = parseKmdlName(folder.name);
      console.log(`Processing Movie: "${parsed.title}" (${parsed.year})...`);

      // Get TMDB Details
      const tmdb = await getTmdbMovieMetadata(parsed.title, parsed.year);
      
      // Get KMDL Video Stream Link
      const folderPath = `/1:/${encodeURIComponent(folder.name)}/`;
      const streamUrl = await resolveKmdlMovieFile(folderPath);

      if (streamUrl) {
        syncedMovies.push({
          id: `kmdl-m-${folder.id || Date.now()}`,
          title: tmdb?.title || parsed.title,
          language: folder.name.includes('Hindi') ? 'Hindi' : 'Korean',
          tag: 'HD',
          year: tmdb?.year || parsed.year || '2024',
          country: 'Korea',
          genre: 'Drama',
          category: 'Trending Movies',
          rating: tmdb?.rating || parsed.rating || '7.5',
          poster: tmdb?.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
          backdrop: tmdb?.backdrop || null,
          description: tmdb?.description || 'Streamed directly from KMDL cloud storage.',
          streamUrl: streamUrl,
          audioTracks: ['Hindi Dubbed', 'Korean Original', 'English dub']
        });
      }
    }
  } catch (err) {
    console.error('Error syncing movies from KMDL:', err.message);
  }

  // 2. Process TV Series from KMDL Folder 0:/
  try {
    const kmdlSeriesRes = await axios.post(`${KMDL_BASE}/0:/`, { page_index: 0, password: '' }, { timeout: 8000 });
    const seriesFolders = (kmdlSeriesRes.data?.data?.files || []).slice(0, seriesCount);

    for (const folder of seriesFolders) {
      const parsed = parseKmdlName(folder.name);
      console.log(`Processing Series: "${parsed.title}" (${parsed.year})...`);

      // Get TMDB Details
      const tmdb = await getTmdbTvMetadata(parsed.title, parsed.year);

      // Get KMDL Episodes
      const folderPath = `/0:/${encodeURIComponent(folder.name)}/`;
      const episodes = await resolveKmdlSeriesEpisodes(folderPath);

      if (episodes && episodes.length > 0) {
        syncedSeries.push({
          id: `kmdl-s-${folder.id || Date.now()}`,
          title: tmdb?.title || parsed.title,
          language: folder.name.includes('Hindi') ? 'Hindi' : 'Korean',
          year: tmdb?.year || parsed.year || '2024',
          country: 'Korea',
          genre: 'Romance',
          seasonsCount: 1,
          rating: tmdb?.rating || parsed.rating || '8.2',
          poster: tmdb?.poster || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80',
          backdrop: tmdb?.backdrop || null,
          description: tmdb?.description || 'Full season streaming directly from KMDL cloud storage.',
          audioTracks: ['Hindi Dubbed', 'Korean Original', 'English dub'],
          selectedAudio: 'Hindi Dubbed',
          episodes: episodes
        });
      }
    }
  } catch (err) {
    console.error('Error syncing series from KMDL:', err.message);
  }

  console.log(`✅ Sync finished: ${syncedMovies.length} movies, ${syncedSeries.length} series.`);
  return { movies: syncedMovies, series: syncedSeries };
}

module.exports = {
  parseKmdlName,
  getTmdbMovieMetadata,
  getTmdbTvMetadata,
  resolveKmdlMovieFile,
  resolveKmdlSeriesEpisodes,
  syncFromKmdlAndTmdb
};
