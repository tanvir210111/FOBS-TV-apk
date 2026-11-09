// FOBS TV Live OTA Patch Bundle v1.0.6
// Bulletproof DOM-level interceptors that work seamlessly even with legacy APK binaries!
(function () {
  console.log('⚡ FOBS TV Live Patch v1.0.6 executing...');

  // 1. Inject CSS for Chromium shadow-DOM play overlay suppression and clean styling
  try {
    const styleId = 'fobs-patch-style-v106';
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
        .ep-empty-notice {
          font-size: 12px;
          color: #f59e0b;
          padding: 8px 12px;
          background: rgba(245, 158, 11, 0.1);
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.25);
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
      `;
      document.head.appendChild(style);
    }
  } catch (e) {
    console.warn('Live patch CSS injection warning:', e);
  }

  // Helper to get active series ID & path
  function getMediaIdentifiers(media) {
    if (!media) return { sId: '', dPath: '' };
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const dPath = media.detailPath || media.mbDetailPath || '';
    return { sId, dPath };
  }

  // 2. Fetch and Cache Series Episodes Quality Info
  async function fetchQualityInfoForMedia(media, seasonNum = 1) {
    if (!media || media._isFetchingInfo) return;
    const { sId, dPath } = getMediaIdentifiers(media);
    if (!sId) return;

    media._isFetchingInfo = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seasonNum}&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.episodes) && data.episodes.length > 0) {
        media._episodesInfo = data.episodes;

        // Auto fallback if curQ has 0 episodes in this season
        const curQ = parseInt(window.appState?.currentQuality || '480p', 10) || 480;
        const hasCur = data.episodes.some(info => (info.qualities || []).some(q => q.resolution === curQ));
        if (!hasCur) {
          const avail = new Set();
          data.episodes.forEach(info => (info.qualities || []).forEach(q => avail.add(q.resolution)));
          const sorted = Array.from(avail).sort((a, b) => a - b);
          if (sorted.length > 0) {
            const fallbackQ = sorted[0];
            if (window.appState) window.appState.currentQuality = `${fallbackQ}p`;
            if (typeof window.updateQualityDisplay === 'function') window.updateQualityDisplay(`${fallbackQ}p`);
          }
        }

        // Trigger DOM filters
        filterEpisodePillsDom();
        filterBatchModalDom();
      }
    } catch (err) {
      console.warn('fetchQualityInfoForMedia error:', err);
    } finally {
      media._isFetchingInfo = false;
    }
  }

  // 3. Bulletproof DOM-level Filter for Player Episode Pills (#episodesListRow)
  function filterEpisodePillsDom() {
    const row = document.getElementById('episodesListRow');
    if (!row) return;

    const media = window.appState?.currentMedia;
    if (!media) return;

    const episodesInfo = media._episodesInfo;
    const curQ = parseInt(window.appState?.currentQuality || '480p', 10) || 480;

    if (!episodesInfo) {
      fetchQualityInfoForMedia(media, window.appState?.currentSeason || 1);
      return;
    }

    const buttons = Array.from(row.querySelectorAll('.ep-pill:not(.ep-all)'));
    let visibleCount = 0;

    buttons.forEach((btn, idx) => {
      const rawText = btn.textContent.trim();
      const epNum = parseInt(rawText, 10) || (idx + 1);

      const info = episodesInfo.find(it => it.episode === epNum);
      let hasQ = false;
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        hasQ = info.qualities.some(q => q.resolution === curQ);
      }

      if (hasQ) {
        btn.style.display = '';
        visibleCount++;
      } else {
        btn.style.display = 'none';
      }
    });

    let emptyNotice = row.querySelector('.ep-empty-notice');
    if (visibleCount === 0 && buttons.length > 0) {
      if (!emptyNotice) {
        emptyNotice = document.createElement('div');
        emptyNotice.className = 'ep-empty-notice';
        row.appendChild(emptyNotice);
      }
      emptyNotice.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${curQ}P তে কোনো পর্ব নেই (${curQ === 480 ? '720P বা 1080P সিলেক্ট করুন' : 'অন্য কোয়ালিটি সিলেক্ট করুন'})</span>`;
      emptyNotice.style.display = 'flex';
    } else if (emptyNotice) {
      emptyNotice.style.display = 'none';
    }
  }
  window.filterEpisodePillsDom = filterEpisodePillsDom;

  // 4. Bulletproof DOM-level Filter for Batch Downloader Modal (#dlEpisodesScrollList)
  function filterBatchModalDom() {
    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    const media = window.appState?.currentMedia;
    if (!media) return;

    const episodesInfo = media._episodesInfo;
    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;

    if (!episodesInfo) {
      fetchQualityInfoForMedia(media, window.appState?._batchDownload?.season || window.appState?.currentSeason || 1);
      return;
    }

    const items = Array.from(scrollList.querySelectorAll('.dl-ep-item'));
    let visibleCount = 0;

    items.forEach((item, idx) => {
      const badge = item.querySelector('.dl-ep-badge');
      const badgeText = badge ? badge.textContent.replace(/[^0-9]/g, '') : '';
      const epNum = parseInt(badgeText, 10) || (idx + 1);

      const info = episodesInfo.find(it => it.episode === epNum);
      let match = null;
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        match = info.qualities.find(q => q.resolution === qNum);
      }

      const chk = item.querySelector('input[type="checkbox"]');
      const sizeEl = item.querySelector('.dl-ep-size');

      if (match) {
        item.style.display = 'flex';
        visibleCount++;
        if (sizeEl && match.sizeText) {
          sizeEl.textContent = match.sizeText;
        }
        if (window.appState?._batchDownload?.episodes?.[idx]) {
          window.appState._batchDownload.episodes[idx].realSizeText = match.sizeText;
          window.appState._batchDownload.episodes[idx].realSizeBytes = match.sizeBytes;
          window.appState._batchDownload.episodes[idx].realQuality = `${match.resolution}P`;
        }
      } else {
        item.style.display = 'none';
        if (chk && chk.checked) {
          chk.checked = false;
        }
        if (window.appState?._batchDownload?.selected) {
          window.appState._batchDownload.selected.delete(idx);
        }
      }
    });

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = visibleCount;

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  }
  window.filterBatchModalDom = filterBatchModalDom;

  // 5. Watch DOM mutations on #episodesListRow and #dlEpisodesScrollList
  function setupDomObservers() {
    const epRow = document.getElementById('episodesListRow');
    if (epRow && !epRow._hasObserver) {
      const obs = new MutationObserver((mutations) => {
        let hasNewButtons = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && (n.classList.contains('ep-pill') || n.id === 'episodesListRow')) {
                hasNewButtons = true;
                break;
              }
            }
          }
        }
        if (hasNewButtons) filterEpisodePillsDom();
      });
      obs.observe(epRow, { childList: true });
      epRow._hasObserver = true;
    }

    const dlList = document.getElementById('dlEpisodesScrollList');
    if (dlList && !dlList._hasObserver) {
      const dlObs = new MutationObserver((mutations) => {
        let hasItems = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            hasItems = true;
            break;
          }
        }
        if (hasItems) filterBatchModalDom();
      });
      dlObs.observe(dlList, { childList: true });
      dlList._hasObserver = true;
    }
  }

  // 6. Hook Global Quality Clicks
  document.addEventListener('click', (e) => {
    // Quality sheet selection
    const qBtn = e.target.closest('.quality-sheet-btn, [data-quality]');
    if (qBtn) {
      setTimeout(() => {
        filterEpisodePillsDom();
        filterBatchModalDom();
      }, 80);
    }

    // Download modal open button
    const dlOpenBtn = e.target.closest('#downloadBtn, .download-btn, [onclick*="triggerDownload"]');
    if (dlOpenBtn) {
      setTimeout(() => {
        filterBatchModalDom();
      }, 150);
    }
  }, true);

  // 7. Auto-Purge and Repair 140MB Fake Sizes in LocalStorage & Active Downloads
  function purgeFake140MB() {
    try {
      const raw = localStorage.getItem('fobs_downloads');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;

      let changed = false;
      list.forEach(item => {
        if (!item) return;
        const rec = item.receivedBytes || 0;
        const tot = item.totalBytes || 0;

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

        if (item.sizeText && (item.sizeText.includes('/ 140.0 MB') || item.sizeText.includes('/ 140 MB') || item.sizeText.includes('~140 MB') || item.sizeText === '140.0 MB' || item.sizeText === '140 MB')) {
          if (rec > 0) {
            const dMb = (rec / 1048576).toFixed(1);
            const tMb = (Math.max(tot, rec) / 1048576).toFixed(1);
            item.sizeText = `${dMb} MB / ${tMb} MB`;
          } else {
            item.sizeText = item.realSizeText || 'Calculating size...';
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
    } catch (e) {}
  }

  // Periodic Watchdog (Runs every 1 second to keep observers and filters alive)
  setInterval(() => {
    setupDomObservers();
    const playerOpen = document.getElementById('playerOverlay')?.classList.contains('open') || (document.getElementById('playerOverlay')?.style.display === 'block');
    if (playerOpen) {
      filterEpisodePillsDom();
    }
    const dlModalOpen = document.getElementById('downloadOptionsModal')?.classList.contains('open');
    if (dlModalOpen) {
      filterBatchModalDom();
    }
  }, 1000);

  purgeFake140MB();
  setupDomObservers();

  console.log('✅ FOBS TV Live Patch v1.0.6 fully armed and active.');
})();
