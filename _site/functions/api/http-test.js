export async function onRequest() {
  const tests = [
    { name: "example.com", url: "https://example.com" },
    { name: "Cloudflare trace", url: "https://www.cloudflare.com/cdn-cgi/trace" },
    { name: "TheSportsDB", url: "https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=134923" },
  ];

  const results = [];
  for (const t of tests) {
    try {
      const r = await fetch(t.url, { method: "GET" });
      const ct = r.headers.get("content-type") || "";
      const snippet = (await r.text()).slice(0, 200);
      results.push({ name: t.name, url: t.url, ok: r.ok, status: r.status, contentType: ct, snippet });
    } catch (e) {
      results.push({ name: t.name, url: t.url, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
