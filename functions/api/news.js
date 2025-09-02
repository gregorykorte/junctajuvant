// functions/api/news.js
// Deterministic edge aggregator for Juncta Juvant
// Bind KV namespace NEWS_CACHE in Pages → Settings → Functions → Bindings

const VERSION = '2025-08-23b';

const FEEDS = [
  { url:'https://www.wcpo.com/news/local-news/hamilton-county/cincinnati.rss', label:'WCPO' },
  { url:'https://www.cincinnatamagazine.com/category/news/feed/',               label:'Cincinnati Magazine' },
  { url:'https://thecincinnatiherald.com/feed/',                                label:'The Cincinnati Herald' },
  { url:'https://www.wvxu.org/politics.rss',                                    label:'WVXU' },
  { url:'https://www.citybeat.com/cincinnati/Rss.xml?section=11962257',         label:'CityBeat' },
  { url:'https://www.wlwt.com/local-news-rss',                                  label:'WLWT' },
  { url:'https://rss.bizjournals.com/feed/cdfd3a38bf00fe702915839e402f927be4566046/13253?market=cincinnati', label:'Cincinnati Business Courier' },
  { url:'https://signalcincinnati.org/feed/',                                   label:'Signal Cincinnati' },
  { url:'https://feeds.feedburner.com/soapboxmedia',                             label:'Soapbox Cincinnati' },
  { url:'https://www.thecatholictelegraph.com/category/local-news/feed',        label:'Catholic Telegraph' },
  { url:'https://www.newsrecord.org/search/?a=64128ff4-dd69-11ee-b9cb-bbbdd76e4cd4&s=start_time&sd=desc&f=rss', label:'The News Record' },
  { url:'https://americanisraelite.com/category/local/feed/',                   label:'American Israelite' },
  // Statewide/public-media – allowed but softly downweighted unless obviously local
  { url:'https://ohiocapitaljournal.com/feed/localFeed',                        label:'Ohio Capital Journal' },
  { url:'https://www.statenews.org/index.rss',                                  label:'Statehouse News Bureau' },
  { url:'https://spectrumlocalnews.com/services/contentfeed.oh|cincinnati|news.landing.rss', label:'Spectrum News 1 (Cincinnati)' },
];

const TTL = 120;               // seconds – everyone sees the same set for ~2 minutes
const PER_FEED_TIMEOUT = 2000; // ms per feed
const MAX_ITEMS = 5;           // rail length
const MAX_PER_SOURCE = 1;      // rail: at most one per outlet (hero can be same outlet)
const UA = 'Mozilla/5.0 JJFeed/1.0 (+https://junctajuvant.com)';

const CUR  = `news_final_${VERSION}`;
const LAST = `news_final_${VERSION}_last`;

// --- tiny helpers ---
const re = (s, f='i') => new RegExp(s, f);
const tag = (xml, name) => { const m = re(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml); return m ? m[1].trim() : ''; };
const attr = (xml, name) => { const m = re(`${name}\\s*=\\s*"(.*?)"`).exec(xml); return m ? m[1] : ''; };
const first = (xml, ...names) => { for (const n of names){ const v = tag(xml, n); if (v) return v; } return ''; };
const firstMatch = (xml, ...rx) => { for (const r of rx){ const m = r.exec(xml); if (m) return m[1]; } return ''; };

function decodeEntities(s='') {
  if (!s) return '';
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}
// CDATA-aware untag: unwrap CDATA, strip tags, collapse spaces, then decode entities
const untag = (s = '') => {
  if (!s) return '';
  // 1) unwrap <![CDATA[ ... ]]>
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // 2) remove HTML tags
  s = s.replace(/<[^>]+>/g, '');
  // 3) collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // 4) decode entities (relies on your existing decodeEntities)
  return decodeEntities(s);
};

function bylineFrom(itemXML){
  const contentOf = (n) => { const m = re(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`).exec(itemXML); return m ? m[1] : ''; };
  let raw = contentOf('dc:creator') || contentOf('author') || contentOf('media:credit');
  if (!raw) { const anyNs = /<[^>]*:creator[^>]*>([\s\S]*?)<\/[^>]*:creator>/i.exec(itemXML); raw = anyNs ? anyNs[1] : ''; }
  let b = untag(raw);
  b = b.replace(/^by\s+/i,'').split('|')[0].split('–')[0].split('—')[0].replace(/\s+\(.+?\)\s*$/,'').replace(/\s+-\s+.+$/,'');
  return b.trim();
}
function firstParagraphText(html=''){ const m=/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html||''); return untag(m?m[0]:html||''); }

function imageFrom(itemXML){
  let url = firstMatch(itemXML, re(`<media:content[^>]*url="([^"]+)"`), re(`<media:thumbnail[^>]*url="([^"]+)"`));
  let w = firstMatch(itemXML, re(`<media:content[^>]*width="([^"]+)"`));
  let h = firstMatch(itemXML, re(`<media:content[^>]*height="([^"]+)"`));
  let caption = first(itemXML, 'media:description');
  if (!url) url = firstMatch(itemXML, re(`<enclosure[^>]*type="image\\/[^"]*"[^>]*url="([^"]+)"`), re(`<enclosure[^>]*url="([^"]+)"[^>]*type="image\\/[^"]*"`));
  if (!url) { const html = first(itemXML, 'content:encoded', 'description'); url = firstMatch(html, re(`<img[^>]+src=["']([^"']+)["']`)); }
  return { url: url || '', width: w?Number(w):undefined, height: h?Number(h):undefined, caption: untag(caption) };
}

function parseFeed(xml, fallbackLabel, feedUrl){
  const channelTitle = tag(xml,'channel') ? tag(tag(xml,'channel'),'title') : '';
  const feedTitle    = tag(xml,'feed')    ? tag(tag(xml,'feed'),'title')    : '';
  const source = (fallbackLabel || untag(channelTitle || feedTitle) || new URL(feedUrl).hostname);
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of blocks) {
    const title = untag(tag(it,'title'));
    let link = attr(tag(it,'link') || it,'href') || untag(tag(it,'link'));
    const when = first(it,'pubDate','updated','published');
    const d = when ? new Date(when) : new Date();
    const byline = bylineFrom(it);
    const img = imageFrom(it);
    const rawHtml = first(it,'content:encoded','description');
    const description = untag(rawHtml);
    const firstParagraph = firstParagraphText(rawHtml);
    if (title && link) items.push({
      title, link, pubDate: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
      source, byline, imageUrl: img.url, imageCaption: img.caption, imageWidth: img.width, imageHeight: img.height,
      description, firstParagraph, descLen: description.length
    });
  }
  return items;
}

// Soft Cincinnati-first
const LOCAL_TERMS = [
  'cincinnati','queen city','otr','over-the-rhine','clifton','hyde park','oakley','price hill','westwood','downtown','uptown',
  'mount adams','mt. adams','walnut hills','northside','norwood','evanston','avondale',
  'nky','northern kentucky','covington','newport','bellevue','boone county','kenton county','campbell county',
  'florence','erlanger','fort thomas','ft. thomas','fairfield','hamilton','oxford','blue ash','sharonville',
  'mason','loveland','milford','lebanon','west chester','liberty township','colerain','reading','madisonville',
  'hamilton county','butler county','clermont county','warren county','dearborn county',
  'bengals','reds','fc cincinnati','fccc','roebling','ohio river','the banks','banks district'
];
const STATEWIDE_SOURCES = new Set(['Ohio Capital Journal','Statehouse News Bureau','Spectrum News 1 (Cincinnati)']);
function localityScore(it){ const hay=`${it.title||''} ${it.description||''}`.toLowerCase(); const hits=LOCAL_TERMS.reduce((n,t)=>n+(hay.includes(t)?1:0),0); return hits>=3?4:hits===2?3:hits===1?2:0; }
function softGate(it){ const s=localityScore(it); return STATEWIDE_SOURCES.has(it.source) && s===0 ? -2 : s; }

const STOCK_HOSTS = ['gettyimages','istockphoto','shutterstock','unsplash','pexels','pixabay'];
function isStock(u='',c=''){ const s=(u||'').toLowerCase(), t=(c||'').toLowerCase(); return !u || !/^https:\/\//i.test(u) || STOCK_HOSTS.some(h=>s.includes(h)) || /courtesy|handout|provided/i.test(t); }

function pickHero(items){
  const cand = items.filter(it => it.firstParagraph && it.firstParagraph.length >= 60 && !isStock(it.imageUrl, it.imageCaption));
  if (!cand.length) return null;
  cand.sort((a,b)=>{
    const ad = new Date(b.pubDate) - new Date(a.pubDate); if (ad) return ad;
    const l  = softGate(b) - softGate(a); if (l) return l;
    if (b.imageWidth !== a.imageWidth) return (b.imageWidth||0)-(a.imageWidth||0);
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.link.localeCompare(b.link);
  });
  return cand[0];
}

function dedupeAndCap(items, heroLink=null){
  const seen = new Set(); const perSource = new Map(); const out = [];
  const ordered = items.slice().sort((a,b)=>{
    const ad = new Date(b.pubDate) - new Date(a.pubDate); if (ad) return ad;
    const l  = softGate(b) - softGate(a); return l || a.source.localeCompare(b.source) || a.link.localeCompare(b.link);
  });
  for (const it of ordered){
    const k = `${it.title}::${it.link}`; if (seen.has(k)) continue;
    if (heroLink && it.link === heroLink) continue;
    const n = perSource.get(it.source) || 0; if (n >= MAX_PER_SOURCE) continue;
    perSource.set(it.source, n+1); seen.add(k); out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

async function fetchWithTimeout(url, ms){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort('timeout'), ms);
  try{
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, 'accept':'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      cf: { cacheTtl: 120, cacheEverything: true }
    });
    return await res.text();
  }catch{ return ''; } finally{ clearTimeout(t); }
}

function json(data, cacheHint){
  data.version = VERSION;
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control': `public, s-maxage=${TTL}, stale-while-revalidate=${TTL*2}, max-age=0, must-revalidate`,
      'x-cache': cacheHint,
      'x-code-version': VERSION,
      'x-generated-at': data.generatedAt || new Date().toISOString()
    }
  });
}

// --- entry ---
export async function onRequestGet({ request, env }) {
  const force = new URL(request.url).searchParams.get('force') === '1';

  if (!force) {
    const cached = await env.NEWS_CACHE.get(CUR, { type: 'json' });
    if (cached) return json(cached, 'kv');
  }

  const started = Date.now();
  const results = await Promise.all(FEEDS.map(async f => ({ label:f.label, url:f.url, xml: await fetchWithTimeout(f.url, PER_FEED_TIMEOUT) })));

  let items = [];
  const sources = [];
  for (const r of results) {
    if (!r.xml) continue;
    const parsed = parseFeed(r.xml, r.label, r.url);
    if (parsed.length) sources.push({ source: parsed[0].source, count: parsed.length });
    items.push(...parsed);
  }

  const hero = pickHero(items);
  const rail = dedupeAndCap(items, hero?.link || null);

  const payload = { generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started, hero, rail, sources };

  const good = payload.hero && payload.rail && payload.rail.length >= Math.min(MAX_ITEMS, 6);
  if (good) {
    try {
      await env.NEWS_CACHE.put(CUR,  JSON.stringify(payload), { expirationTtl: TTL });
      await env.NEWS_CACHE.put(LAST, JSON.stringify(payload), { expirationTtl: TTL * 3 });
    } catch {}
    return json(payload, 'miss-rebuilt');
  } else {
    const last = await env.NEWS_CACHE.get(LAST, { type: 'json' });
    if (last) return json(last, 'fallback-lastgood');
    try { await env.NEWS_CACHE.put(CUR, JSON.stringify(payload), { expirationTtl: TTL }); } catch {}
    return json(payload, 'miss-partial');
  }
}
