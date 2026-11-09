// FOBS TV Live OTA Patch Bundle v1.0.5
// Updates applied here execute live across all user devices without requiring a new APK!
(function () {
  console.log('⚡ FOBS TV Live Patch v1.0.5 executing...');

  // 1. Inject CSS to suppress Chromium / Android WebView internal black play circle overlay
  try {
    const styleId = 'fobs-patch-style-v105';
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

  // 2. Load Series Episodes Quality Info (Auto-detects available resolutions like MovieBox)
  window.loadSeriesEpisodesQualityInfo = async function(media, seasonNum = 1) {
    if (!media) return;
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const dPath = media.detailPath || media.mbDetailPath || '';
    if (!sId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seasonNum}&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.episodes) && data.episodes.length > 0) {
        media._episodesInfo = data.episodes;

        const curQ = parseInt(window.appState?.currentQuality || '480p', 10) || 480;
        const hasCurQ = data.episodes.some(info => Array.isArray(info.qualities) && info.qualities.some(q => q.resolution === curQ));

        if (!hasCurQ) {
          const availResolutions = new Set();
          data.episodes.forEach(info => {
            (info.qualities || []).forEach(q => {
              if (q.resolution) availResolutions.add(q.resolution);
            });
          });
          const sorted = Array.from(availResolutions).sort((a, b) => a - b);
          if (sorted.length > 0) {
            const fallbackQ = sorted[0];
            console.log(`[FOBS TV Patch] Quality ${curQ}p has 0 episodes. Switching to ${fallbackQ}p`);
            if (window.appState) window.appState.currentQuality = `${fallbackQ}p`;
            if (typeof window.updateQualityDisplay === 'function') window.updateQualityDisplay(`${fallbackQ}p`);
          }
        }

        if (typeof window.getActiveSeasonEpisodes === 'function' && typeof window.renderEpisodePills === 'function') {
          const activeEpisodes = window.getActiveSeasonEpisodes(media);
          if (activeEpisodes) {
            window.renderEpisodePills(activeEpisodes, window.appState?.currentEpisodeIndex || 0);
          }
        }
      }
    } catch (err) {
      console.warn('loadSeriesEpisodesQualityInfo patch error:', err);
    }
  };

  // 3. Render Episode Pills strictly filtered by quality (MovieBox exact match!)
  window.renderEpisodePills = function(episodes, activeIndex) {
    const row = document.getElementById('episodesListRow');
    if (!row) return;

    const currentMedia = window.appState?.currentMedia;
    const curQ = parseInt(window.appState?.currentQuality || '480p', 10) || 480;
    const episodesInfo = (currentMedia && currentMedia._episodesInfo) || [];

    let visibleEpisodes = [];
    episodes.forEach((ep, idx) => {
      const epNum = ep ? (ep.number ?? ep.episodeNumber ?? ep.episode ?? (idx + 1)) : (idx + 1);
      const info = episodesInfo.find(it => it.episode === epNum);
      
      if (episodesInfo.length > 0) {
        if (info && Array.isArray(info.qualities) && info.qualities.length > 0) {
          const hasQ = info.qualities.some(q => q.resolution === curQ);
          if (hasQ) {
            visibleEpisodes.push({ ep, idx, epNum });
          }
        }
      } else {
        visibleEpisodes.push({ ep, idx, epNum });
      }
    });

    if (visibleEpisodes.length === 0 && episodes.length > 0) {
      row.innerHTML = `
        <div style="font-size: 12px; color: #f59e0b; padding: 8px 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.25); display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>${curQ}P তে কোনো পর্ব নেই (${curQ === 480 ? '720P বা 1080P সিলেক্ট করুন' : 'অন্য কোয়ালিটি সিলেক্ট করুন'})</span>
        </div>
      `;
      return;
    }

    row.innerHTML = `
      <button class="ep-pill ep-all">All</button>
      ${visibleEpisodes.map(item => {
        const { ep, idx, epNum } = item;
        const formatted = typeof epNum === 'number'
          ? (epNum < 10 ? '0' + epNum : String(epNum))
          : String(epNum).replace(/^ep\s*/i, '').padStart(2, '0');
        return `
          <button class="ep-pill ${idx === activeIndex ? 'active' : ''}" onclick="selectEpisode(${idx})">
            ${formatted}
          </button>
        `;
      }).join('')}
    `;
  };

  // 4. Hook Quality Switcher to re-render episode pills dynamically
  const origSelectVideoQuality = window.selectVideoQuality;
  if (typeof origSelectVideoQuality === 'function' && !origSelectVideoQuality._hasFilterPatch) {
    window.selectVideoQuality = function(quality, isAuto = false) {
      origSelectVideoQuality(quality, isAuto);
      if (window.appState && window.appState.currentMedia) {
        const media = window.appState.currentMedia;
        if (media.type === 'series' || media.seasons || media.episodes) {
          if (typeof window.getActiveSeasonEpisodes === 'function' && typeof window.renderEpisodePills === 'function') {
            const activeEps = window.getActiveSeasonEpisodes(media);
            if (activeEps) {
              window.renderEpisodePills(activeEps, window.appState.currentEpisodeIndex || 0);
            }
          }
        }
      }
    };
    window.selectVideoQuality._hasFilterPatch = true;
  }

  // 5. Dynamic Episode Real Size & Resolution Fetcher for Downloader
  window.fetchExactEpisodesSizes = async function(media, seasonNum) {
    if (!media) return;
    const sId = media.subjectId || media.mbSubjectId || (media.id && media.id.startsWith('mb-s-') ? media.id.replace('mb-s-', '') : null) || (media.id && media.id.startsWith('mb-m-') ? media.id.replace('mb-m-', '').replace(/-hindi$/, '') : null) || '';
    const dPath = media.detailPath || media.mbDetailPath || '';
    if (!sId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/moviebox/episodes-info?id=${encodeURIComponent(sId)}&path=${encodeURIComponent(dPath)}&se=${seasonNum}&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.episodes) && data.episodes.length > 0) {
        media._episodesInfo = data.episodes;

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
        }
      }
    } catch (err) {
      console.warn('Live patch fetchExactEpisodesSizes error:', err.message);
    }
  };

  // 6. Batch Downloader Episode List (Strict MovieBox Quality Match)
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
    const episodesInfo = (media && media._episodesInfo) || [];

    let filteredEpisodes = [];
    allEpisodes.forEach((ep, origIdx) => {
      const epNum = ep ? (ep.episode ?? ep.episodeNumber ?? ep.number ?? (origIdx + 1)) : (origIdx + 1);
      const info = episodesInfo.find(it => it.episode === epNum);
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

    if (filteredEpisodes.length === 0 && allEpisodes.length > 0) {
      scrollList.innerHTML = `
        <div style="text-align: center; color: #f59e0b; padding: 30px 15px; font-size: 13px;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
          <span>${curQ} তে কোনো পর্ব নেই। উপরে 720P বা 1080P সিলেক্ট করুন।</span>
        </div>
      `;
      const totalCountEl = document.getElementById('dlTotalEpsCount');
      if (totalCountEl) totalCountEl.innerText = 0;
      if (window.appState) {
        window.appState._batchDownload = {
          media,
          isSeries: true,
          season: seasonNum,
          episodes: [],
          selected: new Set()
        };
      }
      if (typeof window.updateBatchSelectedSummary === 'function') window.updateBatchSelectedSummary();
      return;
    }

    const selectedSet = new Set(filteredEpisodes.map((_, i) => i));
    if (window.appState) {
      window.appState._batchDownload = {
        media,
        isSeries: true,
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

    scrollList.innerHTML = window.appState._batchDownload.episodes.map((ep, idx) => {
      const epNum = ep.episode ?? ep.episodeNumber ?? ep.number ?? (idx + 1);
      const epTitle = ep.title ? ep.title : `Episode ${epNum}`;
      const estSizeStr = ep.realSizeText || (typeof window.getEpisodeEstimatedSize === 'function' ? window.getEpisodeEstimatedSize(curQ, ep, idx) : '~250 MB');
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
            <input type="checkbox" id="dl_ep_chk_${idx}" checked onchange="toggleBatchEpisode(${idx})">
            <span class="dl-checkbox-custom"><i class="fa-solid fa-check"></i></span>
          </label>
        </div>
      `;
    }).join('');

    const totalCountEl = document.getElementById('dlTotalEpsCount');
    if (totalCountEl) totalCountEl.innerText = window.appState._batchDownload.episodes.length;

    const selectAllChk = document.getElementById('dlSelectAllCheckbox');
    if (selectAllChk) selectAllChk.checked = true;

    if (typeof window.updateBatchSelectedSummary === 'function') window.updateBatchSelectedSummary();
    if (episodesInfo.length === 0) {
      window.fetchExactEpisodesSizes(media, seasonNum);
    }
  };

  // 7. Batch Quality Switcher
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

  // 8. Auto-Purge Fake 140MB Artifacts from LocalStorage
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

          // Repair clamped fake 140MB or rec > tot
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
          if (item.sizeText && (item.sizeText.includes('/ 140.0 MB') || item.sizeText.includes('/ 140 MB') || item.sizeText.includes('~140 MB') || item.sizeText === '140.0 MB' || item.sizeText === '140 MB')) {
            if (rec > 0) {
              const dMb = (rec / 1048576).toFixed(1);
              const tMb = (Math.max(tot, rec) / 1048576).toFixed(1);
              item.sizeText = `${dMb} MB / ${tMb} MB`;
            } else {
              item.sizeText = item.realSizeText || 'Checking size...';
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
    console.warn('Live patch downloads cleanup error:', e);
  }

  // 9. Patch getStoredDownloadsList
  window.getStoredDownloadsList = function() {
    try {
      const raw = localStorage.getItem('fobs_downloads') || '[]';
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      let modified = false;
      list.forEach(item => {
        if (!item) return;
        const rec = item.receivedBytes || 0;
        const tot = item.totalBytes || 0;
        if (rec > 0 && (tot < rec || tot === 146800640 || !tot)) {
          item.totalBytes = Math.max(tot, rec);
          const dMb = (rec / 1048576).toFixed(1);
          const tMb = (item.totalBytes / 1048576).toFixed(1);
          item.sizeText = item.status === 'Ready (Offline)' ? `${tMb} MB` : `${dMb} MB / ${tMb} MB`;
          modified = true;
        } else if (item.sizeText && (item.sizeText.includes('/ 140.0 MB') || item.sizeText.includes('/ 140 MB') || item.sizeText === '140.0 MB')) {
          if (rec > 0) {
            item.totalBytes = Math.max(tot, rec);
            const dMb = (rec / 1048576).toFixed(1);
            const tMb = (item.totalBytes / 1048576).toFixed(1);
            item.sizeText = `${dMb} MB / ${tMb} MB`;
          } else {
            item.sizeText = item.realSizeText || 'Checking size...';
          }
          modified = true;
        }
      });
      if (modified) {
        try { localStorage.setItem('fobs_downloads', JSON.stringify(list)); } catch (e) {}
      }
      return list;
    } catch (e) {
      return [];
    }
  };

  console.log('✅ FOBS TV Live Patch v1.0.5 applied successfully.');
})();
