/**
 * A page of the public web, read as text for the edge's own reading of it (the booking page a listing's website names,
 * lib/google/booking-page.ts). Every address it asks -- the first, and each one a redirect sends it to -- is one on
 * the public internet (contracts feedUrlOk), so a site cannot send the read into this platform's own network. It
 * follows a few redirects and no more, takes HTML only, and reads no more than it was told it may, as the page
 * arrives, rather than reading it whole and cutting it.
 *
 * It answers null rather than throwing: a page that cannot be read says nothing, and nothing is wrong. What a
 * business's home page says of itself, in one line (siteWordsOf), is read here too: a cold email's opening is written
 * and checked against it (lib/reach-out/check-one.ts).
 */
import { feedUrlOk } from "./packages/contracts.js";
// Who is asking, for a site that wants to know: channels' (site-reads.ts), the one place it is said.
import { BOT_USER_AGENT, emailPlainText } from "./packages/channels.js";

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
