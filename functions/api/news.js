// functions/api/news.js
// Deterministic edge aggregator for Juncta Juvant
// KV binding required: NEWS_CACHE (bind in Pages → Settings → Functions → KV bindings)

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

  // Balance, statewide/public-media (soft-locality scoring keeps Cincy-first)
  { url:'https://ohiocapitaljournal.com/feed/localFeed',                        label:'Ohio Capital Journal' },
  { url:'https://www.statenews.org/index.rss',                                  label:'Statehouse News Bureau' },
  { url:'https://spectrumlocalnews.com/services/contentfeed.oh|cincinnati|news.landing.rss', label:'Spectrum News 1 (Cincinnati)' },
];

const TTL = 300;                 // KV TTL (seconds): everyone sees the same set for ~5 min
const PER_FEED_TIMEOUT = 2000;   // ms per feed
const MAX_ITEMS = 84;             // rail length
const MAX_PER_SOURCE = 1;        // rail: at most one per outlet (hero can be same outlet)
const UA = 'Mozilla/5.0 JJFeed/1.0 (+https://junctajuvant.com)';

const CUR  = 'news_final_v1';       // current KV key
const LAST = 'news_final_v1_last';  // last-good KV key (fallback)

// ---------- helpers ----------
const re   = (s, f='i') => new RegExp(s, f);
const tag  = (xml, name) => { const m = re(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml); return m ? m[1].trim() : ''; };
const attr = (xml, name) => { const m = re(`${name}\\s*=\\s*"(.*?)"`).exec(xml); return m ? m[1] : ''; };
const first = (xml, ...names) => { for (const n of names){ const v = tag(xml, n); if (v) return v; } return ''; };
const firstMatch = (xml, ...rxs) => { for (const r of rxs){ const m = r.exec(xml); if (m) return m[1]; } return ''; };


// functions/api/news.js
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  // ... your constants / helpers above ...

  // Serve cached only when NOT forced
  if (!force) {
    const cached = await env.NEWS_CACHE.get(CUR, { type: 'json' });
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, s-maxage=${TTL}, max-age=0, must-revalidate`,
          'x-cache': 'kv'
        }
      });
    }
  }

  // else: build fresh bundle and store in KV, then return it…
  // (rest of your existing code)
}


// Decode HTML entities (numeric + common named)
function decodeEntities(s='') {
  if (!s) return '';
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const untag = (s='') => decodeEntities((s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

// Prefer dc:creator / author / media:credit; clean “By …” and titles like “| Editor-in-Chief”
function bylineFrom(itemXML) {
  const contentOf = (name) => {
    const m = re(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(itemXML);
    return m ? m[1] : '';
  };
  let raw = contentOf('dc:creator') || contentOf('author') || contentOf('media:credit');
  if (!raw) {
    const anyNs = /<[^>]*:creator[^>]*>([\s\S]*?)<\/[^>]*:creator>/i.exec(itemXML);
    raw = anyNs ? anyNs[1] : '';
  }
  let b = untag(raw);
  b = b.replace(/^by\s+/i, '');
  b = b.split('|')[0];
  b = b.split('–')[0].split('—')[0];
  b = b.replace(/\s+\(.+?\)\s*$/, '');
  b = b.replace(/\s+-\s+.+$/, '');
  return b.trim();
}

// First <p>’s text; fallback to full HTML if no <p>
function firstParagraphText(html='') {
  const m = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html || '');
  const pick = m ? m[0] : (html || '');
  return untag(pick);
}

function imageFrom(itemXML){
  let url = firstMatch(itemXML,
    re(`<media:content[^>]*url="([^"]+)"`),
    re(`<media:thumbnail[^>]*url="([^"]+)"`)
  );
  let w = firstMatch(itemXML, re(`<media:content[^>]*width="([^"]+)"`));
  let h = firstMatch(itemXML, re(`<media:content[^>]*height="([^"]+)"`));
  let caption = first(itemXML, 'media:description');

  if (!url) url = firstMatch(itemXML,
    re(`<enclosure[^>]*type="image\\/[^"]*"[^>]*url="([^"]+)"`),
    re(`<enclosure[^>]*url="([^"]+)"[^>]*type="image\\/[^"]*"`)
  );
  if (!url) {
    const html = first(itemXML, 'content:encoded', 'description');
    url = firstMatch(html, re(`<img[^>]+src=["']([^"']+)["']`));
  }
  return { url: url || '', width: w ? Number(w) : undefined, height: h ? Number(h) : undefined, caption: untag(caption) };
}

function parseFeed(xml, fallbackLabel, feedUrl){
  const channelTitle = tag(xml, 'channel') ? tag(tag(xml,'channel'), 'title') : '';
  const feedTitle    = tag(xml, 'feed')    ? tag(tag(xml,'feed'),    'title') : '';
  const source = (fallbackLabel || untag(channelTitle || feedTitle) || new URL(feedUrl).hostname);

  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of itemBlocks) {
    const title = untag(tag(it,'title'));
    let link = attr(tag(it,'link') || it, 'href') || untag(tag(it,'link')); // Atom or RSS
    const when = first(it, 'pubDate', 'updated', 'published');
    const d = when ? new Date(when) : new Date();

    const byline = bylineFrom(it);
    const img = imageFrom(it);

    const rawHtml = first(it, 'content:encoded', 'description');
    const description    = untag(rawHtml);
    const firstParagraph = firstParagraphText(rawHtml);
    const descLen = description.length;

    if (title && link) {
      items.push({
        title, link,
        pubDate: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
        source, byline,
        imageUrl: img.url, imageCaption: img.caption, imageWidth: img.width, imageHeight: img.height,
        description, firstParagraph, descLen
      });
    }
  }
  return items;
}

// Locality nudges (soft preference for Cincy/tri-state terms)
const LOCAL_TERMS = [
  'cincinnati','queen city','otr','over-the-rhine','clifton','hyde park','oakley','price hill','westwood','downtown','uptown',
  'mount adams','mt. adams','walnut hills','northside','norwood','evanston','avondale',
  'nky','northern kentucky','covington','newport','bellevue','boone county','kenton county','campbell county',
  'florence','erlanger','fort thomas','ft. thomas','fairfield','hamilton','oxford','blue ash','sharonville',
  'mason','loveland','milford','lebanon','west chester','liberty township','colerain','reading','madisonville',
  'hamilton county','butler county','clermont county','warren county','dearborn county',
  'bengals','reds','fc cincinnati','fccc','roebling','ohio river','the banks','banks district'
];
const STATEWIDE_SOURCES = new Set([
  'Ohio Capital Journal','Statehouse News Bureau','Spectrum News 1 (Cincinnati)'
]);

function localityScore(it) {
  const hay = `${(it.title||'')} ${(it.description||'')}`.toLowerCase();
  const hits = LOCAL_TERMS.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
  return hits >= 3 ? 4 : hits === 2 ? 3 : hits === 1 ? 2 : 0; // 0..4
}
function softGate(item){
  const local =
