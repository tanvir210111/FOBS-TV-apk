// FOBS TV Live OTA Patch Bundle v1.1.2
// 1. Online watch: ALL episodes shown serially with auto-detect playback (always lowest resolution default)
// 2. Video Player: Never stuck on poster; Connecting to stream server message with animated loader; hide resolution in portrait
// 3. Quality sheet: Only show available resolutions for the current episode; hide non-existent ones
// 4. Download modal ONLY: strictly filter episodes and movies by available resolution with exact real file sizes
// 5. Movies: Exactly like series episodes list UI with top quality tabs, badges, exact sizes, and checkbox
(function () {
  console.log('⚡ FOBS TV Live Patch v1.1.2 executing...');

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
      /* Hide resolution dropdown in portrait mode resources row */
      #currentQualityBtn {
        display: none !important;
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
    const qBtn = document.getElementById('currentQualityBtn');
    if (qBtn) qBtn.style.setProperty('display', 'none', 'important');
  }
  stripVideoPoster();

  const videoEl = document.getElementById('mainVideoPlayer');
  if (videoEl && !videoEl._hasPosterWatcher) {
    const posterObs = new MutationObserver(() => stripVideoPoster());
    posterObs.observe(videoEl, { attributes: true, attributeFilter: ['poster'] });
    videoEl._hasPosterWatcher = true;
  }

  // Hook playStreamUrl: Connecting to stream server message with cyan spinner until video actually plays
  const origPlayStreamUrl = window.playStreamUrl;
  window.playStreamUrl = function(url, audioIndex = null, seekTime = null) {
    stripVideoPoster();
    const loader = document.getElementById('videoLoader');
    if (loader) {
      loader.classList.add('active');
      const txt = loader.querySelector('.loader-text');
      if (txt) txt.innerText = 'Connecting to stream server...';
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
  // Dynamic Quality Sheet Filter (Only show available resolutions)
  // -------------------------------------------------------------
  const origOpenQualitySheet = window.openQualitySheet;
  window.openQualitySheet = function() {
    const container = document.getElementById('qualityOptionsList');
    if (container) {
      const state = getAppState();
      const avail = state?.availableQualities || window.appState?.availableQualities || [];
      const availResSet = new Set(avail.map(q => parseInt(q.resolution, 10)).filter(n => !isNaN(n) && n > 0));

      const buttons = container.querySelectorAll('.sheet-option-btn');
      buttons.forEach(btn => {
        const qVal = parseInt(btn.getAttribute('data-q') || '', 10);
        if (availResSet.size > 0) {
          btn.style.display = availResSet.has(qVal) ? 'flex' : 'none';
        } else {
          btn.style.display = 'flex';
        }
        const curQ = parseInt(state?.currentQuality || '480', 10);
        btn.classList.toggle('selected', qVal === curQ);
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

        if (typeof window.renderBatchEpisodesList === 'function') {
          window.renderBatchEpisodesList(seasonNum);
        } else {
          filterDownloadEpisodesModal();
        }
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

    let filteredEpisodes = [];
    allEpisodes.forEach((ep, origIdx) => {
      const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (origIdx + 1)) : (origIdx + 1);
      const info = episodesInfo.find(it => it.isMovie || it.episode === epNum);
      if (episodesInfo.length > 0) {
        if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
          const match = info.qualities.find(q => q.resolution === qNum);
          if (match) {
            filteredEpisodes.push({ ep, origIdx, epNum, match });
          }
        }
      } else {
        filteredEpisodes.push({ ep, origIdx, epNum, match: null });
      }
    });

    const state = getAppState();

    if (filteredEpisodes.length === 0 && allEpisodes.length > 0) {
      const emptyMsg = isSeries
        ? `${curQ} তে কোনো পর্ব নেই। উপরে 720P বা 1080P সিলেক্ট করুন।`
        : `${curQ} তে কোনো ফাইল নেই। উপরে 720P বা 1080P সিলেক্ট করুন।`;
      scrollList.innerHTML = `
        <div style="text-align: center; color: #f59e0b; padding: 30px 15px; font-size: 13px;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
          <span>${emptyMsg}</span>
        </div>
      `;
      const totalCountEl = document.getElementById('dlTotalEpsCount');
      if (totalCountEl) totalCountEl.innerText = 0;
      if (state) {
        state._batchDownload = {
          media,
          isSeries,
          season: seasonNum,
          episodes: [],
          selected: new Set()
        };
      }
      if (typeof window.updateBatchSelectedSummary === 'function') window.updateBatchSelectedSummary();
      return;
    }

    const selectedSet = new Set(filteredEpisodes.map((_, i) => i));
    if (state) {
      state._batchDownload = {
        media,
        isSeries,
        season: seasonNum,
        episodes: filteredEpisodes.map(f => {
          const epCopy = { ...f.ep, _origIdx: f.origIdx };
          if (f.match) {
            epCopy.realSizeText = f.match.sizeText;
            epCopy.realSizeBytes = f.match.sizeBytes;
            epCopy.realQuality = `${f.match.resolution}P`;
          }
          return epCopy;
        }),
        selected: selectedSet
      };
    }

    const batchEpisodes = state?._batchDownload?.episodes || filteredEpisodes.map(f => f.ep);
    scrollList.innerHTML = batchEpisodes.map((ep, idx) => {
      const isMovieItem = ep.isMovie || !isSeries;
      const epNum = ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1);
      const badgeText = isMovieItem ? 'MOVIE' : `EP ${epNum}`;
      const epTitle = isMovieItem ? media.title : (ep.title ? ep.title : `Episode ${epNum}`);
      const estSizeStr = ep.realSizeText || (isMovieItem
        ? (qNum >= 1080 ? '~1.2 GB' : (qNum >= 720 ? '~650 MB' : '~380 MB'))
        : (typeof getEpisodeEstimatedSize === 'function' ? getEpisodeEstimatedSize(curQ, ep, idx) : '~250 MB'));

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
    if (totalCountEl) totalCountEl.innerText = batchEpisodes.length;

    const selectAllChk = document.getElementById('dlSelectAllCheckbox');
    if (selectAllChk) selectAllChk.checked = true;

    if (typeof window.updateBatchSelectedSummary === 'function') window.updateBatchSelectedSummary();
    fetchDownloadQualityInfo(media, isSeries ? seasonNum : 0);
  };

  // -------------------------------------------------------------
  // 4. Strict Download Modal Filter Watcher
  // -------------------------------------------------------------
  function filterDownloadEpisodesModal() {
    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    const media = getActiveMedia();
    if (!media) return;

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));
    const episodesInfo = media._episodesInfo;
    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;

    const state = getAppState();
    const batchState = state?._batchDownload;

    if (!episodesInfo) {
      fetchDownloadQualityInfo(media, isSeries ? (batchState?.season || state?.currentSeason || 1) : 0);
      return;
    }

    const items = Array.from(scrollList.querySelectorAll('.dl-ep-item'));
    let visibleCount = 0;

    items.forEach((item, idx) => {
      const badge = item.querySelector('.dl-ep-badge');
      const isMovieBadge = badge && badge.textContent.includes('MOVIE');
      const badgeText = badge ? badge.textContent.replace(/[^0-9]/g, '') : '';
      const epNum = parseInt(badgeText, 10) || (idx + 1);

      const info = episodesInfo.find(it => (isMovieBadge || !isSeries) ? (it.isMovie || it.episode === 1) : it.episode === epNum);
      let match = null;
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        match = info.qualities.find(q => q.resolution === qNum);
      }

      const chk = item.querySelector('input[type="checkbox"]');
      const sizeEl = item.querySelector('.dl-ep-size');

      // STRICT DOWNLOAD FILTER: Only show item if it has this resolution
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

    // Handle empty state in download modal if 0 items exist in this quality
    let emptyNotice = scrollList.querySelector('.dl-empty-quality-notice');
    if (visibleCount === 0 && items.length > 0) {
      if (!emptyNotice) {
        emptyNotice = document.createElement('div');
        emptyNotice.className = 'dl-empty-quality-notice';
        scrollList.appendChild(emptyNotice);
      }
      emptyNotice.style.cssText = 'text-align: center; color: #f59e0b; padding: 25px 15px; font-size: 13px; width: 100%;';
      const emptyText = isSeries
        ? `${curQ} তে কোনো পর্ব উপলব্ধ নেই। উপরে 720P বা 1080P সিলেক্ট করুন।`
        : `${curQ} তে কোনো ফাইল উপলব্ধ নেই। উপরে 720P বা 1080P সিলেক্ট করুন।`;
      emptyNotice.innerHTML = `
        <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
        <span>${emptyText}</span>
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
  // 6. Hook Quality Selection in Download Modal
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
      const batchState = getAppState()?._batchDownload;
      window.renderBatchEpisodesList(batchState?.season || 0);
    }
    setTimeout(filterDownloadEpisodesModal, 50);
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
            : (qNum >= 1080 ? 750 : (qNum >= 720 ? 420 : 250));
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
  // 8. Confirm Download (Handles Movies and Series with Real Sizes)
  // -------------------------------------------------------------
  const origConfirmBatchDownload = window.confirmBatchDownload;
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

    const selectedIndices = Array.from(batchState?.selected || []).sort((a, b) => a - b);
    if (selectedIndices.length === 0) {
      showToast(isSeries ? 'অনুগ্রহ করে অন্তত ১টি পর্ব নির্বাচন করুন' : 'অনুগ্রহ করে মুভিটি নির্বাচন করুন');
      return;
    }

    if (isSeries) {
      if (typeof origConfirmBatchDownload === 'function') {
        return origConfirmBatchDownload();
      }
    }

    // Single Movie Download with exact real size & resolution matching
    const ep = batchState?.episodes?.[0];
    const movieTitle = media.title;
    const moviePoster = media.poster || 'assets/fobs_logo.png';
    const realSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 950 : (targetResNum >= 720 ? 450 : 250)} MB`;
    const realBytes = ep?.realSizeBytes || 0;
    const realQuality = ep?.realQuality || curQ;
    const subjectId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const detailPath = media.detailPath || media.mbDetailPath || '';
    const taskId = `dl_${subjectId || media.id}_movie_${realQuality}`;
    const downloadEndpointUrl = `/api/moviebox/stream?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=0&ep=0&q=${targetResNum}`;

    if (window.fobsDownloadQueue) {
      window.fobsDownloadQueue.enqueue({
        id: taskId,
        mediaId: media.id,
        title: movieTitle,
        poster: moviePoster,
        quality: realQuality,
        resolution: parseInt(realQuality, 10) || targetResNum,
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
          quality: realQuality,
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
    if (typeof showToast === 'function') showToast(`📥 "${movieTitle}" (${realQuality}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
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
      setTimeout(filterDownloadEpisodesModal, 60);
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
  // 11. Ongoing Watchdog
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

  console.log('✅ FOBS TV Live Patch v1.1.2 active: Movies and Series download UI unified with exact real file sizes.');
})();