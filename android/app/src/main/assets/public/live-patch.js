// FOBS TV Live OTA Patch Bundle v1.0.4
// Updates applied here execute live across all user devices without requiring a new APK!
(function () {
  console.log('⚡ FOBS TV Live Patch v1.0.4 executing...');

  // 1. Inject CSS to suppress Chromium / Android WebView internal black play circle overlay
  try {
    const styleId = 'fobs-patch-style-v104';
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

  // 3. Dynamic Episode Real Size Fetcher
  window.fetchExactEpisodesSizes = async function(media, seasonNum) {
    if (!media) return;
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const dPath = media.detailPath || media.mbDetailPath || '';
    if (!sId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seasonNum}&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.episodes)) {
        const batchState = window.appState?._batchDownload;
        if (!batchState || !batchState.episodes) return;

        const qNum = parseInt(window.currentDownloadQuality || '480P', 10) || 480;

        data.episodes.forEach(info => {
          const epIdx = batchState.episodes.findIndex(e => (e.episode ?? e.episodeNumber ?? e.number) === info.episode);
          if (epIdx !== -1 && info.qualities && info.qualities.length > 0) {
            let match = null;
            if (qNum <= 480) {
              match = info.qualities.find(q => q.resolution === 480)
                   || info.qualities.find(q => q.resolution === 360)
                   || info.qualities.find(q => q.resolution === 720)
                   || info.qualities[info.qualities.length - 1];
            } else {
              match = info.qualities.find(q => q.resolution === qNum)
                   || info.qualities.find(q => Math.abs(q.resolution - qNum) <= 120)
                   || info.qualities[0];
            }

            if (match && match.sizeText) {
              const epObj = batchState.episodes[epIdx];
              epObj.realSizeText = match.sizeText;
              epObj.realSizeBytes = match.sizeBytes;
              epObj.realQuality = `${match.resolution}P`;

              const sizeEl = document.getElementById(`dl_ep_size_${epIdx}`);
              if (sizeEl) {
                const resTag = match.resolution !== qNum ? ` (${match.resolution}P)` : '';
                sizeEl.innerText = `${match.sizeText}${resTag}`;
              }
            }
          }
        });
        if (typeof window.updateBatchSelectedSummary === 'function') {
          window.updateBatchSelectedSummary();
        }
      }
    } catch (err) {
      console.warn('Fetch exact episode sizes error:', err.message);
    }
  };

  // 4. Enhanced Episode Size Helper
  window.getEpisodeEstimatedSize = function (quality, ep = null, idx = 0) {
    if (ep && ep.realSizeText) return ep.realSizeText;
    if (ep && (ep.size || ep.fileSize)) return ep.size || ep.fileSize;

    const q = String(quality || '480P').toUpperCase();
    let baseMb = 280;
    if (q.includes('1080')) baseMb = 650;
    else if (q.includes('720')) baseMb = 380;
    else baseMb = 220;

    if (ep && ep.duration) {
      const mins = parseInt(ep.duration, 10);
      if (!isNaN(mins) && mins > 0) {
        const perMin = q.includes('1080') ? 22 : (q.includes('720') ? 14 : 9);
        return `~${Math.round(mins * perMin)} MB`;
      }
    }

    const variance = ((idx * 13) % 45) - 22;
    return `~${baseMb + variance} MB`;
  };

  // 5. Purge and Repair any Stored Downloads Stuck on 140MB
  try {
    const raw = localStorage.getItem('fobs_downloads');
    if (raw) {
      const list = JSON.parse(raw);
      let changed = false;
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (!item) return;
          const rec = item.receivedBytes || 0;
          const tot = item.totalBytes || 0;

          // If item was clamped to fake 140MB (146800640) or rec > tot
          if (rec > 0 && (tot === 146800640 || tot < rec || !tot)) {
            const realTot = Math.max(tot, rec);
            item.totalBytes = realTot;
            const dMb = (rec / 1048576).toFixed(1);
            const tMb = (realTot / 1048576).toFixed(1);
            item.sizeText = item.status === 'Ready (Offline)' ? `${dMb} MB` : `${dMb} MB / ${tMb} MB`;
            const pct = Math.min(99, Math.round((rec / realTot) * 100));
            item.progress = pct;
            if (item.status === 'downloading') item.statusText = `Downloading... ${pct}%`;
            changed = true;
          }

          // If queued or downloaded item displays fake 140MB text
          if (item.sizeText && (item.sizeText.includes('140.0 MB') || item.sizeText.includes('~140 MB') || item.sizeText.includes('140 MB'))) {
            if (rec > 0) {
              const dMb = (rec / 1048576).toFixed(1);
              const tMb = (Math.max(tot, rec) / 1048576).toFixed(1);
              item.sizeText = `${dMb} MB / ${tMb} MB`;
            } else {
              item.sizeText = 'Checking size...';
            }
            changed = true;
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

  // Hook into batch downloader modal to auto-fetch exact sizes
  const origRender = window.renderBatchEpisodesList;
  if (typeof origRender === 'function' && !origRender._hasPatch) {
    window.renderBatchEpisodesList = function(seasonNum) {
      origRender(seasonNum);
      if (window.appState && window.appState.currentMedia) {
        window.fetchExactEpisodesSizes(window.appState.currentMedia, seasonNum);
      }
    };
    window.renderBatchEpisodesList._hasPatch = true;
  }

  console.log('✅ FOBS TV Live Patch v1.0.4 applied successfully.');
})();
