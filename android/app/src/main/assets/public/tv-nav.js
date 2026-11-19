/**
 * FOBS TV - Smart TV Remote (D-Pad) & PC Keyboard Navigation Engine
 * Fully compatible with Android TV, Tizen, webOS & PC Keyboard
 */
(function () {
  'use strict';

  let currentFocused = null;
  let isNavActive = false;

  const FOCUSABLE_SELECTOR = [
    '.nav-tab-pill',
    '.nav-me-btn',
    '#searchInput',
    '.search-btn',
    '.btn-hero-watch',
    '.btn-hero-list',
    '.btn-hero-info',
    '.tv-nav-item',
    '.media-card',
    '.bottom-tab-item',
    '.category-pill',
    '.hero-backdrop-track',
    '.hero-peek-card',
    '.hero-bottom-slider',
    '.live-channel-card',
    '.channel-card',
    '.genre-card',
    '.action-btn',
    '.nav-icon-btn',
    '.search-input',
    '.player-control-btn',
    '.episode-item',
    '.server-btn',
    '.subtitle-option',
    '.details-close-btn',
    '.modal-close-btn'
  ].join(', ');

  function getVisibleFocusables() {
    // If player is open, only allow player controls
    const isPlayerOpen = document.body.classList.contains('player-open') || 
                         document.body.classList.contains('is-fullscreen') ||
                         document.querySelector('.player-view-overlay.open');

    if (isPlayerOpen) {
      const playerOverlay = document.querySelector('.player-view-overlay');
      if (playerOverlay) {
        return Array.from(playerOverlay.querySelectorAll('button, .player-control-btn, .episode-item, [tabindex="0"]'))
          .filter(isVisible);
      }
    }

    // If a modal or sheet is open, constrain to it
    const activeModal = document.querySelector('.details-modal.open, .media-detail-overlay.open, .mb-fullscreen-page-overlay:not([style*="display: none"])');
    if (activeModal) {
      return Array.from(activeModal.querySelectorAll('button, .details-btn, .episode-pill, .server-btn, [tabindex="0"]'))
        .filter(isVisible);
    }

    return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  }

  function isVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function setFocus(el) {
    if (!el) return;
    if (currentFocused && currentFocused !== el) {
      currentFocused.classList.remove('tv-focused');
    }
    currentFocused = el;
    currentFocused.classList.add('tv-focused');
    try {
      currentFocused.focus({ preventScroll: true });
    } catch (_) {}

    // Smooth scroll into view
    try {
      currentFocused.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    } catch (_) {}
    isNavActive = true;
  }

  function findNextInDirection(direction) {
    const focusables = getVisibleFocusables();
    if (!focusables.length) return null;

    if (!currentFocused || !document.body.contains(currentFocused) || !isVisible(currentFocused)) {
      // Pick first visible item
      return focusables[0];
    }

    const curRect = currentFocused.getBoundingClientRect();
    const curX = curRect.left + curRect.width / 2;
    const curY = curRect.top + curRect.height / 2;

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const el of focusables) {
      if (el === currentFocused) continue;
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2;
      const targetY = rect.top + rect.height / 2;

      const dx = targetX - curX;
      const dy = targetY - curY;

      let isValidDirection = false;
      let primaryDist = 0;
      let secondaryDist = 0;

      if (direction === 'right') {
        isValidDirection = targetX > curX + 10;
        primaryDist = dx;
        secondaryDist = Math.abs(dy);
      } else if (direction === 'left') {
        isValidDirection = targetX < curX - 10;
        primaryDist = -dx;
        secondaryDist = Math.abs(dy);
      } else if (direction === 'down') {
        isValidDirection = targetY > curY + 10;
        primaryDist = dy;
        secondaryDist = Math.abs(dx);
      } else if (direction === 'up') {
        isValidDirection = targetY < curY - 10;
        primaryDist = -dy;
        secondaryDist = Math.abs(dx);
      }

      if (isValidDirection) {
        // Weight secondary distance higher to favor staying in same row/column
        const distance = Math.hypot(primaryDist, secondaryDist * 2.2);
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = el;
        }
      }
    }

    return bestCandidate;
  }

  function handleKeyDown(e) {
    const key = e.key || '';
    const keyCode = e.keyCode || e.which;

    // Arrow Navigation
    if (key === 'ArrowRight' || keyCode === 39) {
      const next = findNextInDirection('right');
      if (next) {
        setFocus(next);
        e.preventDefault();
      }
    } else if (key === 'ArrowLeft' || keyCode === 37) {
      const next = findNextInDirection('left');
      if (next) {
        setFocus(next);
        e.preventDefault();
      }
    } else if (key === 'ArrowDown' || keyCode === 40) {
      const next = findNextInDirection('down');
      if (next) {
        setFocus(next);
        e.preventDefault();
      }
    } else if (key === 'ArrowUp' || keyCode === 38) {
      const next = findNextInDirection('up');
      if (next) {
        setFocus(next);
        e.preventDefault();
      }
    } else if (key === 'Enter' || keyCode === 13) {
      if (currentFocused) {
        currentFocused.click();
        e.preventDefault();
      }
    } else if (key === 'Escape' || keyCode === 27 || key === 'Backspace' || keyCode === 8 || keyCode === 10009 || keyCode === 461 || keyCode === 4) {
      // Handle Back Navigation
      // 1. If player open -> exit player
      const isPlayerOpen = document.body.classList.contains('player-open') || 
                           document.body.classList.contains('is-fullscreen') ||
                           document.querySelector('.player-view-overlay.open');
      if (isPlayerOpen) {
        const closeBtn = document.getElementById('playerBackBtn') || document.querySelector('.player-back-btn');
        if (closeBtn) closeBtn.click();
        e.preventDefault();
        return;
      }

      // 2. If details modal open -> close modal
      const closeDetailBtn = document.querySelector('.details-close-btn, .modal-close-btn');
      if (closeDetailBtn && isVisible(closeDetailBtn)) {
        closeDetailBtn.click();
        e.preventDefault();
        return;
      }

      // 3. If in another tab -> switch to Home
      const homeTab = document.querySelector('.bottom-tab-item[data-tab="home"]') || document.querySelector('.bottom-tab-item:first-child');
      if (homeTab && !homeTab.classList.contains('active')) {
        homeTab.click();
        setFocus(homeTab);
        e.preventDefault();
      }
    }
  }

  // Remove focus class on mouse move so mouse usage remains natural
  window.addEventListener('mousemove', function () {
    if (isNavActive && currentFocused) {
      currentFocused.classList.remove('tv-focused');
      isNavActive = false;
    }
  }, { passive: true });

  window.addEventListener('keydown', handleKeyDown);

  console.log('🎮 FOBS TV Remote & Keyboard D-Pad Navigation Engine Active');
})();
