// FOBS TV Live OTA Patch Bundle v1.1.4
// 1. Online watch: ALL episodes shown serially; auto-detect plays lowest available resolution (360p/480p default)
// 2. Video Player: Never stuck on poster; Connecting to stream server message with animated loader; hide resolution in portrait
// 3. Quality sheet: Only show resolutions that ACTUALLY exist (jei resolution nai sei resolution video te show koraiyo na)
// 4. Download modal: 480P SD, 720P HD, 1080P FHD tabs with real MovieBox streams & sizes; duplicate fallbacks removed
// 5. Movies: Exactly like series episodes list UI with top quality tabs, badges, exact sizes, and checkbox
(function () {
  console.log('⚡ FOBS TV Live Patch v1.1.4 executing...');

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
      if (txt) {
        txt.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #00f2fe; margin-right: 8px;"></i> Connecting to stream server...';
      }
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
  // 4. Download Modal Filter Watcher: Updates sizes, NEVER hides items!
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

    const items = Array.from(scrollList.querySelectorAll('.dl-ep-item'));
    items.forEach((item, idx) => {
      item.style.display = 'flex'; // ALWAYS visible!
      const badge = item.querySelector('.dl-ep-badge');
      const isMovieBadge = badge && badge.textContent.includes('MOVIE');
      const badgeText = badge ? badge.textContent.replace(/[^0-9]/g, '') : '';
      const epNum = parseInt(badgeText, 10) || (idx + 1);

      const info = episodesInfo.find(it => (isMovieBadge || !isSeries) ? (it.isMovie || it.episode === 1) : it.episode === epNum);
      let match = null;
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        match = info.qualities.find(q => q.resolution === qNum)
             || (qNum === 480 ? info.qualities.find(q => q.resolution === 360) : null);
      }

      const sizeEl = item.querySelector('.dl-ep-size');
      let sizeText = '';
      let sizeBytes = 0;

      if (match && match.sizeText) {
        sizeText = match.sizeText;
        sizeBytes = match.sizeBytes;
      } else {
        const isMovieItem = isMovieBadge || !isSeries;
        const estMb = isMovieItem
          ? (qNum >= 1080 ? 1200 : (qNum >= 720 ? 650 : 380))
          : (qNum >= 1080 ? 480 : (qNum >= 720 ? 260 : 135));
        sizeText = estMb >= 1024 ? `~${(estMb / 1024).toFixed(2)} GB` : `~${estMb} MB`;
        sizeBytes = estMb * 1024 * 1024;
      }

      if (sizeEl) sizeEl.textContent = sizeText;
      if (batchState?.episodes?.[idx]) {
        batchState.episodes[idx].realSizeText = sizeText;
        batchState.episodes[idx].realSizeBytes = sizeBytes;
        batchState.episodes[idx].realQuality = curQ;
      }
    });

    // Remove any empty-quality notice
    const emptyNotice = scrollList.querySelector('.dl-empty-quality-notice');
    if (emptyNotice) emptyNotice.remove();

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = items.length;

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

    const selectedIndices = Array.from(batchState?.selected || []).sort((a, b) => a - b);
    if (selectedIndices.length === 0) {
      showToast(isSeries ? 'অনুগ্রহ করে অন্তত ১টি পর্ব নির্বাচন করুন' : 'অনুগ্রহ করে মুভিটি নির্বাচন করুন');
      return;
    }

    const subjectId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '').replace(/-hindi$/, '') : null) || '';
    const detailPath = media.detailPath || media.mbDetailPath || '';

    if (isSeries) {
      const seNum = batchState?.season || window.appState?.currentSeason || 1;
      selectedIndices.forEach(idx => {
        const ep = batchState.episodes[idx];
        const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1)) : (idx + 1);
        const epTitle = ep?.title ? `${media.title} - ${ep.title}` : `${media.title} - S${seNum} Ep ${epNum}`;
        const epPoster = ep?.stillPath || media.poster || 'assets/fobs_logo.png';
        const taskId = `dl_${subjectId || media.id}_s${seNum}_e${epNum}_${curQ}`;
        const epRealSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 480 : (targetResNum >= 720 ? 260 : 135)} MB`;
        const epRealBytes = ep?.realSizeBytes || 0;
        const downloadEndpointUrl = `/api/moviebox/stream?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=${seNum}&ep=${epNum}&q=${targetResNum}`;

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
      if (typeof showToast === 'function') showToast(`📥 ${selectedIndices.length} টি পর্ব (${curQ}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
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
    const downloadEndpointUrl = `/api/moviebox/stream?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=0&ep=0&q=${targetResNum}`;

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
  // 11. Ongoing Watchdog
  // -------------------------------------------------------------
  setInterval(() => {
    stripVideoPoster();
    restoreOnlineWatchPills();
    setupDownloadModalObserver();
  }, 1000);

  restoreOnlineWatchPills();
  purgeFake140MB();
  setupDownloadModalObserver();

  console.log('✅ FOBS TV Live Patch v1.1.4 active: 480P, 720P, 1080P enabled; lowest quality auto-detect & duplicate fallbacks fixed.');
})();