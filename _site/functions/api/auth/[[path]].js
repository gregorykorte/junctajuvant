// Proxies Pages requests to your deployed Worker service.
const WORKER_BASE = "https://sveltia-cms-auth.gregorykorte.workers.dev";

export async function onRequest({ request }) {
  const inUrl = new URL(request.url);
  const outUrl = new URL(
    WORKER_BASE + inUrl.pathname.replace(/^\/api\/auth/, "") + inUrl.search
  );

  // Preserve method, headers, and body
  const upstreamReq = new Request(outUrl, request);
  return fetch(upstreamReq);
}
