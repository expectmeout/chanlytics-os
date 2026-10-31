/**
 * A business's page, read for the edge's own reading of it: the website read (lib/imports/website-read.ts), the booking
 * page a listing's website names (lib/google/booking-page.ts), a lead's home page for its mark
 * (lib/leads/lead-marks.ts) and for what a cold email's opening may say (lib/reach-out/check-one.ts). The page is
 * the platform's one reader's (channels sitePageReader: Firecrawl's scrape, drawn as a browser draws it, on the
 * provider's network and never ours). The address is judged first (contracts feedUrlOk), so one inside a private
 * network is never asked for; past that the provider follows the site's own redirects.
 *
 * It answers null rather than throwing: a page that cannot be read says nothing, and nothing is wrong. What a
 * business's home page says of itself, in one line (siteWordsOf), is read here too: a cold email's opening is written
 * and checked against it (lib/reach-out/check-one.ts).
 */
import { feedUrlOk } from "./packages/contracts.js";
import { emailPlainText, sitePageReader, type SitePage } from "./packages/channels.js";
import { env } from "./env.js";

/**
 * A page at an address, held to `maxChars` as the readers read it (its HTML and its Markdown each), in no longer than
 * `timeoutMs`; null with no key set (FIRECRAWL_API_KEY), an address that is not a public one (the one asked, or the one
 * the site's redirects ended at), a page that answered an error or nothing, or no answer in time.
 */
export async function sitePage(
  url: string | null,
  limits: { timeoutMs: number; maxChars: number },
): Promise<SitePage | null> {
  const at = feedUrlOk(url);
  const reader = sitePageReader(env.FIRECRAWL_API_KEY);
  if (!at || !reader) return null;
  const page = await reader(at, { timeoutMs: limits.timeoutMs }).catch(() => null);
  const landed = page ? feedUrlOk(page.url) : null;
  if (!page || !landed) return null;
  return {
    url: landed,
    html: page.html.slice(0, limits.maxChars),
    markdown: page.markdown.slice(0, limits.maxChars),
  };
}

/** The most a business's website is said in, in characters: as much as a directory's about (core leads/cards.ts). */
const WEBSITE_SAYS_MAX = 600;

const TITLE = /<title[^>]*>([\s\S]*?)<\/title\s*>/i;
const META = /<meta\b[^>]*>/gi;
const CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/** A page's description, as its meta tags say it: its own, else the one it gives a link's preview. */
function descriptionOf(html: string): string {
  let preview = "";
  for (const [tag] of html.matchAll(META)) {
    const said = CONTENT.exec(tag);
    const content = said?.[1] ?? said?.[2] ?? "";
    if (!content.trim()) continue;
    if (/\bname\s*=\s*["']?description\b/i.test(tag)) return content;
    if (!preview && /\bproperty\s*=\s*["']?og:description\b/i.test(tag)) preview = content;
  }
  return preview;
}

/** HTML's words in one line, as an email's are read (channels emailPlainText): entities read, no script, no style. */
const pageLineOf = (html: string): string => (emailPlainText({ text: null, html }) ?? "").replace(/\s+/g, " ").trim();

/**
 * What a business's own home page says of itself, in one line: its title, its description, then its page's words, each
 * once, cut at a word within WEBSITE_SAYS_MAX; null where it says nothing. Its words, never ours.
 */
export function siteWordsOf(html: string): string | null {
  const parts: string[] = [];
  for (const part of [
    pageLineOf(`<p>${TITLE.exec(html)?.[1] ?? ""}</p>`),
    pageLineOf(`<p>${descriptionOf(html)}</p>`),
    pageLineOf(html),
  ])
    if (part && !parts.some((p) => p.includes(part))) parts.push(part);
  const said = parts.join(" · ");
  if (!said) return null;
  if (said.length <= WEBSITE_SAYS_MAX) return said;
  const cut = said.slice(0, WEBSITE_SAYS_MAX + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s·,;:–—-]+$/, "");
}
