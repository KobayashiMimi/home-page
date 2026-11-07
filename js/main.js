(function () {
  'use strict';

  const photos = Array.isArray(window.PORTFOLIO_PHOTOS) ? window.PORTFOLIO_PHOTOS : [];
  const totalPhotos = photos.length;

  // DOM Elements
  const sections = {
    top: document.getElementById('view-top'),
    self: document.getElementById('view-self'),
    photographs: document.getElementById('view-portfolio'),
    films: document.getElementById('view-films'),
    contact: document.getElementById('view-contact')
  };

  const navLinks = document.querySelectorAll('[data-nav]');
  const gridContainer = document.getElementById('photobook-grid');
  const portfolioCountEl = document.getElementById('portfolio-count');
  const layoutButtons = document.querySelectorAll('[data-layout]');
  const topHeroImg = document.getElementById('top-hero-img');
  const topHeroImgNext = document.getElementById('top-hero-img-next');

  // Viewer Modal Elements
  const viewerModal = document.getElementById('viewer-modal');
  const viewerImg = document.getElementById('viewer-img');
  const viewerImgNext = document.getElementById('viewer-img-next');
  const viewerPrevBtn = document.getElementById('viewer-prev');
  const viewerNextBtn = document.getElementById('viewer-next');
  const viewerTapPrev = document.getElementById('viewer-tap-prev');
  const viewerTapNext = document.getElementById('viewer-tap-next');
  const viewerCounter = document.getElementById('viewer-counter');
  const viewerCloseBtn = document.getElementById('viewer-close');
  const viewerStage = document.getElementById('viewer-stage');

  let currentView = 'top';
  let currentPhotoIndex = -1; // 0-based index into photos[]
  let isViewerOpen = false;
  let activeViewerLayer = 0; // 0 = viewerImg, 1 = viewerImgNext
  let savedScrollY = 0;
  let plateObserver = null;
  let filmsObserver = null;

  function setupPlateScrollReveal() {
    if (!gridContainer) return;
    const plates = gridContainer.querySelectorAll('.photo-plate');

    if (!('IntersectionObserver' in window)) {
      plates.forEach((el) => el.classList.add('is-in-view'));
      return;
    }

    if (plateObserver) {
      plateObserver.disconnect();
    }

    plateObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in-view');
            plateObserver.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.1
      }
    );

    plates.forEach((el) => {
      if (!el.classList.contains('is-in-view')) {
        plateObserver.observe(el);
      }
    });
  }

  function setupFilmsScrollReveal(resetExisting = false) {
    if (!sections.films) return;
    const targets = sections.films.querySelectorAll('.film-video-wrap, .film-caption, .film-still-img');

    if (resetExisting) {
      targets.forEach((el) => {
        el.classList.remove('is-in-view');
        el.style.transitionDelay = '';
      });
    }

    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in-view'));
      return;
    }

    if (filmsObserver) {
      filmsObserver.disconnect();
    }

    // Track whether this is the initial batch visible on opening the Films view
    let isInitialBatch = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isInitialBatch = false;
      });
    });

    filmsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            if (el.classList.contains('film-still-img')) {
              const siblings = el.parentElement
                ? Array.from(el.parentElement.querySelectorAll('.film-still-img'))
                : [];
              const idxInGroup = siblings.indexOf(el);
              if (isInitialBatch && idxInGroup >= 0 && idxInGroup < 2) {
                // Gentle delayed fade for the first 2 photos of "東京" right after the section opens
                el.style.transitionDelay = `${0.42 + idxInGroup * 0.14}s`;
              } else if (idxInGroup >= 0) {
                el.style.transitionDelay = `${(idxInGroup % 2) * 0.12}s`;
              }
            }
            el.classList.add('is-in-view');
            filmsObserver.unobserve(el);
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.12
      }
    );

    targets.forEach((el) => {
      if (!el.classList.contains('is-in-view')) {
        filmsObserver.observe(el);
      }
    });
  }

  // Explicitly featured 1-based photo numbers requested to be displayed large
  const FEATURE_NUMBERS = new Set([1, 7, 14, 31, 40, 47, 56, 59, 65, 78, 81, 92, 96, 111]);

  // Balanced 2-photo diptych templates (Left + Right always complete a 12-col row; min size = 5 cols = photo 025 size)
  const DIPTYCH_PAIRS = [
    ['pair-lg-left', 'pair-min-right-low'],     // Left 7 cols + Right 5 cols (offset lower)
    ['pair-min-left', 'pair-md-right-high'],    // Left 5 cols + Right 6 cols (offset higher)
    ['pair-md-left', 'pair-min-right'],         // Left 6 cols + Right 5 cols
    ['pair-min-left-low', 'pair-lg-right'],     // Left 5 cols (offset lower) + Right 7 cols
    ['pair-min-left-in', 'pair-min-right-in']   // Left 5 cols + Right 5 cols (gentle offset)
  ];

  // Balanced 1-photo solo templates (always centered or near-center so weight never leans awkwardly)
  const SOLO_PLATES = [
    'solo-md-center',     // Cols 4..9  (6 cols)
    'solo-md-left-mid',   // Cols 3..8  (6 cols)
    'solo-lg-right-mid',  // Cols 4..10 (7 cols)
    'solo-lg-left-mid'    // Cols 3..9  (7 cols)
  ];

  // Compose a complete, orphan-free spread layout for all photos
  function computeSpreadClasses() {
    const classes = new Array(totalPhotos);
    let pairCursor = 0;
    let soloCursor = 0;
    let featPortraitCursor = 0;
    let featLandscapeCursor = 0;

    // Group photo indices (0-based) into contiguous segments separated by FEATURE_NUMBERS
    const segments = [];
    let currentSeg = [];

    for (let i = 0; i < totalPhotos; i++) {
      const photoNum = i + 1;
      if (FEATURE_NUMBERS.has(photoNum)) {
        if (currentSeg.length > 0) {
          segments.push({ type: 'segment', indices: currentSeg });
          currentSeg = [];
        }
        segments.push({ type: 'feature', index: i, photoNum: photoNum });
      } else {
        currentSeg.push(i);
      }
    }
    if (currentSeg.length > 0) {
      segments.push({ type: 'segment', indices: currentSeg });
    }

    segments.forEach((seg) => {
      if (seg.type === 'feature') {
        const idx = seg.index;
        const p = photos[idx];
        if (seg.photoNum === 1) {
          classes[idx] = 'feature-opening-xl';
        } else if (seg.photoNum === 111) {
          classes[idx] = 'feature-portrait-center';
        } else if (p && p.orientation === 'landscape') {
          const landscapeFeatureStyles = [
            'feature-landscape-xl',
            'feature-landscape-left',
            'feature-landscape-right'
          ];
          classes[idx] = landscapeFeatureStyles[featLandscapeCursor % landscapeFeatureStyles.length];
          featLandscapeCursor++;
        } else {
          const portraitFeatureStyles = [
            'feature-portrait-center',
            'feature-portrait-left',
            'feature-portrait-right'
          ];
          classes[idx] = portraitFeatureStyles[featPortraitCursor % portraitFeatureStyles.length];
          featPortraitCursor++;
        }
      } else {
        const list = seg.indices;
        const len = list.length;
        // If segment has an odd number of photos, place 1 solo at an even index near the middle
        // so that both before and after the solo are an even number of photos (100% complete pairs).
        const soloAt = len % 2 === 1 ? Math.floor(len / 4) * 2 : -1;
        let i = 0;

        while (i < len) {
          if (i === soloAt) {
            classes[list[i]] = SOLO_PLATES[soloCursor % SOLO_PLATES.length];
            soloCursor++;
            i += 1;
          } else {
            const pair = DIPTYCH_PAIRS[pairCursor % DIPTYCH_PAIRS.length];
            pairCursor++;
            classes[list[i]] = pair[0];
            classes[list[i + 1]] = pair[1];
            i += 2;
          }
        }
      }
    });

    return classes;
  }

  function formatNumber(num) {
    return String(num).padStart(3, '0');
  }

  // Build Photobook Grid
  function renderGrid() {
    if (!gridContainer) return;
    if (portfolioCountEl) {
      portfolioCountEl.textContent = `${formatNumber(totalPhotos)} photographs`;
    }

    const spreadClasses = computeSpreadClasses();
    const fragment = document.createDocumentFragment();

    photos.forEach((photo, idx) => {
      const article = document.createElement('article');
      const spreadClass = spreadClasses[idx] || 'pair-min-left';
      const orientClass = photo.orientation === 'portrait' ? 'is-portrait' : 'is-landscape';
      article.className = `photo-plate ${spreadClass} ${orientClass}`;
      article.setAttribute('role', 'button');
      article.setAttribute('tabindex', '0');
      article.setAttribute('aria-label', `Photograph ${formatNumber(photo.index)}`);
      article.dataset.index = String(idx);

      const frame = document.createElement('div');
      frame.className = 'photo-plate-frame';

      const img = document.createElement('img');
      img.className = 'photo-plate-img';
      // Use high-res asset for feature plates and large plates so they are crisp at large sizes
      const useHighRes =
        spreadClass.startsWith('feature-') ||
        spreadClass.includes('-lg-') ||
        spreadClass.includes('-md-');
      img.src = useHighRes ? photo.src : photo.thumb;
      img.width = photo.width;
      img.height = photo.height;
      img.alt = `小林ミミ 写真作品 ${formatNumber(photo.index)}`;
      img.loading = idx < 6 ? 'eager' : 'lazy';
      img.decoding = 'async';

      if (img.complete) {
        img.classList.add('is-loaded');
      } else {
        img.addEventListener('load', () => {
          img.classList.add('is-loaded');
        });
      }

      const num = document.createElement('span');
      num.className = 'photo-plate-num';
      num.textContent = formatNumber(photo.index);

      frame.appendChild(img);
      article.appendChild(frame);
      article.appendChild(num);

      article.addEventListener('click', () => {
        openViewer(idx, true);
      });

      article.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openViewer(idx, true);
        }
      });

      fragment.appendChild(article);
    });

    gridContainer.appendChild(fragment);
    setupPlateScrollReveal();
  }

  // Switch Main View (top / self / photographs / contact)
  function switchView(viewName, scrollToTop = true) {
    if (!sections[viewName]) {
      viewName = 'top';
    }
    currentView = viewName;

    Object.keys(sections).forEach((key) => {
      const el = sections[key];
      if (!el) return;
      if (key === viewName) {
        if (viewName === 'films') {
          const filmTargets = el.querySelectorAll('.film-video-wrap, .film-caption, .film-still-img');
          filmTargets.forEach((t) => {
            t.classList.remove('is-in-view');
            t.style.transitionDelay = '';
          });
        }
        el.classList.add('is-active');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.classList.add('is-visible');
            if (viewName === 'photographs') {
              setupPlateScrollReveal();
            } else if (viewName === 'films') {
              setupFilmsScrollReveal(false);
            }
          });
        });
      } else {
        el.classList.remove('is-visible');
        el.classList.remove('is-active');
      }
    });

    navLinks.forEach((link) => {
      if (link.dataset.nav === viewName) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    });

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  // Preload adjacent full-resolution images for seamless page turning
  function preloadAdjacent(idx) {
    [idx - 1, idx + 1].forEach((neighborIdx) => {
      if (neighborIdx >= 0 && neighborIdx < totalPhotos) {
        const pre = new Image();
        pre.src = photos[neighborIdx].src;
      }
    });
  }

  // Show specific photo in Viewer with smooth crossfade
  function showPhotoAt(idx, updateHash = true) {
    if (idx < 0 || idx >= totalPhotos) return;
    currentPhotoIndex = idx;
    const photo = photos[idx];

    const nextSrc = photo.src;
    const altText = `小林ミミ 写真作品 ${formatNumber(photo.index)}`;
    const incomingEl = activeViewerLayer === 0 ? viewerImgNext : viewerImg;
    const outgoingEl = activeViewerLayer === 0 ? viewerImg : viewerImgNext;

    const tempImg = new Image();
    tempImg.onload = () => {
      if (currentPhotoIndex !== idx || !incomingEl || !outgoingEl) return;
      activeViewerLayer = activeViewerLayer === 0 ? 1 : 0;

      incomingEl.classList.remove('is-loaded', 'is-active');
      incomingEl.src = nextSrc;
      incomingEl.alt = altText;

      // Force style flush so transition from opacity 0 -> 1 always animates smoothly
      void incomingEl.offsetWidth;

      requestAnimationFrame(() => {
        incomingEl.classList.add('is-loaded', 'is-active');
        outgoingEl.classList.remove('is-active');
      });
    };
    tempImg.src = nextSrc;

    // Update prev / next buttons (matching STUDIO "-" style at boundaries)
    if (idx <= 0) {
      viewerPrevBtn.textContent = '-';
      viewerPrevBtn.disabled = true;
      viewerTapPrev.classList.add('is-disabled');
    } else {
      viewerPrevBtn.textContent = 'prev';
      viewerPrevBtn.disabled = false;
      viewerTapPrev.classList.remove('is-disabled');
    }

    if (idx >= totalPhotos - 1) {
      viewerNextBtn.textContent = '-';
      viewerNextBtn.disabled = true;
      viewerTapNext.classList.add('is-disabled');
    } else {
      viewerNextBtn.textContent = 'next';
      viewerNextBtn.disabled = false;
      viewerTapNext.classList.remove('is-disabled');
    }

    if (viewerCounter) {
      viewerCounter.textContent = `${formatNumber(photo.index)} / ${formatNumber(totalPhotos)}`;
    }

    if (updateHash) {
      const targetHash = `#photo/${formatNumber(photo.index)}`;
      if (window.location.hash !== targetHash) {
        history.replaceState(null, '', targetHash);
      }
    }

    preloadAdjacent(idx);
  }

  function openViewer(idx, pushState = true) {
    if (idx < 0 || idx >= totalPhotos) return;
    if (!isViewerOpen) {
      savedScrollY = window.scrollY;
      isViewerOpen = true;
      if (viewerImg) viewerImg.classList.remove('is-active', 'is-loaded');
      if (viewerImgNext) viewerImgNext.classList.remove('is-active', 'is-loaded');
      viewerModal.classList.add('is-open');
      viewerModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    const photo = photos[idx];
    if (pushState) {
      const targetHash = `#photo/${formatNumber(photo.index)}`;
      if (window.location.hash !== targetHash) {
        history.pushState(null, '', targetHash);
      }
    }
    showPhotoAt(idx, false);
  }

  function closeViewer(updateHash = true) {
    if (!isViewerOpen) return;
    isViewerOpen = false;
    viewerModal.classList.remove('is-open');
    viewerModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (currentView !== 'photographs') {
      switchView('photographs', false);
    }

    window.scrollTo({ top: savedScrollY, behavior: 'instant' });

    if (updateHash) {
      history.pushState(null, '', '#photographs');
    }
  }

  function goPrev() {
    if (!isViewerOpen) return;
    if (currentPhotoIndex > 0) {
      showPhotoAt(currentPhotoIndex - 1, true);
    }
  }

  function goNext() {
    if (!isViewerOpen) return;
    if (currentPhotoIndex < totalPhotos - 1) {
      showPhotoAt(currentPhotoIndex + 1, true);
    }
  }

  // Handle URL Hash Routing
  function handleHashChange() {
    const rawHash = window.location.hash.replace(/^#/, '').trim();

    if (rawHash.startsWith('photo/')) {
      const numPart = parseInt(rawHash.slice(6), 10);
      const idx = Number.isFinite(numPart) ? numPart - 1 : 0;
      if (currentView !== 'photographs') {
        switchView('photographs', false);
      }
      openViewer(Math.max(0, Math.min(totalPhotos - 1, idx)), false);
      return;
    }

    if (isViewerOpen) {
      closeViewer(false);
    }

    if (rawHash === 'portfolio') {
      switchView('photographs', true);
    } else if (
      rawHash === 'self' ||
      rawHash === 'photographs' ||
      rawHash === 'films' ||
      rawHash === 'contact' ||
      rawHash === 'top'
    ) {
      switchView(rawHash, true);
    } else {
      switchView('top', true);
    }
  }

  // Layout switcher on Photographs Grid
  function setupLayoutSwitch() {
    layoutButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = btn.dataset.layout;
        layoutButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        gridContainer.classList.remove('is-editorial', 'is-uniform-grid', 'is-single-column');
        if (mode === 'uniform') {
          gridContainer.classList.add('is-uniform-grid');
        } else if (mode === 'scroll') {
          gridContainer.classList.add('is-single-column');
        } else {
          gridContainer.classList.add('is-editorial');
        }
        setupPlateScrollReveal();
      });
    });
  }

  // Event Listeners for Viewer
  function setupViewerEvents() {
    viewerPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goPrev();
    });

    viewerNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goNext();
    });

    viewerTapPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      goPrev();
    });

    viewerTapNext.addEventListener('click', (e) => {
      e.stopPropagation();
      goNext();
    });

    viewerCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeViewer(true);
    });

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      if (!isViewerOpen) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeViewer(true);
      }
    });

    // Touch swipe support for smartphones
    let touchStartX = 0;
    let touchStartY = 0;

    viewerStage.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    viewerStage.addEventListener('touchend', (e) => {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    }, { passive: true });
  }

  // Slow, unhurried Top Hero Slideshow (assets/hero-top.jpg + featured photos only)
  const SLIDESHOW_INTERVAL_MS = 5000;
  let slideshowTimer = null;
  let slideshowList = [];
  let currentSlideIdx = 0;
  let activeHeroLayer = 0; // 0 = topHeroImg, 1 = topHeroImgNext

  function buildSlideshowList() {
    const list = ['assets/hero-top.jpg'];
    const seen = new Set(list);

    photos.forEach((p) => {
      if (FEATURE_NUMBERS.has(p.index) && !seen.has(p.src)) {
        seen.add(p.src);
        list.push(p.src);
      }
    });

    return list;
  }

  function advanceTopSlideshow() {
    if (currentView !== 'top' || isViewerOpen || document.hidden) return;
    if (!topHeroImg || !topHeroImgNext || slideshowList.length < 2) return;

    const nextIdx = (currentSlideIdx + 1) % slideshowList.length;
    const nextSrc = slideshowList[nextIdx];
    const incomingEl = activeHeroLayer === 0 ? topHeroImgNext : topHeroImg;
    const outgoingEl = activeHeroLayer === 0 ? topHeroImg : topHeroImgNext;

    const preloader = new Image();
    preloader.onload = () => {
      if (currentView !== 'top') return;
      currentSlideIdx = nextIdx;
      activeHeroLayer = activeHeroLayer === 0 ? 1 : 0;

      incomingEl.classList.remove('is-loaded');
      incomingEl.src = nextSrc;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          incomingEl.classList.add('is-loaded', 'is-active');
          outgoingEl.classList.remove('is-active');
        });
      });
    };
    preloader.src = nextSrc;
  }

  function setupTopSlideshow() {
    if (!topHeroImg) return;

    if (topHeroImg.complete) {
      topHeroImg.classList.add('is-loaded');
    } else {
      topHeroImg.addEventListener('load', () => {
        topHeroImg.classList.add('is-loaded');
      });
    }

    slideshowList = buildSlideshowList();
    if (slideshowList.length > 1 && topHeroImgNext) {
      // Preload the second slide quietly
      const pre = new Image();
      pre.src = slideshowList[1];
    }

    if (slideshowTimer) clearInterval(slideshowTimer);
    slideshowTimer = setInterval(advanceTopSlideshow, SLIDESHOW_INTERVAL_MS);
  }

  // Background Loop Audio (assets/birth.m4a)
  function setupBackgroundAudio() {
    const bgAudio = document.getElementById('bg-audio');
    if (!bgAudio) return;

    const audioSrc = 'assets/birth.m4a';
    if (!bgAudio.getAttribute('src') || bgAudio.getAttribute('src') !== audioSrc) {
      bgAudio.setAttribute('src', audioSrc);
      bgAudio.load();
    }

    bgAudio.loop = true;
    bgAudio.volume = 0.28;

    let isPlaying = false;

    const tryPlay = () => {
      if (document.hidden) return;
      if (!bgAudio.paused && !bgAudio.ended) {
        isPlaying = true;
        removeUnlockListeners();
        return;
      }

      bgAudio.volume = 0.28;
      const playPromise = bgAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (!bgAudio.paused) {
              isPlaying = true;
              removeUnlockListeners();
            }
          })
          .catch(() => {
            // Browser blocked initial unmuted autoplay; will start on next user gesture
          });
      }
    };

    // Use capture: true so e.stopPropagation() on buttons/photos never blocks audio unlock
    const unlockEvents = ['click', 'pointerup', 'touchend', 'keydown', 'pointerdown', 'touchstart'];
    const listenerOpts = { capture: true, passive: true };

    const onFirstInteraction = () => {
      if (isPlaying && !bgAudio.paused) {
        removeUnlockListeners();
        return;
      }
      tryPlay();
    };

    function removeUnlockListeners() {
      unlockEvents.forEach((evt) => {
        document.removeEventListener(evt, onFirstInteraction, listenerOpts);
        window.removeEventListener(evt, onFirstInteraction, listenerOpts);
      });
    }

    unlockEvents.forEach((evt) => {
      document.addEventListener(evt, onFirstInteraction, listenerOpts);
      window.addEventListener(evt, onFirstInteraction, listenerOpts);
    });

    bgAudio.addEventListener('playing', () => {
      isPlaying = true;
      removeUnlockListeners();
    });

    // Ensure seamless loop fallback
    bgAudio.addEventListener('ended', () => {
      bgAudio.currentTime = 0;
      tryPlay();
    });

    // Pause when tab/window is hidden or closed, resume when visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        bgAudio.pause();
      } else {
        tryPlay();
      }
    });

    tryPlay();
  }

  // Initialize
  function init() {
    setupTopSlideshow();
    setupBackgroundAudio();

    renderGrid();
    setupFilmsScrollReveal();
    setupLayoutSwitch();
    setupViewerEvents();

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
