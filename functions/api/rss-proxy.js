// functions/api/rss-proxy.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing ?url=", { status: 400 });

  const upstream = await fetch(target, {
    headers: { "User-Agent": "junctajuvant.com RSS proxy" },
  });
  const body = await upstream.text();

  return new Response(body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "s-maxage=900, stale-while-revalidate=300"
    },
  });
}
