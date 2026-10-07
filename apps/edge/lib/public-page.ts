/**
 * A page of the public web, read as text for the edge's own reading of it (the booking page a listing's website names,
 * lib/google/booking-page.ts). Every address it asks -- the first, and each one a redirect sends it to -- is one on
 * the public internet (contracts feedUrlOk), so a site cannot send the read into this platform's own network. It
 * follows a few redirects and no more, takes HTML only, and reads no more than it was told it may, as the page
 * arrives, rather than reading it whole and cutting it.
 *
 * It answers null rather than throwing: a page that cannot be read says nothing, and nothing is wrong.
 */
import { feedUrlOk } from "./packages/contracts.js";

/** Who is asking, for a site that wants to know: the platform's own reader, with the page that says what it does. */
export const BOT_USER_AGENT = "ChanlyticsBot/1.0 (+https://chanlytics.com/bot)";

/** An http to https hop and a www one are what a site does; more than this is a chain, and not followed. */
const REDIRECTS_MAX = 3;

export async function publicPageText(
  fetchImpl: typeof fetch,
  url: string | null,
  limits: { timeoutMs: number; maxBytes: number },
): Promise<string | null> {
  const stop = AbortSignal.timeout(limits.timeoutMs);
  let at = feedUrlOk(url);
  try {
    for (let hop = 0; at && hop <= REDIRECTS_MAX; hop += 1) {
      const res = await fetchImpl(at, {
        signal: stop,
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": BOT_USER_AGENT },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        await res.body?.cancel().catch(() => undefined);
        at = next ? feedUrlOk(new URL(next, at).toString()) : null;
        continue;
      }
      if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      return await textUpTo(res.body, limits.maxBytes);
    }
    return null;
  } catch {
    return null;
  }
}

/** A body as text, up to `maxBytes` of it: what arrives past them is not read. */
async function textUpTo(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const part = value.subarray(0, Math.max(0, maxBytes - size));
    size += part.byteLength;
    text += decoder.decode(part, { stream: true });
    if (size >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text + decoder.decode();
}
