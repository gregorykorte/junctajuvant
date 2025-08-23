import { FEEDS, TZ, CACHE_TTL_MS } from './config.js';

// bump cache key to include image metadata
const CACHE_KEY = 'jj_news_v2';
let inflight = false;

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

function textOf(el){
  return el?.textContent?.trim() || '';
}

function extractFirstImgFromHTML(html){
  // very light regex to find first <img src="...">
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html || '');
  return m ? m[1] : '';
}

function pickImage(itemEl, doc){
  // media:content (preferred)
  const media = itemEl.querySelector('media\\:content[url], content');
  const mediaEls = itemEl.querySelectorAll('media\\:content, media\\:thumbnail');
  let url = '';
  let w, h, caption = '';

  // try explicit media:content/thumbnail nodes
  for (const m of mediaEls) {
    const u = m.getAttribute('url');
    if (u) {
      url = u;
      w = m.getAttribute('width');
      h = m.getAttribute('height');
      const desc = m.querySelector('media\\:description') || itemEl.querySelector('media\\:description');
      if (desc) caption = textOf(desc);
      break;
    }
  }
  // enclosure fallback
  if (!url) {
    const enc = itemEl.querySelector('enclosure[url][type^="image/"]');
    if (enc) url = enc.getAttribute('url');
  }
  // content:encoded / description HTML <img> fallback
  if (!url) {
    const cdata = textOf(itemEl.querySelector('content\\:encoded'));
    url = extractFirstImgFromHTML(cdata);
  }
  if (!url) {
    const descHTML = textOf(itemEl.querySelector('description'));
    url = extractFirstImgFromHTML(descHTML);
  }

  // caption fallback
  if (!caption) {
    caption = textOf(itemEl.querySelector('media\\:description')) || '';
  }

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

async function fetchData(){
  const items = [];
  await Promise.all(FEEDS.map(async ({url, label})=>{
    try{
      const res = await fetch(`/api/rss-proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) return;
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const fallbackTitle = doc.querySelector('channel > title')?.textContent?.trim() || doc.querySelector('feed > title')?.textContent?.trim() || new URL(url).hostname;
      const sourceLabel = label || fallbackTitle;

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

        // image extraction
        const img = pickImage(it, doc);

        // description length proxy (strip tags quickly)
        const descRaw = it.querySelector('content\\:encoded, description');
        const descText = (descRaw ? descRaw.textContent : '').replace(/<[^>]+>/g, '').trim();
        const descLen = descText.length;

        if (title && link) items.push({
          title, link, pubDate: isNaN(d.getTime()) ? new Date() : d,
          source: sourceLabel, byline,
          imageUrl: img.url || '',
          imageCaption: img.caption || '',
          imageWidth: img.width,
          imageHeight: img.height,
          descLen
        });
      });
    }catch{}
  }));

  if (!items.length) return [];
  const seen = new Set();
  return items
    .filter(it => { const k = `${it.title}::${it.link}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a,b)=> b.pubDate - a.pubDate)
    .slice(0, 8);
}

async function refresh(){
  if (inflight) return;
  const ul = document.getElementById('news-list');
  if (ul && !ul.children.length) ul.innerHTML = '<li class="muted">Loading headlines…</li>';

  const cached = readCache();
  if (cached && cached.length){ render(cached); }
  if (cached) return; // fresh within TTL

  inflight = true;
  try{
    const data = await fetchData();
    if (data.length){ writeCache(data); render(data); }
    else if (ul) ul.innerHTML = '<li class="muted">No headlines found.</li>';
  }catch{
    if (ul) ul.innerHTML = '<li class="muted">No headlines found.</li>';
  }finally{ inflight = false; }
}

export function startNews(){
  refresh();
  setInterval(refresh, CACHE_TTL_MS);
}
