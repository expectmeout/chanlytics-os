import "server-only";

/**
 * A website sign-up's confirmation link (00489, the double opt-in), as the dashboard answers it at /c/<token>. The
 * edge's door emailed it to the address a website's form carried (apps/edge/lib/website/signup-confirm.ts); pressed,
 * it is the person's yes to offers by email, proven by the press, since only the inbox the email reached holds it.
 *
 * GET draws one question and one button, and changes nothing: link scanners and previews fetch every URL in an email,
 * and a yes that happened on a fetch would be a yes nobody gave. POST is that button, and records the yes in the same
 * response: never a redirect, never a sign-in. The token is the link's authority (packages/channels confirm-token.ts),
 * and the one write is set_email_offers_yes's (confirmed_signup), which judges the press itself: the email is the
 * sign-up's confirmation, it left, it is at most seven days old, it went to the person's address now, and they have not
 * said STOP. Its answer is what the page says.
 *
 * It holds the service role, like the unsubscribe page beside it, because the person pressing has no session, and draws
 * its own small HTML on that page's paper (link-page.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmationEmailOf, setEmailOffersYes, type Database, type OffersYesOutcome } from "@chanlytics/db";
import { addressOf, verifyConfirmToken, type ConfirmClaims } from "@chanlytics/channels";
import { confirmPageWords, escapeHtml, MIN_MS, type ConfirmPageView } from "@chanlytics/contracts";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { LINK_PAGE_HEADERS, LINK_PAGE_MAX_BYTES, LINK_PAGE_STYLE, linkPageDb, readLinkFields } from "./link-page";

/** The header a confirmation page answers with, naming its view: how a test, or a probe, tells the page answering. */
const CONFIRM_PAGE_HEADER = "x-confirm-page";

/** The secrets a link may be sealed under (the unsubscribe link's: the current, then the previous), or null without one. */
function confirmSecrets(): string[] | null {
  const current = env.UNSUBSCRIBE_SECRET;
  if (!current) return null;
  const previous = env.UNSUBSCRIBE_SECRET_PREVIOUS;
  return previous ? [current, previous] : [current];
}

/** When each thing was last said: a scanner fetching every link must not flood the log. */
const confirmSaidAt = new Map<string, number>();

/** Whether a line may be said now: once a minute at most for each. */
function sayNow(what: "unavailable" | "bad_link"): boolean {
  const now = Date.now();
  if (now - (confirmSaidAt.get(what) ?? 0) < MIN_MS) return false;
  confirmSaidAt.set(what, now);
  return true;
}

/** The page's facts: who asks (the name the email left as) and the address it asks about. */
interface Asked {
  business: string | null;
  address: string | null;
}

const NOBODY: Asked = { business: null, address: null };

/** One view of the page: its words on the product's paper, a button where it asks, no script. */
function confirmPage(status: number, view: ConfirmPageView, asked: Asked): Response {
  const w = confirmPageWords(view, asked);
  const lines = w.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  const button = w.button
    ? `<form method="post"><input type="hidden" name="confirm" value="yes">` +
      `<button type="submit">${escapeHtml(w.button)}</button></form>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escapeHtml(w.title)}</title><style>${LINK_PAGE_STYLE}</style></head>
<body><main><div class="card"><h1>${escapeHtml(w.title)}</h1>${lines}${button}</div></main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...LINK_PAGE_HEADERS, "content-type": "text/html; charset=utf-8", [CONFIRM_PAGE_HEADER]: view },
  });
}

/** The link's claims and the database, or the page that says why there are none. */
function opened(token: string): { claims: ConfirmClaims; db: SupabaseClient<Database> } | Response {
  const keys = confirmSecrets();
  const db = linkPageDb();
  if (!keys || !db) {
    if (sayNow("unavailable")) log.error("signup_confirm_unavailable", { why: keys ? "no_database" : "no_secret" });
    return confirmPage(503, "unavailable", NOBODY);
  }
  const claims = verifyConfirmToken(keys, token);
  if (!claims) {
    if (sayNow("bad_link")) log.warn("signup_confirm_bad_link", {});
    return confirmPage(404, "gone", NOBODY);
  }
  return { claims, db };
}

/** Who asks and about which address, off the email the link names; null when the workspace holds no such email. */
async function confirmationAsked(db: SupabaseClient<Database>, c: ConfirmClaims): Promise<Asked | null> {
  const email = await confirmationEmailOf(db, { tenantId: c.tenantId, messageId: c.messageId });
  if (!email) return null;
  return { business: email.from ? (addressOf(email.from)?.name ?? null) : null, address: email.to };
}

export async function confirmGet(token: string): Promise<Response> {
  const open = opened(token);
  if (open instanceof Response) return open;
  try {
    const asked = await confirmationAsked(open.db, open.claims);
    return asked ? confirmPage(200, "ask", asked) : confirmPage(404, "gone", NOBODY);
  } catch (e) {
    log.error("signup_confirm_failed", {
      tenant_id: open.claims.tenantId,
      step: "read",
      error: e instanceof Error ? e.message : String(e),
    });
    return confirmPage(503, "unavailable", NOBODY);
  }
}

/** What the yes door's answer is, on the page. */
const VIEW_OF: Record<OffersYesOutcome, ConfirmPageView> = {
  recorded: "done",
  unchanged: "done",
  expired: "expired",
  address_changed: "address_changed",
  stopped: "stopped",
  not_a_confirmation: "gone",
  not_sent: "gone",
  unsubscribed: "gone",
};

export async function confirmPost(token: string, req: Request): Promise<Response> {
  const open = opened(token);
  if (open instanceof Response) return open;
  const { claims, db } = open;
  if (Number(req.headers.get("content-length") ?? 0) > LINK_PAGE_MAX_BYTES) return confirmPage(413, "gone", NOBODY);
  const fields = await readLinkFields(req);
  // Only the page's own button says yes: anything else posted here is not a press.
  if (typeof fields === "string" || fields.get("confirm") !== "yes") return confirmPage(400, "gone", NOBODY);
  try {
    const [asked, outcome] = await Promise.all([
      confirmationAsked(db, claims),
      setEmailOffersYes(db, {
        tenantId: claims.tenantId,
        contactId: claims.contactId,
        source: "confirmed_signup",
        messageId: claims.messageId,
        evidence: { via: "link" },
      }),
    ]);
    log.info("signup_confirmed", { tenant_id: claims.tenantId, outcome });
    return confirmPage(200, VIEW_OF[outcome], asked ?? NOBODY);
  } catch (e) {
    log.error("signup_confirm_failed", {
      tenant_id: claims.tenantId,
      step: "yes",
      error: e instanceof Error ? e.message : String(e),
    });
    return confirmPage(503, "unavailable", NOBODY);
  }
}
