/** Tiny response helpers for Web-handler functions. */

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function text(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers });
}
