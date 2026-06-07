/* ─── Slug from URL path (/shelf/<slug>) ────────────────────── */
const SLUG = window.location.pathname.split('/').filter(Boolean)[1] || '';

/* ─── Fixed genre list (approved) ───────────────────────────── */
const GENRES = [
  'Fantasy', 'Science Fiction', 'Mystery & Crime', 'Thriller & Suspense',
  'Historical Fiction', 'Classic Literature', 'Non-Fiction', 'Self-Help',
  'Romance', 'Horror & Supernatural', 'Mythology & Folklore', 'Political & Social',
];

/* ─── State ──────────────────────────────────────────────────── */
const S = {
  all: [],
  filtered: [],
  genre: '',
  year: '',
  minRating: 0,
  query: '',
  sort: 'year_read_desc',
  lastUpdated: null,
};

/* ─── DOM refs ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const booksGrid    = $('booksGrid');
const skeletonGrid = $('skeletonGrid');
const emptyState   = $('emptyState');
const searchInput  = $('searchInput');
const searchClear  = $('searchClear');
const yearFilter   = $('yearFilter');
const sortFilter   = $('sortFilter');
const genreChips   = $('genreChips');
const starFilter   = $('starFilter');
const resetBtn     = $('resetBtn');
const syncBtn      = $('syncBtn');
const emptySyncBtn = $('emptySyncBtn');
const resultCount  = $('resultCount');
const lastUpdEl    = $('lastUpdated');
const modalBackdrop = $('modalBackdrop');
const modal        = $('modal');
const modalClose   = $('modalClose');
const modalInner   = $('modalInner');
const syncOverlay  = $('syncOverlay');
const toast        = $('toast');
const shareBtn     = $('shareBtn');

gsap.registerPlugin(ScrollTrigger, Flip);

/* ═══════════════════════════════════════════════════════════════
   PARTICLES
═══════════════════════════════════════════════════════════════ */
class Particles {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.pts = [];
    this.raf = null;
    this.resize();
    this.spawn();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
    window.addEventListener('resize', () => { this.resize(); this.pts = []; this.spawn(); });
  }
  resize() {
    this.c.width  = window.innerWidth;
    this.c.height = window.innerHeight;
  }
  spawn() {
    const n = Math.min(90, Math.floor(this.c.width * this.c.height / 16000));
    for (let i = 0; i < n; i++) {
      this.pts.push({
        x:  Math.random() * this.c.width,
        y:  Math.random() * this.c.height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r:  Math.random() * 1.1 + 0.4,
        a:  Math.random() * 0.45 + 0.08,
      });
    }
  }
  tick() {
    const { x: ctx, c: cv, pts } = this;
    ctx.clearRect(0, 0, cv.width, cv.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > cv.width)  p.vx *= -1;
      if (p.y < 0 || p.y > cv.height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.a})`;
      ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(201,168,76,${0.07 * (1 - d / 130)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  }
}

/* ═══════════════════════════════════════════════════════════════
   HERO ENTRANCE
═══════════════════════════════════════════════════════════════ */
function playHeroEntrance() {
  const tl = gsap.timeline({ delay: 0.2 });
  tl
    .to('.hero-eyebrow', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })
    .to('.hero-line-1',  { opacity: 1, y: 0, duration: 1,   ease: 'power4.out' }, '-=0.5')
    .to('.hero-line-2',  { opacity: 1, y: 0, duration: 1,   ease: 'power4.out' }, '-=0.72')
    .to('.hero-sub',     { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.55')
    .to('.stats-row',    { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.4')
    .to('.hero-scroll',  { opacity: 1,       duration: 0.7 },                     '-=0.2');
}

/* ═══════════════════════════════════════════════════════════════
   COUNTER ANIMATION
═══════════════════════════════════════════════════════════════ */
function animateCounters(books) {
  const yr   = String(new Date().getFullYear());
  const thisYr  = books.filter(b => b.year_read === yr).length;
  const genreSet = new Set(books.map(b => b.primary_genre).filter(Boolean));
  const rated  = books.filter(b => b.user_rating > 0);
  const avgRat = rated.length ? rated.reduce((s, b) => s + b.user_rating, 0) / rated.length : 0;

  [
    { el: $('statTotal'),   val: books.length, dec: false },
    { el: $('statYear'),    val: thisYr,        dec: false },
    { el: $('statGenres'),  val: genreSet.size, dec: false },
    { el: $('statRating'),  val: avgRat,        dec: true  },
  ].forEach(({ el, val, dec }) => {
    gsap.fromTo({ n: 0 }, { n: 0 }, {
      n: val, duration: 2.2, ease: 'power2.out', delay: 0.6,
      onUpdate() { el.textContent = dec ? this.targets()[0].n.toFixed(1) : Math.round(this.targets()[0].n); },
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   BUILD FILTER CONTROLS
═══════════════════════════════════════════════════════════════ */
function buildFilters(books) {
  /* Year */
  const years = [...new Set(books.map(b => b.year_read).filter(Boolean))].sort((a, b) => b - a);
  yearFilter.innerHTML = '<option value="">All Years</option>';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearFilter.appendChild(o);
  });

  /* Fixed genre chips — only show genres that have at least one book */
  const present = new Set(books.map(b => b.primary_genre).filter(Boolean));
  genreChips.innerHTML = '';
  GENRES.filter(g => present.has(g)).forEach(g => {
    const chip = document.createElement('button');
    chip.className = 'genre-chip';
    chip.textContent = g;
    chip.dataset.g = g;
    chip.addEventListener('click', () => selectGenre(g, chip));
    genreChips.appendChild(chip);
  });

  /* Star rating filter */
  starFilter.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'sf-star';
    btn.textContent = '★';
    btn.dataset.r = i;
    btn.setAttribute('aria-label', `${i} star minimum`);
    btn.addEventListener('click',      () => setMinRating(i));
    btn.addEventListener('mouseenter', () => hoverStars(i));
    btn.addEventListener('mouseleave', () => hoverStars(S.minRating));
    starFilter.appendChild(btn);
  }
}

function selectGenre(g, chip) {
  if (S.genre === g) {
    S.genre = '';
    chip.classList.remove('active');
  } else {
    S.genre = g;
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  }
  runFilter();
}

function setMinRating(r) {
  S.minRating = S.minRating === r ? 0 : r;
  hoverStars(S.minRating);
  runFilter();
}

function hoverStars(count) {
  document.querySelectorAll('.sf-star').forEach((s, i) => s.classList.toggle('lit', i < count));
}

/* ═══════════════════════════════════════════════════════════════
   FILTER + SORT
═══════════════════════════════════════════════════════════════ */
function runFilter() {
  let books = S.all;
  const q = S.query.toLowerCase();

  if (q) books = books.filter(b =>
    b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
  );
  if (S.year) books = books.filter(b => b.year_read === S.year);
  if (S.genre) books = books.filter(b => b.primary_genre === S.genre);
  if (S.minRating > 0) books = books.filter(b => b.user_rating >= S.minRating);

  books = [...books].sort((a, b) => {
    switch (S.sort) {
      case 'year_read_desc': return (b.year_read||'0').localeCompare(a.year_read||'0');
      case 'year_read_asc':  return (a.year_read||'9').localeCompare(b.year_read||'9');
      case 'rating_desc':    return b.user_rating - a.user_rating;
      case 'rating_asc':     return a.user_rating - b.user_rating;
      case 'title_asc':      return a.title.localeCompare(b.title);
      case 'title_desc':     return b.title.localeCompare(a.title);
      default: return 0;
    }
  });

  S.filtered = books;
  renderBooks(books);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER BOOKS
═══════════════════════════════════════════════════════════════ */
function renderBooks(books) {
  resultCount.textContent = books.length;

  if (books.length === 0) {
    booksGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    const hasActiveFilters = S.query || S.year || S.genre || S.minRating;
    $('emptyTitle').textContent = hasActiveFilters ? 'No books match' : 'Library is empty';
    $('emptyMsg').textContent   = hasActiveFilters ? 'Try different filters' : 'Sync your Goodreads library to get started';
    return;
  }

  emptyState.style.display = 'none';
  booksGrid.style.display = 'grid';
  booksGrid.innerHTML = books.map(bookCardHTML).join('');

  const cards = [...booksGrid.querySelectorAll('.book-card')];

  gsap.fromTo(cards,
    { opacity: 0, y: 28, scale: 0.97 },
    {
      opacity: 1, y: 0, scale: 1,
      duration: 0.48,
      stagger: { amount: Math.min(1.2, cards.length * 0.05), ease: 'power1.out' },
      ease: 'power3.out',
      clearProps: 'transform,opacity',
    }
  );

  cards.forEach((card, i) => {
    const book = books[i];
    card.addEventListener('mousemove',  e => tiltCard(e, card));
    card.addEventListener('mouseleave', () => resetTilt(card));
    card.addEventListener('click',      () => openModal(book));
  });

  ScrollTrigger.refresh();
}

/* ═══════════════════════════════════════════════════════════════
   CARD HTML
═══════════════════════════════════════════════════════════════ */
function bookCardHTML(book) {
  const isGoodreadPlaceholder = !book.cover ||
    book.cover.includes('nophoto') ||
    book.cover.includes('nocover') ||
    book.cover.endsWith('/nophoto_');

  const coverHTML = isGoodreadPlaceholder
    ? `<div class="card-cover-fallback">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
           <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
           <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
         </svg>
         <span>${esc(book.title)}</span>
       </div>`
    : `<img
         src="${esc(book.cover)}"
         alt="${esc(book.title)}"
         loading="lazy"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
       />
       <div class="card-cover-fallback" style="display:none">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
           <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
           <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
         </svg>
         <span>${esc(book.title)}</span>
       </div>`;

  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star-dot${i < book.user_rating ? ' on' : ''}">★</span>`
  ).join('');

  const genreTag = book.primary_genre ? `<span class="gtag">${esc(book.primary_genre)}</span>` : '';

  return `
    <article class="book-card" data-id="${book.id}">
      <div class="card-cover">
        ${coverHTML}
        <div class="card-grad"></div>
        ${book.year_read ? `<div class="card-year">${book.year_read}</div>` : ''}
        <div class="card-peek"><button class="peek-btn">View Details</button></div>
        <div class="card-shine"></div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(book.title)}</div>
        <div class="card-author">${esc(book.author)}</div>
        <div class="card-stars">${stars}</div>
        ${genreTag ? `<div class="card-genres">${genreTag}</div>` : ''}
      </div>
    </article>`;
}

/* ═══════════════════════════════════════════════════════════════
   3D TILT
═══════════════════════════════════════════════════════════════ */
function tiltCard(e, card) {
  const r    = card.getBoundingClientRect();
  const cx   = r.width  / 2;
  const cy   = r.height / 2;
  const x    = e.clientX - r.left - cx;
  const y    = e.clientY - r.top  - cy;
  const rotX = (y / cy) * -7;
  const rotY = (x / cx) *  7;

  gsap.to(card, {
    rotateX: rotX, rotateY: rotY,
    transformPerspective: 900,
    duration: 0.28, ease: 'power1.out',
  });

  const shine = card.querySelector('.card-shine');
  const px = ((e.clientX - r.left) / r.width)  * 100;
  const py = ((e.clientY - r.top)  / r.height) * 100;
  shine.style.background =
    `radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,0.07) 0%, transparent 55%)`;
}

function resetTilt(card) {
  gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.55, ease: 'power2.out' });
  card.querySelector('.card-shine').style.background = '';
}

/* ═══════════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════════════ */
function openModal(book) {
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="meta-star${i < book.user_rating ? ' on' : ''}">★</span>`
  ).join('');

  const isPlaceholder = !book.cover || book.cover.includes('nophoto') || book.cover.includes('nocover');
  const coverHTML = isPlaceholder
    ? `<div class="modal-cover-fallback">📖</div>`
    : `<img src="${esc(book.cover)}" alt="${esc(book.title)}"
           onerror="this.parentElement.innerHTML='<div class=modal-cover-fallback>📖</div>'"/>
       <div class="modal-cover-fade"></div>`;

  const genreHTML = book.primary_genre ? `<span class="modal-genre-tag">${esc(book.primary_genre)}</span>` : '';

  modalInner.innerHTML = `
    <div class="modal-cover">${coverHTML}</div>
    <div class="modal-body">
      <div class="modal-eyebrow">Book Details</div>
      <h2 class="modal-title">${esc(book.title)}</h2>
      <div class="modal-author">by ${esc(book.author)}</div>

      <div class="modal-meta">
        ${book.user_rating ? `
          <div class="meta-block">
            <span class="meta-label">My Rating</span>
            <div class="meta-stars">${stars}</div>
          </div>` : ''}
        ${book.avg_rating ? `
          <div class="meta-block">
            <span class="meta-label">Avg Rating</span>
            <span class="meta-val">${book.avg_rating.toFixed(2)} / 5</span>
          </div>` : ''}
        ${book.year_read ? `
          <div class="meta-block">
            <span class="meta-label">Year Read</span>
            <span class="meta-val">${book.year_read}</span>
          </div>` : ''}
        ${book.year_published ? `
          <div class="meta-block">
            <span class="meta-label">Published</span>
            <span class="meta-val">${book.year_published}</span>
          </div>` : ''}
      </div>

      ${genreHTML ? `<div class="modal-genres">${genreHTML}</div>` : ''}

      ${book.description ? `<p class="modal-desc">${esc(book.description)}</p>` : ''}

      ${book.link ? `
        <a href="${book.link}" target="_blank" rel="noopener noreferrer" class="modal-link">
          View on Goodreads
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>` : ''}
    </div>`;

  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  $('toastMsg').textContent = msg;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
}

/* ═══════════════════════════════════════════════════════════════
   SYNC (background — polls /api/sync-status)
═══════════════════════════════════════════════════════════════ */
let syncPollTimer = null;

async function syncLibrary() {
  if (!SLUG) return;
  syncBtn.classList.add('syncing');
  syncOverlay.classList.add('active');

  try {
    const res  = await fetch(`/api/sync/${SLUG}`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'already_running') {
      pollSyncStatus();
      return;
    }
    if (data.status === 'started') {
      pollSyncStatus();
    } else {
      showToast(`Sync failed: ${data.error || 'Unknown error'}`, 'error');
      syncBtn.classList.remove('syncing');
      syncOverlay.classList.remove('active');
    }
  } catch {
    showToast('Connection error — could not start sync', 'error');
    syncBtn.classList.remove('syncing');
    syncOverlay.classList.remove('active');
  }
}

function pollSyncStatus() {
  clearTimeout(syncPollTimer);
  syncPollTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/sync-status/${SLUG}`);
      const data = await res.json();

      if (data.status === 'done') {
        syncBtn.classList.remove('syncing');
        syncOverlay.classList.remove('active');
        await loadBooks(false);
        showToast(`Library synced — ${data.total} books loaded`, 'success');
        return;
      }
      if (data.status === 'error') {
        syncBtn.classList.remove('syncing');
        syncOverlay.classList.remove('active');
        showToast(`Sync failed: ${data.message || 'Unknown error'}`, 'error');
        return;
      }
      // Still running — continue polling
      pollSyncStatus();
    } catch {
      // Network hiccup — keep polling
      pollSyncStatus();
    }
  }, 3000);
}

/* ═══════════════════════════════════════════════════════════════
   SHARE BUTTON
═══════════════════════════════════════════════════════════════ */
function initShareBtn() {
  if (!shareBtn) return;
  const icon  = document.getElementById('shareBtnIcon');
  const label = document.getElementById('shareBtnLabel');
  let resetTimer;

  shareBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch {}

    clearTimeout(resetTimer);
    shareBtn.classList.add('copied');
    icon.innerHTML = '<polyline points="20 6 9 17 4 12" stroke-width="2.5"/>';
    label.textContent = 'Copied!';

    resetTimer = setTimeout(() => {
      shareBtn.classList.remove('copied');
      icon.innerHTML = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';
      label.textContent = 'Share';
    }, 2000);
  });
}

/* ═══════════════════════════════════════════════════════════════
   LOAD BOOKS
═══════════════════════════════════════════════════════════════ */
function showSkeletons() {
  skeletonGrid.style.display = 'grid';
  booksGrid.style.display    = 'none';
  emptyState.style.display   = 'none';
  skeletonGrid.innerHTML = Array.from({ length: 16 }, () => `
    <div class="skel-card">
      <div class="skel-cover"></div>
      <div class="skel-info">
        <div class="skel-line m"></div>
        <div class="skel-line s"></div>
      </div>
    </div>`
  ).join('');
}

function hideSkeletons() {
  skeletonGrid.style.display = 'none';
}

async function loadBooks(skeleton = true) {
  if (!SLUG) {
    hideSkeletons();
    showToast('Invalid shelf URL', 'error');
    return;
  }
  if (skeleton) showSkeletons();

  try {
    const res  = await fetch(`/api/books/${SLUG}`);
    if (!res.ok) {
      hideSkeletons();
      showToast('Shelf not found', 'error');
      return;
    }
    const data = await res.json();
    S.all = data.books || [];
    S.lastUpdated = data.last_updated;

    /* Inject username into nav and hero */
    const username = data.username || 'My';
    const navUsernameEl = $('navUsername');
    const heroNameEl    = $('heroName');
    if (navUsernameEl) navUsernameEl.textContent = `${username}'s Library`;
    if (heroNameEl)    heroNameEl.textContent     = username + "'s";
    document.title = `${username}'s Bookshelf`;

    if (S.lastUpdated && lastUpdEl) {
      const d = new Date(S.lastUpdated);
      lastUpdEl.textContent = `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    hideSkeletons();
    buildFilters(S.all);
    animateCounters(S.all);
    runFilter();
  } catch {
    hideSkeletons();
    showToast('Could not load books — is the server running?', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════ */
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════════ */
function initEvents() {
  /* Search */
  searchInput.addEventListener('input', () => {
    S.query = searchInput.value.trim();
    searchClear.classList.toggle('visible', S.query.length > 0);
    runFilter();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    S.query = '';
    searchClear.classList.remove('visible');
    runFilter();
    searchInput.focus();
  });

  /* Year + Sort */
  yearFilter.addEventListener('change', () => { S.year = yearFilter.value; runFilter(); });
  sortFilter.addEventListener('change', () => { S.sort = sortFilter.value; runFilter(); });

  /* Reset all */
  resetBtn.addEventListener('click', resetFilters);

  /* Sync */
  syncBtn.addEventListener('click', syncLibrary);
  emptySyncBtn.addEventListener('click', syncLibrary);

  /* Modal */
  modalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* Nav scroll effect */
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

function resetFilters() {
  S.query = ''; S.year = ''; S.genre = ''; S.minRating = 0; S.sort = 'year_read_desc';
  searchInput.value = '';
  yearFilter.value  = '';
  sortFilter.value  = 'year_read_desc';
  searchClear.classList.remove('visible');
  hoverStars(0);
  document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
  runFilter();
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  new Particles($('particles-canvas'));
  playHeroEntrance();
  initEvents();
  initShareBtn();
  loadBooks();
});
