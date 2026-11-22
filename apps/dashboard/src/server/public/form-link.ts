import "server-only";

/**
 * /l/<code>: a short link to one place a form is shared (00680; the content loop PRD's Appendix A). It counts the open
 * for its day and goes on to the form, carrying its code so the entry that follows says which place it came through.
 * An open is a count, never a visitor: no cookie is left and no address is kept. A chat app that fetches the address
 * to draw its preview is not a person opening it, and is not counted. A code nobody holds opens nothing; a link that
 * was stopped, or whose form is not there, lands on the business's own page.
 *
 * Cross-workspace: a code names one link, and the link its own workspace; nothing else is read.
 */
import { SOURCE_LABELS } from "@chanlytics/contracts";
import { openLink, type LinkOpened } from "@chanlytics/db/forms";
import { log } from "../shared/log";
import { linkPageDb } from "./link-page";

/** A link's code, as the database makes it (link_code_new). */
const CODE = /^[a-hjkmnp-z2-9]{6}$/;

/** Who fetches an address to draw its preview or to index it, by what they call themselves: no person's open. */
const PREVIEWER =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|^WhatsApp\/|SkypeUriPreview|Pinterest\/|GoogleOther|preview/i;

const gone = () =>
  new Response("Nothing is at this address.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

/** Where an opened link lands: its form with the code, or the business's page where the link or the form is not live. */
function landingOf(opened: LinkOpened, carried: URLSearchParams): string {
  const home = `/b/${opened.workspace}`;
  if (opened.stopped || !opened.subject.slug) return home;
  const query = new URLSearchParams({ l: opened.code });
  for (const name of SOURCE_LABELS) {
    const label = carried.get(name);
    if (label) query.set(name, label);
  }
  return `${home}/${opened.subject.slug}?${query.toString()}`;
}

/** GET: the open counted, and the visitor sent on to where the link lands. */
export async function linkGet(code: string, request: Request): Promise<Response> {
  const clean = code.trim().toLowerCase();
  const db = linkPageDb();
  if (!db || !CODE.test(clean)) return gone();
  const agent = request.headers.get("user-agent") ?? "";
  const counted = request.method === "GET" && agent.includes("Mozilla/") && !PREVIEWER.test(agent);
  let opened: LinkOpened | null;
  try {
    opened = await openLink(db, clean, counted);
  } catch (e) {
    // Where it lands could not be read: the visitor is asked to come back, never shown a broken page.
    log.error("form_link_failed", { error: String(e).slice(0, 300) });
    return new Response(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }
  if (!opened?.workspace) return gone();
  return new Response(null, {
    status: 302,
    headers: { location: landingOf(opened, new URL(request.url).searchParams), "cache-control": "no-store" },
  });
}
