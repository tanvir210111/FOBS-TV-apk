// FOBS TV Live OTA Patch Bundle v1.1.0
// 1. Online watch: ALL episodes shown serially with auto-detect playback (always lowest resolution default)
// 2. Video Player: Never stuck on poster; eliminate native WebKit play button & frozen poster overlays
// 3. Download modal ONLY: strictly filter episodes by available resolution with exact real file sizes
(function () {
  console.log('⚡ FOBS TV Live Patch v1.1.0 executing...');

  // -------------------------------------------------------------
  // Safe Media & State Resolution
  // -------------------------------------------------------------
  function getActiveMedia() {
    try {
      if (typeof appState !== 'undefined' && appState?.currentMedia) {
        window.appState = appState;
        return appState.currentMedia;
      }
    } catch (e) {}
    return window.appState?.currentMedia || window.currentMedia || null;
  }

  function getAppState() {
    try {
      if (typeof appState !== 'undefined') {
        window.appState = appState;
        return appState;
      }
    } catch (e) {}
    return window.appState || null;
  }

  // -------------------------------------------------------------
  // 0. Eliminate Native Android Poster Freeze & Big Play Button
  // -------------------------------------------------------------
  function injectNoNativePosterStyles() {
    if (document.getElementById('fobs-no-native-poster-style')) return;
    const style = document.createElement('style');
    style.id = 'fobs-no-native-poster-style';
    style.textContent = `
      #mainVideoPlayer {
        background: #000 !important;
      }
      #mainVideoPlayer::-webkit-media-controls-start-playback-button,
      #mainVideoPlayer::-webkit-media-controls-overlay-play-button {
        display: none !important;
        -webkit-appearance: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      .video-loader {
        background: rgba(0, 0, 0, 0.75) !important;
        backdrop-filter: blur(3px) !important;
      }
    `;
    document.head.appendChild(style);
  }
  injectNoNativePosterStyles();

  function stripVideoPoster() {
    const video = document.getElementById('mainVideoPlayer');
    if (video && video.hasAttribute('poster')) {
      video.removeAttribute('poster');
    }
  }
  stripVideoPoster();

  const videoEl = document.getElementById('mainVideoPlayer');
  if (videoEl && !videoEl._hasPosterWatcher) {
    const posterObs = new MutationObserver(() => stripVideoPoster());
    posterObs.observe(videoEl, { attributes: true, attributeFilter: ['poster'] });
    videoEl._hasPosterWatcher = true;
  }

  // Hook playStreamUrl to clear poster and display smooth cyan spinner
  const origPlayStreamUrl = window.playStreamUrl;
  window.playStreamUrl = function(url, audioIndex = null, seekTime = null) {
    stripVideoPoster();
    const loader = document.getElementById('videoLoader');
    if (loader) {
      loader.classList.add('active');
      const txt = loader.querySelector('.loader-text');
      if (txt) txt.innerText = 'ভিডিও প্রস্তুত হচ্ছে...';
    }

    const video = document.getElementById('mainVideoPlayer');
    if (video) {
      video.removeAttribute('poster');
      const hideLoader = () => {
        if (loader) loader.classList.remove('active');
      };
      video.addEventListener('playing', hideLoader, { once: true });
      video.addEventListener('timeupdate', hideLoader, { once: true });
      video.addEventListener('loadeddata', hideLoader, { once: true });
      video.addEventListener('error', hideLoader, { once: true });
    }

    if (typeof origPlayStreamUrl === 'function') {
      return origPlayStreamUrl(url, audioIndex, seekTime);
    }
  };

  // -------------------------------------------------------------
  // 1. Video Player: Restore ALL episode pills for Online Watch (Serially available)
  // -------------------------------------------------------------
  function restoreOnlineWatchPills() {
    stripVideoPoster();
    const row = document.getElementById('episodesListRow');
    if (!row) return;

    // Unhide all episode pills in player
    row.querySelectorAll('.ep-pill').forEach(btn => {
      btn.style.display = '';
    });

    // Remove any empty-quality notice from the player pills
    row.querySelectorAll('.ep-empty-notice').forEach(el => el.remove());
  }

  // Override window.renderEpisodePills to always render all episodes serially for online watch
  window.renderEpisodePills = function(episodes, activeIndex) {
    stripVideoPoster();
    const row = document.getElementById('episodesListRow');
    if (!row) return;

    row.innerHTML = `
      <button class="ep-pill ep-all">All</button>
      ${episodes.map((ep, idx) => {
        const rawNum = ep ? (ep.number ?? ep.episodeNumber ?? ep.episode ?? (idx + 1)) : (idx + 1);
        const isBad = rawNum === undefined || rawNum === null || String(rawNum).trim() === '' || String(rawNum).toLowerCase() === 'undefined';
        const cleanNum = isBad ? (idx + 1) : rawNum;
        const formatted = typeof cleanNum === 'number'
          ? (cleanNum < 10 ? '0' + cleanNum : String(cleanNum))
          : String(cleanNum).replace(/^ep\s*/i, '').padStart(2, '0');
        return `
          <button class="ep-pill ${idx === activeIndex ? 'active' : ''}" onclick="selectEpisode(${idx})">
            ${formatted}
          </button>
        `;
      }).join('')}
    `;
  };

  // -------------------------------------------------------------
  // 2. Media Identifiers & Real Quality Info Fetcher
  // -------------------------------------------------------------
  function getMediaIdentifiers(media) {
    if (!media) return { sId: '', dPath: '' };
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const dPath = media.detailPath || media.mbDetailPath || '';
    return { sId, dPath };
  }

  async function fetchDownloadQualityInfo(media, seasonNum = 1) {
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

        // Auto-switch to lowest available quality if current quality has 0 episodes in this season
        const curQNum = parseInt(window.currentDownloadQuality || '480P', 10) || 480;
        const hasCurQ = data.episodes.some(info => (info.qualities || []).some(q => q.resolution === curQNum));
        if (!hasCurQ) {
          const avail = new Set();
          data.episodes.forEach(info => (info.qualities || []).forEach(q => avail.add(q.resolution)));
          const sorted = Array.from(avail).sort((a, b) => a - b);
          if (sorted.length > 0) {
            window.currentDownloadQuality = `${sorted[0]}P`;
            document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
              tab.classList.toggle('active', tab.getAttribute('data-quality') === window.currentDownloadQuality);
            });
          }
        }

        filterDownloadEpisodesModal();
      }
    } catch (err) {
      console.warn('fetchDownloadQualityInfo error:', err);
    } finally {
      media._isFetchingInfo = false;
    }
  }
  window.fetchExactEpisodesSizes = fetchDownloadQualityInfo;

  // -------------------------------------------------------------
  // 3. Strict Download Modal Filter (MovieBox Exact Match)
  // -------------------------------------------------------------
  function filterDownloadEpisodesModal() {
    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    const media = getActiveMedia();
    if (!media) return;

    const episodesInfo = media._episodesInfo;
    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;

    const state = getAppState();
    const batchState = state?._batchDownload;

    if (!episodesInfo) {
      fetchDownloadQualityInfo(media, batchState?.season || state?.currentSeason || 1);
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

      // STRICT DOWNLOAD FILTER: Only show episodes that have this resolution
      if (match) {
        item.style.display = 'flex';
        visibleCount++;
        if (sizeEl && match.sizeText) {
          sizeEl.textContent = match.sizeText;
        }
        if (batchState?.episodes?.[idx]) {
          batchState.episodes[idx].realSizeText = match.sizeText;
          batchState.episodes[idx].realSizeBytes = match.sizeBytes;
          batchState.episodes[idx].realQuality = `${match.resolution}P`;
        }
      } else {
        item.style.display = 'none';
        if (chk && chk.checked) {
          chk.checked = false;
        }
        if (batchState?.selected) {
          batchState.selected.delete(idx);
        }
      }
    });

    // Handle empty state in download modal if 0 episodes exist in this quality
    let emptyNotice = scrollList.querySelector('.dl-empty-quality-notice');
    if (visibleCount === 0 && items.length > 0) {
      if (!emptyNotice) {
        emptyNotice = document.createElement('div');
        emptyNotice.className = 'dl-empty-quality-notice';
        scrollList.appendChild(emptyNotice);
      }
      emptyNotice.style.cssText = 'text-align: center; color: #f59e0b; padding: 25px 15px; font-size: 13px; width: 100%;';
      emptyNotice.innerHTML = `
        <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
        <span>${curQ} তে কোনো পর্ব উপলব্ধ নেই। উপরে 720P বা 1080P সিলেক্ট করুন।</span>
      `;
      emptyNotice.style.display = 'block';
    } else if (emptyNotice) {
      emptyNotice.style.display = 'none';
    }

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = visibleCount;

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  }
  window.filterDownloadEpisodesModal = filterDownloadEpisodesModal;

  // -------------------------------------------------------------
  // 4. Hook Quality Selection in Download Modal
  // -------------------------------------------------------------
  const origSwitchBatchQuality = window.switchBatchQuality;
  window.switchBatchQuality = function(quality) {
    if (typeof origSwitchBatchQuality === 'function') {
      origSwitchBatchQuality(quality);
    } else {
      window.currentDownloadQuality = quality || '480P';
      document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-quality') === window.currentDownloadQuality);
      });
    }
    setTimeout(filterDownloadEpisodesModal, 50);
  };

  // -------------------------------------------------------------
  // 5. Watch DOM mutations for Download Modal
  // -------------------------------------------------------------
  function setupDownloadModalObserver() {
    const dlList = document.getElementById('dlEpisodesScrollList');
    if (dlList && !dlList._hasDlObserver) {
      const dlObs = new MutationObserver((mutations) => {
        let hasItems = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && n.classList?.contains('dl-ep-item')) {
                hasItems = true;
                break;
              }
            }
          }
        }
        if (hasItems) filterDownloadEpisodesModal();
      });
      dlObs.observe(dlList, { childList: true });
      dlList._hasDlObserver = true;
    }
  }

  // Global Click Listeners for Download Quality Tabs & Open Button
  document.addEventListener('click', (e) => {
    const dlTab = e.target.closest('#dlQualityTabs .dl-q-tab, [onclick*="switchBatchQuality"]');
    if (dlTab) {
      setTimeout(filterDownloadEpisodesModal, 60);
    }
    const dlOpenBtn = e.target.closest('#downloadBtn, .download-btn, [onclick*="triggerDownload"]');
    if (dlOpenBtn) {
      setTimeout(filterDownloadEpisodesModal, 150);
    }
  }, true);

  // -------------------------------------------------------------
  // 6. Auto-Repair Clamped Fake 140MB in Active UI & LocalStorage
  // -------------------------------------------------------------
  window.updateDownloadProgress = function(id, percent, sizeText = '') {
    const bar = document.getElementById(`dl_progress_${id}`);
    const text = document.getElementById(`dl_status_${id}`);

    let cleanSizeText = sizeText;
    if (cleanSizeText && (cleanSizeText.includes('/ 140.0 MB') || cleanSizeText.includes('/ 140 MB'))) {
      const downloads = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
      const item = downloads.find(d => d.id === id);
      const activeTask = window.activeDownloadTasks && window.activeDownloadTasks[id];
      const rec = (activeTask && activeTask.receivedBytes) || (item && item.receivedBytes) || 0;
      const tot = Math.max((activeTask && activeTask.totalBytes) || (item && item.totalBytes) || 0, rec);
      const dMb = (rec / 1048576).toFixed(1);
      const tMb = tot > 0 ? (tot / 1048576).toFixed(1) : dMb;
      cleanSizeText = `${dMb} MB / ${tMb} MB`;
    }

    if (bar) bar.style.width = `${percent}%`;
    if (text) {
      text.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #00f2fe; margin-right: 4px;"></i> <span>Downloading... ${percent}% ${cleanSizeText ? `(${cleanSizeText})` : ''}</span>`;
      text.style.color = '#00f2fe';
    }
  };

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
          item.sizeText = item.status === 'Ready (Offline)' ? `${tMb} MB` : `${dMb} MB / ${tMb} MB`;
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

  // -------------------------------------------------------------
  // 7. Ongoing Watchdog
  // -------------------------------------------------------------
  setInterval(() => {
    stripVideoPoster();
    restoreOnlineWatchPills();
    setupDownloadModalObserver();
    const dlModalOpen = document.getElementById('downloadOptionsModal')?.classList.contains('open');
    if (dlModalOpen) {
      filterDownloadEpisodesModal();
    }
  }, 800);

  restoreOnlineWatchPills();
  purgeFake140MB();
  setupDownloadModalObserver();

  console.log('✅ FOBS TV Live Patch v1.1.0 active: Normal download modal open, strict resolution filter, no stuck poster.');
})();
