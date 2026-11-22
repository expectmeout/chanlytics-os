import "server-only";

/**
 * A form's printed code (00680; the Forms canvas, "The printed sheet"): the code a link is drawn as, and one sheet,
 * Letter or A4, to print and put where customers wait, as the say-yes page's desk sign is: the business, what to ask
 * for, the code, and the link in letters for a phone that won't scan.
 *
 * Public, for the reason the desk sign is: it is printed from wherever the owner happens to be, and it shows nothing
 * the form's own page does not. A code nobody holds, a link that was stopped and a form that is not live open nothing.
 * Reading it counts no open. The address is PRINTED, so it comes from the allow-list and never from the request's own
 * host (server/shared/origin.ts printableOrigin).
 */
import QRCode from "qrcode";
import { escapeHtml, fillWords, formPageWords, type FormDescription } from "@chanlytics/contracts";
import { findFormVersion, openLink } from "@chanlytics/db/forms";
import { log } from "../shared/log";
import { printableOrigin } from "../shared/origin";
import { businessNameOf, findFormPlace } from "./form-page";
import { linkPageDb } from "./link-page";

/** A link's code, as the database makes it (link_code_new). */
const LINK_CODE = /^[a-hjkmnp-z2-9]{6}$/;

const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex" };

const notFoundPage = () =>
  new Response("Nothing is at this address.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
  });

/** A printed code's link, and the form it opens as its visitors see it now. */
interface Printed {
  address: string;
  business: string;
  described: FormDescription;
}

/** What a code prints: null for a code nobody holds, a link that was stopped, or a form that is not live. */
async function printedOf(code: string, request: Request): Promise<Printed | null> {
  const clean = code.trim().toLowerCase();
  const db = linkPageDb();
  if (!db || !LINK_CODE.test(clean)) return null;
  const opened = await openLink(db, clean, false);
  if (!opened?.workspace || opened.stopped || !opened.subject.slug || opened.subject.state !== "live") return null;
  const place = await findFormPlace(db, opened.workspace, opened.subject.slug);
  const version = place?.form.liveVersionId
    ? await findFormVersion(db, place.tenantId, place.form.liveVersionId)
    : null;
  if (!place || !version?.description) return null;
  const origin = printableOrigin(
    request.headers.get("x-forwarded-proto"),
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  return { address: `${origin}/l/${clean}`, business: businessNameOf(place.workspace), described: version.description };
}

/** A read that failed is answered as away for a moment, never as a broken page. */
function away(e: unknown): Response {
  log.error("form_link_failed", { error: String(e).slice(0, 300) });
  return new Response(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
}

/**
 * GET /l/<code>/code: the link as a code, an SVG. Error correction Q, as the desk sign's: paper is creased, taped
 * over and read under glare. A four-module quiet zone, since paper has no card around it.
 */
export async function linkCodeGet(code: string, request: Request): Promise<Response> {
  let printed: Printed | null;
  try {
    printed = await printedOf(code, request);
  } catch (e) {
    return away(e);
  }
  if (!printed) return notFoundPage();
  const svg = await QRCode.toString(printed.address, { type: "svg", margin: 4, errorCorrectionLevel: "Q" });
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", ...NO_STORE } });
}

/** The sheet's own look: paper, the same in light and dark, with a bar that is not printed. */
const SIGN_STYLE = `*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#141414;background:#f1efec}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;max-width:720px;margin:0 auto;padding:16px 22px;font-size:14px;color:#55524d}
.bar button{font:inherit;font-weight:600;color:#fff;background:#141414;border:0;border-radius:999px;padding:10px 18px;cursor:pointer}
.sheet{max-width:720px;margin:0 auto 32px;padding:56px 44px;background:#fff;text-align:center}
.biz{margin:0;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{margin:14px 0 0;font-size:40px;line-height:1.12;letter-spacing:-.01em;overflow-wrap:anywhere}
.code{width:min(64vw,340px);margin:28px auto 0}.code svg{display:block;width:100%;height:auto}
.how{max-width:420px;margin:22px auto 0;font-size:18px}.url{margin:14px 0 0;font:600 16px ui-monospace,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.fine{max-width:440px;margin:26px auto 0;font-size:12px;color:#55524d}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0 auto;padding:0;max-width:none}@page{margin:18mm}}`;

/** GET /l/<code>/sign: the sheet, with the browser's own Print one press away. */
export async function linkSignGet(code: string, request: Request): Promise<Response> {
  let printed: Printed | null;
  try {
    printed = await printedOf(code, request);
  } catch (e) {
    return away(e);
  }
  if (!printed) return notFoundPage();
  const { described, business, address } = printed;
  const words = formPageWords(described);
  const svg = await QRCode.toString(address, { type: "svg", margin: 4, errorCorrectionLevel: "Q" });
  const how = [words.scan, described.intro ?? ""].filter(Boolean).join(" ");
  const html = `<!doctype html><html lang="${escapeHtml(described.lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(`${described.heading} · ${business}`)}</title>
<style>${SIGN_STYLE}</style></head><body>
<div class="bar"><span>One sheet, Letter or A4.</span><button type="button" onclick="window.print()">Print</button></div>
<main class="sheet"><p class="biz">${escapeHtml(business)}</p><h1>${escapeHtml(described.heading)}</h1>
<div class="code" role="img" aria-label="${escapeHtml(described.heading)}">${svg}</div>
<p class="how">${escapeHtml(how)}</p><p class="url">${escapeHtml(address.replace(/^https?:\/\//, ""))}</p>
<p class="fine">${escapeHtml(fillWords(words.booked, { business }))}</p></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
}
