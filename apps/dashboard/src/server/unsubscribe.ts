import "server-only";

/**
 * The unsubscribe link every campaign email carries (Reach out, Part 2; RFC 8058), as the dashboard answers it.
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
import { createServiceClient, type Database } from "@chanlytics/db";
import { verifyUnsubscribeToken } from "@chanlytics/channels";
import { unsubscribePageWords, type UnsubscribeView } from "@chanlytics/contracts";

/** The largest body a one click or the page's button sends. Anything larger is not one. */
const MAX_BODY_BYTES = 4096;

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  svc ??= createServiceClient({ url, serviceRoleKey: key });
  return svc;
}

/** For tests: the database the page reads and writes through. */
export function setServiceClient(db: SupabaseClient<Database> | null): void {
  svc = db;
}

const secret = (): string | null => process.env.UNSUBSCRIBE_SECRET?.trim() || null;

const HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  // The token is in the path: nothing on the page links out, and nothing should carry it anywhere if it did.
  "referrer-policy": "no-referrer",
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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
.foot{margin:18px 0 0;font-size:.8rem}
`;

function page(status: number, view: UnsubscribeView): Response {
  const w = unsubscribePageWords(view);
  const form = w.button
    ? `<form method="post"><input type="hidden" name="unsubscribe" value="yes"><button type="submit">${escapeHtml(w.button)}</button></form>`
    : "";
  const foot = w.foot ? `<p class="foot">${escapeHtml(w.foot)}</p>` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escapeHtml(w.title)}</title><style>${STYLE}</style></head>
<body><main><div class="card"><h1>${escapeHtml(w.lead)}</h1><p>${escapeHtml(w.body)}</p>${form}</div>${foot}</main></body></html>`;
  return new Response(html, { status, headers: { ...HEADERS, "content-type": "text/html; charset=utf-8" } });
}

function text(status: number, body: string): Response {
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

export async function unsubscribeGet(token: string): Promise<Response> {
  const key = secret();
  const db = serviceDb();
  if (!key || !db) return page(503, { kind: "unavailable" });
  const claims = verifyUnsubscribeToken(key, token);
  if (!claims) return page(404, { kind: "bad_link" });
  return page(200, { kind: "ask", business: await businessName(db, claims.tenantId) });
}

export async function unsubscribePost(token: string, req: Request): Promise<Response> {
  const key = secret();
  const db = serviceDb();
  if (!key || !db) return text(503, "Unsubscribe is not available right now. Try again in a minute.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return text(413, "Too large.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return text(400, "An unsubscribe says List-Unsubscribe=One-Click.");
  }
  // The mail client's one click says exactly this (RFC 8058 §3.1); the page's own button says the other.
  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  const pressed = form.get("unsubscribe") === "yes";
  if (!oneClick && !pressed) return text(400, "An unsubscribe says List-Unsubscribe=One-Click.");
  const claims = verifyUnsubscribeToken(key, token);
  if (!claims) return oneClick ? text(400, "This link doesn't work.") : page(404, { kind: "bad_link" });

  const { data, error } = await db.rpc("set_email_marketing", {
    p_tenant_id: claims.tenantId,
    p_contact_id: claims.contactId,
    p_state: "opted_out",
    p_source: "unsubscribe",
    p_evidence: { channel: "email", via: oneClick ? "one_click" : "page", message_id: claims.messageId },
  });
  if (error) {
    console.error(
      "unsubscribe_not_recorded",
      JSON.stringify({ tenant: claims.tenantId, message: claims.messageId, error: error.message }),
    );
    return oneClick ? text(503, "Not recorded. Try again in a minute.") : page(503, { kind: "unavailable" });
  }
  if (oneClick) return text(200, "Unsubscribed.");
  const said = (data ?? null) as { business?: unknown } | null;
  return page(200, { kind: "done", business: typeof said?.business === "string" ? said.business : null });
}
