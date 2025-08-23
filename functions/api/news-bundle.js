// Aggregates all feeds at the edge, caches JSON in KV so every visitor sees the same bundle.
// KV binding required: NEWS_CACHE

const FEEDS = [
  { url: 'https://www.wcpo.com/news/local-news/hamilton-county/cincinnati.rss', label: 'WCPO' },
  { url: 'https://www.cincinnatamagazine.com/category/news/feed/', label: 'Cincinnati Magazine' },
  { url: 'https://thecincinnatiherald.com/feed/', label: 'The Cincinnati Herald' },
  { url: 'https://www.wvxu.org/politics.rss', label: 'WVXU' },
  { url: 'https://www.citybeat.com/cincinnati/Rss.xml?section=11962257', label: 'CityBeat' },
  { url: 'https://www.wlwt.com/local-news-rss', label: 'WLWT' },
  { url: 'https://rss.bizjournals.com/feed/cdfd3a38bf00fe702915839e402f927be4566046/13253?market=cincinnati', label: 'Cincinnati Business Courier' },
  { url: 'https://signalcincinnati.org/feed/', label: 'Signal Cincinnati' },
  { url: 'https://feeds.feedburner.com/soapboxmedia', label: 'Soapbox Cincinnati' },
  { url: 'https://www.thecatholictelegraph.com/category/local-news/feed', label: 'Catholic Telegraph' },
  { url: 'https://www.newsrecord.org/search/?a=64128ff4-dd69-11ee-b9cb-bbbdd76e4cd4&s=start_time&sd=desc&f=rss', label: 'The News Record' },
  { url: 'https://americanisraelite.com/category/local/feed/', label: 'American Israelite' }
];

const TTL_SECONDS = 180;            // cache window (everyone sees the same set)
const PER_FEED_TIMEOUT = 2000;      // abort slow feeds
const UA = 'Mozilla/5.0 JJFeed/1.0 (+https://junctajuvant.com)';

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      cf: { cacheTtl: 120, cacheEverything: true }
    });
    const text = await res.text(); // even on 4xx we return text; client can skip
    return { ok: res.ok, status: res.status, xml: text };
  } catch (e) {
    return { ok: false, status: 599, error: String(e) };
  } finally { clearTimeout(t); }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const KV_KEY = 'bundle_v1';

  if (!force) {
    const cached = await env.NEWS_CACHE.get(KV_KEY, { type: 'json' });
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, s-maxage=${TTL_SECONDS}, max-age=0, must-revalidate`,
          'x-cache': 'kv'
        }
      });
    }
  }

  // Fetch all feeds in parallel (each with its own timeout)
  const started = Date.now();
  const results = await Promise.all(FEEDS.map(async (f) => {
    const r = await fetchWithTimeout(f.url, PER_FEED_TIMEOUT);
    return { url: f.url, label: f.label, ...r };
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    feeds: results
  };

  // Store in KV so everyone gets the same bundle for the TTL window
  try {
    await env.NEWS_CACHE.put(KV_KEY, JSON.stringify(payload), { expirationTtl: TTL_SECONDS });
  } catch {}

  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, s-maxage=${TTL_SECONDS}, max-age=0, must-revalidate`,
      'x-cache': 'miss-rebuilt'
    }
  });
}
