// Completes the GitHub OAuth flow: exchanges ?code for an access_token,
// then returns a tiny HTML page that posts the token to Decap via postMessage.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Validate state from cookie
  const cookie = request.headers.get('Cookie') || '';
  const m = /gh_oauth_state=([a-f0-9]{32})/.exec(cookie);
  const cookieState = m ? m[1] : null;
  if (!code || !state || !cookieState || cookieState !== state) {
    return htmlClosePopup(`authorization:github:error:state_mismatch`);
  }

  // Build redirect_uri from current host
  const origin = `${url.protocol}//${url.host}`;
  const redirectUri = `${origin}/api/decap-auth/callback`;

  // Exchange code -> token
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri
  });

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body
  });

  if (!tokenRes.ok) {
    return htmlClosePopup(`authorization:github:error:token_http_${tokenRes.status}`);
  }

  const data = await tokenRes.json();
  const token = data.access_token;
  if (!token) {
    return htmlClosePopup(`authorization:github:error:no_token`);
  }

  // Clear the state cookie
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Set-Cookie': 'gh_oauth_state=; Path=/api/decap-auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
  });

  // Decap expects the popup to postMessage 'authorization:github:success:<token>'
  const page = `<!doctype html>
<meta charset="utf-8">
<title>Done</title>
<script>
  (function(){
    try {
      window.opener && window.opener.postMessage('authorization:github:success:${token}', '*');
    } finally {
      window.close();
    }
  })();
</script>
<p>You can close this window.</p>`;

  return new Response(page, { status: 200, headers });

  function htmlClosePopup(message) {
    const h = `<!doctype html>
<meta charset="utf-8">
<title>Error</title>
<script>
  (function(){
    try {
      window.opener && window.opener.postMessage('${message}', '*');
    } finally {
      window.close();
    }
  })();
</script>
<p>Authentication error. You can close this window.</p>`;
    return new Response(h, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' }});
  }
}
