// functions/api/decap-auth/callback.js
// Cloudflare Pages Function: OAuth callback relay for Decap.
// - Accepts GET /api/decap-auth/callback?code=...&state=... (and optional ?provider=...)
// - Redirects to /admin/#callback?... so the CMS can finish auth in the browser.
// - Single export only to avoid "Multiple exports with the same name 'onRequest'".

export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);

    // Handle CORS preflight defensively (some IdP setups preflight).
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // If the IdP sent an error, surface it to the CMS.
    const err =
      url.searchParams.get("error_description") ||
      url.searchParams.get("error") ||
      "";

    if (err) {
      const back = `${url.origin}/admin/#callback?error=${encodeURIComponent(
        err
      )}`;
      return Response.redirect(back, 302);
    }

    // Normal success path: pass through code/state (+ any provider hint).
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const provider = url.searchParams.get("provider") || "";

    // Some flows may not include query params (hash-only). Relay whatever we have.
    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    if (state) qs.set("state", state);
    if (provider) qs.set("provider", provider);

    // If no known params exist, emit a tiny relay page that forwards query → hash.
    if (![...qs.keys()].length) {
      const relayHtml = `<!doctype html><meta charset="utf-8">
<script>
  const p = new URLSearchParams(location.search);
  location.replace('${url.origin}/admin/#callback?' + p.toString());
</script>`;
      return new Response(relayHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const dest = `${url.origin}/admin/#callback?${qs.toString()}`;
    return Response.redirect(dest, 302);
  } catch (e) {
    console.error("decap-auth callback error:", e);
    return new Response(
      "Callback error: " + (e?.message || String(e)),
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}
