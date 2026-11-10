// FOBS TV Live OTA Patch Bundle v1.4.0 (MovieBox Native Offline Storage & Playback Engine)
// 1. MovieBox Style Offline Video Playback: Direct native device storage with embedded HTTP Range server & butter-smooth seek
// 2. Dual Offline Subtitles: Bangla & English subtitles reliably saved with clean title extraction & rendered offline
// 3. Smooth Online Playback: Connecting overlay smoothly dissolves only when video is actively playing (no frozen 1-2s icon)
// 4. Power Button Screen Lock Auto-Pause: Automatically pauses video and silences audio when screen is locked/turned off
// 5. Unaffected Online Streaming: Fast millisecond streaming, CDN tokens, and live playback remain 100% rock-solid
(function () {
  console.log('⚡ FOBS TV Live Patch v1.4.0 (MovieBox Native Engine) executing...');
  window.FOBS_LIVE_PATCH_VERSION = '1.4.0';

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

  function getApiBaseUrl() {
    if (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) {
      return window.API_BASE_URL;
    }
    const isCustomLocalPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                              window.location.port && 
                              window.location.port !== '80' && 
                              window.location.port !== '443';
    if (isCustomLocalPort) {
      return '';
    }
    return 'https://fobstv.duckdns.org';
  }

  function getAbsoluteApiUrl(path) {
    if (!path || typeof path !== 'string') return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
      return path;
    }
    const base = getApiBaseUrl();
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return `${base}${cleanPath}`;
  }
  window.getAbsoluteApiUrl = getAbsoluteApiUrl;

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
      overlay.addEventListener('click', () => {
        const vp = document.getElementById('mainVideoPlayer');
        if (vp) {
          const p = vp.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              vp.muted = true;
              vp.play().catch(() => {});
            });
          }
        }
        hideConnectingLoader();
      });
      container.appendChild(overlay);
    }
    return overlay;
  }

  function isOfflinePlayback(videoEl) {
    if (!videoEl) videoEl = document.getElementById('mainVideoPlayer');
    const state = getAppState();
    if (state?.currentMedia?.isOffline) return true;
    if (state?.currentMedia?.offlineDownloadId) return true;
    if (videoEl) {
      const src = videoEl.currentSrc || videoEl.src || '';
      if (typeof src === 'string' && (src.startsWith('blob:') || src.includes('127.0.0.1') || src.includes('localhost'))) return true;
    }
    return false;
  }
  window.isOfflinePlayback = isOfflinePlayback;

  function attachVideoWatcher() {
    const videoEl = document.getElementById('mainVideoPlayer');
    if (videoEl && !videoEl._hasFobsWatcher) {
      const posterObs = new MutationObserver(() => stripVideoPoster());
      posterObs.observe(videoEl, { attributes: true, attributeFilter: ['poster'] });

      // Smooth transition: Only dismiss connecting overlay when video is actively moving and rendering frames!
      const dismissWhenPlaying = () => {
        if (videoEl.currentTime > 0.05 || !videoEl.paused) {
          hideConnectingLoader();
        }
      };

      videoEl.addEventListener('playing', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('timeupdate', () => {
        if (videoEl.currentTime > 0.05) {
          hideConnectingLoader();
        }
      });
      videoEl.addEventListener('loadedmetadata', () => {
        if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
          const state = getAppState();
          if (state?.currentMedia && (state.currentMedia.isOffline || state.currentMedia.offlineDownloadId)) {
            state.currentMedia.duration = videoEl.duration;
          }
        }
      });
      videoEl.addEventListener('error', () => {
        hideConnectingLoader();
      });
      videoEl.addEventListener('waiting', () => {
        if (isOfflinePlayback(videoEl)) {
          hideConnectingLoader();
          const l = document.getElementById('videoLoader');
          if (l) l.classList.remove('active');
          return;
        }
        if (!videoEl.paused) showConnectingLoader();
      });
      videoEl.addEventListener('loadstart', () => {
        if (isOfflinePlayback(videoEl)) {
          hideConnectingLoader();
          const l = document.getElementById('videoLoader');
          if (l) l.classList.remove('active');
          return;
        }
        if (videoEl.paused) showConnectingLoader();
      });
      videoEl.addEventListener('seeking', () => {
        if (isOfflinePlayback(videoEl)) {
          hideConnectingLoader();
          const l = document.getElementById('videoLoader');
          if (l) l.classList.remove('active');
        }
      });
      videoEl.addEventListener('seeked', () => {
        if (isOfflinePlayback(videoEl)) {
          hideConnectingLoader();
          const l = document.getElementById('videoLoader');
          if (l) l.classList.remove('active');
        }
      });

      videoEl._hasFobsWatcher = true;
    }
  }
  attachVideoWatcher();

  function showConnectingLoader() {
    if (isOfflinePlayback()) {
      hideConnectingLoader();
      return;
    }
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
    // Safety auto-dismiss fallback: Never freeze playback (3.5 seconds max)
    if (window._connectingSafetyTimer) clearTimeout(window._connectingSafetyTimer);
    window._connectingSafetyTimer = setTimeout(() => {
      hideConnectingLoader();
    }, 3500);
  }
  window.showConnectingLoader = showConnectingLoader;

  function hideConnectingLoader(force = false) {
    const videoEl = document.getElementById('mainVideoPlayer');
    if (!force && videoEl && !isOfflinePlayback(videoEl) && videoEl.src && !videoEl.paused && videoEl.currentTime < 0.05) {
      // Keep connecting overlay visible until video actually starts outputting frames!
      return;
    }
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

  // -------------------------------------------------------------
  // Flawless Offline Video Seeking Engine (FastSeek & Coalescing)
  // -------------------------------------------------------------
  let _liveOfflineSeekQueue = null;
  let _isLiveOfflineSeeking = false;
  let _liveOfflineSeekWatchdog = null;

  function handleLiveOfflineSeek(video, targetSeconds, wasPlaying) {
    if (!video) return;

    hideConnectingLoader();
    const loader = document.getElementById('videoLoader');
    if (loader) loader.classList.remove('active');

    // If hardware decoder is busy seeking, queue the newest target to prevent decoder pipeline lock
    if (video.seeking || _isLiveOfflineSeeking) {
      _liveOfflineSeekQueue = { targetSeconds, wasPlaying };
      return;
    }

    _isLiveOfflineSeeking = true;
    _liveOfflineSeekQueue = null;

    if (_liveOfflineSeekWatchdog) clearTimeout(_liveOfflineSeekWatchdog);

    const totalDur = (video.duration && isFinite(video.duration) && video.duration > 0)
      ? video.duration
      : ((typeof getMediaTotalDurationSeconds === 'function') ? getMediaTotalDurationSeconds() : 3600);
    const safeTarget = Math.max(0, Math.min(totalDur > 1 ? totalDur - 0.5 : totalDur, targetSeconds));

    let settled = false;
    const finishSeek = () => {
      if (settled) return;
      settled = true;
      _isLiveOfflineSeeking = false;
      if (_liveOfflineSeekWatchdog) clearTimeout(_liveOfflineSeekWatchdog);

      if (loader) loader.classList.remove('active');
      hideConnectingLoader();

      if (typeof updateLandscapeProgress === 'function') updateLandscapeProgress();
      if (typeof syncPlayPauseIcons === 'function') syncPlayPauseIcons();

      // If user dragged to another target while seeking was in flight, process immediately
      if (_liveOfflineSeekQueue !== null) {
        const queued = _liveOfflineSeekQueue;
        _liveOfflineSeekQueue = null;
        handleLiveOfflineSeek(video, queued.targetSeconds, queued.wasPlaying);
        return;
      }

      if (wasPlaying) {
        const p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    };

    video.addEventListener('seeked', finishSeek, { once: true });
    video.addEventListener('canplay', finishSeek, { once: true });

    // Safety watchdog for lost seek events (350ms)
    _liveOfflineSeekWatchdog = setTimeout(() => {
      if (!settled) {
        if (video.seeking) {
          try {
            const nudge = Math.min(totalDur > 1 ? totalDur - 0.2 : totalDur, safeTarget + 0.05);
            video.currentTime = nudge;
          } catch(e) {}
        }
        finishSeek();
      }
    }, 350);

    // FastSeek for instantaneous keyframe jump without parsing all intra-frames
    try {
      if (typeof video.fastSeek === 'function') {
        video.fastSeek(safeTarget);
      } else {
        video.currentTime = safeTarget;
      }
    } catch (e) {
      console.warn('Offline fastSeek fallback:', e);
      try {
        video.currentTime = safeTarget;
      } catch (e2) {}
      finishSeek();
    }
  }
  window.handleLiveOfflineSeek = handleLiveOfflineSeek;

  // Intercept window.seekToAbsoluteTime
  const origSeekToAbsoluteTime = (typeof window.seekToAbsoluteTime === 'function' && !window.seekToAbsoluteTime._isFobsHook)
    ? window.seekToAbsoluteTime
    : null;

  window.seekToAbsoluteTime = function(targetSeconds) {
    const video = document.getElementById('mainVideoPlayer');
    if (video && isOfflinePlayback(video)) {
      handleLiveOfflineSeek(video, targetSeconds, !video.paused);
      return;
    }
    if (typeof origSeekToAbsoluteTime === 'function') {
      return origSeekToAbsoluteTime(targetSeconds);
    }
    if (video) {
      try { video.currentTime = targetSeconds; video.play().catch(() => {}); } catch(e) {}
    }
  };
  window.seekToAbsoluteTime._isFobsHook = true;

  // Un-mute automatically on the first user interaction
  const unmuteOnUserAction = () => {
    const vp = document.getElementById('mainVideoPlayer');
    if (vp && vp.muted) {
      vp.muted = false;
    }
  };
  document.addEventListener('click', unmuteOnUserAction, { passive: true });
  document.addEventListener('touchstart', unmuteOnUserAction, { passive: true });

  function stripVideoPoster() {
    const video = document.getElementById('mainVideoPlayer');
    if (video && video.hasAttribute('poster')) {
      video.removeAttribute('poster');
    }
    const qBtn = document.getElementById('currentQualityBtn');
    if (qBtn) qBtn.style.setProperty('display', 'none', 'important');
  }
  stripVideoPoster();

  // Prefetch Stream: Warmed cache for millisecond playback startup (<100ms)
  function prefetchStream(media, se = 0, ep = 0) {
    if (!media) return;
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null)) || (media.id && /^\d{16,20}$/.test(media.id) ? media.id : null) || media.id;
    if (!sId) return;
    const dPath = media.detailPath || media.mbDetailPath || media.movieboxDetailPath || '';
    const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
    const isMovie = media.type === 'movie' || (!media.seasons && !media.episodes);
    const seNum = isMovie ? 0 : (se || 1);
    const epNum = isMovie ? 0 : (ep || 1);
    const pfUrl = getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${epNum}&q=480&json=1`);
    fetch(pfUrl, { priority: 'low' }).catch(() => {});
  }
  window.prefetchStream = prefetchStream;

  // Universal Instant Stream Resolver: Ensures 480p SD default & auto-renewing stream endpoints
  window.getActiveEpisodeStream = function(ep, audioTrack) {
    if (!ep) return '';
    const m = getActiveMedia();
    const isMovie = m?.type === 'movie' || (!m?.seasons && !m?.episodes);
    const epNum = isMovie ? 0 : (ep?.episode ?? ep?.episodeNumber ?? parseInt(ep?.number, 10) ?? 1);
    const seNum = isMovie ? 0 : (ep?.season ?? window.appState?.currentSeason ?? 1);

    if (window.appState) window.appState.currentQuality = '480p';

    const isMovieBox = (
      m?.subjectId ||
      m?.mbSubjectId ||
      (m?.id && (m.id.startsWith('mb-s-') || m.id.startsWith('mb-m-') || /^\d{16,20}$/.test(m.id)))
    );
    const sId = m?.subjectId || m?.mbSubjectId || (m?.id && m.id.startsWith('mb-s-') ? m.id.replace('mb-s-', '') : (m?.id && m.id.startsWith('mb-m-') ? m.id.replace('mb-m-', '').replace(/-hindi$/, '') : null)) || (m?.id && /^\d{16,20}$/.test(m.id) ? m.id : null);
    const dPath = m?.detailPath || m?.mbDetailPath || m?.movieboxDetailPath || '';
    if (sId && isMovieBox) {
      return getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seNum}&ep=${epNum}&q=480`);
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
      return getAbsoluteApiUrl(clean);
    }

    const rawCdn = allUrls.find(u => typeof u === 'string' && (u.includes('hakunaymatata') || u.includes('bcdnxw') || u.includes('haildrop') || u.includes('fogtwist') || u.includes('sunburst') || u.includes('stormshade')));
    if (rawCdn) {
      if (sId) {
        return getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(sId)}&se=${seNum}&ep=${epNum}&q=480`);
      }
      return getAbsoluteApiUrl(`/api/stream?url=${encodeURIComponent(rawCdn)}`);
    }

    return ep?.streamUrl || m?.streamUrl || '';
  };

  // Hook playStreamUrl: Guaranteed 480p millisecond start & safe fallback
  if (!window._fobsOriginalPlayStreamUrl && typeof window.playStreamUrl === 'function' && !window.playStreamUrl._isFobsHook) {
    window._fobsOriginalPlayStreamUrl = window.playStreamUrl;
  }
  const basePlayStreamUrl = window._fobsOriginalPlayStreamUrl || (typeof window.playStreamUrl === 'function' && !window.playStreamUrl._isFobsHook ? window.playStreamUrl : null);

  const fobsPlayStreamHook = function(url, audioIndex = null, seekTime = null) {
    showConnectingLoader();
    const vp = document.getElementById('mainVideoPlayer');
    if (vp) {
      vp.preload = 'auto';
      // Ensure audio sound is restored on play start
      vp.muted = false;
    }

    let fastUrl = url;
    if (typeof fastUrl === 'string') {
      if (fastUrl.startsWith('/api/')) {
        fastUrl = getAbsoluteApiUrl(fastUrl);
      }
      if (fastUrl.includes('/api/moviebox/stream')) {
        fastUrl = fastUrl.replace(/([?&])q=\d+/g, '$1q=480');
        if (!fastUrl.includes('q=')) fastUrl += (fastUrl.includes('?') ? '&' : '?') + 'q=480';
      } else if (fastUrl.includes('hakunaymatata') || fastUrl.includes('bcdnxw') || fastUrl.includes('haildrop') || fastUrl.includes('fogtwist') || fastUrl.includes('sunburst') || fastUrl.includes('stormshade')) {
        const m = getActiveMedia();
        const sId = m?.subjectId || m?.mbSubjectId || (m?.id && m.id.startsWith('mb-s-') ? m.id.replace('mb-s-', '') : (m?.id && m.id.startsWith('mb-m-') ? m.id.replace('mb-m-', '').replace(/-hindi$/, '') : null)) || (m?.id && /^\d{16,20}$/.test(m.id) ? m.id : null);
        if (sId) {
          const se = window.appState?.currentSeason || 0;
          const ep = window.appState?.currentEpisodeNumber || 0;
          fastUrl = getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(sId)}&se=${se}&ep=${ep}&q=480`);
        } else {
          fastUrl = getAbsoluteApiUrl(`/api/stream?url=${encodeURIComponent(fastUrl)}`);
        }
      }
    }

    const activeBasePlay = window._fobsOriginalPlayStreamUrl || basePlayStreamUrl;
    if (typeof activeBasePlay === 'function' && activeBasePlay !== fobsPlayStreamHook) {
      return activeBasePlay(fastUrl, audioIndex, seekTime);
    }

    // Direct fallback if basePlayStreamUrl is unavailable
    if (vp && fastUrl) {
      const full = getAbsoluteApiUrl(fastUrl);
      if (vp.src !== full) vp.src = full;
      const playP = vp.play();
      if (playP && typeof playP.catch === 'function') {
        playP.catch(() => {
          vp.muted = true;
          vp.play().catch(() => {});
        });
      }
    }
  };
  fobsPlayStreamHook._isFobsHook = true;
  window.playStreamUrl = fobsPlayStreamHook;

  // Hook openPlayer & openPlayerById
  if (!window._fobsOriginalOpenPlayer && typeof window.openPlayer === 'function' && !window.openPlayer._hasLoaderHook) {
    window._fobsOriginalOpenPlayer = window.openPlayer;
  }
  const baseOpenPlayer = window._fobsOriginalOpenPlayer || window.openPlayer;

  window.openPlayer = function(media, episodeIndex = null, resumeSeekTime = null) {
    const vp = document.getElementById('mainVideoPlayer');
    if (vp) {
      vp.preload = 'auto';
      vp.muted = false; // Restore sound!
    }
    showConnectingLoader();
    if (media) prefetchStream(media, 0, 0);
    return baseOpenPlayer(media, episodeIndex, resumeSeekTime);
  };
  window.openPlayer._hasLoaderHook = true;

  // Universal Catalog Search Helper
  function findMediaInCatalog(id, type = null) {
    if (!id) return null;
    const sId = String(id).trim();
    const cleanId = sId.replace(/^mb-[s|m]-/, '').replace(/-hindi$/, '');
    const allMovies = window.appState?.content?.movies || [];
    const allSeries = window.appState?.content?.series || [];
    const allUpcoming = window.appState?.content?.upcoming || [];
    const all = [...allMovies, ...allSeries, ...allUpcoming];

    let found = all.find(x => String(x.id) === sId || String(x.subjectId) === sId || String(x.id) === cleanId || String(x.subjectId) === cleanId);
    if (found) return found;

    found = all.find(x => (x.tmdbId && String(x.tmdbId) === cleanId));
    if (found) return found;

    found = all.find(x => (x.id && (String(x.id).includes(cleanId) || cleanId.includes(String(x.id)))) || (x.subjectId && String(x.subjectId).includes(cleanId)));
    if (found) return found;

    found = all.find(x => x.title && (x.title.toLowerCase() === sId.toLowerCase() || x.title.toLowerCase().includes(sId.toLowerCase())));
    if (found) return found;

    return null;
  }
  window.findMediaInCatalog = findMediaInCatalog;

  if (!window._fobsOriginalOpenPlayerById && typeof window.openPlayerById === 'function' && !window.openPlayerById._hasFobsHook) {
    window._fobsOriginalOpenPlayerById = window.openPlayerById;
  }
  const baseOpenPlayerById = window._fobsOriginalOpenPlayerById || (typeof window.openPlayerById === 'function' && !window.openPlayerById._hasFobsHook ? window.openPlayerById : null);

  window.openPlayerById = function(type, id) {
    showConnectingLoader();
    if (id) {
      const pfUrl = getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(id)}&se=0&ep=0&q=480&json=1`);
      fetch(pfUrl, { priority: 'low' }).catch(() => {});
    }
    
    try {
      const activeBase = window._fobsOriginalOpenPlayerById || baseOpenPlayerById;
      if (typeof activeBase === 'function') {
        const ret = activeBase(type, id);
        const overlay = document.getElementById('playerOverlay');
        if (overlay && overlay.classList.contains('open')) {
          return ret;
        }
      }
    } catch (err) {
      console.warn('activeBase openPlayerById notice:', err);
    }

    const foundItem = findMediaInCatalog(id, type);
    if (foundItem) {
      if (type !== 'upcoming' && typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) {
        if (window.appState) window.appState.pendingOpenMedia = { type, id };
        if (typeof openSimpleLoginModal === 'function') openSimpleLoginModal();
        hideConnectingLoader();
        return;
      }
      if (foundItem.type === 'upcoming' || (foundItem.badgeRight && foundItem.badgeRight.toLowerCase().includes('coming'))) {
        if (typeof openUpcomingBookingModal === 'function') openUpcomingBookingModal(foundItem);
        hideConnectingLoader();
        return;
      }
      const isSer = type === 'series' || foundItem.type === 'series' || (foundItem.seasons && foundItem.seasons.length > 0) || (foundItem.id && foundItem.id.startsWith('mb-s-'));
      if (isSer) {
        foundItem.type = 'series';
        if ((!foundItem.episodes || foundItem.episodes.length === 0) && foundItem.seasons && foundItem.seasons[0] && foundItem.seasons[0].episodes) {
          foundItem.episodes = foundItem.seasons[0].episodes;
        }
      } else {
        foundItem.type = 'movie';
      }
      return window.openPlayer(foundItem);
    }
  };
  window.openPlayerById._hasFobsHook = true;

  // Safe Watch History Resume: Accurate season/episode, no tab conflict, no modal freeze
  window.resumeHistoryItem = function(mediaId, type, resumeSeconds) {
    const overlay = document.getElementById('historyModalOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.style.display = 'none';
    }
    const menu = document.getElementById('profileDropdownMenu');
    if (menu) menu.classList.add('hidden');

    let rawHist = [];
    try { rawHist = JSON.parse(localStorage.getItem('fobs_watch_history') || '[]'); } catch (_) {}
    const histList = (typeof currentUser !== 'undefined' && currentUser && Array.isArray(window.userHistory) && window.userHistory.length > 0) ? window.userHistory : rawHist;
    const targetId = String(mediaId || '').trim();
    const hist = histList.find(h => {
      const hId = String(h.mediaId || h.id || '').trim();
      return (hId && (hId === targetId || hId.includes(targetId) || targetId.includes(hId))) || (h.title && h.title === mediaId);
    });

    const seNum = hist?.seasonNumber || 1;
    const epNum = hist?.episodeNumber || 1;
    const seekTime = (typeof resumeSeconds === 'number' && resumeSeconds > 0) ? resumeSeconds : (hist?.progressSeconds || 0);
    const mediaType = type || hist?.type || 'movie';

    let media = findMediaInCatalog(mediaId, mediaType);
    if (!media && hist?.title) {
      media = findMediaInCatalog(hist.title, mediaType);
    }

    if (!media && hist) {
      const isSer = mediaType === 'series';
      const cleanSub = String(hist.subjectId || hist.mediaId || mediaId).replace(/^mb-[s|m]-/, '').replace(/-hindi$/, '');
      media = {
        id: hist.mediaId || mediaId,
        subjectId: cleanSub,
        detailPath: hist.detailPath || '',
        title: hist.title || 'Video',
        poster: hist.poster || 'assets/fobs_logo.png',
        type: isSer ? 'series' : 'movie',
        seasonsCount: 1,
        seasons: isSer ? [{
          seasonNumber: seNum,
          episodes: [{
            episodeNumber: epNum,
            title: `Episode ${epNum}`,
            streamUrl: getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(cleanSub)}&se=${seNum}&ep=${epNum}&q=480`)
          }]
        }] : [],
        streamUrl: getAbsoluteApiUrl(`/api/moviebox/stream?id=${encodeURIComponent(cleanSub)}&se=0&ep=0&q=480`)
      };
    }

    if (media) {
      if (media.type === 'series' || (media.seasons && media.seasons.length > 0) || (media.episodes && media.episodes.length > 0)) {
        media.type = 'series';
        if (window.appState) window.appState.currentSeason = seNum;
        const activeEpisodes = (typeof window.getActiveSeasonEpisodes === 'function') ? window.getActiveSeasonEpisodes(media) : (media.seasons?.[0]?.episodes || media.episodes || []);
        let targetEpIdx = 0;
        if (Array.isArray(activeEpisodes) && activeEpisodes.length > 0) {
          const foundIdx = activeEpisodes.findIndex(ep => {
            const num = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number) : null;
            return Number(num) === Number(epNum);
          });
          if (foundIdx !== -1) targetEpIdx = foundIdx;
        }
        window.openPlayer(media, targetEpIdx, seekTime);
      } else {
        window.openPlayer(media, null, seekTime);
      }
    } else {
      window.openPlayerById(mediaType, mediaId);
    }
  };

  window.closeHistoryModal = function(e) {
    if (e && e.target !== document.getElementById('historyModalOverlay') && !e.target.closest('.sheet-close-btn') && !e.target.closest('.mb-page-back-btn')) {
      return;
    }
    const overlay = document.getElementById('historyModalOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.style.display = 'none';
    }
  };

  // Hook selectEpisode
  if (typeof window.selectEpisode === 'function' && !window.selectEpisode._hasLoaderHook) {
    const prevSelectEp = window.selectEpisode;
    window.selectEpisode = function(idx) {
      showConnectingLoader();
      const vp = document.getElementById('mainVideoPlayer');
      if (vp) vp.preload = 'auto';
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
    let sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    let dPath = media.detailPath || media.mbDetailPath || '';

    if (!sId && media.id && /^\d{16,20}$/.test(media.id)) {
      sId = media.id;
    }

    // Catalog lookup fallback if subjectId is missing on media object
    if (!sId && window.appState?.content) {
      const all = [...(window.appState.content.movies || []), ...(window.appState.content.series || [])];
      const found = all.find(x => x.id === media.id || (media.id && String(x.id).includes(media.id)) || (x.title && media.title && x.title === media.title));
      if (found) {
        if (found.subjectId) sId = String(found.subjectId);
        if (found.detailPath && !dPath) dPath = found.detailPath;
      }
    }
    return { sId, dPath };
  }

  async function fetchDownloadQualityInfo(media, seasonNum = 1) {
    if (!media || media._isFetchingInfo) return;
    const { sId, dPath } = getMediaIdentifiers(media);
    if (!sId) return;

    const isSeries = media.type === 'series' || (media.episodes && media.episodes.length > 0) || (media.seasons && media.seasons.length > 0) || (media.id && media.id.startsWith('mb-s-')) || (media.id && media.id.startsWith('kmdl-s-'));
    const seParam = isSeries ? (seasonNum || 1) : 0;
    const typeParam = isSeries ? '' : '&type=movie';
    const apiBase = getApiBaseUrl();

    media._isFetchingInfo = true;
    try {
      const res = await fetch(`${apiBase}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seParam}${typeParam}&_t=${Date.now()}`);
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
  // Dynamic Realistic Size Estimator (Per-Episode Variation)
  // -------------------------------------------------------------
  function computeDynamicEpisodeSize(qNum, epNum, isMovie, durationMins = 0) {
    const r = parseInt(qNum, 10) || 480;
    if (isMovie) {
      let baseMb = r >= 1080 ? 1250 : (r >= 720 ? 680 : 380);
      const hash = Math.sin((epNum || 1) * 313 + r * 17) * 10000;
      const variance = ((hash - Math.floor(hash)) * 0.2) - 0.1; // ±10%
      const estMb = Math.round(baseMb * (1 + variance));
      return {
        bytes: estMb * 1024 * 1024,
        text: estMb >= 1024 ? `~${(estMb / 1024).toFixed(2)} GB` : `~${estMb} MB`
      };
    }

    // Series Episode:
    let baseMb;
    if (r >= 1080) baseMb = 390;
    else if (r >= 720) baseMb = 240;
    else if (r >= 480) baseMb = 145;
    else baseMb = 120;

    const hash = Math.sin((epNum || 1) * 997 + r * 13) * 10000;
    const varianceFactor = ((hash - Math.floor(hash)) * 0.28) - 0.14; // ±14% natural variance
    let estMb = Math.round(baseMb * (1 + varianceFactor));

    if (durationMins > 0) {
      const perMin = r >= 1080 ? 8.2 : (r >= 720 ? 5.1 : (r >= 480 ? 3.1 : 2.5));
      estMb = Math.round(durationMins * perMin * (1 + (varianceFactor * 0.4)));
    }

    const bytes = estMb * 1024 * 1024;
    const text = estMb >= 1024 ? `~${(estMb / 1024).toFixed(2)} GB` : `~${estMb} MB`;
    return { bytes, text };
  }
  window.computeDynamicEpisodeSize = computeDynamicEpisodeSize;

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

    // Instant 0ms pre-population if qualities are already attached to media or stream
    if (!media._episodesInfo) {
      if (!isSeries && Array.isArray(media.qualities) && media.qualities.length > 0) {
        media._episodesInfo = [{
          episode: 1,
          isMovie: true,
          title: media.title,
          qualities: media.qualities
        }];
      } else if (!isSeries && Array.isArray(window.currentMovieBoxQualities) && window.currentMovieBoxQualities.length > 0) {
        media._episodesInfo = [{
          episode: 1,
          isMovie: true,
          title: media.title,
          qualities: window.currentMovieBoxQualities
        }];
      }
    }

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
        if (!match) {
          const sorted = [...info.qualities].sort((a, b) => Math.abs((a.resolution || 720) - qNum) - Math.abs((b.resolution || 720) - qNum));
          match = sorted[0];
        }
      }

      const epCopy = { ...ep, _origIdx: origIdx };
      const durationMins = ep?.duration ? parseInt(ep.duration, 10) : 0;
      const dynamicSize = computeDynamicEpisodeSize(qNum, epNum, isMovieItem, durationMins);

      if (match && match.sizeText) {
        epCopy.realSizeText = match.sizeText;
        epCopy.realSizeBytes = match.sizeBytes || dynamicSize.bytes;
        epCopy.realQuality = `${match.resolution || qNum}P`;
      } else {
        epCopy.realSizeText = dynamicSize.text;
        epCopy.realSizeBytes = dynamicSize.bytes;
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
        <div class="dl-ep-item selected" id="dl_ep_item_${idx}" onclick="toggleBatchEpisode(${idx}, event)">
          <div class="dl-ep-left">
            <span class="dl-ep-badge">${badgeText}</span>
            <div class="dl-ep-title-wrap">
              <div class="dl-ep-title">${epTitle}</div>
              <div class="dl-ep-size" id="dl_ep_size_${idx}">${estSizeStr}</div>
            </div>
          </div>
          <label class="dl-ep-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="dl_ep_chk_${idx}" checked onclick="event.stopPropagation()" onchange="toggleBatchEpisode(${idx}, event)">
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
  // 4. Download Modal Filter Watcher: Dynamic Realistic Size Formatting
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

    // Inspect each episode / movie item in the scroll list
    const items = Array.from(scrollList.querySelectorAll('.dl-ep-item'));
    items.forEach((item, idx) => {
      item.style.display = 'flex';
      const badge = item.querySelector('.dl-ep-badge');
      const isMovieBadge = badge && badge.textContent.includes('MOVIE');
      const badgeText = badge ? badge.textContent.replace(/[^0-9]/g, '') : '';
      const epNum = parseInt(badgeText, 10) || (idx + 1);
      const chk = item.querySelector('input[type="checkbox"]');
      const isMovieItem = isMovieBadge || !isSeries;

      const info = episodesInfo.find(it => isMovieItem ? (it.isMovie || it.episode === 1) : it.episode === epNum);
      const hasAnyQualityInfo = info && Array.isArray(info.qualities) && info.qualities.length > 0;

      let match = null;
      if (hasAnyQualityInfo) {
        match = info.qualities.find(q => parseInt(q.resolution, 10) === qNum)
             || (qNum === 480 ? info.qualities.find(q => parseInt(q.resolution, 10) === 360) : null);
        if (!match) {
          const sorted = [...info.qualities].sort((a, b) => Math.abs((parseInt(a.resolution, 10) || 720) - qNum) - Math.abs((parseInt(b.resolution, 10) || 720) - qNum));
          match = sorted[0];
        }
      }

      const sizeEl = item.querySelector('.dl-ep-size');
      const epData = batchState?.episodes?.[idx];
      const durationMins = epData?.duration ? parseInt(epData.duration, 10) : 0;
      const dynamicSize = computeDynamicEpisodeSize(qNum, epNum, isMovieItem, durationMins);

      // Keep episodes active and downloadable
      item.classList.remove('dl-unavailable');
      item.style.opacity = '1';
      if (chk) chk.disabled = false;

      let displayText = dynamicSize.text;
      let displayBytes = dynamicSize.bytes;
      let resolvedQuality = curQ;

      if (match && match.sizeText) {
        displayText = match.sizeText;
        displayBytes = match.sizeBytes || dynamicSize.bytes;
        resolvedQuality = `${match.resolution || qNum}P`;
      }

      if (sizeEl) {
        sizeEl.innerHTML = `<span style="color: #94a3b8; font-weight: 500;">${displayText}</span>`;
      }
      if (batchState?.episodes?.[idx]) {
        batchState.episodes[idx].isUnavailable = false;
        batchState.episodes[idx].realSizeText = displayText;
        batchState.episodes[idx].realSizeBytes = displayBytes;
        batchState.episodes[idx].realQuality = resolvedQuality;
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
  window.toggleBatchEpisode = function(index, ev) {
    const itemEl = document.getElementById(`dl_ep_item_${index}`);
    const batchState = getAppState()?._batchDownload;
    if (!batchState || !batchState.selected) return;

    const chkEl = document.getElementById(`dl_ep_chk_${index}`);

    if (ev && ev.target && ev.target.type === 'checkbox') {
      if (ev.target.checked) {
        batchState.selected.add(index);
      } else {
        batchState.selected.delete(index);
      }
    } else {
      if (batchState.selected.has(index)) {
        batchState.selected.delete(index);
      } else {
        batchState.selected.add(index);
      }
    }

    const isChecked = batchState.selected.has(index);
    if (itemEl) itemEl.classList.toggle('selected', isChecked);
    if (chkEl) chkEl.checked = isChecked;

    const selectAllChk = document.getElementById('dlSelectAllCheckbox');
    if (selectAllChk && batchState.episodes) {
      selectAllChk.checked = (batchState.selected.size === batchState.episodes.length && batchState.episodes.length > 0);
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
      batchState.selected = new Set(batchState.episodes.map((_, i) => i));
    } else {
      batchState.selected.clear();
    }

    batchState.episodes.forEach((_, idx) => {
      const isSelected = batchState.selected.has(idx);
      const itemEl = document.getElementById(`dl_ep_item_${idx}`);
      const chkEl = document.getElementById(`dl_ep_chk_${idx}`);
      if (itemEl) itemEl.classList.toggle('selected', isSelected);
      if (chkEl) chkEl.checked = isSelected;
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
          const dynamicSize = computeDynamicEpisodeSize(qNum, idx + 1, !batchState.isSeries);
          totalBytes += dynamicSize.bytes;
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
  // 8. Confirm Download (Handles Movies and Series with Fresh Token & Batch Queue)
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
      let selectedIndices = Array.from(batchState?.selected || []).sort((a, b) => a - b);
      if (selectedIndices.length === 0) {
        selectedIndices = (batchState?.episodes || []).map((_, i) => i);
      }
      if (selectedIndices.length === 0) {
        if (typeof showToast === 'function') showToast('অনুগ্রহ করে অন্তত ১টি পর্ব নির্বাচন করুন');
        return;
      }

      const seNum = batchState?.season || window.appState?.currentSeason || 1;
      const apiBase = getApiBaseUrl();
      const taskItems = [];

      selectedIndices.forEach(idx => {
        const ep = batchState?.episodes?.[idx];
        const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1)) : (idx + 1);
        const epTitle = ep?.title ? `${media.title} - ${ep.title}` : `${media.title} - S${seNum} Ep ${epNum}`;
        const epPoster = ep?.stillPath || media.poster || 'assets/fobs_logo.png';
        const taskId = `dl_${subjectId || media.id}_s${seNum}_e${epNum}_${curQ}`;
        const epRealSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 385 : (targetResNum >= 720 ? 235 : 142)} MB`;
        const epRealBytes = ep?.realSizeBytes || 0;
        const cleanSafeEpTitle = epTitle.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');

        const downloadEndpointUrl = `${apiBase}/api/download?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=${seNum}&ep=${epNum}&q=${targetResNum}&title=${encodeURIComponent(cleanSafeEpTitle)}`;

        const taskItem = {
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
            isSeries: true,
            seriesTitle: media.title || '',
            cleanTitle: media.title || ''
          }
        };
        taskItems.push(taskItem);
      });

      // Batch enqueue to fobs_downloads in one atomic transaction
      let allDownloads = [];
      try {
        allDownloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
      } catch (_) {
        allDownloads = [];
      }

      taskItems.forEach(item => {
        const existingIdx = allDownloads.findIndex(d => d && d.id === item.id);
        if (existingIdx !== -1) {
          allDownloads[existingIdx] = { ...allDownloads[existingIdx], ...item, status: 'queued' };
        } else {
          allDownloads.push(item);
        }
      });
      localStorage.setItem('fobs_downloads', JSON.stringify(allDownloads));

      if (typeof renderDownloadsList === 'function') renderDownloadsList();
      if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
        setTimeout(() => window.fobsDownloadQueue.processNext(), 100);
      }

      if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
      if (typeof showToast === 'function') showToast(`📥 ${taskItems.length} টি পর্ব (${curQ}) ডাউনলোডের সারিতে যুক্ত হয়েছে`);
      stopBackgroundMedia();
      if (typeof openDownloadsView === 'function') openDownloadsView();
      return;
    }

    // Single Movie Download
    const ep = batchState?.episodes?.[0];
    const movieTitle = media.title;
    const moviePoster = media.poster || 'assets/fobs_logo.png';
    const realSize = ep?.realSizeText || `~${targetResNum >= 1080 ? 1200 : (targetResNum >= 720 ? 650 : 380)} MB`;
    const realBytes = ep?.realSizeBytes || 0;
    const taskId = `dl_${subjectId || media.id}_movie_${curQ}`;
    const cleanSafeMovieTitle = movieTitle.replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
    const apiBase = getApiBaseUrl();
    const downloadEndpointUrl = `${apiBase}/api/download?id=${encodeURIComponent(subjectId)}&path=${encodeURIComponent(detailPath)}&se=0&ep=0&q=${targetResNum}&title=${encodeURIComponent(cleanSafeMovieTitle)}`;

    const movieTaskItem = {
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
        isSeries: false,
        cleanTitle: movieTitle || ''
      }
    };

    let allDownloads = [];
    try {
      allDownloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
    } catch (_) {
      allDownloads = [];
    }
    const existingIdx = allDownloads.findIndex(d => d && d.id === movieTaskItem.id);
    if (existingIdx !== -1) {
      allDownloads[existingIdx] = { ...allDownloads[existingIdx], ...movieTaskItem, status: 'queued' };
    } else {
      allDownloads.push(movieTaskItem);
    }
    localStorage.setItem('fobs_downloads', JSON.stringify(allDownloads));

    if (typeof renderDownloadsList === 'function') renderDownloadsList();
    if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      setTimeout(() => window.fobsDownloadQueue.processNext(), 100);
    }

    if (typeof window.closeDownloadOptionsModal === 'function') window.closeDownloadOptionsModal();
    if (typeof showToast === 'function') showToast(`📥 মুভি ডাউনলোড শুরু হচ্ছে (${curQ})`);
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

    // Instant Click Listener for Video Play: shows connecting loader when starting new video/episode
    const playTarget = e.target.closest('.media-card, #heroPlayBtn, .details-sheet-play-btn, .details-play-btn, .sheet-option-btn, .episode-pill, .ep-btn, [onclick*="openPlayer"], [onclick*="selectEpisode"]');
    if (playTarget && !playTarget.closest('#downloadsView, .mb-dl-card, [onclick*="playDownloadedMedia"]')) {
      showConnectingLoader();
      try {
        const vp = document.getElementById('mainVideoPlayer');
        if (vp) vp.preload = 'auto';
        const card = playTarget.closest('.media-card, [onclick*="openPlayerById"]');
        if (card) {
          const oc = card.getAttribute('onclick') || '';
          const m = oc.match(/openPlayerById\s*\(\s*['"]?[^'",]+['"]?\s*,\s*['"]([^'"]+)['"]/);
          if (m && m[1]) {
            const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
            fetch(`${base}/api/moviebox/stream?id=${encodeURIComponent(m[1])}&se=0&ep=0&q=480&json=1`, { priority: 'low' }).catch(() => {});
          }
        }
      } catch (_) {}
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
      const apiBase = getApiBaseUrl();

      list.forEach(item => {
        if (!item || !item.id) return;

        // 1. Unwrap circular proxy / nested URLs
        if (item.url && typeof item.url === 'string') {
          let cleanUrl = item.url;
          while (cleanUrl.includes('/api/download?url=') || cleanUrl.includes('/api/stream?url=')) {
            try {
              const u = new URL(cleanUrl, apiBase || window.location.origin);
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

        // Auto-prefix relative URLs with apiBase so on Android/Capacitor it connects directly to VPS
        if (item.url && typeof item.url === 'string' && item.url.startsWith('/api/')) {
          item.url = `${apiBase}${item.url}`;
          changed = true;
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
            item.url = `${apiBase}/api/download?id=${encodeURIComponent(sid)}&path=${encodeURIComponent(path)}&se=${se}&ep=${ep}&q=${q}&title=${titleSafe}`;
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

  // -------------------------------------------------------------
  // 12. Robust Offline Playback & Multi-Key IndexedDB Fallback
  // -------------------------------------------------------------
  async function findOfflineMediaRecord(id, storedItem) {
    if (!id) return null;
    try {
      const db = await (typeof openOfflineDatabase === 'function' ? openOfflineDatabase() : null);
      if (!db) return null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(['media_files'], 'readonly');
          const store = tx.objectStore('media_files');

          const req1 = store.get(id);
          req1.onsuccess = () => {
            if (req1.result && (req1.result.videoBlob || req1.result.chunks || req1.result.blob)) {
              return resolve(req1.result);
            }
            const req2 = store.get('temp_' + id);
            req2.onsuccess = () => {
              if (req2.result && (req2.result.videoBlob || req2.result.chunks || req2.result.blob)) {
                return resolve(req2.result);
              }
              if (typeof id === 'string' && id.startsWith('temp_')) {
                const req3 = store.get(id.replace('temp_', ''));
                req3.onsuccess = () => {
                  if (req3.result && (req3.result.videoBlob || req3.result.chunks || req3.result.blob)) {
                    return resolve(req3.result);
                  }
                  scanAllRecords();
                };
                req3.onerror = () => scanAllRecords();
              } else {
                scanAllRecords();
              }
            };
            req2.onerror = () => scanAllRecords();
          };
          req1.onerror = () => scanAllRecords();

          function scanAllRecords() {
            try {
              const cursorReq = store.openCursor();
              const candidates = [];
              cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  const rec = cursor.value;
                  if (rec && (rec.videoBlob || rec.chunks || rec.blob)) {
                    const recId = String(rec.id || cursor.key);
                    const cleanRecId = recId.replace('temp_', '');
                    const cleanTargetId = String(id).replace('temp_', '');
                    if (cleanRecId === cleanTargetId || cleanRecId.includes(cleanTargetId) || cleanTargetId.includes(cleanRecId)) {
                      candidates.push(rec);
                    } else if (storedItem && rec.mediaId && storedItem.mediaId && rec.mediaId === storedItem.mediaId) {
                      if ((storedItem.episode !== undefined && rec.episode === storedItem.episode) || (!storedItem.episode && !rec.episode)) {
                        candidates.push(rec);
                      }
                    } else if (storedItem && rec.title && storedItem.title && (rec.title === storedItem.title || rec.title.includes(storedItem.title) || storedItem.title.includes(rec.title))) {
                      candidates.push(rec);
                    }
                  }
                  cursor.continue();
                } else {
                  if (candidates.length > 0) {
                    const best = candidates.find(c => c.videoBlob) || candidates[0];
                    return resolve(best);
                  }
                  resolve(null);
                }
              };
              cursorReq.onerror = () => resolve(null);
            } catch (_) {
              resolve(null);
            }
          }
        } catch (_) {
          resolve(null);
        }
      });
    } catch (_) {
      return null;
    }
  }

  // Full standalone override of playDownloadedMedia with robust offline playback & dual subtitles
  window.playDownloadedMedia = async function(id) {
    if (typeof closeDownloadsView === 'function') closeDownloadsView();

    const cOverlay = document.getElementById('fobsConnectingOverlay');
    if (cOverlay) { cOverlay.style.display = 'none'; cOverlay.style.opacity = '0'; }
    if (typeof hideConnectingLoader === 'function') hideConnectingLoader();

    if (typeof showToast === 'function') showToast('অফলাইন ভিডিও লোড হচ্ছে...');

    const downloads = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
    const storedItem = downloads.find(d => d.id === id);

    // Check MovieBox Native Device Storage first
    const isNativeReady = window.AndroidApp && typeof window.AndroidApp.isLocalFileReady === 'function' && window.AndroidApp.isLocalFileReady(id);
    let videoUrl = null;
    let nativeBnSub = '';
    let nativeEnSub = '';

    if (isNativeReady) {
      videoUrl = window.AndroidApp.getLocalStreamUrl(id);
      try {
        nativeBnSub = window.AndroidApp.getLocalSubtitle(id, 'bn') || '';
        nativeEnSub = window.AndroidApp.getLocalSubtitle(id, 'en') || '';
      } catch (_) {}
    }

    let offlineItem = await findOfflineMediaRecord(id, storedItem);

    if (storedItem) {
      offlineItem = { ...storedItem, ...(offlineItem || {}) };
    }

    let videoBlob = offlineItem ? (offlineItem.videoBlob || offlineItem.chunks || offlineItem.blob) : null;
    if (videoBlob && !(videoBlob instanceof Blob)) {
      try { videoBlob = new Blob([videoBlob], { type: 'video/mp4' }); } catch(_) { videoBlob = null; }
    }

    const videoPlayer = document.getElementById('mainVideoPlayer');
    const playerOverlay = document.getElementById('playerOverlay');
    const embedFrame = document.getElementById('mainEmbedPlayer');
    const loader = document.getElementById('videoLoader');

    if (!videoPlayer || !playerOverlay) {
      if (typeof showToast === 'function') showToast('⚠️ প্লেয়ার আরম্ভ করা সম্ভব হয়নি');
      return;
    }

    if (!videoUrl && offlineItem && videoBlob) {
      if (window._currentOfflineBlobUrl) {
        try { URL.revokeObjectURL(window._currentOfflineBlobUrl); } catch (_) {}
      }
      videoUrl = URL.createObjectURL(videoBlob);
      window._currentOfflineBlobUrl = videoUrl;
    }

    if (videoUrl && (isNativeReady || (offlineItem && videoBlob))) {
      // Direct, robust offline video playback from Device Storage (MovieBox) or IndexedDB
      if (embedFrame) {
        embedFrame.src = 'about:blank';
        embedFrame.style.display = 'none';
      }

      const quality = offlineItem?.quality || storedItem?.quality || '480P';
      const qStyle = (typeof getQualityBadgeStyle === 'function')
        ? getQualityBadgeStyle(quality)
        : { label: quality, pixel: quality, bg: '#00d26a', color: '#fff', border: 'none', glow: 'none' };

      let isSeries = !!(offlineItem.isSeries || storedItem?.isSeries || offlineItem.season || offlineItem.episode);
      let epNum = offlineItem.episode || storedItem?.episode || storedItem?.options?.episode;
      let seNum = offlineItem.season || storedItem?.season || storedItem?.options?.season;

      if (!epNum && offlineItem.title) {
        const epMatch = offlineItem.title.match(/(?:ep(?:isode)?\.?\s*|e)(\d+)/i);
        if (epMatch) { epNum = parseInt(epMatch[1], 10); isSeries = true; }
        const seMatch = offlineItem.title.match(/(?:s(?:eason)?\.?\s*)(\d+)/i);
        if (seMatch) { seNum = parseInt(seMatch[1], 10); isSeries = true; }
      }

      const state = getAppState();
      if (state) {
        state.currentMedia = {
          id: offlineItem.mediaId || offlineItem.id || id,
          offlineDownloadId: offlineItem.id || id,
          title: offlineItem.title || storedItem?.title || 'Offline Video',
          poster: offlineItem.poster || storedItem?.poster,
          isOffline: true,
          quality: qStyle.pixel,
          isSeries: isSeries,
          season: seNum || 1,
          episode: epNum || 1,
          duration: offlineItem.duration || storedItem?.duration || null
        };
        if (isSeries && epNum) {
          state.currentEpisode = { number: epNum, episodeNumber: epNum, episode: epNum, title: `Episode ${epNum}` };
          state.currentEpisodeNumber = epNum;
        } else {
          state.currentEpisode = null;
        }
      }

      if (window.activeHlsPlayer) {
        try { window.activeHlsPlayer.destroy(); } catch (_) {}
        window.activeHlsPlayer = null;
      }
      if (window.videoStreamColdStartTimer) {
        clearTimeout(window.videoStreamColdStartTimer);
        window.videoStreamColdStartTimer = null;
      }

      videoPlayer._retryCount = 0;
      videoPlayer._ignoreErrors = true;
      videoPlayer.preload = 'auto';
      videoPlayer.muted = false;
      videoPlayer.volume = 1.0;
      videoPlayer.style.display = 'block';
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
      videoPlayer.src = videoUrl;
      videoPlayer.load();

      if (typeof restoreSystemBrightness === 'function') restoreSystemBrightness();

      const dismissOverlay = () => {
        if (loader) loader.classList.remove('active');
        if (typeof hideConnectingLoader === 'function') hideConnectingLoader();
        const curOverlay = document.getElementById('fobsConnectingOverlay');
        if (curOverlay) { curOverlay.style.display = 'none'; curOverlay.style.opacity = '0'; }
        videoPlayer._ignoreErrors = false;
      };

      videoPlayer.addEventListener('loadedmetadata', dismissOverlay, { once: true });
      videoPlayer.addEventListener('loadeddata', dismissOverlay, { once: true });
      videoPlayer.addEventListener('canplay', dismissOverlay, { once: true });
      videoPlayer.addEventListener('playing', dismissOverlay, { once: true });

      // Saved position resume
      let resumeSeekTime = 0;
      try {
        const offlineKey = 'fobs_offline_resume_' + (offlineItem.id || id);
        const savedOffline = JSON.parse(localStorage.getItem(offlineKey) || 'null');
        if (savedOffline && savedOffline.progressSeconds > 5) {
          if (!savedOffline.completed && (!savedOffline.durationSeconds || (savedOffline.progressSeconds / savedOffline.durationSeconds) < 0.95)) {
            resumeSeekTime = savedOffline.progressSeconds;
          }
        }
      } catch (_) {}

      if (resumeSeekTime > 0) {
        videoPlayer.addEventListener('canplay', () => {
          try {
            const dur = videoPlayer.duration || (resumeSeekTime + 10);
            videoPlayer.currentTime = Math.max(0, Math.min(dur > 1 ? dur - 1 : dur, resumeSeekTime));
          } catch (_) {}
        }, { once: true });
      }

      playerOverlay.style.setProperty('display', 'flex', 'important');
      playerOverlay.classList.add('open');
      document.body.classList.add('player-open');

      videoPlayer.play().then(dismissOverlay).catch(dismissOverlay);

      // Title & Badges
      let displayTitle = offlineItem.title || storedItem?.title || 'Offline Video';
      if (isSeries && epNum && !displayTitle.toLowerCase().includes('ep')) {
        displayTitle = `${displayTitle} • Ep ${epNum}`;
      }
      const titleEl = document.getElementById('playerMediaTitle');
      if (titleEl) titleEl.innerText = `${displayTitle} (Downloaded)`;

      const metaEl = document.getElementById('playerMediaMeta');
      if (metaEl) {
        metaEl.innerHTML = `
          <span style="background: rgba(0, 210, 106, 0.18); color: #00d26a; border: 1px solid rgba(0, 210, 106, 0.5); padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 5px;">
            <i class="fa-solid fa-cloud-arrow-down"></i> Downloaded
          </span>
          <span style="background: ${qStyle.bg || 'rgba(0,210,106,0.2)'}; color: ${qStyle.color || '#00d26a'}; border: ${qStyle.border || '1px solid rgba(0,210,106,0.4)'}; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 11px;">
            <i class="fa-solid fa-sliders"></i> ${qStyle.label || quality}
          </span>
          ${(isSeries && epNum) ? `
          <span style="background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.5); padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 11px;">
            <i class="fa-solid fa-film"></i> ${seNum ? `S${seNum}:Ep ${epNum}` : `Ep ${epNum}`}
          </span>` : ''}
        `;
      }

      const lsTitle = document.getElementById('lsVideoTitle');
      if (lsTitle) {
        lsTitle.innerHTML = `<span>${displayTitle}</span> <span style="margin-left: 8px; color: #00d26a; font-size: 11px; font-weight: 700;"><i class="fa-solid fa-cloud-arrow-down"></i> Downloaded</span>`;
      }

      const seriesEpisodesWrapper = document.getElementById('seriesEpisodesWrapper');
      if (seriesEpisodesWrapper) seriesEpisodesWrapper.style.display = 'none';

      // Offline Dual Subtitles
      const offlineTracks = [];
      const bnText = nativeBnSub || offlineItem?.bnVttText || offlineItem?.vttText;
      if (bnText && typeof parseSubtitleTextToCues === 'function') {
        const bnCues = parseSubtitleTextToCues(bnText);
        if (bnCues && bnCues.length > 0) {
          offlineTracks.push({ id: 'offline_bn', language: 'Bangla (বাংলা)', langCode: 'bn', source: isNativeReady ? 'Device Storage (মুভিবক্স)' : 'Offline Storage', rawCues: bnCues });
        }
      }
      const enText = nativeEnSub || offlineItem?.enVttText;
      if (enText && typeof parseSubtitleTextToCues === 'function') {
        const enCues = parseSubtitleTextToCues(enText);
        if (enCues && enCues.length > 0) {
          offlineTracks.push({ id: 'offline_en', language: 'English', langCode: 'en', source: isNativeReady ? 'Device Storage (মুভিবক্স)' : 'Offline Storage', rawCues: enCues });
        }
      }

      if (window.subtitleState) {
        window.subtitleState.availableTracks = offlineTracks;
        if (typeof renderSubtitleLists === 'function') renderSubtitleLists();
        const pref = offlineTracks.find(t => t.langCode === 'bn') || offlineTracks[0];
        if (pref && typeof selectSubtitleTrack === 'function') {
          selectSubtitleTrack(pref.id);
        } else if (typeof selectSubtitleTrack === 'function') {
          selectSubtitleTrack('off');
        }
      }

      if (!window._subCueRenderInterval) {
        window._subCueRenderInterval = setInterval(() => {
          const vp = document.getElementById('mainVideoPlayer');
          if (vp && !vp.paused && window.subtitleState?.enabled && window.subtitleState?.cues?.length > 0) {
            const curTime = (vp.currentTime || 0) + (window.appState?.streamSeekOffset || 0);
            if (typeof window.renderActiveSubtitleCue === 'function') {
              window.renderActiveSubtitleCue(curTime);
            }
          }
        }, 100);
      }

      const readyTitle = displayTitle || offlineItem?.title || storedItem?.title || 'Video';
      if (typeof showToast === 'function') {
        showToast(isNativeReady
          ? `⚡ ইন্টারনেট ছাড়াই চলছে (মুভিবক্স ডিভাইস স্টোরেজ): ${readyTitle}`
          : `⚡ ইন্টারনেট ছাড়াই চলছে: ${readyTitle} (${qStyle.pixel || quality})`
        );
      }
      return;
    }

    // Fallback: If blob was not found in IndexedDB
    if (storedItem && navigator.onLine) {
      console.warn('IndexedDB blob missing for', id, '— online stream fallback');
      const apiBase = getApiBaseUrl();
      const { subjectId, detailPath, season, episode, resolution, isSeries, options: itemOpts } = storedItem;
      const sid = subjectId || itemOpts?.subjectId || '';
      const path = detailPath || itemOpts?.detailPath || '';
      const se = season ?? itemOpts?.season ?? 0;
      const ep = episode ?? itemOpts?.episode ?? 0;
      const q = resolution || parseInt(storedItem.quality, 10) || 480;

      if (sid) {
        const streamUrl = `${apiBase}/api/moviebox/stream?id=${encodeURIComponent(sid)}&path=${encodeURIComponent(path)}&se=${se}&ep=${ep}&q=${q}`;
        if (embedFrame) { embedFrame.src = 'about:blank'; embedFrame.style.display = 'none'; }

        const state = getAppState();
        if (state) {
          state.currentMedia = {
            id: storedItem.mediaId || id,
            offlineDownloadId: id,
            title: storedItem.title,
            poster: storedItem.poster,
            isOffline: false,
            quality: storedItem.quality || `${q}P`,
            isSeries: !!(isSeries || itemOpts?.isSeries),
            season: se || 1,
            episode: ep || 1
          };
        }

        videoPlayer.muted = false;
        videoPlayer.volume = 1.0;
        videoPlayer.style.display = 'block';
        videoPlayer.src = streamUrl;
        videoPlayer.load();
        videoPlayer.play().catch(() => {});

        playerOverlay.style.setProperty('display', 'flex', 'important');
        playerOverlay.classList.add('open');
        document.body.classList.add('player-open');
        if (typeof showToast === 'function') showToast('⚡ স্ট্রিমিং মোডে চলছে');
        return;
      }
    }

    if (typeof showToast === 'function') {
      showToast('⚠️ অফলাইনে এই ভিডিও ফাইলটি পাওয়া যায়নি। ইন্টারনেট সংযোগ দিয়ে আবার ডাউনলোড করুন।');
    }
  };
  window.playDownloadedMedia._hasEnhancedHook = true;

  // Native MovieBox Downloader Callbacks
  window.onNativeDownloadProgress = function(id, percent, downloadedBytes, totalBytes) {
    const downMb = (downloadedBytes / (1024 * 1024)).toFixed(1);
    const totMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
    const sizeText = `${downMb} MB / ${totMb} MB`;
    if (typeof window.updateDownloadProgress === 'function') {
      window.updateDownloadProgress(id, percent, sizeText);
    }
    try {
      const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
      const item = downloads.find(d => d && (d.id === id || id.includes(d.id)));
      if (item) {
        item.progress = percent;
        item.receivedBytes = downloadedBytes;
        item.totalBytes = totalBytes;
        item.status = 'downloading';
        item.statusText = `Downloading... ${percent}%`;
        item.sizeText = sizeText;
        localStorage.setItem('fobs_downloads', JSON.stringify(downloads));
      }
    } catch (_) {}
  };

  window.onNativeDownloadComplete = function(id) {
    try {
      const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
      const item = downloads.find(d => d && (d.id === id || id.includes(d.id)));
      if (item) {
        item.progress = 100;
        item.status = 'Ready (Offline)';
        item.downloaded = true;
        item.isReady = true;
        item.statusText = 'Downloaded • Ready to Watch (অফলাইন)';
        localStorage.setItem('fobs_downloads', JSON.stringify(downloads));
      }
    } catch (_) {}
    if (typeof window.renderDownloadsList === 'function') window.renderDownloadsList();
    if (typeof showToast === 'function') showToast('🎬 ডাউনলোড সম্পন্ন হয়েছে! অফলাইনে প্লে করতে ক্লিক করুন');
    if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      setTimeout(() => window.fobsDownloadQueue.processNext(), 400);
    }
  };

  window.onNativeDownloadPaused = function(id) {
    try {
      const downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
      const item = downloads.find(d => d && (d.id === id || id.includes(d.id)));
      if (item) {
        item.status = 'paused';
        item.paused = true;
        item.statusText = `Paused (${item.progress || 0}%)`;
        localStorage.setItem('fobs_downloads', JSON.stringify(downloads));
      }
    } catch (_) {}
    if (typeof window.renderDownloadsList === 'function') window.renderDownloadsList();
  };

  window.onNativeDownloadDeleted = function(id) {
    try {
      let downloads = JSON.parse(localStorage.getItem('fobs_downloads') || '[]');
      downloads = downloads.filter(d => d && d.id !== id && !id.includes(d.id));
      localStorage.setItem('fobs_downloads', JSON.stringify(downloads));
    } catch (_) {}
    if (typeof window.renderDownloadsList === 'function') window.renderDownloadsList();
  };

  // Hook pause/resume/delete for Native Downloader
  const origPause = window.pauseDownload;
  window.pauseDownload = function(id, e) {
    if (window.AndroidApp && typeof window.AndroidApp.pauseNativeDownload === 'function') {
      window.AndroidApp.pauseNativeDownload(id);
    }
    if (typeof origPause === 'function') origPause(id, e);
  };

  const origResume = window.resumeDownload;
  window.resumeDownload = function(id, e) {
    if (window.AndroidApp && typeof window.AndroidApp.resumeNativeDownload === 'function') {
      window.AndroidApp.resumeNativeDownload(id);
    }
    if (typeof origResume === 'function') origResume(id, e);
  };

  const origDelete = window.deleteDownload;
  window.deleteDownload = function(id, e) {
    if (window.AndroidApp && typeof window.AndroidApp.deleteNativeDownload === 'function') {
      window.AndroidApp.deleteNativeDownload(id);
    }
    if (typeof origDelete === 'function') origDelete(id, e);
  };

  // Hook window.downloadMedia to route to MovieBox Native Downloader when available
  if (typeof window.downloadMedia === 'function' && !window.downloadMedia._hasCleanHook) {
    const origDownloadMedia = window.downloadMedia;
    window.downloadMedia = function(url, title, options = {}, resumeExistingId = null) {
      const apiBase = getApiBaseUrl();
      let cleanUrl = url;
      if (cleanUrl && cleanUrl.startsWith('/api/')) {
        cleanUrl = `${apiBase}${cleanUrl}`;
      }
      while (cleanUrl && (cleanUrl.includes('/api/download?url=') || cleanUrl.includes('/api/stream?url='))) {
        try {
          const u = new URL(cleanUrl, apiBase || window.location.origin);
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

      // If running inside Android App with MovieBox Native Storage, use direct disk streaming!
      if (window.AndroidApp && typeof window.AndroidApp.startNativeDownload === 'function') {
        const downloadId = resumeExistingId || ('dl_' + Date.now());
        const cleanSafeTitle = (title || 'video').replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
        const qNum = opts.resolution || 480;

        let proxiedDownloadUrl = cleanUrl;
        if (!proxiedDownloadUrl.startsWith('http')) {
          proxiedDownloadUrl = `${apiBase}${proxiedDownloadUrl.startsWith('/') ? '' : '/'}${proxiedDownloadUrl}`;
        }
        if (!proxiedDownloadUrl.includes('title=')) {
          proxiedDownloadUrl += `${proxiedDownloadUrl.includes('?') ? '&' : '?'}title=${encodeURIComponent(cleanSafeTitle)}`;
        }
        if (!proxiedDownloadUrl.includes('q=')) {
          proxiedDownloadUrl += `&q=${qNum}`;
        }

        let dlSeason = opts.season || 1;
        let dlEpisode = opts.episode || 1;
        let dlSubjectId = opts.subjectId || (opts.mediaId ? String(opts.mediaId).replace(/^mb-[s|m]-/, '') : '');
        let dlDetailPath = opts.detailPath || '';
        let dlIsSeries = opts.isSeries || false;

        let cleanT = (opts.cleanTitle || opts.seriesTitle || title || '')
          .replace(/\s*-\s*S\d+\s*Ep\s*\d+.*/i, '')
          .replace(/\s*-\s*Episode\s*\d+.*/i, '')
          .replace(/\s*-\s*Ep\s*\d+.*/i, '')
          .replace(/\s*-\s*Season\s*\d+.*/i, '')
          .replace(/\[.*?\]|\(.*?\)/g, '')
          .trim();
        if (cleanT.includes(' - ')) cleanT = cleanT.split(' - ')[0].trim();

        const bnSubUrl = `${apiBase}/api/subtitles/download?title=${encodeURIComponent(cleanT)}&season=${dlSeason}&episode=${dlEpisode}&subjectId=${encodeURIComponent(dlSubjectId)}&detailPath=${encodeURIComponent(dlDetailPath)}&type=${dlIsSeries ? 'series' : 'movie'}&lang=bn`;
        const enSubUrl = `${apiBase}/api/subtitles/download?title=${encodeURIComponent(cleanT)}&season=${dlSeason}&episode=${dlEpisode}&subjectId=${encodeURIComponent(dlSubjectId)}&detailPath=${encodeURIComponent(dlDetailPath)}&type=${dlIsSeries ? 'series' : 'movie'}&lang=en`;

        const curDownloads = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
        let curItem = curDownloads.find(d => d.id === downloadId);
        if (!curItem) {
          curItem = {
            id: downloadId,
            mediaId: opts.mediaId || '',
            title: title,
            poster: opts.poster || 'assets/fobs_logo.png',
            quality: opts.quality || '480P',
            resolution: qNum,
            season: opts.season,
            episode: opts.episode,
            isSeries: opts.isSeries,
            url: proxiedDownloadUrl,
            progress: 1,
            receivedBytes: 0,
            totalBytes: 0,
            sizeText: 'Connecting...',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            status: 'downloading',
            statusText: 'Connecting...',
            options: opts
          };
          curDownloads.unshift(curItem);
        } else {
          curItem.status = 'downloading';
          curItem.statusText = 'Connecting...';
          curItem.paused = false;
          curItem.failed = false;
        }
        localStorage.setItem('fobs_downloads', JSON.stringify(curDownloads));
        if (typeof renderDownloadsList === 'function') renderDownloadsList();

        window.AndroidApp.startNativeDownload(
          downloadId,
          proxiedDownloadUrl,
          title,
          opts.poster || '',
          opts.quality || '480P',
          opts.season || 0,
          opts.episode || 0,
          !!opts.isSeries,
          bnSubUrl,
          enSubUrl,
          JSON.stringify(curItem)
        );

        if (typeof showToast === 'function') {
          showToast(`📥 মুভিবক্স ডাউনলোড শুরু হয়েছে: "${title}" (${opts.quality})`);
        }
        return Promise.resolve();
      }

      return origDownloadMedia(cleanUrl, title, opts, resumeExistingId);
    };
    window.downloadMedia._hasCleanHook = true;
  }

  // Hook fobsDownloadQueue for bulletproof sequential downloading
  if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
    const origQueueProcessNext = window.fobsDownloadQueue.processNext.bind(window.fobsDownloadQueue);
    window.fobsDownloadQueue.processNext = async function() {
      const now = Date.now();
      const activeTasks = window.activeDownloadTasks || {};
      const isAnyActive = Object.values(activeTasks).some(t => t && t.isDownloading && !t.isPaused);
      if (window.fobsDownloadQueue.isProcessing && !isAnyActive && (now - (window.fobsDownloadQueue._lastProcessStart || 0) > 30000)) {
        console.warn('Resetting stuck fobsDownloadQueue lock in live-patch');
        window.fobsDownloadQueue.isProcessing = false;
      }
      repairStuckDownloads();
      return origQueueProcessNext();
    };
  }

  // -------------------------------------------------------------
  // 13. Stop Background Video & Audio on Downloads View
  // -------------------------------------------------------------
  function stopBackgroundMedia() {
    try {
      const videoPlayer = document.getElementById('mainVideoPlayer');
      if (videoPlayer) {
        videoPlayer.pause();
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
    if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      window.fobsDownloadQueue.processNext();
    }
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

  // Auto-wakeup download queue on network change or visibility resume
  window.addEventListener('online', () => {
    if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      window.fobsDownloadQueue.processNext();
    }
  });
  // Auto-pause video and silence audio when screen is locked or power button is pressed
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const vp = document.getElementById('mainVideoPlayer');
      if (vp && !vp.paused) {
        vp.pause();
      }
    } else if (document.visibilityState === 'visible' && window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      window.fobsDownloadQueue.processNext();
    }
  });

  // -------------------------------------------------------------
  // 14. Ongoing Watchdog
  // -------------------------------------------------------------
  setInterval(() => {
    stripVideoPoster();
    restoreOnlineWatchPills();
    setupDownloadModalObserver();
  }, 1500);

  // Background queue check and repair every 8 seconds
  setInterval(() => {
    repairStuckDownloads();
    if (window.fobsDownloadQueue && typeof window.fobsDownloadQueue.processNext === 'function') {
      const list = (typeof getStoredDownloadsList === 'function') ? getStoredDownloadsList() : [];
      if (list.some(d => d && d.status === 'queued')) {
        window.fobsDownloadQueue.processNext();
      }
    }
  }, 8000);

  restoreOnlineWatchPills();
  purgeFake140MB();
  repairStuckDownloads();
  setupDownloadModalObserver();

  console.log('✅ FOBS TV Live Patch v1.4.0 active: MovieBox Device Storage, Dual Offline Subtitles, Zero-Hang Range Seek.');
})();