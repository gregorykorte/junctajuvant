import { TZ, CACHE_TTL_MS } from './config.js';
const CACHE_KEY = 'jj_news_final_v1';
let inflight = false;

const fmt = new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true, timeZone:TZ });

function readCache(){ try{ const raw=localStorage.getItem(CACHE_KEY); if(!raw) return null; const {ts,data}=JSON.parse(raw); if(Date.now()-ts<CACHE_TTL_MS) return data; }catch{} return null; }
function writeCache(data){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ts:Date.now(), data})) }catch{} }

function renderRail(list){
  const ul = document.getElementById('news-list'); if(!ul) return;
  ul.innerHTML = list.map(({title,link,pubDate,source,byline})=>{
    const by = byline ? ` · by ${byline}` : '';
    return `<li><a href="${link}" target="_blank" rel="noopener">${title}</a><br><span class="source">${source}${by} · ${fmt.format(new Date(pubDate))}</span></li>`;
  }).join('');
}

export async function startNews(){
  if (inflight) return; inflight = true;
  const ul = document.getElementById('news-list'); if (ul) ul.innerHTML = '<li class="muted">Loading headlines…</li>';

  const cached = readCache();
  if (cached){ renderRail(cached.rail); window.dispatchEvent(new CustomEvent('jj:newsHero', { detail: cached.hero })); inflight=false; }

  try{
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error('news');
    const data = await res.json();           // { hero, rail, ... }
    writeCache(data);
    renderRail(data.rail);
    window.dispatchEvent(new CustomEvent('jj:newsHero', { detail: data.hero }));
  }catch{
    if (!cached && ul) ul.innerHTML = '<li class="muted">No headlines found.</li>';
  }finally{ inflight = false; }
}
