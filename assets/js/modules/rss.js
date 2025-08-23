import { FEEDS, TZ, CACHE_TTL_MS } from './config.js';

const CACHE_KEY = 'jj_news_v4';         // bumped: now carries description text
const FEED_TIMEOUT_MS = 2000;
const DEADLINE_MS = 2500;
const MAX_ITEMS = 8;
const MAX_PER_SOURCE = 3;         // NEW: diversify


let inflight = false;
let finalized = false;

function bylineFrom(item){
  const txt = sel => item.querySelector(sel)?.textContent?.trim() || '';
  // Common cases (CityBeat uses dc:creator)
  let b = txt('dc\\:creator') || txt('author > name') || txt('author') || txt('media\\:credit');
  if (b) return b;
  // Fallback: any namespaced *:creator
  for (const n of item.children || []) {
    if (/:creator$/i.test(n.nodeName)) {
      const t = n.textContent.trim();
      if (t) return t;
    }
  }
  return '';
}


function readCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL_MS) return data;
  }catch{}
  return null;
}
function writeCache(data){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }catch{}
}

function textOf(el){ return el?.textContent?.trim() || ''; }

function extractFirstImgFromHTML(html){
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html || '');
  return m ? m[1] : '';
}

function pickImage(itemEl){
  const mediaEls = itemEl.querySelectorAll('media\\:content, media\\:thumbnail');
  let url = '', w, h, caption = '';
  for (const m of mediaEls) {
    const u = m.getAttribute('url');
    if (u) {
      url = u; w = m.getAttribute('width'); h = m.getAttribute('height');
      const desc = m.querySelector('media\\:description') || itemEl.querySelector('media\\:description');
      if (desc) caption = textOf(desc);
      break;
    }
  }
  if (!url) {
    const enc = itemEl.querySelector('enclosure[url][type^="image/"]');
    if (enc) url = enc.getAttribute('url');
  }
  if (!url) {
    const cdata = textOf(itemEl.querySelector('content\\:encoded'));
    url = extractFirstImgFromHTML(cdata) || extractFirstImgFromHTML(textOf(itemEl.querySelector('description')));
  }
  if (!caption) caption = textOf(itemEl.querySelector('media\\:description')) || '';
  return { url, width: w ? Number(w) : undefined, height: h ? Number(h) : undefined, caption };
}

function render(list){
  const ul = document.getElementById('news-list');
  if (!ul) return;
  const fmt = new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true, timeZone:TZ });
  ul.innerHTML = list.map(({title, link, pubDate, source, byline})=>{
    const by = byline ? ` · by ${byline}` : '';
    return `<li><a href="${link}" target="_blank" rel="noopener">${title}</a><br>
            <span class="source">${source}${by} · ${fmt.format(pubDate)}</span></li>`;
  }).join('');
}

function packUnique(items, heroLink=null){
  const seen = new Set();
  const perSource = new Map();
  const out = [];
  for (const it of items.sort((a,b)=> b.pubDate - a.pubDate)) {
    const k = `${it.title}::${it.link}`;
    if (seen.has(k)) continue;
    if (heroLink && it.link === heroLink) continue; // drop hero from rail
    const n = perSource.get(it.source) || 0;
    if (n >= MAX_PER_SOURCE) continue;
    perSource.set(it.source, n+1);
    seen.add(k);
    out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function finalize(items){
  if (finalized) return;
  finalized = true;

  const heroChoice = (()=>{
    try { return JSON.parse(localStorage.getItem('jj_hero_choice'))?.link || null; }
    catch { return null; }
  })();

  const list = packUnique(items, heroChoice);

  const ul = document.getElementById('news-list');
  if (!list.length) { if (ul) ul.innerHTML = '<li class="muted">No headlines found.</li>'; return; }

  writeCache(list);
  render(list);
  window.dispatchEvent(new CustomEvent('jj:newsUpdated'));
}

async function fetchFeed(url, label){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), FEED_TIMEOUT_MS);

  try{
    const res = await fetch(`/api/rss-proxy?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    const sourceLabel =
      label ||
      doc.querySelector('channel > title')?.textContent?.trim() ||
      doc.querySelector('feed > title')?.textContent?.trim() ||
      new URL(url).hostname;

    const out = [];
    doc.querySelectorAll('item, entry').forEach(it=>{
      const title = textOf(it.querySelector('title'));
      const linkEl = it.querySelector('link');
      const link = linkEl?.getAttribute?.('href') || textOf(linkEl) || '';
      const whenStr = textOf(it.querySelector('pubDate')) || textOf(it.querySelector('updated')) || textOf(it.querySelector('published'));
      const d = whenStr ? new Date(whenStr) : new Date();
      const byline =
        textOf(it.querySelector('dc\\:creator')) ||
        textOf(it.querySelector('author > name')) ||
        textOf(it.querySelector('author')) ||
        textOf(it.querySelector('media\\:credit'));

      const byline = bylineFrom(it);

      const img = pickImage(it);
      // description text (strip tags)
      const descRaw = it.querySelector('content\\:encoded, description');
      const descText = (descRaw ? descRaw.textContent : '').replace(/<[^>]+>/g, '').trim();
      const descLen = descText.length;

      if (title && link) out.push({
        title, link, pubDate: isNaN(d.getTime()) ? new Date() : d,
        source: sourceLabel, byline,
        imageUrl: img.url || '', imageCaption: img.caption || '',
        imageWidth: img.width, imageHeight: img.height,
        description: descText, descLen
      });
    });
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function startNews(){
  if (inflight) return;
  inflight = true;

  const ul = document.getElementById('news-list');
  if (ul) ul.innerHTML = '<li class="muted">Loading headlines…</li>';

  const cached = readCache();
  if (cached && cached.length){
    render(cached);
    inflight = false;
    window.dispatchEvent(new CustomEvent('jj:newsUpdated'));
    return;
  }

  // After export function startNews(){...}
window.addEventListener('jj:heroSelected', () => {
  const cached = readCache();
  if (!cached || !cached.length) return;
  const heroLink = (()=>{
    try { return JSON.parse(localStorage.getItem('jj_hero_choice'))?.link || null; }
    catch { return null; }
  })();
  const list = packUnique(cached, heroLink);
  writeCache(list);
  render(list);
});


  const items = [];
  let renderedEarly = false;
  const doneOne = (list=[]) => {
    if (finalized) return;
    for (const it of list) items.push(it);
    if (!renderedEarly && items.length >= MAX_ITEMS){
      renderedEarly = true;
      finalize(items);
    }
  };

  const promises = FEEDS.map(({url, label}) => fetchFeed(url, label).then(doneOne));
  const deadline = setTimeout(() => finalize(items), DEADLINE_MS);

  Promise.allSettled(promises).then(() => {
    clearTimeout(deadline);
    finalize(items);
    inflight = false;
  });
}
