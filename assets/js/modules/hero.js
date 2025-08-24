import { TZ } from './config.js';

function setHero(it) {
  const fig = document.querySelector('.hero');
  const img = fig?.querySelector('img');
  if (!fig || !img || !it) return;

  // Headline
  const a = document.getElementById('hero-link');
  if (a) { a.textContent = it.title || ''; a.href = it.link || '#'; }

  // Meta (matches rail)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true
  });
  const src = document.getElementById('hero-source');
  const when = document.getElementById('hero-time');
  const by   = document.getElementById('hero-byline');
  if (src)  src.textContent = it.source || '';
  if (when) when.textContent = fmt.format(new Date(it.pubDate));
  if (by)   by.textContent   = it.byline ? ` · by ${it.byline}` : '';

  // Image + alt
  if (it.imageUrl) img.src = it.imageUrl;
  img.alt = it.title || 'Feature photo';

  // Description: prefer firstParagraph (server) then full description
  const desc = document.getElementById('hero-desc');
  if (desc) desc.textContent = it.firstParagraph || it.description || '';

  // Clickable figure
  const open = () => { if (it.link) window.open(it.link, '_blank', 'noopener'); };
  fig.style.cursor = 'pointer';
  fig.setAttribute('role','link');
  fig.tabIndex = 0;
  fig.onclick = open;
  fig.onkeyup = (e)=>{ if (e.key === 'Enter') open(); };

  // Tell rail to drop the hero
  try { localStorage.setItem('jj_hero_choice', JSON.stringify({ link: it.link, ts: Date.now() })); } catch {}
  window.dispatchEvent(new CustomEvent('jj:heroSelected', { detail: { link: it.link } }));
}

export function startHero(){
  // Use server-picked hero
  window.addEventListener('jj:newsHero', (e)=> { if (e.detail) setHero(e.detail); });
}
