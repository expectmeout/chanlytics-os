/**
 * A business's own website, read for what it says about itself and for what its head declares: a page, and one image
 * it names, each with a time and a size cap. The website read, a booking page, a cold email's opening and a lead's mark
 * read other businesses' sites (the edge's lib/public-page.ts sitePage), and the Logo row reads a workspace's own site
 * for its logo (00407) on the owner's press (the edge's lib/imports/logo-lookup.ts): one reading, wherever it is done.
 *
 * A page is Firecrawl's (31 Oct 2026, Ruben: "we are not a website reading software"): one scrape answers the page as
 * a browser drew it, its scripts run, from the provider's network and never ours, with its main content as Markdown
 * beside it. What the page is then read FOR (its services, its booking link, its mark, its colour) stays the product's
 * own. An image is ours: the fetch is the caller's (`publicFetcher()` in production, which refuses any address that
 * is not on the public internet, at every hop). Both answer null rather than throwing: a page or an image that cannot
 * be read says nothing, and nothing is wrong. Its map answers a site's other pages, and its team read how many credits
 * are left (every scrape is one credit, a cached copy's too: whoever reads a page reads it once).
 */
import { logger } from "./log/logger";
import { answerObject, providerFetch } from "./provider-fetch";

/** Who is asking, for a site that wants to know: the platform's own reader, with the page that says what it does. */
const BOT_USER_AGENT = "ChanlyticsBot/1.0 (+https://chanlytics.com/bot)";

/** A read is given at least this, whatever the caller has left, and at most the cap for what it reads. */
const READ_FLOOR_MS = 500;
const IMAGE_READ_CAP_MS = 5_000;

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
/** Firecrawl's map (https://docs.firecrawl.dev/features/map): the pages of a site it knows of, the likeliest first. */
export const FIRECRAWL_MAP = "https://api.firecrawl.dev/v2/map";
/** Firecrawl's team read (https://docs.firecrawl.dev/api-reference/endpoint/credit-usage): what the plan has left. */
export const FIRECRAWL_CREDITS = "https://api.firecrawl.dev/v2/team/credit-usage";
/** The least a scrape may be given: the provider refuses a `timeout` under a second. */
const SCRAPE_FLOOR_MS = 1_000;
/** How long past the scrape's own bound its answer may take: the provider says its timeout; we do not guess it. */
const SCRAPE_ANSWER_MS = 2_000;
/** How long the team read may take: one row of the provider's own books. */
const CREDITS_READ_MS = 5_000;

/** The look the provider read off a page, where a read asked for it (SiteReadOptions.brand). */
export interface SiteBrand {
  /** The address of the mark it takes for the business's own, on the web; null for none. */
  logo: string | null;
  /** The colour it takes for the brand's, as the page writes it; null for none. */
  colour: string | null;
}

/** A business's page as the reader was given it. */
export interface SitePage {
  /** Where the page was read, after the redirects the provider followed. */
  url: string;
  /** The page as a browser drew it, its head included: what a mark, a colour or a link is read from. */
  html: string;
  /** Its main content as Markdown, the menus and footers left out: what a model is given to read. */
  markdown: string;
  /** What its head calls it. */
  title: string | null;
  /** What its head says of it: its own description, else the one it gives a link's preview. */
  description: string | null;
  /** Its look, where the read asked for it and the provider saw one. */
  brand: SiteBrand | null;
}

/** What a read of a page asks for. */
export interface SiteReadOptions {
  timeoutMs: number;
  /**
   * The page as it stands now, never the provider's copy of it (its `maxAge`, two days by default): what an owner's
   * press reads, since what they just changed must be what is read. A copy costs the same credit, and answers sooner.
   */
  fresh?: boolean;
  /** Its look too (the provider's `branding` format, which adds nothing to the scrape's credit). */
  brand?: boolean;
}

/** A page read at an address, in no longer than `timeoutMs`; null where it could not be read. Never throws. */
export type SitePageReader = (url: string, o: SiteReadOptions) => Promise<SitePage | null>;

/** A provider's words for a thing, read for what they are: its metadata can repeat a tag, and answers a list for it. */
function wordsSaid(v: unknown): string | null {
  const one: unknown = Array.isArray(v) ? v[0] : v;
  return typeof one === "string" && one.trim() ? one.trim() : null;
}

/** A provider's branding as the look it says: its logo where that is an address on the web, its primary colour. */
function brandOf(v: unknown): SiteBrand | null {
  if (!v || typeof v !== "object") return null;
  const b = v as { logo?: unknown; images?: { logo?: unknown } | null; colors?: { primary?: unknown } | null };
  const said = wordsSaid(b.images?.logo) ?? wordsSaid(b.logo);
  const logo = said && /^https?:\/\//i.test(said) ? said : null;
  const colour = wordsSaid(b.colors?.primary);
  return logo || colour ? { logo, colour } : null;
}

/** A scrape's answer as a page, or null: no success, a page that answered an error, or nothing drawn. */
function sitePageOf(answer: Record<string, unknown> | null, asked: string): SitePage | null {
  const data = answer?.success === true ? answer.data : null;
  if (!data || typeof data !== "object") return null;
  const d = data as {
    rawHtml?: unknown;
    markdown?: unknown;
    branding?: unknown;
    metadata?: { statusCode?: unknown; url?: unknown; title?: unknown; description?: unknown; ogDescription?: unknown };
  };
  const status = typeof d.metadata?.statusCode === "number" ? d.metadata.statusCode : 200;
  if (status >= 400 || typeof d.rawHtml !== "string" || !d.rawHtml) return null;
  return {
    url: typeof d.metadata?.url === "string" && d.metadata.url ? d.metadata.url : asked,
    html: d.rawHtml,
    markdown: typeof d.markdown === "string" ? d.markdown : "",
    title: wordsSaid(d.metadata?.title),
    description: wordsSaid(d.metadata?.description) ?? wordsSaid(d.metadata?.ogDescription),
    brand: brandOf(d.branding),
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
        body: JSON.stringify({
          url,
          formats: ["rawHtml", "markdown", ...(o.brand ? ["branding"] : [])],
          onlyMainContent: true,
          timeout,
          ...(o.fresh ? { maxAge: 0 } : {}),
        }),
        timeoutMs: timeout + SCRAPE_ANSWER_MS,
        idempotent: true,
      },
      deps,
    );
    // The provider's own no (a key refused, a 402 for credits gone): every page reads as no page until it is fixed, so
    // it is said apart from a page that did not answer. The credit watch pages it (imports/site-reader-watch.ts).
    if (a.outcome === "refused") logger().warn("site_read_refused", { status: a.status });
    return a.outcome === "ok" ? sitePageOf(answerObject(a), url) : null;
  };
}

/** One of a site's pages as the provider's map knows it. */
export interface SiteLink {
  url: string;
  /** What its head calls it, where the map kept that. */
  title: string | null;
}

/** A site's pages for a few words, the likeliest first, in no longer than `timeoutMs`; none where it knows of none. */
export type SiteMapper = (url: string, o: { search: string; limit: number; timeoutMs: number }) => Promise<SiteLink[]>;

/** The map over Firecrawl: a credit a call, whatever it finds. Never throws. */
export function firecrawlMapper(key: string, deps: { fetch?: typeof fetch } = {}): SiteMapper {
  return async (url, o) => {
    const timeout = Math.max(SCRAPE_FLOOR_MS, o.timeoutMs);
    const a = await providerFetch(
      "firecrawl",
      FIRECRAWL_MAP,
      {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ url, search: o.search, limit: o.limit, timeout }),
        timeoutMs: timeout + SCRAPE_ANSWER_MS,
        idempotent: true,
      },
      deps,
    );
    const links = a.outcome === "ok" ? answerObject(a)?.links : null;
    if (!Array.isArray(links)) return [];
    return links.flatMap((l: unknown) => {
      const said = l && typeof l === "object" ? (l as { url?: unknown; title?: unknown }) : {};
      const at = wordsSaid(said.url);
      return at ? [{ url: at, title: wordsSaid(said.title) }] : [];
    });
  };
}

/** What the reader's plan has left, or why that could not be read: `refused` is the provider's no to the key itself. */
export type SiteReaderCredits =
  | { kind: "read"; remaining: number; plan: number | null; periodEnd: string | null }
  | { kind: "refused"; status: number }
  | { kind: "unread" };

/** The credits left on the reader's plan: a read of its books, free. Never throws. */
export async function firecrawlCredits(key: string, deps: { fetch?: typeof fetch } = {}): Promise<SiteReaderCredits> {
  const a = await providerFetch(
    "firecrawl",
    FIRECRAWL_CREDITS,
    { method: "GET", headers: { authorization: `Bearer ${key}` }, timeoutMs: CREDITS_READ_MS, idempotent: true },
    deps,
  );
  if (a.outcome === "refused" && (a.status === 401 || a.status === 403)) return { kind: "refused", status: a.status };
  const data = a.outcome === "ok" ? answerObject(a)?.data : null;
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!d || typeof d.remainingCredits !== "number") return { kind: "unread" };
  return {
    kind: "read",
    remaining: d.remainingCredits,
    plan: typeof d.planCredits === "number" ? d.planCredits : null,
    periodEnd: wordsSaid(d.billingPeriodEnd),
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

const MAPPER_STAND_IN = Symbol.for("chanlytics.siteMapper.standIn");
type MapperHolder = { [MAPPER_STAND_IN]?: SiteMapper | null };

/** The map every read of a site's other pages goes through: a test's where one stands in, else the provider's with the key. */
export function siteMapper(key: string | null | undefined): SiteMapper | null {
  const standIn = (globalThis as MapperHolder)[MAPPER_STAND_IN];
  if (standIn) return standIn;
  return key ? firecrawlMapper(key) : null;
}

/** For tests only: stand in for the provider's map. Returns the one before, to put back; null puts the provider back. */
export function setSiteMapper(m: SiteMapper | null): SiteMapper | null {
  const holder = globalThis as MapperHolder;
  const before = holder[MAPPER_STAND_IN] ?? null;
  holder[MAPPER_STAND_IN] = m;
  return before;
}
