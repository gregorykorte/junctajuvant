// Starts the GitHub OAuth flow.
// Env: GITHUB_CLIENT_ID, OAUTH_SCOPE (public_repo or repo), OAUTH_ALLOW_SIGNUP (optional)

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const clientId = env.GITHUB_CLIENT_ID;
  const scope = env.OAUTH_SCOPE || 'public_repo';
  const allowSignup = (env.OAUTH_ALLOW_SIGNUP || 'false') === 'true';

  // Build redirect_uri dynamically so it works on prod + preview hosts
  const redirectUri = `${origin}/api/decap-auth/callback`;

  // CSRF state
  const state = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2,'0'), '');

  const authURL = new URL('https://github.com/login/oauth/authorize');
  authURL.searchParams.set('client_id', clientId);
  authURL.searchParams.set('redirect_uri', redirectUri);
  authURL.searchParams.set('scope', scope);
  authURL.searchParams.set('state', state);
  authURL.searchParams.set('allow_signup', allowSignup ? 'true' : 'false');

  const headers = new Headers({
    'Location': authURL.toString(),
    'Set-Cookie': [
      // store state for callback validation (HttpOnly so JS can't read it)
      `gh_oauth_state=${state}; Path=/api/decap-auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
    ].join('\n')
  });

  return new Response(null, { status: 302, headers });
}
