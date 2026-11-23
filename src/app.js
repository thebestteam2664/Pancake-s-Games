const STORAGE_FAVORITES_KEY = 'pancakes_games_favorites_v1';
const STORAGE_SAVES_KEY = 'pancakes_games_saves_v1';
const FEATURED_GAME_IDS = ['1v1-lol', 'football-bros', 'ragdoll-hit', 'fnaf-1', 'slope'];
const FEATURED_AUTO_MS = 5000;

const state = {
  games: [],
  featuredGames: [],
  featuredIndex: 0,
  featuredTimer: null,
  featuredWrapTimeout: null,
  featuredPaused: false,
  wallpaper: {
    paused: false,
  },
  activeCategory: 'All',
  searchQuery: '',
  activeGameId: null,
  sessionStartMs: null,
  autoSaveTimer: null,
  clearedActiveSave: false,
  pendingDeleteAction: null,
  favorites: new Set(),
  saves: {}, // { [gameId]: { savedAt: number, playSeconds: number, note: string } }
  loading: true,
  error: null,
};

const els = {
  brandHomeLink: document.getElementById('brand-home-link'),
  navFilterBtns: document.querySelectorAll('[data-nav-filter]'),
  randomGameBtn: document.getElementById('random-game-btn'),
  heroSection: document.getElementById('hero-section'),
  playerSection: document.getElementById('player-section'),
  playerBackBtn: document.getElementById('player-back-btn'),
  playerSaveStatus: document.getElementById('player-save-status'),
  playerTitle: document.getElementById('player-title'),
  playerMeta: document.getElementById('player-meta'),
  playerDeleteSaveBtn: document.getElementById('player-delete-save-btn'),
  playerFavoriteBtn: document.getElementById('player-favorite-btn'),
  playerReloadBtn: document.getElementById('player-reload-btn'),
  playerDirectLink: document.getElementById('player-direct-link'),
  playerFullscreenBtn: document.getElementById('player-fullscreen-btn'),
  playerMuteStopBtn: document.getElementById('player-mute-stop-btn'),
  playerSaveNote: document.getElementById('player-save-note'),
  playerCopyNoteBtn: document.getElementById('player-copy-note-btn'),
  playerPlaytime: document.getElementById('player-playtime'),
  iframeStage: document.getElementById('iframe-stage'),
  playerControlsText: document.getElementById('player-controls-text'),
  heroPlayFeaturedBtn: document.getElementById('hero-play-featured-btn'),
  heroFullscreenFeaturedBtn: document.getElementById('hero-fullscreen-featured-btn'),
  featuredCarousel: document.getElementById('featured-carousel'),
  featuredTrack: document.getElementById('featured-track'),
  featuredDots: document.getElementById('featured-dots'),
  featuredCounter: document.getElementById('featured-counter'),
  featuredSweep: document.getElementById('featured-sweep'),
  featuredProgressBar: document.getElementById('featured-progress-bar'),
  wallpaperVideo: document.getElementById('wallpaper-video'),
  statTotalGames: document.getElementById('stat-total-games'),
  statSavedCount: document.getElementById('stat-saved-count'),
  statFavoritesCount: document.getElementById('stat-favorites-count'),
  savedSection: document.getElementById('saved-section'),
  savedGrid: document.getElementById('saved-grid'),
  clearSavedBtn: document.getElementById('clear-saved-btn'),
  catalogDeleteAllBtn: document.getElementById('catalog-delete-all-btn'),
  catalogHeading: document.getElementById('catalog-heading'),
  searchInput: document.getElementById('search-input'),
  categoryTabs: document.querySelectorAll('.cat-tab'),
  resultsCount: document.getElementById('results-count'),
  catalogStatus: document.getElementById('catalog-status'),
  gamesGrid: document.getElementById('games-grid'),
  footerTopBtn: document.getElementById('footer-top-btn'),
  deleteConfirmModal: document.getElementById('delete-confirm-modal'),
  deleteConfirmTitle: document.getElementById('delete-confirm-title'),
  deleteConfirmMessage: document.getElementById('delete-confirm-message'),
  deleteConfirmYesBtn: document.getElementById('delete-confirm-yes-btn'),
  deleteConfirmCancelBtn: document.getElementById('delete-confirm-cancel-btn'),
};

function loadLocalStorageState() {
  try {
    const favRaw = localStorage.getItem(STORAGE_FAVORITES_KEY);
    if (favRaw) {
      const parsed = JSON.parse(favRaw);
      if (Array.isArray(parsed)) {
        state.favorites = new Set(parsed.filter((id) => typeof id === 'string'));
      }
    }
  } catch {
    state.favorites = new Set();
  }

  try {
    const savesRaw = localStorage.getItem(STORAGE_SAVES_KEY);
    if (savesRaw) {
      const parsed = JSON.parse(savesRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        state.saves = parsed;
      }
    }
  } catch {
    state.saves = {};
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch {
    // Ignore storage errors
  }
}

function persistSavesToStorage() {
  try {
    if (Object.keys(state.saves).length === 0) {
      localStorage.removeItem(STORAGE_SAVES_KEY);
    } else {
      localStorage.setItem(STORAGE_SAVES_KEY, JSON.stringify(state.saves));
    }
  } catch {
    // Ignore storage errors
  }
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s played`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins}m played`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m played`;
}

function formatRelativeTime(timestamp) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function commitActiveGameSave(explicit = false) {
  if (!state.activeGameId) return;
  if (!explicit && state.clearedActiveSave) return;

  state.clearedActiveSave = false;
  const now = Date.now();
  const prev = state.saves[state.activeGameId] || { savedAt: now, playSeconds: 0, note: '' };
  const elapsedSec = state.sessionStartMs ? Math.max(0, Math.floor((now - state.sessionStartMs) / 1000)) : 0;
  state.sessionStartMs = now;

  const noteVal = els.playerSaveNote ? els.playerSaveNote.value.trim() : prev.note || '';
  state.saves[state.activeGameId] = {
    savedAt: now,
    playSeconds: (prev.playSeconds || 0) + elapsedSec,
    note: noteVal,
  };
  persistSavesToStorage();

  if (els.playerPlaytime) {
    els.playerPlaytime.textContent = formatDuration(state.saves[state.activeGameId].playSeconds);
  }
  if (els.playerCopyNoteBtn) {
    els.playerCopyNoteBtn.classList.toggle('hidden', !noteVal);
  }
}

function startAutoSaveLoop() {
  stopAutoSaveLoop();
  state.autoSaveTimer = setInterval(() => {
    commitActiveGameSave(false);
  }, 10000);
}

function stopAutoSaveLoop() {
  if (state.autoSaveTimer) {
    clearInterval(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }
}

function resolveAssetUrl(rawPath) {
  if (typeof rawPath !== 'string') return '';
  const trimmed = rawPath.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return `.${trimmed}`;
  }
  return trimmed;
}

function validateSafeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const candidate = rawUrl.trim();
  if (!candidate) return null;

  if ((candidate.startsWith('/') && !candidate.startsWith('//')) || candidate.startsWith('./')) {
    return candidate;
  }

  try {
    const url = new URL(candidate, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Safely parse an <iframe> tag stored in games.json and validate its src URL.
 */
function parseIframeConfig(iframeHtml, fallbackTitle) {
  if (typeof iframeHtml !== 'string' || !iframeHtml.trim()) {
    return null;
  }

  const trimmed = iframeHtml.trim();
  let rawSrc = '';
  let title = fallbackTitle || 'Playable Game';
  let allow = 'fullscreen; autoplay; gamepad';

  if (trimmed.toLowerCase().startsWith('<iframe')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const parsedIframe = doc.querySelector('iframe');
    if (!parsedIframe) return null;
    rawSrc = parsedIframe.getAttribute('src') || '';
    title = parsedIframe.getAttribute('title') || title;
    allow = parsedIframe.getAttribute('allow') || allow;
  } else {
    rawSrc = trimmed;
  }

  const safeSrc = validateSafeUrl(rawSrc);
  if (!safeSrc) return null;

  return { src: safeSrc, title, allow };
}

/**
 * Unmount any active iframe and immediately silence audio/WebGL loops by navigating to about:blank first.
 */
function teardownActiveIframe({ skipSave = false } = {}) {
  if (!skipSave) {
    commitActiveGameSave(false);
  }
  stopAutoSaveLoop();

  const existing = els.iframeStage.querySelectorAll('iframe');
  existing.forEach((frame) => {
    try {
      frame.src = 'about:blank';
    } catch {
      // Ignore cross-origin edge errors
    }
    frame.remove();
  });
  els.iframeStage.replaceChildren();
  state.sessionStartMs = null;
}

function closePlayerAndReturnHome() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  teardownActiveIframe();
  state.activeGameId = null;
  els.playerSection.classList.add('hidden');
  els.heroSection.classList.remove('hidden');
  setWallpaperPaused(false);
  startFeaturedAutoScroll();
  renderCatalog();
}

function buildThumbnailContainer(game) {
  const wrapper = document.createElement('div');
  wrapper.className =
    'relative aspect-[5/4] w-full overflow-hidden bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-center';

  if (game.thumbnail) {
    const img = document.createElement('img');
    img.src = resolveAssetUrl(game.thumbnail);
    img.alt = `${game.title} official logo`;
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.className = 'game-card-thumb h-full w-full object-contain p-1.5';
    img.addEventListener('error', () => {
      img.remove();
      const fallback = document.createElement('span');
      fallback.className = 'font-display text-lg font-bold text-slate-400 px-4 text-center';
      fallback.textContent = game.title;
      wrapper.appendChild(fallback);
    });
    wrapper.appendChild(img);
    return wrapper;
  }

  const fallback = document.createElement('span');
  fallback.className = 'font-display text-lg font-bold text-slate-400 px-4 text-center';
  fallback.textContent = game.title;
  wrapper.appendChild(fallback);
  return wrapper;
}

function getFilteredGames() {
  const query = state.searchQuery.trim().toLowerCase();

  return state.games.filter((game) => {
    if (state.activeCategory === 'Favorites' && !state.favorites.has(game.id)) {
      return false;
    }
    if (state.activeCategory === 'Saved' && !state.saves[game.id]) {
      return false;
    }
    if (
      state.activeCategory !== 'All' &&
      state.activeCategory !== 'Favorites' &&
      state.activeCategory !== 'Saved' &&
      game.category !== state.activeCategory
    ) {
      return false;
    }

    if (!query) return true;
    const haystack = `${game.title} ${game.category} ${game.description || ''} ${game.controls || ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

function getActiveFeaturedGame() {
  return state.featuredGames[state.featuredIndex] || state.games.find((g) => g.featured) || state.games[0] || null;
}

function syncHeroFeaturedCta(animateSwap = false) {
  const featured = getActiveFeaturedGame();
  if (featured && els.heroPlayFeaturedBtn) {
    const nextLabel = `Play ${featured.title}`;
    if (animateSwap && els.heroPlayFeaturedBtn.textContent !== nextLabel) {
      els.heroPlayFeaturedBtn.classList.remove('btn-swap-pop');
      void els.heroPlayFeaturedBtn.offsetWidth;
      els.heroPlayFeaturedBtn.classList.add('btn-swap-pop');
    }
    els.heroPlayFeaturedBtn.textContent = nextLabel;
  }
  if (els.featuredCounter && state.featuredGames.length > 0) {
    els.featuredCounter.textContent = `${state.featuredIndex + 1} / ${state.featuredGames.length}`;
  }
}

function getFeaturedGames() {
  const picked = [];
  const usedIds = new Set();

  FEATURED_GAME_IDS.forEach((id) => {
    const match = state.games.find((g) => g.id === id);
    if (match && !usedIds.has(match.id)) {
      picked.push(match);
      usedIds.add(match.id);
    }
  });

  for (const game of state.games) {
    if (picked.length >= 5) break;
    if (!usedIds.has(game.id)) {
      picked.push(game);
      usedIds.add(game.id);
    }
  }

  return picked.slice(0, 5);
}

function restartFeaturedProgressBar() {
  const bar = els.featuredProgressBar;
  if (!bar) return;
  bar.classList.remove('is-running', 'is-paused');
  void bar.offsetWidth;
  if (!state.activeGameId && state.featuredGames.length > 1) {
    bar.classList.add('is-running');
    if (state.featuredPaused) {
      bar.classList.add('is-paused');
    }
  }
}

function triggerFeaturedSweep() {
  const sweep = els.featuredSweep;
  if (!sweep) return;
  sweep.classList.remove('is-sweeping');
  void sweep.offsetWidth;
  sweep.classList.add('is-sweeping');
}

function clearFeaturedWrapTimeout() {
  if (state.featuredWrapTimeout) {
    clearTimeout(state.featuredWrapTimeout);
    state.featuredWrapTimeout = null;
  }
}

function stopFeaturedAutoScroll() {
  if (state.featuredTimer) {
    clearInterval(state.featuredTimer);
    state.featuredTimer = null;
  }
  if (els.featuredProgressBar && state.featuredPaused) {
    els.featuredProgressBar.classList.add('is-paused');
  }
}

function updateFeaturedDotsUI() {
  if (!els.featuredDots) return;
  const dots = els.featuredDots.querySelectorAll('[role="tab"]');
  dots.forEach((dot, idx) => {
    const isCurrent = idx === state.featuredIndex;
    dot.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    const pill = dot.firstElementChild;
    if (pill) {
      pill.className = isCurrent
        ? 'block h-2 w-6 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.65)] transition-all duration-500 ease-out'
        : 'block h-2 w-2 rounded-full bg-slate-600 group-hover:bg-slate-400 group-hover:scale-125 transition-all duration-300 ease-out';
    }
  });
}

function setFeaturedSlide(targetIndex, animateChange = true, wrapForward = false) {
  const count = state.featuredGames.length;
  if (count === 0) return;

  clearFeaturedWrapTimeout();
  const track = els.featuredTrack;
  const isSeamlessWrap = Boolean(wrapForward && targetIndex >= count && track && track.children.length > count);

  // Wrap modulo count so advancing past the 5th game loops seamlessly back to the 1st game
  state.featuredIndex = ((targetIndex % count) + count) % count;

  if (track) {
    track.classList.remove('no-transition');
    const trackIndex = isSeamlessWrap ? count : state.featuredIndex;
    track.style.transform = `translateX(-${trackIndex * 100}%)`;

    const slides = track.querySelectorAll('.featured-slide');
    slides.forEach((slide, idx) => {
      slide.classList.remove('is-active');
      if (idx === trackIndex) {
        if (animateChange) {
          void slide.offsetWidth;
        }
        slide.classList.add('is-active');
      }
    });

    if (isSeamlessWrap) {
      state.featuredWrapTimeout = setTimeout(() => {
        track.classList.add('no-transition');
        track.style.transform = 'translateX(0%)';
        slides.forEach((slide, idx) => {
          if (idx === 0) {
            slide.style.animation = 'none';
            slide.classList.add('is-active');
          } else {
            slide.classList.remove('is-active');
          }
        });
        void track.offsetWidth;
        track.classList.remove('no-transition');
        if (slides[0]) {
          slides[0].style.animation = '';
        }
        state.featuredWrapTimeout = null;
      }, 840);
    }
  }

  if (animateChange) {
    triggerFeaturedSweep();
  }
  restartFeaturedProgressBar();
  updateFeaturedDotsUI();
  syncHeroFeaturedCta(animateChange);
}

function startFeaturedAutoScroll() {
  stopFeaturedAutoScroll();
  if (state.activeGameId || state.featuredPaused || state.featuredGames.length <= 1) return;

  restartFeaturedProgressBar();
  state.featuredTimer = setInterval(() => {
    if (!state.activeGameId && !state.featuredPaused && state.featuredGames.length > 1) {
      setFeaturedSlide(state.featuredIndex + 1, true, true);
    }
  }, FEATURED_AUTO_MS);
}

function createFeaturedSlideElement(game) {
  const slide = document.createElement('div');
  slide.className = 'featured-slide relative w-full h-full shrink-0 flex items-center justify-center group';

  if (game.thumbnail) {
    const img = document.createElement('img');
    img.src = resolveAssetUrl(game.thumbnail);
    img.alt = `${game.title} featured game logo`;
    img.referrerPolicy = 'no-referrer';
    img.className = 'featured-slide-img h-full w-full max-h-[260px] object-contain p-5 pb-16 bg-slate-900/70';
    img.addEventListener('error', () => {
      img.remove();
      const fallback = document.createElement('span');
      fallback.className = 'font-display text-2xl font-bold text-slate-400 px-6 text-center pb-14';
      fallback.textContent = game.title;
      slide.prepend(fallback);
    });
    slide.appendChild(img);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'font-display text-2xl font-bold text-slate-400 px-6 text-center pb-14';
    fallback.textContent = game.title;
    slide.appendChild(fallback);
  }

  const overlay = document.createElement('div');
  overlay.className =
    'pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-transparent';

  const infoBar = document.createElement('div');
  infoBar.className = 'absolute inset-x-0 bottom-0 p-5 flex flex-wrap items-end justify-between gap-4';

  const textWrap = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'featured-slide-kicker text-xs font-medium text-amber-400';
  kicker.textContent = `Featured Pick · ${game.category}`;

  const title = document.createElement('p');
  title.className = 'featured-slide-title mt-1 font-display text-2xl font-bold text-slate-50';
  title.textContent = game.title;

  textWrap.appendChild(kicker);
  textWrap.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'featured-slide-actions flex items-center gap-2 shrink-0';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className =
    'btn-tactile px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer';
  playBtn.textContent = 'Play Now';
  playBtn.addEventListener('click', () => launchGame(game.id));

  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className =
    'btn-tactile px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-900/90 border border-slate-700 hover:border-amber-400 rounded-lg whitespace-nowrap shrink-0 cursor-pointer';
  fsBtn.textContent = 'Fullscreen';
  fsBtn.addEventListener('click', () => launchGame(game.id, { fullscreen: true }));

  actions.appendChild(playBtn);
  actions.appendChild(fsBtn);

  infoBar.appendChild(textWrap);
  infoBar.appendChild(actions);

  slide.appendChild(overlay);
  slide.appendChild(infoBar);
  return slide;
}

function renderFeaturedCarousel() {
  if (!els.featuredTrack || !els.featuredDots) return;

  state.featuredGames = getFeaturedGames();
  if (state.featuredGames.length === 0) return;
  if (state.featuredIndex >= state.featuredGames.length) {
    state.featuredIndex = 0;
  }

  clearFeaturedWrapTimeout();
  els.featuredTrack.replaceChildren();
  els.featuredDots.replaceChildren();

  state.featuredGames.forEach((game, idx) => {
    els.featuredTrack.appendChild(createFeaturedSlideElement(game));

    const dotBtn = document.createElement('button');
    dotBtn.type = 'button';
    dotBtn.setAttribute('role', 'tab');
    dotBtn.setAttribute('aria-label', `Show featured game ${idx + 1}: ${game.title}`);
    dotBtn.setAttribute('title', game.title);
    dotBtn.className = 'p-1.5 cursor-pointer group focus:outline-none';

    const dotVisual = document.createElement('span');
    dotVisual.className = 'block h-2 w-2 rounded-full bg-slate-600 transition-all duration-300';
    dotBtn.appendChild(dotVisual);

    dotBtn.addEventListener('click', () => {
      setFeaturedSlide(idx, true, false);
      startFeaturedAutoScroll();
    });

    els.featuredDots.appendChild(dotBtn);
  });

  // Append a clone of the 1st slide at the end so sliding past game #5 glides seamlessly to game #1
  if (state.featuredGames.length > 1) {
    const cloneSlide = createFeaturedSlideElement(state.featuredGames[0]);
    cloneSlide.setAttribute('aria-hidden', 'true');
    els.featuredTrack.appendChild(cloneSlide);
  }

  setFeaturedSlide(state.featuredIndex, false, false);
  startFeaturedAutoScroll();
}

function pulseStatEl(el, nextValue) {
  if (!el) return;
  const text = String(nextValue);
  if (el.textContent !== text) {
    el.textContent = text;
    el.classList.remove('stat-pop');
    void el.offsetWidth;
    el.classList.add('stat-pop');
  }
}

function updateStats() {
  pulseStatEl(els.statTotalGames, state.games.length);
  pulseStatEl(els.statFavoritesCount, state.favorites.size);
  pulseStatEl(els.statSavedCount, Object.keys(state.saves).length);
  syncHeroFeaturedCta(false);
}

function updateTabsUI() {
  if (els.catalogHeading) {
    if (state.activeCategory === 'All') els.catalogHeading.textContent = 'All Games';
    else if (state.activeCategory === 'Saved') els.catalogHeading.textContent = 'Saved Games';
    else els.catalogHeading.textContent = `${state.activeCategory} Games`;
  }

  els.categoryTabs.forEach((tab) => {
    const category = tab.dataset.category;
    const isActive = category === state.activeCategory;
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) {
      tab.className =
        'cat-tab btn-tactile px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer bg-amber-400 text-slate-950 shadow-[0_0_16px_-4px_rgba(251,191,36,0.55)]';
    } else {
      tab.className =
        'cat-tab btn-tactile px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer text-slate-300 hover:text-slate-50';
    }
  });

  els.navFilterBtns.forEach((btn) => {
    const navCat = btn.dataset.navFilter;
    const isActive = navCat === state.activeCategory;
    btn.classList.toggle('text-amber-400', isActive);
  });
}

function deleteIdbDatabase(dbName) {
  return new Promise((resolve) => {
    if (!window.indexedDB || !dbName) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = setTimeout(done, 800);
    try {
      const req = window.indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => {
        clearTimeout(timer);
        done();
      };
      req.onerror = () => {
        clearTimeout(timer);
        done();
      };
      req.onblocked = () => {
        clearTimeout(timer);
        done();
      };
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

async function wipeSingleGameOriginStorage(gameId) {
  const prefix = `__pg_game_${gameId}__:`;
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage restrictions
  }

  const dbNames = new Set([`/idbfs__${gameId}`, `idbfs__${gameId}`]);
  try {
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const list = await window.indexedDB.databases();
      list.forEach((entry) => {
        if (entry && entry.name && entry.name.endsWith(`__${gameId}`)) {
          dbNames.add(entry.name);
        }
      });
    }
  } catch {
    // Ignore databases() errors
  }

  await Promise.all([...dbNames].map((name) => deleteIdbDatabase(name)));
}

async function wipeAllGamesOriginStorage() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k !== STORAGE_FAVORITES_KEY) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage restrictions
  }

  try {
    sessionStorage.clear();
  } catch {
    // Ignore storage restrictions
  }

  const dbNames = new Set([
    '/idbfs',
    'idbfs',
    'UnityCache',
    '/idbfs__ragdoll-hit',
    'idbfs__ragdoll-hit',
    '/idbfs__ragdoll-archers',
    'idbfs__ragdoll-archers',
    '/idbfs__10-minutes-till-dawn',
    'idbfs__10-minutes-till-dawn',
  ]);
  try {
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const list = await window.indexedDB.databases();
      list.forEach((entry) => {
        if (entry && entry.name) dbNames.add(entry.name);
      });
    }
  } catch {
    // Ignore databases() errors
  }

  await Promise.all([...dbNames].map((name) => deleteIdbDatabase(name)));

  try {
    if (window.caches && typeof window.caches.keys === 'function') {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
    }
  } catch {
    // Ignore CacheStorage restrictions
  }
}

function mountFreshActiveGameIframe(game) {
  const iframeConfig = parseIframeConfig(game.iframe, game.title);
  if (!iframeConfig) return;

  const iframeEl = document.createElement('iframe');
  iframeEl.src = iframeConfig.src;
  iframeEl.title = iframeConfig.title;
  iframeEl.setAttribute('allow', iframeConfig.allow);
  iframeEl.setAttribute('allowfullscreen', '');
  iframeEl.setAttribute('referrerpolicy', 'no-referrer');
  els.iframeStage.replaceChildren(iframeEl);

  iframeEl.addEventListener('load', () => {
    try {
      iframeEl.focus();
    } catch {
      // Ignore cross-origin focus errors
    }
  });
}

function resetActivePlayerSaveUI(statusMessage) {
  state.clearedActiveSave = true;
  state.sessionStartMs = null;
  stopAutoSaveLoop();
  if (els.playerSaveNote) els.playerSaveNote.value = '';
  if (els.playerCopyNoteBtn) els.playerCopyNoteBtn.classList.add('hidden');
  if (els.playerPlaytime) els.playerPlaytime.textContent = '0s played';
  if (els.playerSaveStatus && statusMessage) {
    els.playerSaveStatus.textContent = statusMessage;
  }
}

async function clearSingleSave(gameId, { restartIfActive = false } = {}) {
  const isActive = state.activeGameId === gameId;
  if (!state.saves[gameId] && !isActive) return;

  if (isActive) {
    state.clearedActiveSave = true;
    teardownActiveIframe({ skipSave: true });
  }

  delete state.saves[gameId];
  persistSavesToStorage();

  await wipeSingleGameOriginStorage(gameId);

  if (isActive) {
    resetActivePlayerSaveUI('Save deleted and game data wiped. Relaunch or play again anytime to start fresh.');
    if (restartIfActive) {
      const game = state.games.find((g) => g.id === gameId);
      if (game) mountFreshActiveGameIframe(game);
    }
  }

  renderCatalog();
}

async function clearAllSaves() {
  const hadActive = Boolean(state.activeGameId);
  const activeGame = hadActive ? state.games.find((g) => g.id === state.activeGameId) : null;

  if (hadActive) {
    state.clearedActiveSave = true;
    teardownActiveIframe({ skipSave: true });
  }

  state.saves = {};
  persistSavesToStorage();

  await wipeAllGamesOriginStorage();

  if (hadActive) {
    resetActivePlayerSaveUI('All saves and local game data deleted.');
    if (activeGame) {
      mountFreshActiveGameIframe(activeGame);
    }
  }

  renderCatalog();
}

function closeDeleteConfirmModal() {
  state.pendingDeleteAction = null;
  if (els.deleteConfirmModal) {
    els.deleteConfirmModal.classList.add('hidden');
  }
}

function openDeleteConfirmModal({ title, message, onConfirm }) {
  if (!els.deleteConfirmModal) {
    onConfirm();
    return;
  }
  state.pendingDeleteAction = onConfirm;
  if (els.deleteConfirmTitle) els.deleteConfirmTitle.textContent = title;
  if (els.deleteConfirmMessage) els.deleteConfirmMessage.textContent = message;
  els.deleteConfirmModal.classList.remove('hidden');
  if (els.deleteConfirmCancelBtn) {
    els.deleteConfirmCancelBtn.focus();
  }
}

function confirmDeleteSingleSave(gameId) {
  const game = state.games.find((g) => g.id === gameId);
  const title = game ? game.title : 'this game';
  openDeleteConfirmModal({
    title: `Delete ${title} Save?`,
    message: `Warning: This will permanently delete your saved session, playtime, checkpoint notes, and local game progress for ${title}.`,
    onConfirm: () => clearSingleSave(gameId, { restartIfActive: true }),
  });
}

function confirmDeleteAllSaves() {
  const count = Object.keys(state.saves).length;
  openDeleteConfirmModal({
    title: 'Delete All Saved Progress?',
    message: `Warning: This will permanently delete ${count === 1 ? 'your 1 saved game' : `all ${count} saved games`} and wipe all locally stored progress. Your Favorites will stay saved.`,
    onConfirm: () => clearAllSaves(),
  });
}

function renderSavedGames() {
  const entries = Object.entries(state.saves)
    .map(([id, info]) => {
      const game = state.games.find((g) => g.id === id);
      return game ? { game, info } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.info.savedAt || 0) - (a.info.savedAt || 0));

  if (entries.length === 0) {
    els.savedGrid.replaceChildren();
    els.savedSection.classList.add('hidden');
    return;
  }

  els.savedSection.classList.remove('hidden');
  els.savedGrid.replaceChildren();

  entries.forEach(({ game, info }, idx) => {
    const card = document.createElement('div');
    card.style.setProperty('--stagger', String(Math.min(idx, 12)));
    card.className =
      'game-card game-card-enter flex flex-col justify-between gap-3 p-4 rounded-xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-sm hover:border-amber-400/50 hover:shadow-[0_14px_30px_-10px_rgba(245,158,11,0.22)]';

    const left = document.createElement('div');
    left.className = 'flex items-center gap-3 min-w-0';

    if (game.thumbnail) {
      const icon = document.createElement('img');
      icon.src = resolveAssetUrl(game.thumbnail);
      icon.alt = game.title;
      icon.referrerPolicy = 'no-referrer';
      icon.className = 'h-12 w-12 rounded-lg object-contain bg-slate-950/90 border border-slate-800 p-1 shrink-0';
      left.appendChild(icon);
    }

    const textWrap = document.createElement('div');
    textWrap.className = 'min-w-0 flex-1';

    const title = document.createElement('p');
    title.className = 'text-sm font-semibold text-slate-100 truncate';
    title.textContent = game.title;

    const meta = document.createElement('p');
    meta.className = 'text-xs text-slate-400 truncate';
    const notePreview = info.note ? ` · ${info.note.slice(0, 24)}` : '';
    meta.textContent = `${formatRelativeTime(info.savedAt)} · ${formatDuration(info.playSeconds)}${notePreview}`;

    textWrap.appendChild(title);
    textWrap.appendChild(meta);
    left.appendChild(textWrap);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/70';

    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className =
      'btn-tactile px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md whitespace-nowrap cursor-pointer';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => launchGame(game.id));

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className =
      'btn-tactile px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md whitespace-nowrap cursor-pointer';
    fsBtn.textContent = 'Fullscreen';
    fsBtn.addEventListener('click', () => launchGame(game.id, { fullscreen: true }));

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className =
      'btn-tactile ml-auto px-2.5 py-1.5 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/35 hover:border-red-400 hover:bg-red-500/20 rounded-md whitespace-nowrap cursor-pointer';
    clearBtn.textContent = 'Delete Save';
    clearBtn.setAttribute('aria-label', `Delete saved progress for ${game.title}`);
    clearBtn.setAttribute('title', `Delete saved progress for ${game.title}`);
    clearBtn.addEventListener('click', () => confirmDeleteSingleSave(game.id));

    actions.appendChild(resumeBtn);
    actions.appendChild(fsBtn);
    actions.appendChild(clearBtn);

    card.appendChild(left);
    card.appendChild(actions);
    els.savedGrid.appendChild(card);
  });
}

function renderCatalog() {
  updateTabsUI();
  updateStats();
  renderSavedGames();

  if (els.catalogDeleteAllBtn) {
    const showCatalogDeleteAll = state.activeCategory === 'Saved' && Object.keys(state.saves).length > 0;
    els.catalogDeleteAllBtn.classList.toggle('hidden', !showCatalogDeleteAll);
  }

  if (state.loading) {
    els.gamesGrid.replaceChildren();
    els.catalogStatus.classList.remove('hidden');
    els.catalogStatus.textContent = 'Loading games...';
    els.resultsCount.textContent = '';
    return;
  }

  if (state.error) {
    els.gamesGrid.replaceChildren();
    els.catalogStatus.classList.remove('hidden');
    els.catalogStatus.replaceChildren();

    const errText = document.createElement('p');
    errText.className = 'text-sm text-red-400';
    errText.textContent = state.error;

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className =
      'mt-4 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', fetchGamesCatalog);

    els.catalogStatus.appendChild(errText);
    els.catalogStatus.appendChild(retryBtn);
    els.resultsCount.textContent = '0 games';
    return;
  }

  const filtered = getFilteredGames();
  els.resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;

  if (filtered.length === 0) {
    els.gamesGrid.replaceChildren();
    els.catalogStatus.classList.remove('hidden');
    els.catalogStatus.replaceChildren();

    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'text-sm text-slate-300';
    if (state.activeCategory === 'Favorites') {
      emptyMsg.textContent = 'No favorite games saved yet. Click Save on any game to add it here.';
    } else if (state.activeCategory === 'Saved') {
      emptyMsg.textContent = 'No saved game sessions yet. Play any game and your progress will appear here.';
    } else {
      emptyMsg.textContent = 'No games match your current search or category filter.';
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'mt-4 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer';
    resetBtn.textContent = 'Show All Games';
    resetBtn.addEventListener('click', () => {
      state.activeCategory = 'All';
      state.searchQuery = '';
      els.searchInput.value = '';
      renderCatalog();
    });

    els.catalogStatus.appendChild(emptyMsg);
    els.catalogStatus.appendChild(resetBtn);
    return;
  }

  els.catalogStatus.classList.add('hidden');
  els.gamesGrid.replaceChildren();

  filtered.forEach((game, idx) => {
    const isPlaying = state.activeGameId === game.id;
    const isFav = state.favorites.has(game.id);
    const savedInfo = state.saves[game.id];

    const card = document.createElement('article');
    card.style.setProperty('--stagger', String(Math.min(idx, 16)));
    card.className = `game-card game-card-enter group flex flex-col rounded-2xl border ${
      isPlaying
        ? 'border-amber-400 shadow-[0_18px_35px_-14px_rgba(251,191,36,0.35)]'
        : 'border-slate-800/90 hover:border-amber-400/60 hover:shadow-[0_20px_38px_-14px_rgba(245,158,11,0.26)]'
    } bg-slate-900/80 backdrop-blur-sm overflow-hidden`;

    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className =
      'relative block w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';
    thumbBtn.setAttribute('aria-label', `Play ${game.title}`);
    thumbBtn.appendChild(buildThumbnailContainer(game));
    thumbBtn.addEventListener('click', () => launchGame(game.id));

    const body = document.createElement('div');
    body.className = 'flex flex-1 flex-col justify-between p-5';

    const top = document.createElement('div');

    const metaParts = [game.category];
    if (savedInfo) metaParts.push(`Saved ${formatRelativeTime(savedInfo.savedAt)}`);
    if (isFav) metaParts.push('Favorite');

    const meta = document.createElement('p');
    meta.className = 'text-xs text-slate-400 truncate';
    meta.textContent = metaParts.join(' · ');

    const title = document.createElement('h3');
    title.className = 'mt-1.5 font-display text-lg font-bold text-slate-50 leading-snug group-hover:text-amber-200 transition-colors';
    title.textContent = game.title;

    const desc = document.createElement('p');
    desc.className = 'mt-2 text-xs leading-relaxed text-slate-400 line-clamp-2';
    desc.textContent = game.description || '';

    top.appendChild(meta);
    top.appendChild(title);
    top.appendChild(desc);

    const footer = document.createElement('div');
    footer.className = 'mt-5 pt-3.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = `btn-tactile px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
      isPlaying
        ? 'bg-emerald-500 text-slate-950'
        : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
    }`;
    playBtn.textContent = isPlaying ? 'Playing' : savedInfo ? 'Resume' : 'Play';
    playBtn.addEventListener('click', () => launchGame(game.id));

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className =
      'btn-tactile px-3 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer';
    fsBtn.textContent = 'Fullscreen';
    fsBtn.setAttribute('aria-label', `Play ${game.title} in fullscreen`);
    fsBtn.addEventListener('click', () => launchGame(game.id, { fullscreen: true }));

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = `btn-tactile ml-auto px-3 py-2 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer ${
      isFav
        ? 'border-amber-400/60 text-amber-300 bg-amber-400/10'
        : 'border-slate-700 text-slate-300 hover:border-slate-500'
    }`;
    favBtn.textContent = isFav ? 'Favorited' : 'Favorite';
    favBtn.addEventListener('click', () => toggleFavorite(game.id));

    footer.appendChild(playBtn);
    footer.appendChild(fsBtn);
    footer.appendChild(favBtn);

    if (savedInfo) {
      const deleteSaveBtn = document.createElement('button');
      deleteSaveBtn.type = 'button';
      deleteSaveBtn.className =
        'btn-tactile px-2.5 py-2 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/35 hover:border-red-400 hover:bg-red-500/20 rounded-lg whitespace-nowrap shrink-0 cursor-pointer';
      deleteSaveBtn.textContent = 'Delete Save';
      deleteSaveBtn.setAttribute('aria-label', `Delete saved progress for ${game.title}`);
      deleteSaveBtn.addEventListener('click', () => confirmDeleteSingleSave(game.id));
      footer.appendChild(deleteSaveBtn);
    }

    body.appendChild(top);
    body.appendChild(footer);

    card.appendChild(thumbBtn);
    card.appendChild(body);
    els.gamesGrid.appendChild(card);
  });
}

function updatePlayerFavoriteButton() {
  if (!state.activeGameId) return;
  const isFav = state.favorites.has(state.activeGameId);
  els.playerFavoriteBtn.textContent = isFav ? 'Saved Favorite' : 'Save Favorite';
  els.playerFavoriteBtn.className = isFav
    ? 'px-3.5 py-2 text-xs font-semibold text-amber-300 bg-amber-400/10 border border-amber-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer'
    : 'px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer';
}

function requestStageFullscreen() {
  const stage = els.iframeStage;
  const fn =
    stage.requestFullscreen ||
    stage.webkitRequestFullscreen ||
    stage.mozRequestFullScreen ||
    stage.msRequestFullscreen;
  if (typeof fn === 'function') {
    Promise.resolve(fn.call(stage)).catch(() => {});
  }
}

function launchGame(gameId, options = {}) {
  const game = state.games.find((g) => g.id === gameId);
  if (!game) return;

  const iframeConfig = parseIframeConfig(game.iframe, game.title);
  if (!iframeConfig) {
    state.error = `Unable to load "${game.title}".`;
    renderCatalog();
    return;
  }

  teardownActiveIframe();

  state.activeGameId = game.id;
  state.sessionStartMs = Date.now();
  state.clearedActiveSave = false;

  const existingSave = state.saves[game.id] || {
    savedAt: Date.now(),
    playSeconds: 0,
    note: '',
  };
  existingSave.savedAt = Date.now();
  state.saves[game.id] = existingSave;
  persistSavesToStorage();

  els.playerTitle.textContent = game.title;
  els.playerMeta.textContent = `${game.category} · ${game.description || ''}`;
  els.playerControlsText.textContent = `Controls: ${game.controls || 'Keyboard / Mouse'}`;
  els.playerDirectLink.href = iframeConfig.src;
  els.playerSaveNote.value = existingSave.note || '';
  els.playerCopyNoteBtn.classList.toggle('hidden', !(existingSave.note || '').trim());
  els.playerPlaytime.textContent = formatDuration(existingSave.playSeconds);
  els.playerSaveStatus.textContent =
    'Progress auto-saves for this browser session. Use Fullscreen to keep your mouse locked inside the game.';
  updatePlayerFavoriteButton();

  const iframeEl = document.createElement('iframe');
  iframeEl.src = iframeConfig.src;
  iframeEl.title = iframeConfig.title;
  iframeEl.setAttribute('allow', iframeConfig.allow);
  iframeEl.setAttribute('allowfullscreen', '');
  iframeEl.setAttribute('referrerpolicy', 'no-referrer');

  els.iframeStage.appendChild(iframeEl);

  stopFeaturedAutoScroll();
  setWallpaperPaused(true);
  els.heroSection.classList.add('hidden');
  els.playerSection.classList.remove('hidden', 'theater-enter');
  void els.playerSection.offsetWidth;
  els.playerSection.classList.add('theater-enter');
  startAutoSaveLoop();

  if (options.fullscreen) {
    requestStageFullscreen();
  }

  renderCatalog();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  iframeEl.addEventListener('load', () => {
    try {
      iframeEl.focus();
    } catch {
      // Ignore cross-origin focus errors
    }
  });
}

function reloadActiveGame() {
  const iframeEl = els.iframeStage.querySelector('iframe');
  if (!iframeEl) return;
  const currentSrc = iframeEl.src;
  iframeEl.src = 'about:blank';
  requestAnimationFrame(() => {
    iframeEl.src = currentSrc;
    try {
      iframeEl.focus();
    } catch {
      // Ignore focus errors
    }
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    requestStageFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function toggleFavorite(gameId) {
  if (state.favorites.has(gameId)) {
    state.favorites.delete(gameId);
  } else {
    state.favorites.add(gameId);
  }
  saveFavorites();
  updatePlayerFavoriteButton();
  renderCatalog();
}

function launchRandomGame() {
  if (state.games.length === 0) return;
  const pool = state.games.filter((g) => g.id !== state.activeGameId);
  const list = pool.length > 0 ? pool : state.games;
  const picked = list[Math.floor(Math.random() * list.length)];
  launchGame(picked.id);
}

async function fetchGamesCatalog() {
  state.loading = true;
  state.error = null;
  renderCatalog();

  try {
    const response = await fetch('./games.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load game catalog (HTTP ${response.status})`);
    }
    const data = await response.json();
    const list = Array.isArray(data) ? data : data.games;
    if (!Array.isArray(list)) {
      throw new Error('Invalid game catalog format.');
    }

    state.games = list.filter((item) => item && typeof item.id === 'string' && typeof item.iframe === 'string');
    state.loading = false;
    state.error = null;
    renderFeaturedCarousel();
    renderCatalog();
  } catch (err) {
    state.loading = false;
    state.error = err instanceof Error ? err.message : 'Unable to load games right now.';
    renderCatalog();
  }
}

function wireEvents() {
  els.brandHomeLink.addEventListener('click', (e) => {
    e.preventDefault();
    state.activeCategory = 'All';
    state.searchQuery = '';
    els.searchInput.value = '';
    closePlayerAndReturnHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  els.navFilterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.dataset.navFilter || 'All';
      closePlayerAndReturnHome();
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  els.categoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeCategory = tab.dataset.category || 'All';
      closePlayerAndReturnHome();
    });
  });

  els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderCatalog();
  });

  els.randomGameBtn.addEventListener('click', launchRandomGame);

  const launchFeatured = (fullscreen = false) => {
    const featured = getActiveFeaturedGame();
    if (featured) launchGame(featured.id, { fullscreen });
  };
  els.heroPlayFeaturedBtn.addEventListener('click', () => launchFeatured(false));
  els.heroFullscreenFeaturedBtn.addEventListener('click', () => launchFeatured(true));

  if (els.featuredCarousel) {
    els.featuredCarousel.addEventListener('mouseenter', () => {
      state.featuredPaused = true;
      stopFeaturedAutoScroll();
    });
    els.featuredCarousel.addEventListener('mouseleave', () => {
      state.featuredPaused = false;
      startFeaturedAutoScroll();
    });
    els.featuredCarousel.addEventListener('focusin', () => {
      state.featuredPaused = true;
      stopFeaturedAutoScroll();
    });
    els.featuredCarousel.addEventListener('focusout', (e) => {
      if (!els.featuredCarousel.contains(e.relatedTarget)) {
        state.featuredPaused = false;
        startFeaturedAutoScroll();
      }
    });
  }

  els.playerBackBtn.addEventListener('click', closePlayerAndReturnHome);
  els.playerMuteStopBtn.addEventListener('click', closePlayerAndReturnHome);
  if (els.playerDeleteSaveBtn) {
    els.playerDeleteSaveBtn.addEventListener('click', () => {
      if (state.activeGameId) {
        confirmDeleteSingleSave(state.activeGameId);
      }
    });
  }
  els.playerSaveNote.addEventListener('input', () => {
    state.clearedActiveSave = false;
    state.sessionStartMs = state.sessionStartMs || Date.now();
    commitActiveGameSave(false);
    if (!state.autoSaveTimer) startAutoSaveLoop();
  });
  els.playerCopyNoteBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.playerSaveNote.value);
      els.playerCopyNoteBtn.textContent = 'Copied!';
      setTimeout(() => {
        els.playerCopyNoteBtn.textContent = 'Copy Code';
      }, 1500);
    } catch {
      els.playerCopyNoteBtn.textContent = 'Copy failed';
    }
  });

  els.playerFavoriteBtn.addEventListener('click', () => {
    if (state.activeGameId) toggleFavorite(state.activeGameId);
  });
  els.playerReloadBtn.addEventListener('click', reloadActiveGame);
  els.playerFullscreenBtn.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    const isFs = Boolean(document.fullscreenElement);
    els.playerFullscreenBtn.textContent = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    if (isFs) {
      const iframeEl = els.iframeStage.querySelector('iframe');
      if (iframeEl) {
        try {
          iframeEl.focus();
        } catch {
          // Ignore focus restrictions
        }
      }
    }
  });

  els.clearSavedBtn.addEventListener('click', confirmDeleteAllSaves);
  if (els.catalogDeleteAllBtn) {
    els.catalogDeleteAllBtn.addEventListener('click', confirmDeleteAllSaves);
  }

  if (els.deleteConfirmYesBtn) {
    els.deleteConfirmYesBtn.addEventListener('click', async () => {
      const action = state.pendingDeleteAction;
      closeDeleteConfirmModal();
      if (typeof action === 'function') {
        await action();
      }
    });
  }
  if (els.deleteConfirmCancelBtn) {
    els.deleteConfirmCancelBtn.addEventListener('click', closeDeleteConfirmModal);
  }
  if (els.deleteConfirmModal) {
    els.deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === els.deleteConfirmModal) {
        closeDeleteConfirmModal();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.deleteConfirmModal && !els.deleteConfirmModal.classList.contains('hidden')) {
      closeDeleteConfirmModal();
    }
  });

  els.footerTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('pagehide', () => {
    teardownActiveIframe();
    clearFeaturedWrapTimeout();
    setWallpaperPaused(true);
  });
}

function setWallpaperPaused(paused) {
  state.wallpaper.paused = paused;
  const video = els.wallpaperVideo;
  if (!video) return;

  if (paused) {
    video.pause();
    return;
  }

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.play().catch(() => {});
}

function initWallpaperLooper() {
  const video = els.wallpaperVideo;
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;

  const ensurePlaying = () => {
    if (state.wallpaper.paused) return;
    video.muted = true;
    video.loop = true;
    if (video.paused) {
      video.play().catch(() => {});
    }
  };

  video.addEventListener('loadeddata', ensurePlaying);
  video.addEventListener('canplay', ensurePlaying);
  video.addEventListener('ended', () => {
    if (state.wallpaper.paused) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensurePlaying();
  });

  window.addEventListener('pointerdown', ensurePlaying, { once: true });
  window.addEventListener('keydown', ensurePlaying, { once: true });

  ensurePlaying();
}

loadLocalStorageState();
initWallpaperLooper();
wireEvents();
fetchGamesCatalog();
