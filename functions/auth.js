export async function onRequest({ request }) {
  return new Response("auth ok: " + new URL(request.url).origin, {
    headers: { "content-type": "text/plain" }
  });
}
