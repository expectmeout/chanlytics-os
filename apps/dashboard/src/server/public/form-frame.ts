import "server-only";

/**
 * /f/<code>: a form framed in a business's own website (the Forms plan, F4 and 3.11; Ruben's call 15). The code is the
 * form's website link (00703: the one link that holds the sites the form may show on), and the page is the hosted form
 * whole, with its checks and its one write (form-page.ts), drawn at an address of its own that knows no session: no
 * cookie is read and no test is drawn. Its content policy names the link's sites, and only them, as the frame's
 * ancestors, so a copy of the lines on anyone else's page shows nothing: the list is held by the visitor's own browser.
 * It proves nothing about an entry sent straight to the address, and nothing trusts it as proof (form-page.ts holds
 * such an entry for a look). A GET is an open of the link, counted as /l/'s are; a POST is the form's own send.
 *
 * Beside it, /f/fit.js: the small script the pasted lines load, which fits each frame to its form and hands it the
 * campaign labels of the page's address, by messages checked for where they come from. Optional: with scripts blocked
 * the frame keeps its height, and with frames blocked the plain link beside it opens the form.
 *
 * Cross-workspace: a code names one link, and the link its own workspace; nothing else is read.
 */
import { frameAncestorsOf } from "@chanlytics/contracts";
import { findLinkSites, openLink } from "@chanlytics/db/forms";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentSecurityPolicy } from "@/csp";
import { publicEnv } from "@/lib/public-env";
import { env } from "../shared/env";
import { log } from "../shared/log";
import { aPersonOpens } from "./form-link";
import { drawFormPage, takeFormPost, type FormFrameAt } from "./form-page";
import { linkPageDb } from "./link-page";

type Db = SupabaseClient<Database>;

/** The framed page's content policy: the app's own, with the form's sites as the only ancestors it may show in. */
const framePolicyOf = (sites: readonly string[]): string =>
  contentSecurityPolicy({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    leadMapBase: env.NEXT_PUBLIC_LEAD_MAP_BASE,
    dev: !publicEnv.productionBuild,
    frameAncestors: frameAncestorsOf(sites),
  });

/** An answer with the frame's own policy over it: where it may be shown, and nowhere else. */
function framed(response: Response, sites: readonly string[]): Response {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", framePolicyOf(sites));
  return new Response(response.body, { status: response.status, headers });
}

/** An address that opens nothing, shown nowhere framed. */
const nothingFramed = (status = 404) =>
  framed(
    new Response(status === 404 ? "Nothing is at this address." : null, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    }),
    [],
  );

/**
 * The website link a code names, its form's address and its sites; null where the code opens no website's form (a
 * post's link included: it lands on a chat or a booking page, never in a frame).
 */
async function findWebsiteFrame(
  db: Db,
  code: string,
  counted: boolean,
): Promise<{ workspace: string; slug: string; frame: FormFrameAt } | null> {
  const opened = await openLink(db, code, counted);
  if (!opened?.workspace || opened.stopped || opened.subject.type !== "form" || !opened.subject.slug) return null;
  const sites = await findLinkSites(db, opened.tenantId, opened.linkId);
  // A place that is not the website's has no frame: its code opens the form through /l/ alone.
  if (sites === null) return null;
  return { workspace: opened.workspace, slug: opened.subject.slug, frame: { code: opened.code, sites } };
}

/** A frame's page drawn, or its send taken: the hosted form at the frame's own address, under its own policy. */
async function answerFrame(code: string, request: Request, send: boolean): Promise<Response> {
  const clean = code.trim().toLowerCase();
  const db = linkPageDb();
  if (!db) return nothingFramed(503);
  let found: Awaited<ReturnType<typeof findWebsiteFrame>>;
  try {
    found = await findWebsiteFrame(db, clean, !send && aPersonOpens(request));
  } catch (e) {
    // The link could not be read: the visitor is asked to come back, never shown a broken page.
    log.error("form_link_failed", { error: String(e).slice(0, 300) });
    return nothingFramed(503);
  }
  if (!found) return nothingFramed();
  const { workspace, slug, frame } = found;
  // A frame knows no session: nobody is asked who is signed in, and no test is drawn.
  const answer = send
    ? await takeFormPost(workspace, slug, request, frame)
    : await drawFormPage(workspace, slug, request, frame);
  return framed(answer, frame.sites);
}

/** GET /f/<code>: the form as a site's frame shows it, its open counted. */
export const drawFramedForm = (code: string, request: Request): Promise<Response> => answerFrame(code, request, false);

/** POST /f/<code>: an entry sent from the frame, taken as the hosted form takes one. */
export const takeFramedForm = (code: string, request: Request): Promise<Response> => answerFrame(code, request, true);

/**
 * The script the pasted lines load: each frame of a form at this script's own address grows with its form, takes the
 * page's campaign labels once it says it is there, and the plain link beside it steps aside. It reads only messages
 * from that address, and sends the labels only to it.
 */
const FIT_SCRIPT = `(function(){var me=document.currentScript,o;try{o=new URL(me.src).origin}catch(e){return}
var N=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
function labels(){var q=new URLSearchParams(location.search),l={},n=0;N.forEach(function(k){var v=q.get(k);if(v){l[k]=v.slice(0,120);n++}});return n?l:null}
addEventListener('message',function(e){if(e.origin!==o||!e.data||e.data.chanlytics!=='form')return;
var fs=document.getElementsByTagName('iframe');for(var i=0;i<fs.length;i++){var f=fs[i];if(f.contentWindow!==e.source)continue;
var h=Number(e.data.height);if(h>0&&h<20000)f.style.height=h+'px';
if(!f.getAttribute('data-fitted')){f.setAttribute('data-fitted','');var l=labels();if(l)f.contentWindow.postMessage({chanlytics:'labels',labels:l},o);
var as=document.querySelectorAll('a[data-chanlytics-form]');for(var j=0;j<as.length;j++)if(as[j].href.indexOf(o+'/')===0)as[j].hidden=true}}})})();`;

/** GET /f/fit.js: the script, kept an hour by a browser and a cache, since every site's page loads the same one. */
export function fitScript(): Response {
  return new Response(FIT_SCRIPT, {
    status: 200,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
