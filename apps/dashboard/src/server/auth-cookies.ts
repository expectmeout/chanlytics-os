/**
 * Writing a refreshed session onto a response, guard and all.
 *
 * WHY THIS IS NOT TWO LINES IN THE PROXY. @supabase/ssr calls `setAll` with
 * the cookies AND, since 0.12, a second argument: the headers that must go out
 * with them --
 *
 *   Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0
 *   Expires: 0
 *   Pragma: no-cache
 *
 * A response that sets an auth cookie and does not say this may be kept by any
 * shared cache between us and the browser, and handed to the next person who
 * asks for that URL. That is one operator's session token served to another,
 * and nothing about it looks wrong in a log. The proxy took the cookies and
 * dropped the headers, because the argument arrived in a library upgrade and
 * the callback signature did not have to change to keep compiling.
 *
 * The library delivers the headers on the first write of a given server client
 * and passes an empty object afterwards, so an empty one means "already said",
 * never "nothing to do" -- the cookies are still written either way.
 *
 * It takes a sink rather than a NextResponse so the behaviour runs in a test
 * without a Next runtime, the way the callback's own decisions do in
 * oauth-callback.ts.
 */

/** One cookie as @supabase/ssr hands it over. Options are its own; we do not read them. */
export interface AuthCookie {
  name: string;
  value: string;
  options?: unknown;
}

/** The part of a NextResponse this needs: somewhere for cookies, somewhere for headers. */
export interface CookieSink {
  cookies: { set: (name: string, value: string, options?: never) => unknown };
  headers: { set: (name: string, value: string) => unknown };
}

export function writeAuthCookies(
  sink: CookieSink,
  cookies: readonly AuthCookie[],
  headers?: Record<string, string> | null,
): void {
  for (const { name, value, options } of cookies) {
    sink.cookies.set(name, value, options as never);
  }
  for (const [name, value] of Object.entries(headers ?? {})) {
    sink.headers.set(name, value);
  }
}
