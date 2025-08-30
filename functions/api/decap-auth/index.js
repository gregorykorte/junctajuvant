// functions/api/decap-auth/index.js
// Decap ↔ GitHub OAuth for Cloudflare Pages, with host normalization.
// Env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OAUTH_REDIRECT_BASE, OAUTH_SCOPE

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const base = "/api/decap-auth";
  const sub = url.pathname.slice(base.length) || "/";

  try {
    // CORS preflight (defensive)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (sub === "/auth") return authHandler(url, request, env);
    if (sub === "/callback") return callbackHandler(url, request, env);
    if (sub === "/" || sub === "") {
      return new Response("OK", { headers: { "content-type": "text/plain" } });
    }
    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("decap-auth error:", e);
    return new Response("Internal error: " + (e?.message || String(e)), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function randState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(req, name) {
  const str = req.headers.get("Cookie") || "";
  for (const part of str.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

function setCookie(name, value, opts = {}) {
  const {
    path = "/api/decap-auth",
    maxAge,
    sameSite = "Lax",
    httpOnly = true,
    secure = true,
  } = opts;
  const bits = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (secure) bits.push("Secure");
  if (httpOnly) bits.push("HttpOnly");
  if (typeof maxAge === "number") bits.push(`Max-Age=${maxAge}`);
  return bits.join("; ");
}

function clearCookie(name) {
  return `${name}=; Path=/api/decap-auth; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

async function authHandler(url, request, env) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });

  const targetBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  // If we were called on a different host (e.g., hashed preview), bounce to the target base first.
  if (url.origin !== targetBase) {
    const bounce = new URL(`${targetBase}/api/decap-auth/auth`);
    // preserve any future extras if you add them
    for (const [k, v] of url.searchParams) bounce.searchParams.set(k, v);
    return Response.redirect(bounce.toString(), 302);
  }

  // Now we are on the normalized base host; set state cookie here.
  const state = randState();
  const redirectUri = `${targetBase}/api/decap-auth/callback`;
  const scope = env.OAUTH_SCOPE || "public_repo";

  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", clientId);
  gh.searchParams.set("redirect_uri", redirectUri);
  gh.searchParams.set("scope", scope);
  gh.searchParams.set("state", state);
  gh.searchParams.set("allow_signup", "false");

  const headers = new Headers(corsHeaders(request));
  headers.append("Set-Cookie", setCookie("decap_state", state, { maxAge: 300 }));
  return Response.redirect(gh.toString(), 302, { headers });
}

async function callbackHandler(url, request, env) {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return miniHtml("Missing GITHUB_CLIENT_ID/SECRET", true);
  }

  const code = url.searchParams.get("code") || "";
  const returnedState = url.searchParams.get("state") || "";
  const savedState = getCookie(request, "decap_state") || "";

  if (!code) return miniHtml("Missing ?code in callback", true);
  if (!savedState || !returnedState || savedState !== returnedState) {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    headers.append("Set-Cookie", clearCookie("decap_state"));
    return new Response(htmlError("Invalid OAuth state"), { status: 400, headers });
  }

  const redirectBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${redirectBase}/api/decap-auth/callback`,
      state: returnedState,
    }),
  });

  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  headers.append("Set-Cookie", clearCookie("decap_state"));

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return new Response(htmlError("Token exchange failed: " + t), { status: 502, headers });
  }

  const data = await tokenRes.json();
  const accessToken = data.access_token;
  const errorDesc = data.error_description || data.error;
  if (!accessToken) {
    return new Response(htmlError("OAuth error: " + (errorDesc || "No access_token returned")), {
      status: 400, headers
    });
  }

  const payload = `authorization:github:success:${JSON.stringify({ token: accessToken })}`;
  return new Response(htmlPostMessage(payload), { status: 200, headers });
}

function htmlError(message) {
  const esc = s => String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><title>Decap OAuth Error</title>
<body>
<p>${esc(message)}</p>
<p><a href="/admin/">Back to admin</a></p>
<script>try{window.opener&&window.opener.postMessage("authorization:github:error:${esc(message)}","*")}catch(e){}</script>
</body>`;
}

function htmlPostMessage(payload) {
  return `<!doctype html><meta charset="utf-8"><title>Decap OAuth</title>
<body>
<script>
  try {
    window.opener && window.opener.postMessage(${JSON.stringify(payload)}, "*");
    // Don't auto-close instantly; give the parent a tick to bind listeners.
    setTimeout(() => window.close(), 300);
  } catch (e) {
    document.body.innerText = "Login complete. You can close this window.";
    var a=document.createElement('a'); a.href='/admin/'; a.innerText='Back to admin';
    document.body.appendChild(document.createElement('br')); document.body.appendChild(a);
  }
</script>
</body>`;
}
