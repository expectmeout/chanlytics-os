import "server-only";

/**
 * The unsubscribe link every campaign email carries (Reach out, Part 2; RFC 8058), as the dashboard answers it. It answers
 * two kinds of email on one door: a reach-out's cold email to a business the finder found, and an OFFER to a customer (One
 * message, every channel, step 4). Which it is, is read from the email the link came in (its row's source); the offer's page
 * speaks to a customer (contracts offerUnsubscribeWords) and, once offers have stopped, offers a second, confirmed act:
 * "Stop all messages", which is a STOP for everything. An unsubscribe is not a STOP (the spec's decision 12).
 *
 * GET draws one question and one button, and changes nothing: link scanners and previews fetch every URL in an
 * email, and a stop that happened on a fetch would be a stop nobody pressed. POST is either the mail client's one
 * click (`List-Unsubscribe=One-Click`, no cookie, no page) or that button, and either records the stop in the same
 * response: never a redirect, never a sign-in. The token is the authority (packages/channels
 * unsubscribe-token.ts); the one write is 00174's set_email_marketing, which can only ever narrow what may be
 * sent, and says nothing twice.
 *
 * It holds the service role, like consent-page.ts, because the person pressing has no session; unlike it, it
 * writes, and only through that door. The page draws its own small HTML: it is the one screen a stranger sees
 * from an email, and it must not depend on the app's bundle to say "you're unsubscribed".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { setEmailUnsubscribed, stopAllMessages, type Database } from "@chanlytics/db";
import { addressOf, verifyUnsubscribeToken } from "@chanlytics/channels";
import {
  escapeHtml,
  offerUnsubscribeWords,
  STOP_ALL_REFUSALS,
  UNSUBSCRIBE_PAGE_HEADER,
  unsubscribePageWords,
  type OfferUnsubscribeView,
  type UnsubscribeView,
  MIN_MS,
} from "@chanlytics/contracts";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { serviceDbIfConfigured } from "@/server/service-db";

/** The largest body a one click or the page's button sends. Anything larger is not one. */
const MAX_BODY_BYTES = 4096;

/** A test's database; otherwise the dashboard's one service-role client, when this deployment holds its keys. */
let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> | null {
  return svc ?? serviceDbIfConfigured();
}

/** For tests: the database the page reads and writes through. */
export function setServiceClient(db: SupabaseClient<Database> | null): void {
  svc = db;
}

/**
 * The secrets a link may be sealed under: the current one first, then the one before it while a rotation settles.
 * Null without the current one, whatever the previous says: the door is either set up or it is not.
 */
function secrets(): string[] | null {
  const current = env.UNSUBSCRIBE_SECRET;
  if (!current) return null;
  const previous = env.UNSUBSCRIBE_SECRET_PREVIOUS;
  return previous ? [current, previous] : [current];
}

/** How often at most the door says each thing: a scanner fetching every link must not flood the log. */
const SAID_EVERY_MS = MIN_MS;
const saidAt = new Map<string, number>();

/** One line to the platform, once a minute at most for each event; whether it was said. Never the link. */
function sayOnceAMinute(
  level: "error" | "warn",
  event: "unsubscribe_unavailable" | "unsubscribe_bad_link",
  fields: Record<string, unknown>,
): boolean {
  const now = Date.now();
  if (now - (saidAt.get(event) ?? 0) < SAID_EVERY_MS) return false;
  saidAt.set(event, now);
  log[level](event, fields);
  return true;
}

/** A door that cannot answer, said to the platform (never the link, which is the authority to stop). */
function sayUnavailable(why: "no_secret" | "no_database"): void {
  sayOnceAMinute("error", "unsubscribe_unavailable", { why });
}

/** Links this instance refused since its last line said so. */
let refusedSinceSaid = 0;

/**
 * A link no key here made: a guess, a link a mail client broke, or one sealed under a key this page does not hold. The
 * page says the first at once, then once a minute at most, each line counting what this instance (one of several)
 * refused since its previous line (`since`, null for its first). So a key set wrong reads as one line, then a count that
 * keeps coming; it is the edge's probe that pages about it (apps/edge lib/email/unsubscribe-probe.ts).
 */
function sayBadLink(): void {
  refusedSinceSaid += 1;
  const last = saidAt.get("unsubscribe_bad_link");
  const since = last === undefined ? null : new Date(last).toISOString();
  if (sayOnceAMinute("warn", "unsubscribe_bad_link", { refused: refusedSinceSaid, since })) refusedSinceSaid = 0;
}

/** The secrets and the database, or null once the platform has been told which is missing. */
function door(): { keys: string[]; db: SupabaseClient<Database> } | null {
  const keys = secrets();
  if (!keys) {
    sayUnavailable("no_secret");
    return null;
  }
  const db = serviceDb();
  if (!db) {
    sayUnavailable("no_database");
    return null;
  }
  return { keys, db };
}

const HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  // The token is in the path: nothing on the page links out, and nothing should carry it anywhere if it did.
  "referrer-policy": "no-referrer",
};

/** The product's paper and ink (legacy tokens.css), light and dark, so the page reads as the app's. */
const STYLE = `
:root{--bg:oklch(0.985 0.003 80);--raised:oklch(1 0 0);--line:oklch(0.92 0.005 80);--ink:oklch(0.18 0.01 260);
--muted:oklch(0.42 0.01 260);--accent:oklch(0.52 0.19 25);--on-accent:#fff;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.16 0.005 260);--raised:oklch(0.2 0.006 260);
--line:oklch(0.27 0.008 260);--ink:oklch(0.96 0.004 80);--muted:oklch(0.74 0.008 260);--accent:oklch(0.7 0.18 28);
--on-accent:#1a0a06}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Geist","Inter",-apple-system,BlinkMacSystemFont,sans-serif}
main{max-width:520px;margin:12vh auto 10vh;padding:0 22px}
.card{padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--raised)}
h1{font-size:1.35rem;margin:0 0 8px;text-wrap:balance}
p{margin:0;color:var(--muted);font-size:.95rem}
form{margin:18px 0 0}
button{font:inherit;font-weight:600;font-size:.95rem;border:0;border-radius:9px;padding:10px 18px;cursor:pointer;
background:var(--accent);color:var(--on-accent)}
button:hover{opacity:.9}
button.quiet{background:transparent;color:var(--muted);border:1px solid var(--line);font-weight:500}
form+form{margin-top:10px}
.foot{margin:18px 0 0;font-size:.8rem}
`;

/** One page as it is drawn: its words, and a button for each press it offers (a form posting `name=value`). */
interface PageWords {
  title: string;
  lead: string;
  body: string;
  buttons: Array<{ label: string; name: string; value: string; quiet?: boolean }>;
  foot: string | null;
}

/** The page every view is drawn on: the product's paper and ink, one card, no script, whatever the words. */
function draw(status: number, kind: string, w: PageWords): Response {
  const forms = w.buttons
    .map(
      (b) =>
        `<form method="post"><input type="hidden" name="${escapeHtml(b.name)}" value="${escapeHtml(b.value)}">` +
        `<button type="submit"${b.quiet ? ' class="quiet"' : ""}>${escapeHtml(b.label)}</button></form>`,
    )
    .join("");
  const foot = w.foot ? `<p class="foot">${escapeHtml(w.foot)}</p>` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escapeHtml(w.title)}</title><style>${STYLE}</style></head>
<body><main><div class="card"><h1>${escapeHtml(w.lead)}</h1><p>${escapeHtml(w.body)}</p>${forms}</div>${foot}</main></body></html>`;
  // Which view this is, so the edge can tell the page answering from anything else answering at its address. The words
  // true of both kinds of email are the same view to the edge (its probe's link names no email, so it draws them): an
  // "ask" or a "done", whichever words the page says it in.
  const view = kind === "ask_either" ? "ask" : kind === "done_either" ? "done" : kind;
  const headers = { ...HEADERS, "content-type": "text/html; charset=utf-8", [UNSUBSCRIBE_PAGE_HEADER]: view };
  return new Response(html, { status, headers });
}

/** A view of the reach-out's cold email's page, and every view that is the same for both: a bad link, a press that failed. */
function page(status: number, view: UnsubscribeView): Response {
  const w = unsubscribePageWords(view);
  return draw(status, view.kind, {
    ...w,
    buttons: w.button ? [{ label: w.button, name: "unsubscribe", value: "yes" }] : [],
  });
}

/** A view of the page an offer's link opens: to a customer, in their words (contracts offerUnsubscribeWords). */
function offerPage(status: number, view: OfferUnsubscribeView): Response {
  return draw(status, view.kind, offerUnsubscribeWords(view));
}

function plainText(status: number, body: string): Response {
  return new Response(body, { status, headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" } });
}

/** The business's name for the page's words; null when it cannot be read, which the words say without. */
async function businessName(db: SupabaseClient<Database>, tenantId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    return error ? null : (data?.name ?? null);
  } catch {
    return null;
  }
}

/**
 * What the email this link came in was: the address it left from (its frozen request's From), so the page can name it, and
 * which kind of email it was. An OFFER to a customer is a broadcast's email (its row's source); any other email is a
 * reach-out's. An email that cannot be read (the read failed, or the row is not there) is `unread`, which is neither: the
 * page then says only what is true of both kinds, and a press of "Stop all messages" is refused in words that say why,
 * never answered as the cold email's page by default. A read that fails is said in the log.
 */
async function emailOf(
  db: SupabaseClient<Database>,
  tenantId: string,
  messageId: string,
): Promise<{ sender: string | null; lane: "offer" | "reach_out" | "unread" }> {
  try {
    const { data, error } = await db
      .from("messages")
      .select("meta")
      .eq("id", messageId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { sender: null, lane: "unread" };
    const meta = data.meta as { source?: unknown; email?: { request?: { from?: unknown } } } | null;
    const from = meta?.email?.request?.from;
    return {
      sender: typeof from === "string" ? (addressOf(from)?.address ?? null) : null,
      lane: meta?.source === "broadcast" ? "offer" : "reach_out",
    };
  } catch (e) {
    log.warn("unsubscribe_lane_unread", {
      tenant_id: tenantId,
      message: messageId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { sender: null, lane: "unread" };
  }
}

/** The page for a link, by what its email was: an offer's words to a customer, a reach-out's to a business, and words true of both where that is not known. */
function pageFor(
  email: { sender: string | null; lane: "offer" | "reach_out" | "unread" },
  business: string | null,
  view: "ask" | "done",
): Response {
  if (email.lane === "offer") return offerPage(200, { kind: view, business });
  if (email.lane === "unread")
    return page(200, view === "ask" ? { kind: "ask_either", business } : { kind: "done_either", business });
  return page(200, { kind: view, business, sender: email.sender });
}

export async function unsubscribeGet(token: string): Promise<Response> {
  const open = door();
  if (!open) return page(503, { kind: "unavailable" });
  const { db } = open;
  const claims = verifyUnsubscribeToken(open.keys, token);
  if (!claims) {
    sayBadLink();
    return page(404, { kind: "bad_link" });
  }
  const [business, email] = await Promise.all([
    businessName(db, claims.tenantId),
    emailOf(db, claims.tenantId, claims.messageId),
  ]);
  return pageFor(email, business, "ask");
}

/**
 * The body's fields, read no further than MAX_BODY_BYTES. Lenient on purpose, because a stop lost to a strict parser
 * is a stop nobody sees: multipart when the type says so, otherwise the url-encoded form RFC 8058 names, whatever
 * type (or none) came with it, and every value trimmed of the line ending a client may leave on it.
 */
async function readFields(req: Request): Promise<Map<string, string> | "too_large" | "unreadable"> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return "too_large";
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  const type = req.headers.get("content-type") ?? "";
  const fields = new Map<string, string>();
  try {
    if (/multipart\/form-data/i.test(type)) {
      const form = await new Response(bytes, { headers: { "content-type": type } }).formData();
      for (const [k, v] of form) if (typeof v === "string") fields.set(k, v.trim());
    } else {
      for (const [k, v] of new URLSearchParams(new TextDecoder().decode(bytes).trim())) fields.set(k, v.trim());
    }
  } catch {
    return "unreadable";
  }
  return fields;
}

export async function unsubscribePost(token: string, req: Request): Promise<Response> {
  const open = door();
  if (!open) return plainText(503, "Unsubscribe is not available right now. Try again in a minute.");
  const { db } = open;
  // The link first: one we did not make is refused before its body is read or the database asked. Our own page
  // never draws the button under a bad link, so no person pressing lands here.
  const claims = verifyUnsubscribeToken(open.keys, token);
  if (!claims) {
    sayBadLink();
    return plainText(400, "This link doesn't work.");
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return plainText(413, "Too large.");
  const fields = await readFields(req);
  if (fields === "too_large") return plainText(413, "Too large.");
  if (fields === "unreadable") return plainText(400, "An unsubscribe says List-Unsubscribe=One-Click.");
  // The mail client's one click says exactly this (RFC 8058 §3.1); the page's own button says the other. The offer
  // page's second act, "Stop all messages", is its own field: asked (the question), then confirmed (the stop).
  const oneClick = fields.get("List-Unsubscribe") === "One-Click";
  const pressed = fields.get("unsubscribe") === "yes";
  const stopAll = fields.get("stop_all");
  if (!oneClick && !pressed && stopAll !== "ask" && stopAll !== "yes")
    return plainText(400, "An unsubscribe says List-Unsubscribe=One-Click.");
  if (stopAll) return stopAllMessagesPage(db, claims, stopAll === "yes");

  let said: { business: string | null };
  try {
    said = await setEmailUnsubscribed(db, {
      tenantId: claims.tenantId,
      contactId: claims.contactId,
      messageId: claims.messageId,
      evidence: { channel: "email", via: oneClick ? "one_click" : "page" },
    });
  } catch (e) {
    log.error("unsubscribe_not_recorded", {
      tenant_id: claims.tenantId,
      message: claims.messageId,
      error: e instanceof Error ? e.message : String(e),
    });
    return oneClick
      ? plainText(503, "Not recorded. Try again in a minute.")
      : page(503, { kind: "unavailable", retry: true });
  }
  if (oneClick) return plainText(200, "Unsubscribed.");
  return pageFor(await emailOf(db, claims.tenantId, claims.messageId), said.business, "done");
}

/**
 * The offer page's second act: "Stop all messages" is asked first (a page that says what it covers and asks again), and
 * only the confirmed press stops everything (stop_all_messages: a STOP, as ingest records one). Only an offer's link offers
 * it: a reach-out's email speaks to a business, which has no visit messages to stop. A press that did not go through says so.
 */
async function stopAllMessagesPage(
  db: SupabaseClient<Database>,
  claims: { tenantId: string; contactId: string; messageId: string },
  confirmed: boolean,
): Promise<Response> {
  const email = await emailOf(db, claims.tenantId, claims.messageId);
  // Refused in words that say why: an email that is not an offer has no other messages to stop, and one that could not be
  // read is not known to be either, so nothing is changed and the press can be made again.
  if (email.lane === "unread") return plainText(503, STOP_ALL_REFUSALS.unread);
  if (email.lane !== "offer") return plainText(400, STOP_ALL_REFUSALS.not_an_offer);
  if (!confirmed) return offerPage(200, { kind: "stop_ask", business: await businessName(db, claims.tenantId) });
  try {
    const stopped = await stopAllMessages(db, {
      tenantId: claims.tenantId,
      contactId: claims.contactId,
      messageId: claims.messageId,
    });
    return offerPage(200, { kind: "stopped", business: stopped.business });
  } catch (e) {
    log.error("unsubscribe_not_recorded", {
      tenant_id: claims.tenantId,
      message: claims.messageId,
      error: e instanceof Error ? e.message : String(e),
    });
    return page(503, { kind: "unavailable" });
  }
}
