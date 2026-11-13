import "server-only";
import { NextResponse, connection } from "next/server";

/** A warm-up's handler: it answers the routes it holds, and says them (`held`) to what holds the list to the pages' reads. */
export interface WarmHandler {
  (): Promise<Response>;
  /** The routes held, by the path the client asks each at, sorted. */
  readonly held: readonly string[];
}

/**
 * A warm-up (GET /api/warm, GET /api/warm/long): a route that answers the routes it holds, by their paths, and nothing else.
 *
 * On Vercel a route's code is loaded the first time it is asked for in an instance: Next preloads its entries at start
 * only outside minimal mode, which is how Vercel runs it. So after every deploy, and in every new instance, the first
 * visit to each page waited for its routes' code: 1.1 to 3.3 s to a first byte, against 0.2 to 0.6 s once it was loaded
 * (production, the load review of 12 Nov 2026). Routes of one configuration share a function, and a module that imports a
 * route loads it, so a warm-up is a route that imports the routes every page opens on: asked for once, by the platform's
 * clock (vercel.json), it loads them all, and a visitor finds them loaded.
 *
 * Answered by the instance at each request (`connection()`), never by a file the build wrote: prerendered, the clock
 * would be answered from a cache and no code would load (check:static-shell fails such a build). It reads nothing of
 * the request, names no workspace and reads no row, so it answers anyone (proxy.ts PUBLIC_PATHS).
 */
export function routesWarmed(routes: readonly string[]): WarmHandler {
  const held = [...routes].sort();
  const answer = async (): Promise<Response> => {
    await connection();
    return NextResponse.json({ ok: true, routes: held }, { headers: { "cache-control": "no-store" } });
  };
  return Object.assign(answer, { held });
}
