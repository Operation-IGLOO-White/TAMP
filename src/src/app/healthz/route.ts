// Liveness probe for the Next.js container itself (Docker HEALTHCHECK). Not
// part of the app's API surface — that lives entirely in Tamp-backend.
export function GET() {
  return new Response("ok\n", { headers: { "Content-Type": "text/plain" } });
}
