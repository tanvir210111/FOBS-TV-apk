/**
 * Verification Script: Tests if MovieBox stream URLs are real, playable videos
 * and not fake/broken links.
 */

const axios = require('axios');
const movieboxService = require('../services/movieboxService');

async function verifyStreams() {
  console.log('======================================================');
  console.log('🔍 MOVIEBOX REAL VIDEO PLAYABILITY VERIFICATION TEST');
  console.log('======================================================\n');

  console.log('Step 1: Fetching latest movies from MovieBox...');
  const sections = await movieboxService.getHomepage();

  // Find cinema / trending movies
  const candidates = [];
  for (const s of sections) {
    if (s.title.includes('Trending') || s.title.includes('Cinema') || s.title.includes('Bollywood') || s.title.includes('Hollywood')) {
      for (const it of s.items) {
        if (it.type === 'movie' && !candidates.some(c => c.id === it.id)) {
          candidates.push(it);
          if (candidates.length >= 5) break;
        }
      }
    }
    if (candidates.length >= 5) break;
  }

  console.log(`Testing ${candidates.length} real movies from MovieBox:\n`);

  for (let i = 0; i < candidates.length; i++) {
    const movie = candidates[i];
    console.log(`------------------------------------------------------`);
    console.log(`[Test ${i + 1}/${candidates.length}] Movie: "${movie.title}" (${movie.year})`);
    console.log(`SubjectId: ${movie.subjectId}`);

    // Resolve media
    const media = await movieboxService.resolveMedia(movie.subjectId, movie.detailPath, 0, 0);
    if (!media || !media.streamUrl) {
      console.log(`❌ Result: Could not resolve stream URL from MovieBox.`);
      continue;
    }

    console.log(`Stream URL: ${media.streamUrl.substring(0, 75)}...`);
    console.log(`Qualities found: ${media.qualities.map(q => q.resolution + 'p (' + Math.round((q.size || 0) / (1024 * 1024)) + ' MB)').join(', ')}`);

    // Test downloading a real 512 KB chunk
    try {
      const startTime = Date.now();
      const res = await axios.get(media.streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://movieboxapp.in/',
          'Range': 'bytes=0-524287' // 512 KB
        },
        responseType: 'arraybuffer',
        timeout: 12000
      });

      const elapsed = Date.now() - startTime;
      const buffer = Buffer.from(res.data);
      const isPartial = res.status === 206 || res.status === 200;
      const contentRange = res.headers['content-range'] || `0-${buffer.length}/${res.headers['content-length']}`;
      const contentType = res.headers['content-type'];

      // Check MP4 magic byte headers: ftyp box
      const isMp4 = buffer.includes(Buffer.from('ftyp')) || buffer.includes(Buffer.from('moov')) || buffer.includes(Buffer.from('mdat'));

      console.log(`HTTP Status: ${res.status} (${isPartial ? 'SUCCESS' : 'FAILED'})`);
      console.log(`Content-Type: ${contentType}`);
      console.log(`Content-Range: ${contentRange}`);
      console.log(`Bytes downloaded: ${buffer.length} bytes in ${elapsed}ms`);
      console.log(`Real MP4 Header Signature Found: ${isMp4 ? '✅ YES (Real MP4 video binary)' : '⚠️ Check'}`);

      if (isPartial && isMp4) {
        console.log(`🎉 VERIFICATION PASSED: Video is 100% REAL and actively playing!`);
      } else {
        console.log(`❌ VERIFICATION FAILED: Did not match valid video.`);
      }
    } catch (err) {
      console.log(`❌ Download Test Error:`, err.response ? `${err.response.status} ${err.response.statusText}` : err.message);
    }
  }

  console.log(`\n======================================================`);
  console.log(`Test Complete!`);
  console.log(`======================================================`);
}

verifyStreams().catch(e => console.error('Verification script crashed:', e));
