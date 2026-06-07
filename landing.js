/* ─── Landing page logic ─────────────────────────────────────── */

const $ = id => document.getElementById(id);

const urlInput      = $('urlInput');
const generateBtn   = $('generateBtn');
const inputWrap     = $('inputWrap');
const inputHint     = $('inputHint');
const progressOverlay = $('progressOverlay');
const overlayTitle  = $('overlayTitle');
const overlayMsg    = $('overlayMsg');
const progressFill  = $('progressFill');
const progressLabel = $('progressLabel');
const toast         = $('toast');

/* ─── Particles (same as shelf) ──────────────────────────────── */
class Particles {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.pts = [];
    this.resize();
    this.spawn();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
    window.addEventListener('resize', () => { this.resize(); this.pts = []; this.spawn(); });
  }
  resize() { this.c.width = window.innerWidth; this.c.height = window.innerHeight; }
  spawn() {
    const n = Math.min(70, Math.floor(this.c.width * this.c.height / 18000));
    for (let i = 0; i < n; i++) {
      this.pts.push({
        x: Math.random() * this.c.width, y: Math.random() * this.c.height,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        r: Math.random() * 1.1 + 0.4, a: Math.random() * 0.4 + 0.08,
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
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(201,168,76,${0.07 * (1 - d / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(this.tick);
  }
}

/* ─── Toast ──────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  $('toastMsg').textContent = msg;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
}

/* ─── Input validation ───────────────────────────────────────── */
function extractUserId(url) {
  const m = url.match(/goodreads\.com\/user\/show\/(\d+)/);
  return m ? m[1] : null;
}

function setError(msg) {
  inputWrap.classList.add('error');
  inputHint.textContent = msg;
  inputHint.classList.add('error-msg');
  inputHint.style.opacity = '1';
  setTimeout(() => inputWrap.classList.remove('error'), 500);
}

function clearError() {
  inputHint.textContent = 'e.g. goodreads.com/user/show/168975936-your-name';
  inputHint.classList.remove('error-msg');
}

/* ─── Progress overlay ───────────────────────────────────────── */
function showOverlay(title, msg) {
  overlayTitle.textContent = title;
  overlayMsg.textContent   = msg;
  progressFill.style.width = '0%';
  progressLabel.textContent = '';
  progressOverlay.classList.add('active');
}

function updateOverlay(title, msg, pct, label) {
  if (title) overlayTitle.textContent = title;
  if (msg)   overlayMsg.textContent   = msg;
  if (pct !== undefined) progressFill.style.width = `${pct}%`;
  if (label !== undefined) progressLabel.textContent = label;
}

function hideOverlay() {
  progressOverlay.classList.remove('active');
}

/* ─── Poll sync status ───────────────────────────────────────── */
let pollTimer = null;
let _pollUserId = '';
let _pollSlug   = '';

function pollStatus(userId, slug) {
  _pollUserId = userId;
  _pollSlug   = slug;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/sync-status/${userId}`);
      const data = await res.json();

      if (data.status === 'done') {
        const dest = data.slug || slug || userId;
        updateOverlay('All set!', 'Your shelf is ready.', 100, `${data.total} books loaded`);
        setTimeout(() => { window.location.href = `/shelf/${dest}`; }, 800);
        return;
      }

      if (data.status === 'error') {
        hideOverlay();
        generateBtn.disabled = false;
        setError(data.message || 'Something went wrong. Please try again.');
        return;
      }

      if (data.status === 'running') {
        const phase    = data.phase || 'fetching';
        const progress = data.progress || 0;
        const total    = data.total   || 0;

        if (phase === 'fetching') {
          updateOverlay('Fetching your books…', 'Reading your Goodreads shelf', 15);
        } else if (phase === 'saving') {
          updateOverlay('Saving your library…', 'Storing books to database', 40);
        } else if (phase === 'genres') {
          const pct = total > 0 ? Math.round(40 + (progress / total) * 55) : 50;
          updateOverlay(
            'Classifying genres…',
            'Looking up each book on Open Library',
            pct,
            total > 0 ? `${progress} / ${total} books` : ''
          );
        }
      }

      pollStatus(userId, slug);
    } catch {
      pollStatus(userId, slug);
    }
  }, 2500);
}

/* ─── Generate handler ───────────────────────────────────────── */
async function handleGenerate() {
  const raw    = urlInput.value.trim();
  const userId = extractUserId(raw);

  if (!userId) {
    setError('Please enter a valid Goodreads profile URL');
    return;
  }

  clearError();
  generateBtn.disabled = true;
  showOverlay('Connecting to Goodreads…', 'Checking your profile');

  try {
    const res  = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: raw }),
    });
    const data = await res.json();

    if (!res.ok) {
      hideOverlay();
      generateBtn.disabled = false;
      setError(data.error || 'Something went wrong. Please try again.');
      return;
    }

    if (data.status === 'exists') {
      const dest = data.slug || data.user_id;
      updateOverlay('Welcome back!', `Found ${data.total} books`, 100, 'Redirecting…');
      setTimeout(() => { window.location.href = `/shelf/${dest}`; }, 700);
      return;
    }

    if (data.status === 'running' || data.status === 'started') {
      updateOverlay('Fetching your books…', 'Reading your Goodreads shelf', 10);
      pollStatus(data.user_id, data.slug || '');
      return;
    }

    hideOverlay();
    generateBtn.disabled = false;
    setError(data.error || 'Unexpected response. Please try again.');
  } catch {
    hideOverlay();
    generateBtn.disabled = false;
    setError('Connection error — is the server reachable?');
  }
}

/* ─── Nav scroll ─────────────────────────────────────────────── */
function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

/* ─── Load existing shelf ────────────────────────────────────── */
const slugInput = $('slugInput');
const loadBtn   = $('loadBtn');
const slugHint  = $('slugHint');

async function handleLoad() {
  const slug = slugInput.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!slug) return;

  loadBtn.disabled = true;
  slugHint.textContent = 'Looking up your shelf…';
  slugHint.classList.remove('error-msg');

  try {
    const res  = await fetch(`/api/check-slug/${encodeURIComponent(slug)}`);
    const data = await res.json();

    if (data.exists) {
      window.location.href = `/shelf/${slug}`;
    } else {
      slugHint.textContent = 'Shelf not found. Check your username or build one above.';
      slugHint.classList.add('error-msg');
      loadBtn.disabled = false;
    }
  } catch {
    slugHint.textContent = 'Connection error. Please try again.';
    slugHint.classList.add('error-msg');
    loadBtn.disabled = false;
  }
}

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = $('particles-canvas');
  if (canvas) new Particles(canvas);

  initNavScroll();

  generateBtn.addEventListener('click', handleGenerate);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGenerate(); });
  urlInput.addEventListener('input', () => {
    if (inputHint.classList.contains('error-msg')) clearError();
  });

  loadBtn.addEventListener('click', handleLoad);
  slugInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLoad(); });
  slugInput.addEventListener('input', () => {
    slugHint.textContent = 'Already have a shelf? Enter your username';
    slugHint.classList.remove('error-msg');
  });
});
