import { CACHE_TTL_MS } from './config.js';

const CACHE_KEY = 'jj_scores_v1';
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

function render(payload){
  const el = document.getElementById('sports-content');
  if (!el) return;
  const { games = [], label = '', date_local = '' } = payload;
  if (!games.length){ el.innerHTML = '<div class="muted">No local games found.</div>'; return; }
  const header = `<div style="font-weight:700">${label} — ${date_local}</div>`;
  const local = ['Reds','Bengals','FC Cincinnati','Bearcats','Xavier','Musketeers','Cyclones'];
  const rows = games.filter(g => local.some(t => (g.home||'').includes(t) || (g.away||'').includes(t)))
    .map(g => `
      <div class="row">
        <div class="league">${g.league} · ${g.time_local}</div>
        <div>${g.home} ${g.homeScore ?? '—'} · ${g.away} ${g.awayScore ?? '—'}</div>
        <div class="muted" style="font-size:.85rem">via ${g.provider}</div>
      </div>`).join('');
  el.innerHTML = header + rows;
}

async function fetchData(){
  const res = await fetch('/api/cincy-scores');
  if (!res.ok) throw new Error('scores');
  return res.json();
}

async function refresh(){
  if (inflight) return;
  const el = document.getElementById('sports-content');
  if (el && !el.children.length) el.innerHTML = '<div class="muted">Connecting to scores…</div>';

  const cached = readCache();
  if (cached){ render(cached); }
  if (cached) return; // fresh within TTL

  inflight = true;
  try{ const data = await fetchData(); writeCache(data); render(data); }
  catch{ const el2 = document.getElementById('sports-content'); if (el2) el2.innerHTML = '<div class="muted">Scores unavailable.</div>'; }
  finally{ inflight = false; }
}

export function startScores(){
  refresh();
  setInterval(refresh, CACHE_TTL_MS);
}