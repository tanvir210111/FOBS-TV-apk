// FOBS TV Live OTA Patch Bundle v1.2.1
// 1. Online watch: ALL episodes shown serially; auto-detect plays lowest available resolution (360p/480p default)
// 2. Video Player: Never stuck on poster; Guaranteed "Connecting to stream server..." overlay with animated cyan spinner
// 3. Quality sheet: Only show resolutions that ACTUALLY exist (jei resolution nai sei resolution video te show koraiyo na)
// 4. Download modal: 480P SD, 720P HD, 1080P FHD tabs with real MovieBox streams & sizes; detect missing resolutions
// 5. Movies: Exactly like series episodes list UI with top quality tabs, badges, exact sizes, and checkbox
// 6. Fast Bufferless Streaming: Instant low-latency playback & resilient offline download engine without proxy loops
// 7. Auto Audio Silence: Instantly terminate background video & audio when opening Me / Downloads screen
// 8. Flawless Pause & Resume: Instant response, persistent chunk recovery & no background worker conflicts
(function () {
  console.log('⚡ FOBS TV Live Patch v1.2.1 executing...');

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
  // 0. Eliminate Native Android Poster Freeze, Big Play Button & Hide Portrait Resolution Button
  // -------------------------------------------------------------
  function injectConnectingOverlayStyles() {
    if (document.getElementById('fobs-connecting-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'fobs-connecting-overlay-style';
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
        background: rgba(0, 0, 0, 0.65) !important;
        backdrop-filter: blur(4px) !important;
        z-index: 9999 !important;
      }
      /* Dedicated Bulletproof Stream Connecting Screen */
      #fobsConnectingOverlay {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.65) !important;
        backdrop-filter: blur(4px) !important;
        display: none;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 9999 !important;
        pointer-events: none !important;
      }
      #fobsConnectingOverlay.active {
        display: flex !important;
      }
      .fobs-stream-spinner {
        width: 44px !important;
        height: 44px !important;
        border: 3.5px solid rgba(0, 242, 254, 0.2) !important;
        border-top-color: #00f2fe !important;
        border-radius: 50% !important;
        animation: fobsStreamSpin 0.75s linear infinite !important;
        margin-bottom: 14px !important;
      }
      .fobs-stream-text {
        font-size: 15px !important;
        font-weight: 600 !important;
        color: #ffffff !important;
        letter-spacing: 0.3px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        text-shadow: 0 2px 10px rgba(0,0,0,0.9) !important;
      }
      @keyframes fobsStreamSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* Hide resolution dropdown in portrait mode resources row */
      #currentQualityBtn {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }
  injectConnectingOverlayStyles();

  function ensureConnectingOverlay() {
    let overlay = document.getElementById('fobsConnectingOverlay');
    const container = document.getElementById('videoContainer');
    if (!container) return null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fobsConnectingOverlay';
      overlay.innerHTML = `
        <div class="fobs-stream-spinner"></div>
        <div class="fobs-stream-text">
          <i class="fa-solid fa-spinner fa-spin" style="color: #00f2fe; margin-right: 8px;"></i>
          <span>Connecting to stream server...</span>
        </div>
      `;
      container.appendChild(overlay);
    }
    return overlay;
  }

  function attachVideoWatcher() {
    const videoEl = document.getElementById('mainVideoPlayer');
    if (videoEl && !videoEl._hasFobsWatcher) {
      const posterObs = new MutationObserver(() => stripVideoPoster());
      posterObs.observe(videoEl, { attributes: true, attributeFilter: ['poster'] });

      videoEl.addEventListener('playing', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('canplay', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('loadeddata', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('loadedmetadata', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('timeupdate', () => {
        if (videoEl.currentTime > 0 && !videoEl.paused) {
          hideConnectingLoader();
        }
      });
      videoEl.addEventListener('error', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('waiting', () => {
        if (!videoEl.paused) showConnectingLoader();
      });
      videoEl.addEventListener('loadstart', () => {
        showConnectingLoader();
      });
      videoEl._hasFobsWatcher = true;
    }
  }
  attachVideoWatcher();

  function showConnectingLoader() {
    stripVideoPoster();
    attachVideoWatcher();
    const overlay = ensureConnectingOverlay();
    if (overlay) overlay.classList.add('active');
    const loader = document.getElementById('videoLoader');
    if (loader) {
      loader.classList.add('active');
      const txt = loader.querySelector('.loader-text');
      if (txt) {
        txt.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #00f2fe; margin-right: 8px;"></i> Connecting to stream server...';
      }
    }
    // Safety auto-dismiss: Never freeze or block player behind connecting screen longer than 2.5s
    if (window._connectingSafetyTimer) clearTimeout(window._connectingSafetyTimer);
    window._connectingSafetyTimer = setTimeout(() => {
      hideConnectingLoader();
    }, 2500);
  }
  window.showConnectingLoader = showConnectingLoader;

  function hideConnectingLoader() {
    if (window._connectingSafetyTimer) {
      clearTimeout(window._connectingSafetyTimer);
      window._connectingSafetyTimer = null;
    }
    const overlay = document.getElementById('fobsConnectingOverlay');
    if (overlay) overlay.classList.remove('active');
    const loader = document.getElementById('videoLoader');
    if (loader) loader.classList.remove('active');
  }
  window.hideConnectingLoader = hideConnectingLoader;

  function stripVideoPoster() {
    const video = document.getElementById('mainVideoPlayer');
    if (video && video.hasAttribute('poster')) {
      video.removeAttribute('poster');
    }
    const qBtn = document.getElementById('currentQualityBtn');
    if (qBtn) qBtn.style.setProperty('display', 'none', 'important');
  }
  stripVideoPoster();

  // Universal Instant Stream Resolver: Ensures 480p SD default & never direct raw MovieBox CDN
  window.getActiveEpisodeStream = function(ep, audioTrack) {
    if (!ep) return '';
    const m = getActiveMedia();
    const isMovie = m?.type === 'movie' || (!m?.seasons && !m?.episodes);
    const epNum = isMovie ? 0 : (ep?.episode ?? ep?.episodeNumber ?? parseInt(ep?.number, 10) ?? 1);
    const seNum = isMovie ? 0 : (ep?.season ?? window.appState?.currentSeason ?? 1);

    if (window.appState) window.appState.currentQuality = '480p';

    const sId = m?.subjectId || m?.mbSubjectId || (m?.id && m.id.startsWith('mb-s-') ? m.id.replace('mb-s-', '') : (m?.id && m.id.startsWith('mb-m-') ? m.id.replace('mb-m-', '').replace(/-hindi$/, '') : null)) || (m?.id && /^\d{16,20}$/.test(m.id) ? m.id : null);
    const dPath = m?.detailPath || m?.mbDetailPath || m?.movieboxDetailPath || '';
    if (sId) {
      return `/api/moviebox/stream?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${epNum}&q=480`;
    }

    const allUrls = [
      ep?.streamUrl,
      ...(Array.isArray(ep?.servers) ? ep.servers.map(s => s?.url) : []),
      m?.streamUrl,
      ...(Array.isArray(m?.servers) ? m.servers.map(s => s?.url) : [])
    ].filter(Boolean);

    const mbUrl = allUrls.find(u => typeof u === 'string' && u.includes('/api/moviebox/stream'));
    if (mbUrl) {
      let clean = mbUrl.replace(/([?&])q=\d+/g, '$1q=480');
      if (!clean.includes('q=')) clean += (clean.includes('?') ? '&' : '?') + 'q=480';
      return clean;
    }

    const rawCdn = allUrls.find(u => typeof u === 'string' && (u.includes('hakunaymatata') || u.includes('bcdnxw') || u.includes('haildrop') || u.includes('fogtwist') || u.includes('sunburst') || u.includes('stormshade')));
    if (rawCdn) {
      return `/api/stream?url=${encodeURIComponent(rawCdn)}`;
    }

    return ep?.streamUrl || m?.streamUrl || '';
  };

  // Hook playStreamUrl: Guaranteed 480p low-latency start & "Connecting to stream server..." overlay
  const origPlayStreamUrl = window.playStreamUrl;
  window.playStreamUrl = function(url, audioIndex = null, seekTime = null) {
    showConnectingLoader();

    let fastUrl = url;
    if (typeof fastUrl === 'string') {
      if (fastUrl.includes('/api/moviebox/stream')) {
        fastUrl = fastUrl.replace(/([?&])q=\d+/g, '$1q=480');
        if (!fastUrl.includes('q=')) fastUrl += (fastUrl.includes('?') ? '&' : '?') + 'q=480';
      } else if (fastUrl.includes('hakunaymatata') || fastUrl.includes('bcdnxw') || fastUrl.includes('haildrop') || fastUrl.includes('fogtwist') || fastUrl.includes('sunburst') || fastUrl.includes('stormshade')) {
        const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        fastUrl = `${base}/api/stream?url=${encodeURIComponent(fastUrl)}`;
      }
    }

    // Let original playStreamUrl perform single, atomic setup and avoid decoder thrashing
    if (typeof origPlayStreamUrl === 'function') {
      return origPlayStreamUrl(fastUrl, audioIndex, seekTime);
    }
  };

  // Hook openPlayer & openPlayerById
  if (typeof window.openPlayer === 'function' && !window.openPlayer._hasLoaderHook) {
    const prevOpenPlayer = window.openPlayer;
    window.openPlayer = function(media, episodeIndex = null, resumeSeekTime = null) {
      const vp = document.getElementById('mainVideoPlayer');
      if (vp) vp.muted = false;
      showConnectingLoader();
      return prevOpenPlayer(media, episodeIndex, resumeSeekTime);
    };
    window.openPlayer._hasLoaderHook = true;
  }

  if (typeof window.openPlayerById === 'function' && !window.openPlayerById._hasLoaderHook) {
    const prevOpenPlayerById = window.openPlayerById;
    window.openPlayerById = function(type, id) {
      showConnectingLoader();
      return prevOpenPlayerById(type, id);
    };
    window.openPlayerById._hasLoaderHook = true;
  }

  // Hook selectEpisode
  if (typeof window.selectEpisode === 'function' && !window.selectEpisode._hasLoaderHook) {
    const prevSelectEp = window.selectEpisode;
    window.selectEpisode = function(idx) {
      showConnectingLoader();
      return prevSelectEp(idx);
    };
    window.selectEpisode._hasLoaderHook = true;
  }

  // Hook selectVideoQuality
  if (typeof window.selectVideoQuality === 'function' && !window.selectVideoQuality._hasLoaderHook) {
    const prevSelectQ = window.selectVideoQuality;
    window.selectVideoQuality = function(quality, isSilent = false) {
      showConnectingLoader();
      return prevSelectQ(quality, isSilent);
    };
    window.selectVideoQuality._hasLoaderHook = true;
  }

  // -------------------------------------------------------------
  // Dynamic Quality Sheet: ONLY show available resolutions! (jei resolution nai sei resolution video te show koraiyo na)
  // -------------------------------------------------------------
  const origOpenQualitySheet = window.openQualitySheet;
  window.openQualitySheet = function() {
    const state = getAppState();
    const curQ = parseInt(state?.currentQuality || '480', 10);
    const avail = state?.availableQualities || window.appState?.availableQualities || [];
    const availResSet = new Set(avail.map(q => parseInt(q.resolution, 10)).filter(n => !isNaN(n) && n > 0));

    const container = document.getElementById('qualityOptionsList');
    if (container) {
      const buttons = container.querySelectorAll('.sheet-option-btn');
      buttons.forEach(btn => {
        const qVal = parseInt(btn.getAttribute('data-q') || '', 10);
        if (availResSet.size > 0 && qVal > 0) {
          const isAvail = availResSet.has(qVal) || (qVal === 480 && availResSet.has(360));
          btn.style.display = isAvail ? 'flex' : 'none';
        } else {
          btn.style.display = 'flex';
        }
        btn.classList.toggle('selected', qVal === curQ);
      });
    }

    const lsContainer = document.getElementById('lsQualityOptionsList');
    if (lsContainer) {
      const lsButtons = lsContainer.querySelectorAll('.ls-speed-option');
      lsButtons.forEach(btn => {
        const qAttr = btn.getAttribute('data-quality') || '';
        const qVal = parseInt(qAttr, 10);
        if (availResSet.size > 0 && qVal > 0) {
          const isAvail = availResSet.has(qVal) || (qVal === 480 && availResSet.has(360));
          btn.style.display = isAvail ? 'flex' : 'none';
        } else {
          btn.style.display = 'flex';
        }
        btn.classList.toggle('active', qVal === curQ || (qAttr === 'auto' && curQ === 480));
      });
    }

    if (typeof origOpenQualitySheet === 'function') {
      origOpenQualitySheet();
    } else {
      const overlay = document.getElementById('qualitySheetOverlay');
      if (overlay) overlay.classList.add('open');
    }
  };

  // -------------------------------------------------------------
  // 1. Video Player: Restore ALL episode pills for Online Watch (Serially available)
  // -------------------------------------------------------------
  function restoreOnlineWatchPills() {
    stripVideoPoster();
    const row = document.getElementById('episodesListRow');
    if (!row) return;

    row.querySelectorAll('.ep-pill').forEach(btn => {
      btn.style.display = '';
    });
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
  // 2. Media Identifiers & Real Quality Info Fetcher (Series & Movies)
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

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));
    const seParam = isSeries ? (seasonNum || 1) : 0;
    const typeParam = isSeries ? '' : '&type=movie';

    media._isFetchingInfo = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seParam}${typeParam}&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.episodes) && data.episodes.length > 0) {
        media._episodesInfo = data.episodes;
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
  // 3. Render Batch Episodes/Movie List inside Download Modal
  // -------------------------------------------------------------
  window.renderBatchEpisodesList = function(seasonNum) {
    const media = getActiveMedia();
    if (!media) return;

    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));

    let allEpisodes = [];
    if (isSeries) {
      if (media.seasons && media.seasons.length > 0) {
        const targetSeason = media.seasons.find(s => (s.seasonNumber || s.season) === seasonNum) || media.seasons[0];
        allEpisodes = targetSeason?.episodes || [];
      } else if (media.episodes && media.episodes.length > 0) {
        allEpisodes = media.episodes;
      }
    } else {
      allEpisodes = [{
        episode: 1,
        isMovie: true,
        title: media.title,
        number: 1
      }];
    }

    if (!allEpisodes || allEpisodes.length === 0) {
      scrollList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">${isSeries ? 'এই সিজনে কোনো পর্ব পাওয়া যায়নি' : 'মুভি ফাইল পাওয়া যায়নি'}</div>`;
      return;
    }

    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;
    const episodesInfo = (media && media._episodesInfo) || [];

    // All episodes / movie are ALWAYS available in 480P, 720P, 1080P!
    const preparedEpisodes = allEpisodes.map((ep, origIdx) => {
      const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (origIdx + 1)) : (origIdx + 1);
      const isMovieItem = ep.isMovie || !isSeries;
      const info = episodesInfo.find(it => isMovieItem ? (it.isMovie || it.episode === 1) : it.episode === epNum);

      let match = null;
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        match = info.qualities.find(q => q.resolution === qNum)
             || (qNum === 480 ? info.qualities.find(q => q.resolution === 360) : null);
      }

      const epCopy = { ...ep, _origIdx: origIdx };
      if (match && match.sizeText) {
        epCopy.realSizeText = match.sizeText;
        epCopy.realSizeBytes = match.sizeBytes;
        epCopy.realQuality = `${match.resolution}P`;
      } else {
        const estMb = isMovieItem
          ? (qNum >= 1080 ? 1200 : (qNum >= 720 ? 650 : 380))
          : (qNum >= 1080 ? 480 : (qNum >= 720 ? 260 : 135));
        const formatted = estMb >= 1024 ? `~${(estMb / 1024).toFixed(2)} GB` : `~${estMb} MB`;
        epCopy.realSizeText = formatted;
        epCopy.realSizeBytes = estMb * 1024 * 1024;
        epCopy.realQuality = curQ;
      }
      return epCopy;
    });

    const state = getAppState();
    const selectedSet = new Set(preparedEpisodes.map((_, i) => i));
    if (state) {
      state._batchDownload = {
        media,
        isSeries,
        season: seasonNum,
        episodes: preparedEpisodes,
        selected: selectedSet
      };
    }

    scrollList.innerHTML = preparedEpisodes.map((ep, idx) => {
      const isMovieItem = ep.isMovie || !isSeries;
      const epNum = ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1);
      const badgeText = isMovieItem ? 'MOVIE' : `EP ${epNum}`;
      const epTitle = isMovieItem ? media.title : (ep.title ? ep.title : `Episode ${epNum}`);
      const estSizeStr = ep.realSizeText || 'Calculating size...';

      return `
        <div class="dl-ep-item selected" id="dl_ep_item_${idx}" onclick="toggleBatchEpisode(${idx})">
          <div class="dl-ep-left">
            <span class="dl-ep-badge">${badgeText}</span>
            <div class="dl-ep-title-wrap">
              <div class="dl-ep-title">${epTitle}</div>
              <div class="dl-ep-size" id="dl_ep_size_${idx}">${estSizeStr}</div>
            </div>
          </div>
          <label class="dl-ep-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="dl_ep_chk_${idx}" checked onchange="toggleBatchEpisode(${idx})">
            <span class="dl-checkbox-custom"><i class="fa-solid fa-check"></i></span>
          </label>
        </div>
      `;
    }).join('');

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = preparedEpisodes.length;

    const selectAllChk = document.getElementById('dlSelectAllCheckbox');
    if (selectAllChk) selectAllChk.checked = true;

    if (typeof window.updateBatchSelectedSummary === 'function') window.updateBatchSelectedSummary();
    fetchDownloadQualityInfo(media, isSeries ? seasonNum : 0);
  };

  // -------------------------------------------------------------
  // 4. Download Modal Filter Watcher: Real Resolution Detection & Size Formatting
  // -------------------------------------------------------------
  function filterDownloadEpisodesModal() {
    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    const media = getActiveMedia();
    if (!media) return;

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));
    const episodesInfo = media._episodesInfo || [];
    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;

    const state = getAppState();
    const batchState = state?._batchDownload;

    // 1. Collect all available resolutions across this media item
    const allAvailableResolutions = new Set();
    episodesInfo.forEach(it => {
      if (Array.isArray(it.qualities)) {
        it.qualities.forEach(q => {
          const r = parseInt(q.resolution, 10);
          if (r > 0) {
            allAvailableResolutions.add(r);
            if (r === 360) allAvailableResolutions.add(480);
          }
        });
      }
    });

    // 2. Mark tabs in #dlQualityTabs that do not have files
    if (allAvailableResolutions.size > 0) {
      document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
        const qAttr = tab.getAttribute('data-quality') || '480P';
        const qVal = parseInt(qAttr, 10) || 480;
        const isAvail = allAvailableResolutions.has(qVal);
        let tag = tab.querySelector('.dl-q-not-avail');
        if (!isAvail) {
          tab.classList.add('tab-disabled');
          tab.style.opacity = '0.45';
          if (!tag) {
            tag = document.createElement('span');
            tag.className = 'dl-q-not-avail';
            tag.style.cssText = 'font-size: 9px; color: #ef4444; margin-left: 4px; font-weight: 700;';
            tag.innerText = '(নেই)';
            tab.appendChild(tag);
          }
        } else {
          tab.classList.remove('tab-disabled');
          tab.style.opacity = '1';
          if (tag) tag.remove();
        }
      });

      // If current selected tab has NO file, auto-switch to lowest available quality!
      if (!allAvailableResolutions.has(qNum)) {
        const sortedAvail = Array.from(allAvailableResolutions).sort((a, b) => a - b);
        if (sortedAvail.length > 0) {
          const targetQ = `${sortedAvail[0]}P`;
          if (window.currentDownloadQuality !== targetQ) {
            console.log(`Auto-switching download quality from unavailable ${curQ} to available ${targetQ}`);
            window.currentDownloadQuality = targetQ;
            document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
              tab.classList.toggle('active', tab.getAttribute('data-quality') === targetQ);
            });
            setTimeout(filterDownloadEpisodesModal, 10);
            return;
          }
        }
      }
    }

    // 3. Inspect each episode / movie item in the scroll list
    const items = Array.from(scrollList.querySelectorAll('.dl-ep-item'));
    items.forEach((item, idx) => {
      item.style.display = 'flex';
      const badge = item.querySelector('.dl-ep-badge');
      const isMovieBadge = badge && badge.textContent.includes('MOVIE');
      const badgeText = badge ? badge.textContent.replace(/[^0-9]/g, '') : '';
      const epNum = parseInt(badgeText, 10) || (idx + 1);
      const chk = item.querySelector('input[type="checkbox"]');

      const info = episodesInfo.find(it => (isMovieBadge || !isSeries) ? (it.isMovie || it.episode === 1) : it.episode === epNum);
      const hasAnyQualityInfo = info && Array.isArray(info.qualities) && info.qualities.length > 0;

      let match = null;
      if (hasAnyQualityInfo) {
        match = info.qualities.find(q => parseInt(q.resolution, 10) === qNum)
             || (qNum === 480 ? info.qualities.find(q => parseInt(q.resolution, 10) === 360) : null);
      }

      const sizeEl = item.querySelector('.dl-ep-size');

      if (hasAnyQualityInfo && !match) {
        // Quality NOT available for this episode/movie
        item.classList.add('dl-unavailable');
        item.classList.remove('selected');
        item.style.opacity = '0.5';
        if (chk) {
          chk.checked = false;
          chk.disabled = true;
        }
        if (sizeEl) {
          sizeEl.innerHTML = '<span style="color: #ef4444; font-weight: 600; font-size: 11px;"><i class="fa-solid fa-circle-exclamation" style="margin-right: 4px;"></i>এই রেজুলেশনে ফাইল নেই</span>';
        }
        if (batchState?.selected) {
          batchState.selected.delete(idx);
        }
        if (batchState?.episodes?.[idx]) {
          batchState.episodes[idx].isUnavailable = true;
        }
      } else if (match && match.sizeText) {
        // Quality available with exact size
        item.classList.remove('dl-unavailable');
        item.style.opacity = '1';
        if (chk) chk.disabled = false;
        if (sizeEl) {
          sizeEl.innerHTML = `<span style="color: #94a3b8; font-weight: 500;">${match.sizeText}</span>`;
        }
        if (batchState?.episodes?.[idx]) {
          batchState.episodes[idx].isUnavailable = false;
          batchState.episodes[idx].realSizeText = match.sizeText;
          batchState.episodes[idx].realSizeBytes = match.sizeBytes;
          batchState.episodes[idx].realQuality = `${match.resolution}P`;
        }
      } else {
        // Fallback or still resolving
        item.classList.remove('dl-unavailable');
        item.style.opacity = '1';
        if (chk) chk.disabled = false;
        const isMovieItem = isMovieBadge || !isSeries;
        const estMb = isMovieItem
          ? (qNum >= 1080 ? 1200 : (qNum >= 720 ? 650 : 380))
          : (qNum >= 1080 ? 480 : (qNum >= 720 ? 260 : 135));
        const sizeText = estMb >= 1024 ? `~${(estMb / 1024).toFixed(2)} GB` : `~${estMb} MB`;
        if (sizeEl) sizeEl.innerHTML = `<span style="color: #94a3b8; font-weight: 500;">${sizeText}</span>`;
        if (batchState?.episodes?.[idx]) {
          batchState.episodes[idx].isUnavailable = false;
          batchState.episodes[idx].realSizeText = sizeText;
          batchState.episodes[idx].realSizeBytes = estMb * 1024 * 1024;
          batchState.episodes[idx].realQuality = curQ;
        }
      }
    });

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = items.length;

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  }
  window.filterDownloadEpisodesModal = filterDownloadEpisodesModal;

  // Toggle Individual Episode Selection
  window.toggleBatchEpisode = function(index) {
    const itemEl = document.getElementById(`dl_ep_item_${index}`);
    if (itemEl && itemEl.classList.contains('dl-unavailable')) {
      if (typeof showToast === 'function') showToast('⚠️ এই রেজুলেশনের কোনো ফাইল উপলব্ধ নেই');
      return;
    }
    const batchState = getAppState()?._batchDownload;
    if (!batchState || !batchState.selected) return;

    if (batchState.selected.has(index)) {
      batchState.selected.delete(index);
    } else {
      batchState.selected.add(index);
    }

    const isChecked = batchState.selected.has(index);
    const chkEl = document.getElementById(`dl_ep_chk_${index}`);
    if (itemEl) itemEl.classList.toggle('selected', isChecked);
    if (chkEl) chkEl.checked = isChecked;

    const selectAllChk = document.getElementById('dlSelectAllCheckbox');
    if (selectAllChk) {
      const availCount = batchState.episodes.filter(ep => !ep.isUnavailable).length;
      selectAllChk.checked = (batchState.selected.size === availCount && availCount > 0);
    }

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  };

  // Toggle Select All Episodes
  window.toggleSelectAllEpisodes = function(checked) {
    const batchState = getAppState()?._batchDownload;
    if (!batchState || !batchState.episodes) return;

    if (checked) {
      const valid = [];
      batchState.episodes.forEach((ep, i) => {
        const itemEl = document.getElementById(`dl_ep_item_${i}`);
        if (!itemEl || !itemEl.classList.contains('dl-unavailable')) {
          valid.push(i);
        }
      });
      batchState.selected = new Set(valid);
    } else {
      batchState.selected.clear();
    }

    batchState.episodes.forEach((ep, idx) => {
      const isSelected = batchState.selected.has(idx);
      const itemEl = document.getElementById(`dl_ep_item_${idx}`);
      const chkEl = document.getElementById(`dl_ep_chk_${idx}`);
      if (itemEl && !itemEl.classList.contains('dl-unavailable')) {
        itemEl.classList.toggle('selected', isSelected);
      }
      if (chkEl && !chkEl.disabled) {
        chkEl.checked = isSelected;
      }
    });

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  };

  // -------------------------------------------------------------
  // 5. Override triggerDownload to unify Movies and Series UI
  // -------------------------------------------------------------
  const origTriggerDownload = window.triggerDownload;
  window.triggerDownload = function() {
    const media = getActiveMedia();
    if (!media) {
      if (typeof origTriggerDownload === 'function') origTriggerDownload();
      return;
    }

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));

    // Default to 480P Data Saver
    window.currentDownloadQuality = window.currentDownloadQuality || '480P';

    if (typeof origTriggerDownload === 'function') {
      origTriggerDownload();
    }

    // Force hide old single movie list; always use episode-style batch scroll list
    const singleMovieQualityList = document.getElementById('dlSingleMovieQualityList');
    if (singleMovieQualityList) singleMovieQualityList.style.setProperty('display', 'none', 'important');

    const controlBar = document.getElementById('dlEpisodesControlBar');
    const scrollList = document.getElementById('dlEpisodesScrollList');
    const seasonSelector = document.getElementById('dlSeasonSelector');

    if (controlBar) controlBar.style.display = 'flex';
    if (scrollList) scrollList.style.display = 'flex';

    if (!isSeries) {
      if (seasonSelector) seasonSelector.style.display = 'none';
      window.renderBatchEpisodesList(0);
    }
  };

  // -------------------------------------------------------------
  // 6. Hook Quality Selection in Download Modal (480P, 720P, 1080P)
  // -------------------------------------------------------------
  window.switchBatchQuality = function(quality) {
    window.currentDownloadQuality = quality || '480P';
    document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-quality') === window.currentDownloadQuality);
    });

    const previewMeta = document.getElementById('dlPreviewMeta');
    const media = getActiveMedia();
    const isHindi = (media?.title?.toLowerCase().includes('hindi') || (window.appState?.currentAudioTrack && window.appState.currentAudioTrack.toLowerCase().includes('hindi')));
    const dubLabel = isHindi ? 'Hindi Dubbed' : (media?.dubLanguage || 'Original Audio');
    const qNum = parseInt(window.currentDownloadQuality, 10) || 480;
    if (previewMeta) {
      previewMeta.innerText = `${dubLabel} • ${window.currentDownloadQuality} ${qNum >= 1080 ? 'Full HD' : (qNum >= 720 ? 'HD' : 'SD')}`;
    }

    filterDownloadEpisodesModal();
  };

  // -------------------------------------------------------------
  // 7. Update Selected Summary & Download Button Text
  // -------------------------------------------------------------
  window.updateBatchSelectedSummary = function() {
    const batchState = getAppState()?._batchDownload;
    const summaryEl = document.getElementById('dlSelectedSummary');
    const btnText = document.getElementById('btnStartDownloadText');
    const curQ = window.currentDownloadQuality || '480P';

    if (!batchState) {
      if (btnText) btnText.innerText = `ডাউনলোড শুরু করুন (${curQ})`;
      return;
    }

    const count = batchState.selected ? batchState.selected.size : 0;
    let totalBytes = 0;
    if (batchState.selected && batchState.episodes) {
      batchState.selected.forEach(idx => {
        const ep = batchState.episodes[idx];
        if (ep && ep.realSizeBytes > 0) {
          totalBytes += ep.realSizeBytes;
        } else {
          const qNum = parseInt(curQ, 10) || 480;
          const estMb = ep?.isMovie
            ? (qNum >= 1080 ? 1200 : (qNum >= 720 ? 650 : 380))
            : (qNum >= 1080 ? 480 : (qNum >= 720 ? 260 : 135));
          totalBytes += estMb * 1024 * 1024;
        }
      });
    }

    const totalMb = Math.round(totalBytes / (1024 * 1024));
    const sizeFormatted = totalMb >= 1024 ? `${(totalMb / 1024).toFixed(2)} GB` : `${totalMb} MB`;

    if (summaryEl) {
      if (count === 0) {
        summaryEl.innerText = 'কোনো ফাইল নির্বাচিত নয়';
      } else {
        summaryEl.innerText = `${count} টি ${batchState.isSeries ? 'পর্ব' : 'মুভি'} নির্বাচিত (${sizeFormatted})`;
      }
    }

    if (btnText) {
      if (count === 0) {
        btnText.innerText = 'ডাউনলোড শুরু করুন (০)';
      } else {
        btnText.innerText = `ডাউনলোড শুরু করুন (${curQ}) - ${sizeFormatted}`;
      }
    }
  };

  // -------------------------------------------------------------
  // 8. Confirm Download (Handles Movies and Series with Real / Desired Quality)
  // -------------------------------------------------------------
  window.confirmBatchDownload = function() {
    const media = getActiveMedia();
    if (!media) {
      if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
      return;
    }

    const curQ = window.currentDownloadQuality || '480P';
    const targetResNum = parseInt(curQ, 10) || 480;
    const batchState = getAppState()?._batchDownload;
    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));

    const validIndices = selectedIndices.filter(idx => {
      const itemEl = document.getElementById(`dl_ep_item_${idx}`);
      return !itemEl || !itemEl.classList.contains('dl-unavailable');
    });
    if (validIndices.length === 0) {
      showToast('⚠️ নির্বাচিত রেজুলেশনে ডাউনলোড করার মতো কোনো ফাইল নেই');
      return;
    }

    let subjectId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '').replace(/-hindi$/, '') : null) || '';
    let detailPath = media.detailPath || media.mbDetailPath || '';
    if (!subjectId && media.id) {
      if (/^\d{16,20}$/.test(media.id)) subjectId = media.id;
    }
    if (!subjectId && window.appState?.content) {
      const all = [...(window.appState.content.movies || []), ...(window.appState.content.series || [])];
      const found = all.find(x => x.id === media.id || (media.id && String(x.id).includes(media.id)) || (x.title && media.title && x.title === media.title));
      if (found) {
        if (found.subjectId) subjectId = String(found.subjectId);
        if (found.detailPath && !detailPath) detailPath = found.detailPath;
      }
    }
    if (!subjectId) subjectId = media.id || '';

    if (isSeries) {
      const seNum = batchState?.season || window.appState?.currentSeason || 1;
      validIndices.forEach(idx => {
        const ep = batchState.episodes[idx];
        const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1)) : (idx + 1);
        const epTitle = ep?.title ? `${media.title} - ${ep.title}` : `${media.title} - S${seNum} Ep ${epNum}`;
        const epPoster = ep?.stillPath || media.poster || 'assets/fobs_logo.png';
        const taskId = `dl_${subjectId || media.id}_s${seNum}_e${epNum}_${curQ}`;
        const epRealSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 480 : (targetResNum >= 720 ? 260 : 135)} MB`;
        const epRealBytes = ep?.realSizeBytes || 0;
        const cleanSafeEpTitle = epTitle.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
        let directUrl = ep?.streamUrl || ep?.directStreamUrl || (ep?.servers && ep.servers[0]?.url) || '';
        if (directUrl && (directUrl.includes('/api/download') || directUrl.includes('/api/stream'))) {
          directUrl = '';
        }
        let downloadEndpointUrl = `/api/download?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=${seNum}&ep=${epNum}&q=${targetResNum}&title=${encodeURIComponent(cleanSafeEpTitle)}`;
        if (directUrl && directUrl.startsWith('http')) {
          downloadEndpointUrl += `&streamUrl=${encodeURIComponent(directUrl)}`;
        }

        if (window.fobsDownloadQueue) {
          window.fobsDownloadQueue.enqueue({
            id: taskId,
            mediaId: media.id,
            title: epTitle,
            poster: epPoster,
            quality: curQ,
            resolution: targetResNum,
            season: seNum,
            episode: epNum,
            isSeries: true,
            url: downloadEndpointUrl,
            progress: 0,
            receivedBytes: 0,
            totalBytes: epRealBytes,
            sizeText: epRealSize,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            status: 'queued',
            statusText: 'Waiting in Queue (লাইনে অপেক্ষমাণ)',
            options: {
              quality: curQ,
              resolution: targetResNum,
              poster: epPoster,
              mediaId: media.id,
              season: seNum,
              episode: epNum,
              subjectId,
              detailPath,
              isSeries: true
            }
          });
        }
      });

      if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
      if (typeof showToast === 'function') showToast(`📥 ${validIndices.length} টি পর্ব (${curQ}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
      stopBackgroundMedia();
      if (typeof openDownloadsView === 'function') openDownloadsView();
      return;
    }

    // Single Movie Download
    const ep = batchState?.episodes?.[0];
    const movieTitle = media.title;
    const moviePoster = media.poster || 'assets/fobs_logo.png';
    const realSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 950 : (targetResNum >= 720 ? 450 : 250)} MB`;
    const realBytes = ep?.realSizeBytes || 0;
    const taskId = `dl_${subjectId || media.id}_movie_${curQ}`;
    const cleanSafeMovieTitle = movieTitle.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
    let directMovieUrl = media?.streamUrl || media?.directStreamUrl || (media?.servers && media.servers[0]?.url) || ep?.streamUrl || '';
    if (directMovieUrl && (directMovieUrl.includes('/api/download') || directMovieUrl.includes('/api/stream'))) {
      directMovieUrl = '';
    }
    let downloadEndpointUrl = `/api/download?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=0&ep=0&q=${targetResNum}&title=${encodeURIComponent(cleanSafeMovieTitle)}`;
    if (directMovieUrl && directMovieUrl.startsWith('http')) {
      downloadEndpointUrl += `&streamUrl=${encodeURIComponent(directMovieUrl)}`;
    }

    if (window.fobsDownloadQueue) {
      window.fobsDownloadQueue.enqueue({
        id: taskId,
        mediaId: media.id,
        title: movieTitle,
        poster: moviePoster,
        quality: curQ,
        resolution: targetResNum,
        season: 0,
        episode: 0,
        isSeries: false,
        url: downloadEndpointUrl,
        progress: 0,
        receivedBytes: 0,
        totalBytes: realBytes,
        sizeText: realSize,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        status: 'queued',
        statusText: 'Waiting in Queue (লাইনে অপেক্ষমাণ)',
        options: {
          quality: curQ,
          resolution: targetResNum,
          poster: moviePoster,
          mediaId: media.id,
          season: 0,
          episode: 0,
          subjectId,
          detailPath,
          isSeries: false
        }
      });
    }

    if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
    if (typeof showToast === 'function') showToast(`📥 "${movieTitle}" (${curQ}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
    stopBackgroundMedia();
    if (typeof openDownloadsView === 'function') openDownloadsView();
  };
  window.confirmStartDownload = window.confirmBatchDownload;

  // -------------------------------------------------------------
  // 9. Watch DOM mutations for Download Modal
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
      const q = dlTab.getAttribute('data-quality') || '480P';
      window.switchBatchQuality(q);
    }
    const dlOpenBtn = e.target.closest('#downloadBtn, .download-btn, [onclick*="triggerDownload"]');
    if (dlOpenBtn) {
      setTimeout(filterDownloadEpisodesModal, 150);
    }
  }, true);

  // -------------------------------------------------------------
  // 10. Auto-Repair Clamped Fake 140MB in Active UI & LocalStorage
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
  // 11. Hook Serial Download Queue & Auto-Repair Stuck / Reconnecting Tasks
  // -------------------------------------------------------------
  function repairStuckDownloads() {
    try {
      const raw = localStorage.getItem('fobs_downloads');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) return;

      let changed = false;
      const activeTasks = window.activeDownloadTasks || {};

      list.forEach(item => {
        if (!item || !item.id) return;

        // 1. Unwrap circular proxy / nested URLs
        if (item.url && typeof item.url === 'string') {
          let cleanUrl = item.url;
          while (cleanUrl.includes('/api/download?url=') || cleanUrl.includes('/api/stream?url=')) {
            try {
              const u = new URL(cleanUrl, typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : window.location.origin);
              const target = u.searchParams.get('url');
              if (target) {
                cleanUrl = decodeURIComponent(target);
              } else {
                break;
              }
            } catch (_) { break; }
          }
          if (cleanUrl !== item.url) {
            item.url = cleanUrl;
            changed = true;
          }
        }

        // 2. Fix empty or missing subjectId in download endpoint URL: /api/download?id=& or /api/download?id=undefined
        if (item.url && typeof item.url === 'string' && (item.url.includes('/api/download?id=&') || item.url.includes('/api/download?id=undefined') || item.url.includes('/api/download?id=null'))) {
          const catalog = window.appState?.content;
          const allMedia = [...(catalog?.movies || []), ...(catalog?.series || [])];
          const matched = allMedia.find(m => (item.mediaId && m.id === item.mediaId) || (m.title && item.title && (m.title === item.title || item.title.startsWith(m.title))));
          if (matched) {
            const sid = matched.subjectId || matched.id;
            const path = matched.detailPath || matched.movieBoxDetailPath || '';
            const q = item.resolution || parseInt(item.quality, 10) || 480;
            const se = item.season || 0;
            const ep = item.episode || 0;
            const titleSafe = encodeURIComponent((item.title || 'video').replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_'));
            item.url = `/api/download?id=${encodeURIComponent(sid)}&path=${encodeURIComponent(path)}&se=${se}&ep=${ep}&q=${q}&title=${titleSafe}`;
            if (item.options) {
              item.options.subjectId = sid;
              item.options.detailPath = path;
            }
            changed = true;
          }
        }

        // 3. Reset orphaned 'Reconnecting' or 'downloading' items that have no active worker
        const activeTasks = window.activeDownloadTasks || {};
        const hasWorker = activeTasks[item.id] && activeTasks[item.id].isDownloading && !activeTasks[item.id].isPaused;
        const isReconnecting = typeof item.statusText === 'string' && item.statusText.toLowerCase().includes('reconnecting');
        const lastAct = item._lastActivity || 0;
        const isRecent = (Date.now() - lastAct) < 25000;
        const isStuckDownloading = item.status === 'downloading' && !hasWorker && !isRecent;

        if (isReconnecting || isStuckDownloading) {
          if (item.progress && item.progress > 0) {
            item.status = 'paused';
            item.paused = true;
            item.failed = false;
            item.statusText = `Paused (${item.progress}%) • Tap to Resume`;
          } else {
            item.status = 'queued';
            item.paused = false;
            item.failed = false;
            item.statusText = 'Queued (লাইনে অপেক্ষমাণ)';
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
    } catch (e) {
      console.warn('repairStuckDownloads error:', e);
    }
  }

  // Hook pauseDownload & resumeDownload for instant, zero-delay UI response
  if (typeof window.pauseDownload === 'function' && !window.pauseDownload._hasPatchHook) {
    const origPause = window.pauseDownload;
    window.pauseDownload = function(id, e) {
      if (e) {
        try { e.stopPropagation(); e.preventDefault(); } catch (_) {}
      }
      const activeTasks = window.activeDownloadTasks || {};
      const task = activeTasks[id];
      if (task) {
        task.isPaused = true;
        task.isDownloading = false;
        if (task.reader) {
          try { task.reader.cancel('paused'); } catch (_) {}
        }
        if (task.controller) {
          try { task.controller.abort(); } catch (_) {}
        }
      }
      const downloads = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
      const item = downloads.find(d => d.id === id);
      if (item) {
        item.status = 'paused';
        item.paused = true;
        item.failed = false;
        item._lastActivity = Date.now();
        item.statusText = `Paused (${item.progress || 0}%)`;
        try { localStorage.setItem('fobs_downloads', JSON.stringify(downloads)); } catch (_) {}
      }
      if (typeof renderDownloadsList === 'function') renderDownloadsList();
      if (typeof showToast === 'function') showToast('⏸️ ডাউনলোড পজ করা হয়েছে');
      return origPause(id, e);
    };
    window.pauseDownload._hasPatchHook = true;
  }

  if (typeof window.resumeDownload === 'function' && !window.resumeDownload._hasPatchHook) {
    const origResume = window.resumeDownload;
    window.resumeDownload = function(id, e) {
      if (e) {
        try { e.stopPropagation(); e.preventDefault(); } catch (_) {}
      }
      const activeTasks = window.activeDownloadTasks || {};
      if (activeTasks[id]) {
        activeTasks[id].isPaused = false;
        activeTasks[id]._autoRetries = 0;
      }
      const downloads = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
      const item = downloads.find(d => d.id === id);
      if (item) {
        item.status = 'downloading';
        item.paused = false;
        item.failed = false;
        item._lastActivity = Date.now();
        const currentQuality = item.quality || item.options?.quality || '480P';
        item.statusText = item.progress > 0 ? `Resuming ${currentQuality} (${item.progress}%)...` : `Connecting ${currentQuality}...`;
        try { localStorage.setItem('fobs_downloads', JSON.stringify(downloads)); } catch (_) {}
      }
      if (typeof renderDownloadsList === 'function') renderDownloadsList();
      return origResume(id, e);
    };
    window.resumeDownload._hasPatchHook = true;
  }

  // Hook retryDownload to auto-repair stale / broken item urls before retrying
  if (typeof window.retryDownload === 'function' && !window.retryDownload._hasRepairHook) {
    const origRetryDownload = window.retryDownload;
    window.retryDownload = function(id, e) {
      repairStuckDownloads();
      if (window.activeDownloadTasks && window.activeDownloadTasks[id]) {
        window.activeDownloadTasks[id]._autoRetries = 0;
        window.activeDownloadTasks[id].isPaused = false;
      }
      return origRetryDownload(id, e);
    };
    window.retryDownload._hasRepairHook = true;
  }

  // Hook window.downloadMedia to ensure clean URLs & quality defaults
  if (typeof window.downloadMedia === 'function' && !window.downloadMedia._hasCleanHook) {
    const origDownloadMedia = window.downloadMedia;
    window.downloadMedia = function(url, title, options = {}, resumeExistingId = null) {
      let cleanUrl = url;
      while (cleanUrl && (cleanUrl.includes('/api/download?url=') || cleanUrl.includes('/api/stream?url='))) {
        try {
          const u = new URL(cleanUrl, typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : window.location.origin);
          const target = u.searchParams.get('url');
          if (target) cleanUrl = decodeURIComponent(target);
          else break;
        } catch (_) { break; }
      }

      const opts = { ...options };
      if (!opts.resolution || isNaN(opts.resolution)) {
        opts.resolution = parseInt(opts.quality || '480', 10) || 480;
      }
      if (!opts.quality) {
        opts.quality = `${opts.resolution}P`;
      }

      return origDownloadMedia(cleanUrl, title, opts, resumeExistingId);
    };
    window.downloadMedia._hasCleanHook = true;
  }

  if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
    const origQueueProcessNext = window.fobsDownloadQueue.processNext.bind(window.fobsDownloadQueue);
    window.fobsDownloadQueue.processNext = async function() {
      repairStuckDownloads();
      return origQueueProcessNext();
    };
  }

  // -------------------------------------------------------------
  // 12. Stop Background Video & Audio on Downloads View
  // -------------------------------------------------------------
  function stopBackgroundMedia() {
    try {
      const videoPlayer = document.getElementById('mainVideoPlayer');
      if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.muted = true;
      }
      const embedFrame = document.getElementById('mainEmbedPlayer');
      if (embedFrame && embedFrame.src && embedFrame.src !== 'about:blank') {
        embedFrame.src = 'about:blank';
        embedFrame.style.display = 'none';
      }
      if (typeof closePlayer === 'function') {
        const playerOverlay = document.getElementById('playerOverlay');
        if (playerOverlay && (playerOverlay.classList.contains('open') || document.body.classList.contains('player-open'))) {
          closePlayer();
        }
      }
    } catch (_) {}
  }
  window.stopBackgroundMedia = stopBackgroundMedia;

  const origOpenDownloadsView = window.openDownloadsView;
  window.openDownloadsView = function() {
    stopBackgroundMedia();
    repairStuckDownloads();
    if (typeof origOpenDownloadsView === 'function') {
      origOpenDownloadsView();
    } else {
      const overlay = document.getElementById('downloadsOverlay');
      if (overlay) {
        overlay.classList.add('open');
        overlay.style.display = 'flex';
      }
      if (typeof renderDownloadsList === 'function') renderDownloadsList();
    }
  };

  // -------------------------------------------------------------
  // 13. Ongoing Watchdog
  // -------------------------------------------------------------
  setInterval(() => {
    stripVideoPoster();
    restoreOnlineWatchPills();
    setupDownloadModalObserver();
  }, 1500);

  // Background queue check and repair every 12 seconds
  setInterval(() => {
    repairStuckDownloads();
  }, 12000);

  restoreOnlineWatchPills();
  purgeFake140MB();
  repairStuckDownloads();
  setupDownloadModalObserver();

  console.log('✅ FOBS TV Live Patch v1.2.1 active: Real resolution detection & missing file warnings, responsive pause/resume buttons.');
})();