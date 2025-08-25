export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  // Verify state cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/decap_oauth_state=([^;]+)/);
  const cookieVal = match ? match[1] : null;

  const enc = new TextEncoder();
  async function hmac(input, secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
    return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  let valid = false;
  if (cookieVal) {
    const [savedState, mac] = cookieVal.split(".");
    if (savedState && mac) {
      const expected = await hmac(savedState, env.COOKIE_SECRET);
      valid = savedState === state && mac === expected;
    }
  }
  if (!valid) return new Response("Invalid OAuth state", { status: 400 });

  const callbackUrl = `${url.origin}/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl
    })
  });

  if (!tokenRes.ok) return new Response(`Token exchange failed: ${await tokenRes.text()}`, { status: 502 });

  const { access_token } = await tokenRes.json();
  if (!access_token) return new Response("No access_token returned", { status: 502 });

  const clear = `decap_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Domain=${url.hostname}`;

  const html = `<!doctype html><meta charset="utf-8"><title>Logging in…</title>
<script>
  (function(){
    var token = ${JSON.stringify(access_token)};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ token: token }, ${JSON.stringify(env.CMS_ORIGIN)});
    }
    window.close();
  })();
</script>
<body>Login complete. You can close this window.</body>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": clear } });
}

export async function onRequest({ request, env }) {
  const required = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "COOKIE_SECRET", "CMS_ORIGIN"];
  const missing = required.filter(k => !env[k]);
  if (missing.length) {
    return new Response("Missing env: " + missing.join(","), { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/decap_oauth_state=([^;]+)/);
  const cookieVal = match ? match[1] : null;

  const enc = new TextEncoder();
  async function hmac(input, secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
    return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  let valid = false;
  if (cookieVal) {
    const [savedState, mac] = cookieVal.split(".");
    if (savedState && mac) {
      const expected = await hmac(savedState, env.COOKIE_SECRET);
      valid = savedState === state && mac === expected;
    }
  }
  if (!valid) return new Response("Invalid OAuth state", { status: 400 });

  const callbackUrl = `${url.origin}/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl
    })
  });
  if (!tokenRes.ok) return new Response(`Token exchange failed: ${await tokenRes.text()}`, { status: 502 });

  const { access_token } = await tokenRes.json();
  if (!access_token) return new Response("No access_token returned", { status: 502 });

  const host = url.hostname;
  const clear = `decap_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Domain=${host}`;

  const html = `<!doctype html><meta charset="utf-8"><title>Logging in…</title>
<script>
  (function(){
    var token = ${JSON.stringify(access_token)};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ token: token }, ${JSON.stringify(env.CMS_ORIGIN)});
    }
    window.close();
  })();
</script>
<body>Login complete. You can close this window.</body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": clear } });
}
