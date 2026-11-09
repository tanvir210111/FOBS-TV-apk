// FOBS TV Live OTA Patch Bundle v1.0.9
// 1. Online watch: ALL episodes shown serially with auto-detect playback (always lowest resolution default)
// 2. Video Player: Never stuck on poster; eliminate native WebKit play button & frozen poster overlays
// 3. Download modal ONLY: strictly filter episodes by available resolution with exact real file sizes
(function () {
  console.log('⚡ FOBS TV Live Patch v1.0.9 executing...');

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
  // 3. Strict Download Modal Renderer (MovieBox Exact Match)
  // -------------------------------------------------------------
  window.renderBatchEpisodesList = function(seasonNum) {
    const media = window.appState?.currentMedia;
    if (!media) return;

    const scrollList = document.getElementById('dlEpisodesScrollList');
    if (!scrollList) return;

    let allEpisodes = [];
    if (media.seasons && media.seasons.length > 0) {
      const targetSeason = media.seasons.find(s => (s.seasonNumber || s.season) === seasonNum) || media.seasons[0];
      allEpisodes = targetSeason?.episodes || [];
    } else if (media.episodes && media.episodes.length > 0) {
      allEpisodes = media.episodes;
    }

    if (!allEpisodes || allEpisodes.length === 0) {
      scrollList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">এই সিজনে কোনো পর্ব পাওয়া যায়নি</div>`;
      return;
    }

    const curQ = window.currentDownloadQuality || '480P';
    const qNum = parseInt(curQ, 10) || 480;
    const episodesInfo = media._episodesInfo;

    // If metadata not yet fetched, show clean loading spinner and trigger fetch
    if (!episodesInfo) {
      scrollList.innerHTML = `
        <div id="dlEpisodesLoading" style="text-align: center; color: #00f2fe; padding: 35px 15px; font-size: 13.5px; width: 100%;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size: 26px; display: block; margin-bottom: 10px; color: #00f2fe;"></i>
          <span>কোয়ালিটি এবং সাইজ লোড হচ্ছে...</span>
        </div>
      `;
      const btnText = document.getElementById('btnStartDownloadText');
      if (btnText) btnText.innerText = 'কোয়ালিটি লোড হচ্ছে...';
      fetchDownloadQualityInfo(media, seasonNum);
      return;
    }

    // Filter strictly by requested quality
    let filteredEpisodes = [];
    allEpisodes.forEach((ep, origIdx) => {
      const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (origIdx + 1)) : (origIdx + 1);
      const info = episodesInfo.find(it => it.episode === epNum);
      if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
        const match = info.qualities.find(q => q.resolution === qNum);
        if (match) {
          filteredEpisodes.push({ ep, origIdx, epNum, match });
        }
      }
    });

    // If 0 episodes have this resolution, show empty notice
    if (filteredEpisodes.length === 0) {
      scrollList.innerHTML = `
        <div class="dl-empty-quality-notice" style="text-align: center; color: #f59e0b; padding: 25px 15px; font-size: 13px; width: 100%;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
          <span>${curQ} তে কোনো পর্ব নেই। উপরে 720P বা 1080P সিলেক্ট করুন।</span>
        </div>
      `;
      const totalCountEl = document.getElementById('dlTotalEpsCount');
      if (totalCountEl) totalCountEl.innerText = 0;
      window.appState._batchDownload = {
        media,
        isSeries: true,
        season: seasonNum,
        episodes: [],
        selected: new Set()
      };
      if (typeof window.updateBatchSelectedSummary === 'function') {
        window.updateBatchSelectedSummary();
      }
      return;
    }

    // Initialize batch state with matching episodes only
    const selectedSet = new Set(filteredEpisodes.map((_, i) => i));
    window.appState._batchDownload = {
      media,
      isSeries: true,
      season: seasonNum,
      episodes: filteredEpisodes.map(f => ({
        ...f.ep,
        _origIdx: f.origIdx,
        realSizeText: f.match.sizeText,
        realSizeBytes: f.match.sizeBytes,
        realQuality: `${f.match.resolution}P`
      })),
      selected: selectedSet
    };

    scrollList.innerHTML = window.appState._batchDownload.episodes.map((ep, idx) => {
      const epNum = ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1);
      const epTitle = ep.title ? ep.title : `Episode ${epNum}`;
      const estSizeStr = ep.realSizeText || 'Calculating size...';
      return `
        <div class="dl-ep-item selected" id="dl_ep_item_${idx}" onclick="toggleBatchEpisode(${idx})">
          <div class="dl-ep-left">
            <span class="dl-ep-badge">EP ${epNum}</span>
            <div class="dl-ep-title-wrap">
              <div class="dl-ep-title">${epTitle}</div>
              <div class="dl-ep-size" id="dl_ep_size_${idx}">${estSizeStr}</div>
            </div>
          </div>
          <label class="dl-ep-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="dl_chk_${idx}" checked onchange="toggleBatchEpisode(${idx})">
            <span class="dl-chk-custom"><i class="fa-solid fa-check"></i></span>
          </label>
        </div>
      `;
    }).join('');

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = filteredEpisodes.length;

    if (typeof window.updateBatchSelectedSummary === 'function') {
      window.updateBatchSelectedSummary();
    }
  };

  // -------------------------------------------------------------
  // 4. Hook Quality Selection in Download Modal
  // -------------------------------------------------------------
  window.switchBatchQuality = function(quality) {
    window.currentDownloadQuality = quality || '480P';
    const qNum = parseInt(window.currentDownloadQuality, 10) || 480;

    document.querySelectorAll('#dlQualityTabs .dl-q-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-quality') === window.currentDownloadQuality);
    });

    document.querySelectorAll('#dlSingleMovieQualityList .dl-quality-item').forEach(item => {
      const isSel = item.getAttribute('data-quality') === window.currentDownloadQuality;
      item.classList.toggle('active', isSel);
      const radio = item.querySelector('.dl-q-radio i');
      if (radio) radio.className = isSel ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
    });

    const previewMeta = document.getElementById('dlPreviewMeta');
    const media = window.appState?.currentMedia;
    const isHindi = (media?.title?.toLowerCase().includes('hindi') || (window.appState?.currentAudioTrack && window.appState.currentAudioTrack.toLowerCase().includes('hindi')));
    const dubLabel = isHindi ? 'Hindi Dubbed' : (media?.dubLanguage || 'Original Audio');
    if (previewMeta) {
      previewMeta.innerText = `${dubLabel} • ${window.currentDownloadQuality} ${qNum >= 1080 ? 'Full HD' : (qNum >= 720 ? 'HD' : 'SD')}`;
    }

    const batchState = window.appState?._batchDownload;
    if (batchState && batchState.isSeries) {
      window.renderBatchEpisodesList(batchState.season || 1);
    } else {
      const btnText = document.getElementById('btnStartDownloadText');
      if (btnText) btnText.innerText = `ডাউনলোড শুরু করুন (${window.currentDownloadQuality})`;
    }
  };

  // -------------------------------------------------------------
  // 5. Hook Trigger Download Popup
  // -------------------------------------------------------------
  const origTriggerDownload = window.triggerDownload;
  window.triggerDownload = function() {
    const media = window.appState?.currentMedia;
    if (!media) {
      if (typeof window.openDownloadsView === 'function') window.openDownloadsView();
      return;
    }

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-'));

    if (isSeries && media._episodesInfo && media._episodesInfo.length > 0) {
      // If 480P has no episodes, auto-select lowest available quality
      const has480 = media._episodesInfo.some(info => (info.qualities || []).some(q => q.resolution === 480));
      if (!has480) {
        const avail = new Set();
        media._episodesInfo.forEach(info => (info.qualities || []).forEach(q => avail.add(q.resolution)));
        const sorted = Array.from(avail).sort((a, b) => a - b);
        if (sorted.length > 0) {
          window.currentDownloadQuality = `${sorted[0]}P`;
        }
      }
    }

    if (typeof origTriggerDownload === 'function') {
      origTriggerDownload();
    }

    if (isSeries) {
      const curSe = window.appState?.currentSeason || 1;
      window.renderBatchEpisodesList(curSe);
    }
  };

  // -------------------------------------------------------------
  // 6. Hook Confirm Batch Download (Stores Exact Real Sizes, Never 140MB)
  // -------------------------------------------------------------
  window.confirmBatchDownload = function() {
    const media = window.appState?.currentMedia;
    if (!media) {
      if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
      return;
    }

    const targetResNum = parseInt(window.currentDownloadQuality || '480P', 10) || 480;
    const batchState = window.appState?._batchDownload;
    const subjectId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '').replace(/-hindi$/, '') : null) || '';
    const detailPath = media.detailPath || media.mbDetailPath || '';

    if (batchState && batchState.isSeries) {
      const selectedIndices = Array.from(batchState.selected || []).sort((a, b) => a - b);
      if (selectedIndices.length === 0) {
        if (typeof showToast === 'function') showToast('অনুগ্রহ করে অন্তত ১টি পর্ব নির্বাচন করুন');
        return;
      }

      const seNum = batchState.season || window.appState?.currentSeason || 1;

      selectedIndices.forEach(idx => {
        const ep = batchState.episodes[idx];
        const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1)) : (idx + 1);
        const epTitle = ep?.title ? `${media.title} - ${ep.title}` : `${media.title} - S${seNum} Ep ${epNum}`;
        const epPoster = ep?.stillPath || media.poster || 'assets/fobs_logo.png';
        const taskId = `dl_${subjectId || media.id}_s${seNum}_e${epNum}_${window.currentDownloadQuality}`;
        const epRealSize = ep?.realSizeText || 'Calculating size...';
        const epRealBytes = ep?.realSizeBytes || 0;
        const epRealQuality = ep?.realQuality || window.currentDownloadQuality;

        const downloadEndpointUrl = `/api/moviebox/stream?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=${seNum}&ep=${epNum}&q=${targetResNum}`;

        window.fobsDownloadQueue.enqueue({
          id: taskId,
          mediaId: media.id,
          title: epTitle,
          poster: epPoster,
          quality: epRealQuality,
          resolution: parseInt(epRealQuality, 10) || targetResNum,
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
            quality: epRealQuality,
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
      });

      if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
      if (typeof showToast === 'function') showToast(`📥 ${selectedIndices.length} টি পর্ব ডাউনলোডের সারিতে যুক্ত হয়েছে`);
      if (typeof window.openDownloadsView === 'function') window.openDownloadsView();
      return;
    }

    // Single Movie
    const movieTitle = media.title;
    const moviePoster = media.poster || 'assets/fobs_logo.png';
    const taskId = `dl_${subjectId || media.id}_movie_${window.currentDownloadQuality}`;
    const downloadEndpointUrl = `/api/moviebox/stream?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=0&ep=0&q=${targetResNum}`;

    window.fobsDownloadQueue.enqueue({
      id: taskId,
      mediaId: media.id,
      title: movieTitle,
      poster: moviePoster,
      quality: window.currentDownloadQuality,
      resolution: targetResNum,
      season: 0,
      episode: 0,
      isSeries: false,
      url: downloadEndpointUrl,
      progress: 0,
      receivedBytes: 0,
      totalBytes: 0,
      sizeText: 'Calculating size...',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      status: 'queued',
      statusText: 'Waiting in Queue (লাইনে অপেক্ষমাণ)',
      options: {
        quality: window.currentDownloadQuality,
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

    if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
    if (typeof showToast === 'function') showToast(`📥 "${movieTitle}" (${window.currentDownloadQuality}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
    if (typeof window.openDownloadsView === 'function') window.openDownloadsView();
  };
  window.confirmStartDownload = window.confirmBatchDownload;

  // -------------------------------------------------------------
  // 7. Auto-Repair Clamped Fake 140MB in Active UI & LocalStorage
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
  // 8. Ongoing Watchdog
  // -------------------------------------------------------------
  setInterval(() => {
    stripVideoPoster();
    restoreOnlineWatchPills();
    purgeFake140MB();
  }, 1000);

  stripVideoPoster();
  restoreOnlineWatchPills();
  purgeFake140MB();

  console.log('✅ FOBS TV Live Patch v1.0.9 active: No stuck poster, online watch serial, download strictly filtered.');
})();
