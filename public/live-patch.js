// FOBS TV Live OTA Patch Bundle v1.0.3
// Updates applied here execute live across all user devices without requiring a new APK!
(function () {
  console.log('⚡ FOBS TV Live Patch v1.0.3 executing...');

  // 1. Inject CSS to suppress Chromium / Android WebView internal black play circle overlay
  try {
    const styleId = 'fobs-patch-style-v103';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .video-container video::-webkit-media-controls,
        .video-container video::-webkit-media-controls-enclosure,
        .video-container video::-webkit-media-controls-panel,
        .video-container video::-webkit-media-controls-overlay-play-button,
        .video-container video::-webkit-media-controls-start-playback-button {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .video-container video {
          background-color: #000 !important;
        }
      `;
      document.head.appendChild(style);
    }
  } catch (e) {
    console.warn('Live patch CSS injection warning:', e);
  }

  // 2. Video Player Poster Auto-Fallback
  try {
    const video = document.getElementById('mainVideoPlayer');
    if (video) {
      const observer = new MutationObserver(() => {
        if (window.appState && window.appState.currentMedia) {
          const m = window.appState.currentMedia;
          const art = m.backdrop || m.poster;
          if (art && !video.getAttribute('poster')) {
            video.setAttribute('poster', art);
          }
        }
      });
      observer.observe(video, { attributes: true, attributeFilter: ['src'] });
    }
  } catch (e) {
    console.warn('Live patch video observer warning:', e);
  }

  // 3. Dynamic Episode Estimated Size in Downloader Modal
  try {
    window.getEpisodeEstimatedSize = function (quality, ep = null, idx = 0) {
      if (ep && (ep.size || ep.fileSize)) {
        return ep.size || ep.fileSize;
      }
      const q = String(quality || '480P').toUpperCase();
      let baseMb = 140;
      if (q.includes('1080')) baseMb = 480;
      else if (q.includes('720')) baseMb = 260;
      else baseMb = 135;

      if (ep && ep.duration) {
        const mins = parseInt(ep.duration, 10);
        if (!isNaN(mins) && mins > 0) {
          const perMin = q.includes('1080') ? 20 : (q.includes('720') ? 10 : 5.5);
          return `~${Math.round(mins * perMin)} MB`;
        }
      }

      const variance = ((idx * 7) % 15) - 7;
      return `~${baseMb + variance} MB`;
    };

    window.getEpisodeEstimatedBytes = function (quality) {
      if (quality === '1080P') return 480 * 1024 * 1024;
      if (quality === '720P') return 260 * 1024 * 1024;
      return 135 * 1024 * 1024;
    };
  } catch (e) {
    console.warn('Live patch size helper warning:', e);
  }

  // 4. Auto-Fix Stored Downloads with Exceeded/Clamped Fake 140MB Sizes
  try {
    const raw = localStorage.getItem('fobs_downloads');
    if (raw) {
      const list = JSON.parse(raw);
      let changed = false;
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item && item.receivedBytes > 0) {
            // If totalBytes was clamped to fake 140MB or smaller than receivedBytes
            if (!item.totalBytes || item.receivedBytes > item.totalBytes || item.totalBytes === 146800640) {
              const newTotal = Math.max(item.totalBytes || 0, item.receivedBytes);
              item.totalBytes = newTotal;
              const downMb = (item.receivedBytes / (1024 * 1024)).toFixed(1);
              const totMb = (newTotal / (1024 * 1024)).toFixed(1);
              if (item.status === 'downloading' || item.status === 'paused') {
                item.sizeText = `${downMb} MB / ${totMb} MB`;
                const percent = Math.min(99, Math.round((item.receivedBytes / newTotal) * 100));
                item.progress = percent;
                if (item.status === 'downloading') item.statusText = `Downloading... ${percent}%`;
              }
              changed = true;
            }
          }
        });
        if (changed) {
          localStorage.setItem('fobs_downloads', JSON.stringify(list));
          if (typeof window.renderDownloadsList === 'function') {
            window.renderDownloadsList();
          }
        }
      }
    }
  } catch (e) {
    console.warn('Live patch downloads cleanup warning:', e);
  }

  console.log('✅ FOBS TV Live Patch v1.0.3 applied successfully.');
})();
