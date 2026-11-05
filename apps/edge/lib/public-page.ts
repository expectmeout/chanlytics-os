/**
 * A business's page, read for the edge's own reading of it: the website read (lib/imports/website-read.ts) and the
 * booking platform's page it names, the Logo row's look (lib/imports/logo-lookup.ts), a lead's home page for its mark and
 * for what the judge may read (lib/leads/lead-marks.ts), and what a cold email's opening may say
 * (lib/reach-out/check-one.ts). The page is the platform's one reader's (channels sitePageReader: Firecrawl's scrape,
 * drawn as a browser draws it, on the provider's network and never ours). The address is judged first (contracts
 * feedUrlOk), so one inside a private network is never asked for; past that the provider follows the site's own redirects.
 *
 * It answers null rather than throwing: a page that cannot be read says nothing, and nothing is wrong.
 */
import { feedUrlOk, SECOND_MS } from "./packages/contracts.js";
import { siteMapper, sitePageReader, type SiteLink, type SitePage } from "./packages/channels.js";
import { env } from "./env.js";

/** One kind of read: how long the page may take, how much of it is held, and what it asks of the reader. */
interface PageRead {
  timeoutMs: number;
  /** Held to this many characters, its HTML and its Markdown each. */
  maxChars: number;
  /** The page as it stands now, never the reader's copy of the last two days: what an owner just changed is what is read. */
  fresh?: boolean;
  /** The look the reader sees on it too. */
  brand?: boolean;
}

/** Every read of a business's page, by what it is read for: what each is given is said here, once. */
export const PAGE_READS = {
  /** The business's own home page, for Check and its look. A site's own pages, never a download. */
  website: { timeoutMs: 10 * SECOND_MS, maxChars: 400_000, brand: true },
  /** The pages it links to for its services and rules, and the booking platform's page, read beside it. */
  websitePage: { timeoutMs: 10 * SECOND_MS, maxChars: 400_000 },
  /** The Logo row's look, at the owner's press: as the site stands now. A head is at the top. */
  logo: { timeoutMs: 10 * SECOND_MS, maxChars: 96_000, fresh: true, brand: true },
  /** A cold email's opening: its head and first words, inside a check's own time. */
  opening: { timeoutMs: 4 * SECOND_MS, maxChars: 200_000 },
  /**
   * A lead's home page, for its mark and the judge, in what time its step has left: as far down as its links go, since
   * a site builder's page holds its booking link deep in (a real one, 434,649 characters in, on 5 Nov 2026).
   */
  lead: { timeoutMs: 10 * SECOND_MS, maxChars: 1_000_000 },
} as const satisfies Record<string, PageRead>;

/** Whether a page can be read here at all: a reader stood in, or its key set. Without one every page reads as no page. */
export const sitePagesReadable = (): boolean => !!sitePageReader(env.FIRECRAWL_API_KEY);

/**
 * A page at an address, as `read` says; null with no key set (FIRECRAWL_API_KEY), an address that is not a public one
 * (the one asked, or the one the site's redirects ended at), a page that answered an error or nothing, or no answer in
 * time.
 */
export async function sitePage(url: string | null, read: PageRead): Promise<SitePage | null> {
  const at = feedUrlOk(url);
  const reader = sitePageReader(env.FIRECRAWL_API_KEY);
  if (!at || !reader) return null;
  const page = await reader(at, { timeoutMs: read.timeoutMs, fresh: read.fresh, brand: read.brand }).catch(() => null);
  const landed = page ? feedUrlOk(page.url) : null;
  if (!page || !landed) return null;
  return {
    ...page,
    url: landed,
    html: page.html.slice(0, read.maxChars),
    markdown: page.markdown.slice(0, read.maxChars),
  };
}

/** The least worth asking the other spelling for: the provider refuses a read of under a second. */
const OTHER_SPELLING_LEAST_MS = SECOND_MS;

/** A site's other spelling, www. or not: a site often answers on one alone. Null for an address that is no address. */
function otherSpelling(url: string): string | null {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * A business's home page at an address that may be spelled either way: as given, and, where that gives no page, its other
 * spelling (www. or not) in what is left of the read's time, never past it. A lead keeps its website's host without the
 * www., and a website a person typed is as they typed it.
 */
export async function homePage(url: string, read: PageRead): Promise<SitePage | null> {
  const until = Date.now() + read.timeoutMs;
  const page = await sitePage(url, read);
  if (page) return page;
  const left = until - Date.now();
  const other = left >= OTHER_SPELLING_LEAST_MS ? otherSpelling(url) : null;
  return other ? sitePage(other, { ...read, timeoutMs: left }) : null;
}

/**
 * The pages of a site its reader's map knows of for a few words, the likeliest first, each a public address: what a home
 * page that links to none of them leaves to ask. None with no key set, or on anything the map could not say.
 */
export async function siteLinks(
  url: string,
  o: { search: string; limit: number; timeoutMs: number },
): Promise<SiteLink[]> {
  const at = feedUrlOk(url);
  const map = siteMapper(env.FIRECRAWL_API_KEY);
  if (!at || !map) return [];
  const links = await map(at, o).catch(() => []);
  return links.filter((l) => !!feedUrlOk(l.url));
}
