/**
 * A business's own website, read for what it says about itself: its home page as text, and one image it names, each
 * with a time and a byte cap. The lead finder reads other businesses' sites for their marks (D6, the edge's
 * lib/leads/lead-marks.ts), and the dashboard reads a workspace's own site for its logo (00407) on the owner's press:
 * one reading, wherever it is done.
 *
 * The fetch is the caller's (`publicFetcher()` in production, which refuses any address that is not on the public
 * internet, at every hop). Both answer null rather than throwing: a page or an image that cannot be read says nothing,
 * and nothing is wrong.
 */

/** Who is asking, for a site that wants to know: the platform's own reader, with the page that says what it does. */
export const BOT_USER_AGENT = "ChanlyticsBot/1.0 (+https://chanlytics.com/bot)";

/** A read is given at least this, whatever the caller has left, and at most the cap for what it reads. */
const READ_FLOOR_MS = 500;
const PAGE_READ_CAP_MS = 8_000;
const IMAGE_READ_CAP_MS = 5_000;

/** How much of a page is worth reading for a mark: a head is at the top, and a megabyte of body is not ours to hold. */
const PAGE_MAX_BYTES = 96_000;

/**
 * One GET of a page as text, for our own reading. It is a business's own home page, asked for once: no redirect chain
 * beyond the platform's own, no cookie kept, nothing followed off the page, and the first ninety kilobytes only -- the
 * head is at the top and the rest is not ours. Anything that is not a page we can read answers null.
 */
export async function pageText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<string | null> {
  const stop = AbortSignal.timeout(Math.max(READ_FLOOR_MS, Math.min(timeoutMs, PAGE_READ_CAP_MS)));
  try {
    const res = await fetchImpl(url, {
      signal: stop,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": BOT_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) return null;
    const body = await res.text();
    return body.slice(0, PAGE_MAX_BYTES);
  } catch {
    return null;
  }
}

/**
 * One GET of an image, never more than `maxBytes`: a length said up front past it is refused before a byte is read,
 * and a body that runs past it is cut off and refused. No AVIF or SVG is asked for, since neither is kept.
 */
export async function imageBytes(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const stop = AbortSignal.timeout(Math.max(READ_FLOOR_MS, Math.min(timeoutMs, IMAGE_READ_CAP_MS)));
  try {
    const res = await fetchImpl(url, {
      signal: stop,
      redirect: "follow",
      headers: {
        accept: "image/png,image/jpeg,image/webp,image/gif,image/x-icon;q=0.9,*/*;q=0.5",
        "user-agent": BOT_USER_AGENT,
      },
    });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      await res.body.cancel().catch(() => undefined);
      return null;
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}
