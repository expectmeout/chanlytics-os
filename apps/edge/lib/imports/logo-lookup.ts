/**
 * A look for the workspace's logo on the business's own website, on the owner's press (00407), asked by the dashboard
 * (POST /api/admin/imports/logo-lookup) because the page is read here, where the reader's key is: the dashboard holds
 * no provider's key. Nothing is stored: the picture found travels back in the answer, the page draws it into the
 * circle and the owner says whether it is theirs, and only a Save keeps anything, through the same door as a chosen
 * picture.
 *
 * Which website: the one the owner confirmed (the receptionist's profile, filled from Google at the first run and
 * edited in Settings › Business), else the linked listing's. A website that is a page on another service (a booking
 * platform, a social page, a link-in-bio page: contracts siteHost, the lead finder's own rule) is not looked at,
 * because its logo is the service's, and neither is our own. The home page is read by the platform's one page reader
 * (lib/public-page.ts sitePage: Firecrawl's scrape), the marks it declares are found as the website read finds them
 * (core siteLogoFrom: schema.org's logo, the home-screen icon, the biggest icon; a builder's default refused), and each
 * picture is asked for over the guarded fetch (channels publicFetcher), which refuses any address that is not on the
 * public internet at every hop. A candidate on a port that is not the web's own, an SVG, a favicon file, or a picture
 * too small or too large for the circle is passed over. The dashboard logs the outcome, never the file.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOGO_FOUND_MAX_BYTES,
  SECOND_MS,
  UUID,
  listingFactsOf,
  parseTenantConfig,
  siteHost,
  type LogoLookupAnswer,
} from "../packages/contracts.js";
import { imageBytes, publicFetcher } from "../packages/channels.js";
import { siteLogoFrom } from "../packages/core.js";
import { getTenantConfig, listingFactsStored, type Database } from "../packages/db.js";
import { sitePage } from "../public-page.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";

type Db = SupabaseClient<Database>;

/** How long a home page may take, and how much of it is read: a head is at the top. */
const PAGE_READ = { timeoutMs: 6 * SECOND_MS, maxChars: 96_000 };
const IMAGE_MS = 4 * SECOND_MS;
/** Our own sites: a workspace whose website is ours has no logo there. */
const OURS = ["chanlytics.com", "chanlytics.agency"];

const ours = (host: string): boolean => OURS.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * The home pages to ask for, from the website as it was typed: its own spelling first (www. or not, as the owner gave
 * it), then the other, since a site often answers on one alone. Both on the same host siteHost judged its own.
 */
function homesOf(website: string, host: string): string[] {
  const typed = (() => {
    try {
      return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  })();
  const first = typed && typed.replace(/^www\./, "") === host ? typed : host;
  const other = first.startsWith("www.") ? host : `www.${host}`;
  return [first, other].map((h) => `https://${h}`);
}

/** The websites to look at, the owner's first. */
async function websitesOf(db: Db, tenantId: string): Promise<string[]> {
  const [config, listing] = await Promise.all([
    getTenantConfig(db, tenantId).catch(() => null),
    listingFactsStored(db, tenantId).catch(() => null),
  ]);
  const own = parseTenantConfig(config?.config ?? null)?.brain?.profile?.website ?? null;
  const google = listingFactsOf(listing)?.website ?? null;
  return [own, google].filter((w): w is string => !!w && !!w.trim());
}

/** The first candidate the site declares that is a picture the circle can be made from, as bytes and its kind. */
async function firstPicture(homes: string[]): Promise<{ base64: string; content_type: string } | null | "unreachable"> {
  for (const home of homes) {
    const page = await sitePage(home, PAGE_READ);
    if (!page) continue;
    // What a mark is, and which of a page's is taken, is core's (siteLogoFrom): the website read judges the same way.
    const fetcher = publicFetcher();
    const found = await siteLogoFrom(
      (url) => imageBytes(fetcher, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES),
      page.html,
      new URL(page.url).origin,
    );
    return found ? { base64: Buffer.from(found.bytes).toString("base64"), content_type: found.head.contentType } : null;
  }
  return "unreachable";
}

/** The look for one workspace: its website's logo, or why there is none. */
async function logoLookup(db: Db, tenantId: string): Promise<LogoLookupAnswer> {
  const websites = await websitesOf(db, tenantId);
  const own = websites
    .map((w) => ({ w, h: siteHost(w) }))
    .find((x): x is { w: string; h: string } => !!x.h && !ours(x.h));
  if (!websites.length) return { outcome: "no_website", host: null };
  if (!own) return { outcome: "not_its_own", host: null };
  const found = await firstPicture(homesOf(own.w, own.h));
  if (found === "unreachable") return { outcome: "unreachable", host: own.h };
  if (!found) return { outcome: "none", host: own.h };
  return { outcome: "found", host: own.h, image: found };
}

/** The door's work after its knock: the workspace the token names, and its look. */
export async function lookupLogoFor(auth: Admitted, body: Partial<{ tenant_id: string }>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  return json(200, { ok: true, ...(await logoLookup(db, tenantId)) });
}
