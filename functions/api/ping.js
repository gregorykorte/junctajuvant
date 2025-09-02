export async function onRequest() {
  return new Response("pong", { headers: { "Cache-Control": "no-store" } });
}
