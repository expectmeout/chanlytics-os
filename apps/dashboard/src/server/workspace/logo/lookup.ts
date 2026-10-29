/**
 * A look for the workspace's logo on the business's own website, on the owner's press (00407). Nothing is stored: the
 * picture found travels back in the answer, the page draws it into the circle and the owner says whether it is theirs,
 * and only a Save keeps anything, through the same door as a chosen picture.
 *
 * Which website: the one the owner confirmed (the receptionist's profile, filled from Google at the first run and edited
 * in Settings › Business), else the linked listing's. A website that is a page on another service (a booking platform,
 * a social page, a link-in-bio page: contracts siteHost, the lead finder's own rule) is not looked at, because its logo
 * is the service's, and neither is our own. The lead finder's reading of a home page finds what the site declares as
 * its mark (core leadMarksFrom: schema.org's logo, the home-screen icon, the biggest icon; a builder's default refused),
 * and every address is asked through the public fetcher, which refuses any that is not on the public internet at every
 * hop. A candidate on a port that is not the web's own, an SVG, a favicon file, or a picture too small or too large for
 * the circle is passed over. What happened is logged by its outcome, never with the file, so how often a business's
 * own site has a usable logo is a number we can read.
 */
import "server-only";
import { LOGO_FOUND_MAX_BYTES, parseTenantConfig, siteHost, type LogoLookupAnswer } from "@chanlytics/contracts";
import { imageBytes, pageText, publicFetcher } from "@chanlytics/channels";
import { siteLogoFrom } from "@chanlytics/core";
import { storedConfigOf } from "@/server/workspace/config-row";
import { listingFactsFor } from "@/server/connections/google";
import { log } from "@/server/log";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";

const PAGE_MS = 6_000;
const IMAGE_MS = 4_000;
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
async function websitesOf(ctx: RouteContext, tenantId: string): Promise<string[]> {
  const [config, listing] = await Promise.all([
    storedConfigOf(ctx.supabase, tenantId),
    listingFactsFor(ctx.supabase, tenantId),
  ]);
  const own = parseTenantConfig(config)?.brain?.profile?.website ?? null;
  const google = listing?.facts?.website ?? null;
  return [own, google].filter((w): w is string => !!w && !!w.trim());
}

/** The first candidate the site declares that is a picture the circle can be made from, as bytes and its kind. */
async function firstPicture(homes: string[]): Promise<{ base64: string; content_type: string } | null | "unreachable"> {
  const fetcher = publicFetcher();
  let html: string | null = null;
  let origin = "";
  for (const home of homes) {
    html = await pageText(fetcher, home, PAGE_MS);
    origin = home;
    if (html !== null) break;
  }
  if (html === null) return "unreachable";
  // What a mark is, and which of a page's is taken, is core's (siteLogoFrom): the website read judges the same way.
  const found = await siteLogoFrom((url) => imageBytes(fetcher, url, IMAGE_MS, LOGO_FOUND_MAX_BYTES), html, origin);
  return found ? { base64: Buffer.from(found.bytes).toString("base64"), content_type: found.head.contentType } : null;
}

/** POST workspaces/logo/lookup. */
export async function lookupLogo(ctx: RouteContext, member: Member): Promise<LogoLookupAnswer> {
  const websites = await websitesOf(ctx, member.tenantId);
  const own = websites
    .map((w) => ({ w, h: siteHost(w) }))
    .find((x): x is { w: string; h: string } => !!x.h && !ours(x.h));
  const host = own?.h ?? null;
  const answer: LogoLookupAnswer = !websites.length
    ? { outcome: "no_website", host: null }
    : !host
      ? { outcome: "not_its_own", host: null }
      : await (async () => {
          const found = await firstPicture(homesOf(own ? own.w : host, host));
          if (found === "unreachable") return { outcome: "unreachable" as const, host };
          if (!found) return { outcome: "none" as const, host };
          return { outcome: "found" as const, host, image: found };
        })();
  log.info("workspace_logo_lookup", { tenant_id: member.tenantId, outcome: answer.outcome });
  return answer;
}
