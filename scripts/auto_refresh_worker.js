/**
 * FOBS TV - Dedicated 15-Minute Background CDN Token Auto-Refresh Worker
 * 
 * Runs continuously in the background to automatically renew all MovieBox CDN tokens,
 * ensuring all streaming links stay permanently fresh and active 24/7 without expiration.
 */

const adminService = require('../services/adminService');

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

console.log('🚀 FOBS TV CDN Auto-Refresh Worker started');
console.log(`⏱️ Schedule: Every 15 minutes (${INTERVAL_MS / 60000} mins)`);

let isRunning = false;

async function doRefresh() {
  if (isRunning) {
    console.log('[Worker] Previous refresh cycle still running, skipping...');
    return;
  }
  isRunning = true;
  const start = Date.now();
  console.log(`\n[Worker] 🔄 Starting 15-min CDN token refresh cycle at ${new Date().toLocaleTimeString()}...`);
  try {
    const result = await adminService.refreshAllCdnTokens();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Worker] ✅ Cycle finished in ${duration}s. Refreshed ${result.refreshedMovies} movies & ${result.refreshedEpisodes} episodes.`);
  } catch (err) {
    console.error('[Worker] ❌ Error during refresh cycle:', err.message);
  } finally {
    isRunning = false;
  }
}

// Initial refresh on worker start
doRefresh();

// Recurring 15-minute timer
setInterval(doRefresh, INTERVAL_MS);
