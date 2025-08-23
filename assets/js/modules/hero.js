// Picks a hero photo from the cached news list using house rules.
// Reads from localStorage key set by rss.js (jj_news_v2).
const CACHE_KEY = 'jj_news_v2';

const BLOCKED_HOSTS = [
  'gettyimages', 'i0.wp.com/media.gettyimages', 'istockphoto', 'shutterstock',
  'unsplash', 'pexels', 'pixabay'
];

const BLOCKED_TERMS = [
  'getty', 'istock', 'shutterstock', 'unsplash', 'pexels', 'pixabay',
  'courtesy', 'provided', 'handout', 'stock photo'
];

// Preference weights by source (tune freely)
const SOURCE_WEIGHT = {
  'Signal Cincinnati': 5,
  'WVXU': 4,
  'WCPO': 4,
  'WLWT': 4,
  'Cincinnati Magazine': 3,
  'Cincinnati Business Courier': 3,
  'CityBeat': 3,
  'The Cincinnati Herald': 3,
  'The News Record': 2,
  'Soapbox Cincinnati': 2,
  'American Israelite': 2,
  'Catholic Telegraph': 2
};

function fromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!data || !Array.isArray(data)) return null;
    return data;
  } catch { return null; }
}

function isBlocked(url = '', caption = '') {
  const u = url.toLowerCase();
  const c = caption.toLowerCase();
  if (!u && !c) return true;
  if (!/^https:\/\//i.test(u)) return true; // avoid mixed content
  if (BLOCKED_HOSTS.some(h => u.includes(h))) return true;
  if (BLOCKED_TERMS.some(t => c.includes(t))) return true;
  return false;
}

function scoreItem(it) {
  // Hard filters
  if (!it.imageUrl) return -1e9;
  if (isBlocked(it.imageUrl, it.imageCaption || '')) return -1e9;

  // Recency (within 24h strongly preferred)
  const now = Date.now();
  const ageHrs = Math.abs((now - new Date(it.pubDate).getTime()) / 36e5);
  if (ageHrs > 36) return -1e9; // too old
  const recency = Math.max(0, 24 - ageHrs); // 0..24

  // Image quality heuristics
  const w = Number(it.imageWidth || 0);
  const h = Number(it.imageHeight || 0);
  const ratio = w && h ? w / h : 1.6;
  let quality = 0;
  if (w >= 800) quality += 3;
  if (ratio > 1.25 && ratio < 2.0) quality += 2; // landscape-ish
  if ((it.imageCaptio
