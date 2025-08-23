import { TZ, CACHE_TTL_MS } from './config.js';

const CACHE_KEY = 'jj_news_bundle_v1';
const MAX_ITEMS = 8;
const MAX_PER_SOURCE = 3;

let inflight = false;

function readCache(){
  try{ const raw = localStorage.getItem(CACHE_KEY); if(!raw) return null;
    const { ts, data } = JSON.parse(raw); if (Date.now()-ts < CACHE_TTL_MS) return data;
  }catch{} return null;
}
function writeCache(data){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }catch{} }

function text(el){ return el?.textContent?.trim() || ''; }

function bylineFrom(item){
  const t = s => item.querySelector(s)?.textContent?.trim() || '';
  let b = t('dc\\:creator') || t('author > name') || t('author') || t('media\\:credit');
  if (b) return b;
  for (const n of item.children || []) {
    if (/:creator$/i.test(n.nodeName)) { const v = n.textContent.trim(); if (v) return v; }
  }
  return '';
}

function extractFirstImgFromHTML(html){
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html || ''); return m ? m[1] : '';
}
function pickImage(item){
  const media = item.querySelectorAll('media\\:content, media\\:thumbnail');
  let url='', w,h, caption='';
  for (const m of media){ const u=m.getAttribute('url'); if(u){ url=u; w=m.getAttribute('width'); h=m.getAttribute('height');
    const d=m.querySelector('media\\:description')||item.querySelector('media\\:description'); if(d) caption=text(d); break; } }
  if (!url){ const enc=item.querySelector('enclosure[url][type^="image/"]'); if (enc) url=enc.getAttribute('url'); }
  if (!url){ url = extractFirstImgFromHTML(text(item.querySelector('content\\:encoded')) ||
                                          text(item.querySelector('description'))); }
  if (!caption){ caption = text(item.querySelector('media\\:description')) || ''; }
  return { url, width: w?Number(w):undefined, height: h?Number(h):undefined, caption };
}

function parseFeed(xml, label, feedUrl){
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const source = label || text(doc.querySelector('channel > title')) || text(doc.querySelector('feed > title')) || new URL(feedUrl).hostname;
  const out = [];
  doc.querySelectorAll('item, entry').forEach(it=>{
    const title = text(it.querySelector('title'));
    const linkEl = it.querySelector('link');
    const link = linkEl?.getAttribute?.('href') || text(linkEl) || '';
    const whenStr = text(it.querySelector('pubDate')) || text(it.querySelector('updated')) || text(it.querySelector('published'));
    const d = whenStr ? new Date(whenStr) : new Date();
    const byline = bylineFrom(it);
    const img = pickImage(it);
    const descNode = it.querySelector('content\\:encoded, description');
    const description = (descNode ? descNode.textContent : '').replace(/<[^>]+>/g, '').trim();
    const descLen = description.length;
    if (title && link) out.push({
      title, link, pubDate: isNaN(d.getTime()) ? new Date() : d,
      source, byline,
      imageUrl: img.url || '', imageCaption: img.caption || '',
      imageWidth: img.width, imageHeight: img.height,
      description, descLen
    });
  });
  return out;
}

function packUnique(items, heroLink=null){
  const seen = new Set();
  const perSource = new Map();
  const out = [];
  for (const it of items.sort((a,b)=> b.pubDate - a.pubDate)) {
    const k = `${it.title}::${it.link}`; if (seen.has(k)) continue;
    if (heroLink && it.link === heroLink) continue;
    const n = perSource.get(it.source) || 0; if (n >= MAX_PER_SOURCE) continue;
    perSource.set(it.source, n+1); seen.add(k); out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function render(list){
  const ul = document.getElementById('news-list'); if(!ul) return;
  const fmt = new Intl.DateTimeFormat('en-US',{ month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true, timeZone:TZ });
  ul.innerHTML = list.map(({title, link, pubDate, source, byline})=>{
    const by = byline ? ` · by ${byline}` : '';
    return `<li><a href="${link}" target="_blank" rel="noopener">${title}</a><br>
            <span class="source">${source}${by} · ${fmt.format(pubDate)}</span></li>`;
  }).join('');
}

export async function startNews(){
  if (inflight) return; inflight = true;
  const ul = document.getElementById('news-list');
  if (ul) ul.innerHTML = '<li class="muted">Loading headlines…</li>';

  const cached = readCache(); if (cached){ render(cached); window.dispatchEvent(new CustomEvent('jj:newsUpdated')); inflight=false; }

  try{
    const res = await fetch('/api/news-bundle');
    if (!res.ok) throw new Error('bundle');
    const bundle = await res.json(); // { feeds:[{url,label,ok,status,xml?}], ... }
    const items = [];
    for (const f of bundle.feeds) {
      if (!f.ok || !f.xml) continue;
      items.push(...parseFeed(f.xml, f.label, f.url));
    }

    // drop hero (if already picked) and cap per-source
    const heroLink = (()=>{ try{ return JSON.parse(localStorage.getItem('jj_hero_choice'))?.link || null; }catch{return null;} })();
    const list = packUnique(items, heroLink);

    if (list.length) {
      writeCache(list); render(list);
      window.dispatchEvent(new CustomEvent('jj:newsUpdated'));
    } else if (ul) {
      ul.innerHTML = '<li class="muted">No headlines found.</li>';
    }
  }catch{
    // keep whatever we showed (cache or loading message)
  }finally{ inflight = false; }
}

// If hero changes, re-pack the rail without that story
window.addEventListener('jj:heroSelected', () => {
  const cached = readCache(); if (!cached) return;
  const heroLink = (()=>{ try{ return JSON.parse(localStorage.getItem('jj_hero_choice'))?.link || null; }catch{return null;} })();
  const list = packUnique(cached, heroLink);
  writeCache(list); render(list);
});
