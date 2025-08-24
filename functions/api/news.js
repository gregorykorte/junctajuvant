// Deterministic aggregator for JJ: returns { hero, rail, generatedAt, sources }
// Requires KV binding: NEWS_CACHE

const FEEDS = [
  { url:'https://www.wcpo.com/news/local-news/hamilton-county/cincinnati.rss', label:'WCPO' },
  { url:'https://www.cincinnatamagazine.com/category/news/feed/', label:'Cincinnati Magazine' },
  { url:'https://thecincinnatiherald.com/feed/', label:'The Cincinnati Herald' },
  { url:'https://www.wvxu.org/politics.rss', label:'WVXU' },
  { url:'https://www.citybeat.com/cincinnati/Rss.xml?section=11962257', label:'CityBeat' },
  { url:'https://www.wlwt.com/local-news-rss', label:'WLWT' },
  { url:'https://rss.bizjournals.com/feed/cdfd3a38bf00fe702915839e402f927be4566046/13253?market=cincinnati', label:'Cincinnati Business Courier' },
  { url:'https://signalcincinnati.org/feed/', label:'Signal Cincinnati' },
  { url:'https://feeds.feedburner.com/soapboxmedia', label:'Soapbox Cincinnati' },
  { url:'https://www.thecatholictelegraph.com/category/local-news/feed', label:'Catholic Telegraph' },
  { url:'https://www.newsrecord.org/search/?a=64128ff4-dd69-11ee-b9cb-bbbdd76e4cd4&s=start_time&sd=desc&f=rss', label:'The News Record' },
  { url:'https://americanisraelite.com/category/local/feed/', label:'American Israelite' },
  { url:'https://ohiocapitaljournal.com/feed/localFeed', label:'Ohio Capital Journal' },
  { url:'https://www.statenews.org/section/the-ohio-newsroom.rss', label:'Statehouse News Bureau' },
  { url:'https://spectrumlocalnews.com/services/contentfeed.oh|cincinnati|news.landing.rss', label:'Spectrum News 1 (Cincinnati)' },

];

const TTL = 180;                // everyone sees same set for 3 minutes
const PER_FEED_TIMEOUT = 2000;
const MAX_ITEMS = 4;
const MAX_PER_SOURCE = 1;
const UA = 'Mozilla/5.0 JJFeed/1.0 (+https://junctajuvant.com)';

// --- helpers (edge-safe, regex-based XML scraping) ---
const re = (s, f='i') => new RegExp(s, f);
const tag = (xml, name) => {
  const m = re(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
};
const attr = (xml, name) => {
  const m = re(`${name}\\s*=\\s*"(.*?)"`, 'i').exec(xml);
  return m ? m[1] : '';
};
const untag = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim();
const first = (xml, ...names) => {
  for (const n of names) { const v = tag(xml, n); if (v) return v; }
  return '';
};
const firstMatch = (xml, ...rxs) => {
  for (const r of rxs) { const m = r.exec(xml); if (m) return m[1]; }
  return '';
};
function bylineFrom(itemXML){
  const b = first(itemXML, 'dc:creator', 'author', 'media:credit');
  if (b) return untag(b);
  const m = re(`<[^>]*:creator[^>]*>([\\s\\S]*?)<\\/[^>]*:creator>`,`i`).exec(itemXML);
  return m ? untag(m[1]) : '';
}
function imageFrom(itemXML){
  // media:content / media:thumbnail
  let url = firstMatch(itemXML, re(`<media:content[^>]*url="([^"]+)"`,'i'),
                                 re(`<media:thumbnail[^>]*url="([^"]+)"`,'i'));
  let w = firstMatch(itemXML, re(`<media:content[^>]*width="([^"]+)"`,'i'));
  let h = firstMatch(itemXML, re(`<media:content[^>]*height="([^"]+)"`,'i'));
  let caption = first(itemXML, 'media:description');
  // enclosure type=image/*
  if (!url) url = firstMatch(itemXML, re(`<enclosure[^>]*type="image\\/[^"]*"[^>]*url="([^"]+)"`,'i'),
                                        re(`<enclosure[^>]*url="([^"]+)"[^>]*type="image\\/[^"]*"`,'i'));
  // <img> in content:encoded or description
  if (!url) {
    const html = first(itemXML, 'content:encoded', 'description');
    url = firstMatch(html, re(`<img[^>]+src=["']([^"']+)["']`,'i'));
  }
  return { url: url || '', width: w ? Number(w) : undefined, height: h ? Number(h) : undefined, caption: untag(caption) };
}
function parseFeed(xml, fallbackLabel, feedUrl){
  const channelTitle = tag(xml, 'channel') ? tag(tag(xml,'channel'), 'title') : '';
  const feedTitle = tag(xml, 'feed') ? tag(tag(xml,'feed'), 'title') : '';
  const source = (fallbackLabel || untag(channelTitle || feedTitle) || new URL(feedUrl).hostname);

  // Items: RSS <item> or Atom <entry>
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of itemBlocks) {
    const title = untag(tag(it,'title'));
    // Atom <link href="..."> OR RSS <link>...</link>
    let link = attr(tag(it,'link') || it, 'href') || untag(tag(it,'link'));
    const when = first(it, 'pubDate', 'updated', 'published');
    const d = when ? new Date(when) : new Date();
    const byline = bylineFrom(it);
    const img = imageFrom(it);
    const desc = untag(first(it, 'content:encoded', 'description'));
    if (title && link) {
      items.push({
        title, link, pubDate: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
        source, byline,
        imageUrl: img.url, imageCaption: img.caption, imageWidth: img.width, imageHeight: img.height,
        description: desc, descLen: desc.length
      });
    }
  }
  return items;
}
function dedupeAndCap(items, heroLink=null){
  const seen = new Set();
  const perSource = new Map();
  const byDate = items.sort((a,b)=> new Date(b.pubDate)-new Date(a.pubDate));
  const out = [];
  for (const it of byDate) {
    const k = `${it.title}::${it.link}`;
    if (seen.has(k)) continue;
    if (heroLink && it.link === heroLink) continue;
    const n = perSource.get(it.source) || 0;
    if (n >= MAX_PER_SOURCE) continue;
    perSource.set(it.source, n+1); seen.add(k); out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
// Very similar to your client hero rules; keep it deterministic.
const STOCK_HOSTS = ['gettyimages','istockphoto','shutterstock','unsplash','pexels','pixabay'];
function isStock(u='', c=''){ const s=(u||'').toLowerCase(), t=(c||'').toLowerCase();
  return !u || !/^https:\/\//i.test(u) || STOCK_HOSTS.some(h=>s.includes(h)) || /courtesy|handout|provided/i.test(t); }
function pickHero(items){
  const candidates = items.filter(it => it.description && it.descLen >= 60 && !isStock(it.imageUrl, it.imageCaption));
  if (!candidates.length) return null;
  candidates.sort((a,b)=>{
    const ad = new Date(b.pubDate)-new Date(a.pubDate);
    if (ad) return ad;
    // tie-breakers for determinism
    if (b.imageWidth!==a.imageWidth) return (b.imageWidth||0)-(a.imageWidth||0);
    if (a.source!==b.source) return a.source.localeCompare(b.source);
    return a.link.localeCompare(b.link);
  });
  return candidates[0];
}

async function fetchWithTimeout(url, ms){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort('timeout'), ms);
  try{
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, 'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      cf: { cacheTtl: 120, cacheEverything: true }
    });
    return await res.text();
  }catch{ return ''; } finally{ clearTimeout(t); }
}

export async function onRequestGet({ env }) {
  const KEY = 'news_final_v1';

  // Serve cached bundle if present
  const cached = await env.NEWS_CACHE.get(KEY, { type: 'json' });
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { 'content-type':'application/json; charset=utf-8',
                 'cache-control':`public, s-maxage=${TTL}, max-age=0, must-revalidate`,
                 'x-cache':'kv' }
    });
  }

  // Build fresh bundle (first request in a window pays the cost)
  const started = Date.now();
  const results = await Promise.all(FEEDS.map(async f => {
    const xml = await fetchWithTimeout(f.url, PER_FEED_TIMEOUT);
    return { label: f.label, url: f.url, xml };
  }));

  // Parse & merge
  let items = [];
  const sources = [];
  for (const r of results) {
    if (!r.xml) continue;
    const parsed = parseFeed(r.xml, r.label, r.url);
    if (parsed.length) sources.push({ source: parsed[0].source, count: parsed.length });
    items.push(...parsed);
  }
  // Choose hero first; then cap rail per-source and drop hero from it
  const hero = pickHero(items);
  const rail = dedupeAndCap(items, hero?.link || null);

  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    hero, rail, sources
  };

  // Store in KV
  try { await env.NEWS_CACHE.put(KEY, JSON.stringify(payload), { expirationTtl: TTL }); } catch {}

  return new Response(JSON.stringify(payload), {
    headers: { 'content-type':'application/json; charset=utf-8',
               'cache-control':`public, s-maxage=${TTL}, max-age=0, must-revalidate`,
               'x-cache':'miss-rebuilt' }
  });
}
