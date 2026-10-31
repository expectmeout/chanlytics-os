/**
 * A business's own website, read for what it says about itself: its home page as text, and one image it names, each
 * with a time and a byte cap. The lead finder reads other businesses' sites for their marks (D6, the edge's
 * lib/leads/lead-marks.ts), and the dashboard reads a workspace's own site for its logo (00407) on the owner's press:
 * one reading, wherever it is done.
 *
 * The fetch is the caller's (`publicFetcher()` in production, which refuses any address that is not on the public
 * internet, at every hop). Both answer null rather than throwing: a page or an image that cannot be read says nothing,
 * and nothing is wrong.
 *
 * A page read for what it says, or for what its head declares, is Firecrawl's (31 Oct 2026, Ruben: "we are not a
 * website reading software"): one scrape answers the page as a browser drew it, its scripts run, from the provider's
 * network and never ours, with its main content as Markdown beside it. What the page is then read FOR (its services,
 * its booking link, its mark, its colour) stays the product's own. `pageText` is the dashboard's Logo row's alone
 * until that read moves to the edge, where the key is.
 */
import { answerObject, providerFetch } from "./provider-fetch";

/** Who is asking, for a site that wants to know: the platform's own reader, with the page that says what it does. */
const BOT_USER_AGENT = "ChanlyticsBot/1.0 (+https://chanlytics.com/bot)";

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

/** Firecrawl's scrape (https://docs.firecrawl.dev/api-reference/endpoint/scrape): one page, its answer in the call. */
export const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v2/scrape";
/** The least a scrape may be given: the provider refuses a `timeout` under a second. */
const SCRAPE_FLOOR_MS = 1_000;
/** How long past the scrape's own bound its answer may take: the provider says its timeout; we do not guess it. */
const SCRAPE_ANSWER_MS = 2_000;

/** A business's page as the reader was given it. */
export interface SitePage {
  /** Where the page was read, after the redirects the provider followed. */
  url: string;
  /** The page as a browser drew it, its head included: what a mark, a colour or a link is read from. */
  html: string;
  /** Its main content as Markdown, the menus and footers left out: what a model is given to read. */
  markdown: string;
}

/** A page read at an address, in no longer than `timeoutMs`; null where it could not be read. Never throws. */
export type SitePageReader = (url: string, o: { timeoutMs: number }) => Promise<SitePage | null>;

/** A scrape's answer as a page, or null: no success, a page that answered an error, or nothing drawn. */
function sitePageOf(answer: Record<string, unknown> | null, asked: string): SitePage | null {
  const data = answer?.success === true ? answer.data : null;
  if (!data || typeof data !== "object") return null;
  const d = data as { rawHtml?: unknown; markdown?: unknown; metadata?: { statusCode?: unknown; url?: unknown } };
  const status = typeof d.metadata?.statusCode === "number" ? d.metadata.statusCode : 200;
  if (status >= 400 || typeof d.rawHtml !== "string" || !d.rawHtml) return null;
  return {
    url: typeof d.metadata?.url === "string" && d.metadata.url ? d.metadata.url : asked,
    html: d.rawHtml,
    markdown: typeof d.markdown === "string" ? d.markdown : "",
  };
}

/** The reader over Firecrawl, its key in a header. `deps.fetch` stands in for the network in this module's own test. */
export function firecrawlReader(key: string, deps: { fetch?: typeof fetch } = {}): SitePageReader {
  return async (url, o) => {
    const timeout = Math.max(SCRAPE_FLOOR_MS, o.timeoutMs);
    const a = await providerFetch(
      "firecrawl",
      FIRECRAWL_SCRAPE,
      {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ url, formats: ["rawHtml", "markdown"], onlyMainContent: true, timeout }),
        timeoutMs: timeout + SCRAPE_ANSWER_MS,
        idempotent: true,
      },
      deps,
    );
    return a.outcome === "ok" ? sitePageOf(answerObject(a), url) : null;
  };
}

const READER_STAND_IN = Symbol.for("chanlytics.sitePageReader.standIn");
type ReaderHolder = { [READER_STAND_IN]?: SitePageReader | null };

/**
 * The reader every server-side read of a business's page goes through: Firecrawl's with the key, a test's where one
 * stands in (`setSitePageReader`, as `setPublicFetch` is), or null where no key is set, so the read says it could not
 * be made.
 */
export function sitePageReader(key: string | null | undefined): SitePageReader | null {
  const standIn = (globalThis as ReaderHolder)[READER_STAND_IN];
  if (standIn) return standIn;
  return key ? firecrawlReader(key) : null;
}

/** For tests only: stand in for the provider. Returns the one before, to put back; null puts the provider back. */
export function setSitePageReader(r: SitePageReader | null): SitePageReader | null {
  const holder = globalThis as ReaderHolder;
  const before = holder[READER_STAND_IN] ?? null;
  holder[READER_STAND_IN] = r;
  return before;
}
