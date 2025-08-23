// /assets/js/modules/hero.js
const CACHE_KEY = 'jj_news_v2';

const BLOCKED_HOSTS = [
  'gettyimages', 'istockphoto', 'shutterstock', 'unsplash', 'pexels', 'pixabay'
];
const BLOCKED_TERMS = ['getty', 'istock', 'shutterstock', 'unsplash', 'pexels', 'pixabay', 'courtesy', 'provided', 'handout', 'stock photo'];

const SOURCE_WEIGHT = {
  'Signal Cincinnati': 5, 'WVXU': 4, 'WCPO': 4, 'WLWT': 4,
  'Cincinnati Magazine': 3, 'Cincinnati Business Courier': 3, 'CityBeat': 3,
  'The Cincinnati Herald': 3, 'The News Record': 2, 'Soapbox Cincinnati': 2,
  'American Israelite': 2, 'Catholic Telegraph': 2
};

function fromCache() {
  try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null; return JSON.parse(raw).data; } catch { return null; }
}
function isBlocked(url='', caption=''){
  const u = url.toLowerCase(), c = caption.toLowerCase();
  if (!u) return true;
  if (!/^https:\/\//i.test(u)) return true;
  if (BLOCKED_HOSTS.some(h => u.includes(h))) return true;
  if (BLOCKED_TERMS.some(t => c.includes(t))) return true;
  return false;
}
function scoreItem(it){
  if (!it.imageUrl || isBlocked(it.imageUrl, it.imageCaption||'')) return -1e9;
  const ageHrs = Math.abs((Date.now() - new Date(it.pubDate).getTime()) / 36e5);
  if (ageHrs > 36) return -1e9;
  const recency = Math.max(0, 24 - ageHrs);
  const w = Number(it.imageWidth||0), h = Number(it.imageHeight||0);
  const ratio = w && h ? w/h : 1.6;
  let quality = 0;
  if (w >= 800) quality += 3;
  if (ratio > 1.25 && ratio < 2.0) quality += 2;
  if ((it.imageCaption||'').length >= 40) quality += 1;
  if ((it.descLen||0) > 400) quality += 1;
  const sourceW = SOURCE_WEIGHT[it.source] || 0;
  const wcpoBonus = it.source === 'WCPO' && (it.imageCaption||'').length ? 2 : 0;
  return recency * 2 + quality + sourceW + wcpoBonus;
}
function setHero(it){
  const fig = document.querySelector('.hero');
  const img = fig?.querySelector('img');
  if (!fig || !img) return;
  img.src = it.imageUrl;
  img.alt = it.title || 'Feature photo';
  // Click-through
  fig.style.cursor = 'pointer';
  fig.setAttribute('role', 'link');
  fig.tabIndex = 0;
  const open = () => { if (it.link) window.open(it.link, '_blank', 'noopener'); };
  fig.onclick = open;
  fig.onkeyup = (e)=>{ if (e.key === 'Enter') open(); };
}
function chooseAndSet(){
  const list = fromCache() || [];
  const candidates = list.filter(it => it.imageUrl);
  if (!candidates.length) return;
  candidates.sort((a,b)=> scoreItem(b) - scoreItem(a));
  const winner = candidates[0];
  if (scoreItem(winner) < 0) return;
  setHero(winner);
}

export function startHero(){
  // Try right away (cache might already exist), then listen for updates
  chooseAndSet();
  window.addEventListener('jj:newsUpdated', chooseAndSet);
}
