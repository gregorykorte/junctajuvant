import { FEEDS, TZ, CACHE_TTL_MS } from './config.js';

const CACHE_KEY = 'jj_news_v1';
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
      const fallbackTitle = doc.querySelector('channel > title')?.textContent?.trim()
        || doc.querySelector('feed > title')?.textContent?.trim()
        || new URL(url).hostname;
      const sourceLabel = label || fallbackTitle;
      doc.querySelectorAll('item, entry').forEach(it=>{
        const title = it.querySelector('title')?.textContent?.trim();
        const linkEl = it.querySelector('link');
        const link = linkEl?.getAttribute?.('href') || linkEl?.textContent?.trim() || '';
        const whenStr = it.querySelector('pubDate')?.textContent
          || it.querySelector('updated')?.textContent
          || it.querySelector('published')?.textContent || '';
        const d = whenStr ? new Date(whenStr) : new Date();
        const byline =
          it.querySelector('dc\\:creator')?.textContent?.trim()
          || it.querySelector('author > name')?.textContent?.trim()
          || it.querySelector('author')?.textContent?.trim()
          || it.querySelector('media\\:credit')?.textContent?.trim() || '';
        if (title && link) items.push({ title, link, pubDate: isNaN(d.getTime()) ? new Date() : d, source: sourceLabel, byline });
      });
    }catch{}
  }));

  if (!items.length) return [];
  const seen = new Set();
  return items
    .filter(it => { const k = `${it.title}::${it.link}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a,b)=> b.pubDate - a.pubDate)
    .slice(0, 8); // limit to eight stories
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
  }finally{
    inflight = false;
  }
}

export function startNews(){
  refresh();
  setInterval(refresh, CACHE_TTL_MS);
}
