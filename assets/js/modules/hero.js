import { TZ } from './config.js';

const CACHE_KEY = 'jj_news_v4'; // keep in sync with rss.js cache key

const BLOCKED_HOSTS = ['gettyimages','istockphoto','shutterstock','unsplash','pexels','pixabay'];
const BLOCKED_TERMS = ['getty','istock','shutterstock','unsplash','pexels','pixabay','courtesy','provided','handout','stock photo'];

const SOURCE_WEIGHT = {
  'Signal Cincinnati': 5, 'WVXU': 4, 'WCPO': 4, 'WLWT': 4,
  'Cincinnati Magazine': 3, 'Cincinnati Business Courier': 3, 'CityBeat': 3,
  'The Cincinnati Herald': 3, 'The News Record': 2, 'Soapbox Cincinnati': 2,
  'American Israelite': 2, 'Catholic Telegraph': 2
};

function fromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data } = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function isBlocked(url = '', caption = '') {
  const u = url.toLowerCase();
  const c = (caption || '').toLowerCase();
  if (!u) return true;
  if (!/^https:\/\//i.test(u)) return true;         // avoid http/mixed content
  if (BLOCKED_HOSTS.some(h => u.includes(h))) return true;
  if (BLOCKED_TERMS.some(t => c.includes(t))) return true;
  return false;
}

function scoreItem(it) {
  // Must have usable image and a real description
  if (!it.description || it.descLen < 60) return -1e9;
  if (!it.imageUrl || isBlocked(it.imageUrl, it.imageCaption || '')) return -1e9;

  const ageHrs = Math.abs((Date.now() - new Date(it.pubDate).getTime()) / 36e5);
  if (ageHrs > 36) return -1e9;

  const recency = Math.max(0, 24 - ageHrs); // 0..24
  const w = Number(it.imageWidth || 0), h = Number(it.imageHeight || 0);
  const ratio = w && h ? w / h : 1.6;

  let quality = 0;
  if (w >= 800) quality += 3;
  if (ratio > 1.25 && ratio < 2.0) quality += 2;
  if ((it.imageCaption || '').length >= 40) quality += 1;
  if ((it.descLen || 0) > 400) quality += 1;

  const sourceW = SOURCE_WEIGHT[it.source] || 0;
  const wcpoBonus = it.source === 'WCPO' && (it.imageCaption || '').length ? 2 : 0;

  return recency * 2 + quality + sourceW + wcpoBonus;
}

function setHero(it) {
  const fig = document.querySelector('.hero');
  const img = fig?.querySelector('img');
  if (!fig || !img) return;

  // Headline link (bold black, no underline per CSS)
  const a = document.getElementById('hero-link');
  if (a) { a.textContent = it.title || ''; a.href = it.link || '#'; }

  // Meta (styled like rail via .source class)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
  const src = document.getElementById('hero-source');
  const when = document.getElementById('hero-time');
  const by = document.getElementById('hero-byline');

  if (src) src.textContent = it.source || '';
  if (when) when.textContent = fmt.format(new Date(it.pubDate));
  if (by)   by.textContent = it.byline ? ` · by ${it.byline}` : '';

  // Image & alt
  img.src = it.imageUrl;
  img.alt = it.title || 'Feature photo';

  // Description
  const desc = document.getElementById('hero-desc');
  if (desc) desc.textContent = it.description || '';

  // Make the whole figure click through as well
  const open = () => { if (it.link) window.open(it.link, '_blank', 'noopener'); };
  fig.style.cursor = 'pointer';
  fig.setAttribute('role','link');
  fig.tabIndex = 0;
  fig.onclick = open;
  fig.onkeyup = (e)=>{ if (e.key === 'Enter') open(); };

  // Record hero choice so rail can drop it; notify
  try { localStorage.setItem('jj_hero_choice', JSON.stringify({ link: it.link, ts: Date.now() })); } catch {}
  window.dispatchEvent(new CustomEvent('jj:heroSelected', { detail: { link: it.link } }));
}

function setHero(it){ /* your existing setHero(...) unchanged */ }

export function startHero(){
  // Use server-picked hero when available
  window.addEventListener('jj:newsHero', (e)=> { if (e.detail) setHero(e.detail); });
  // Fallback (in case user loads before /api/news returns)
  // chooseAndSet();  // optional if you want immediate attempt from any stale cache
}


function chooseAndSet() {
  const list = fromCache() || [];
  const candidates = list.filter(it => it.imageUrl && it.description && it.descLen >= 60);
  if (!candidates.length) return;
  candidates.sort((a, b) => scoreItem(b) - scoreItem(a));
  const winner = candidates[0];
  if (scoreItem(winner) < 0) return;
  setHero(winner);
}

export function startHero() {
  // Try immediately; then react when news updates
  chooseAndSet();
  window.addEventListener('jj:newsUpdated', chooseAndSet);
}
