export async function onRequest(context) {
  const { request, env } = context;

  const state = crypto.randomUUID();
  const enc = new TextEncoder();

  async function hmac(input, secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
    return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const mac = await hmac(state, env.COOKIE_SECRET);
  const cookie = `decap_oauth_state=${state}.${mac}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Domain=${new URL(request.url).hostname}`;

  const callbackUrl = `${new URL(request.url).origin}/callback`;

  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", callbackUrl);
  auth.searchParams.set("scope", "public_repo");
  auth.searchParams.set("state", state);
  auth.searchParams.set("allow_signup", "false");

  return new Response(null, { status: 302, headers: { "Location": auth.toString(), "Set-Cookie": cookie } });
}
