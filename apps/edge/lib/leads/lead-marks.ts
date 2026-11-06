/**
 * The wires the collect's mark step runs on (D6): reading a business's home page, and (00161) the copy we keep. The
 * collect's own wires (lead-wires.ts), the leads sweep's second try (markLeadsAgain, below) and the backfill for leads
 * found before 00161 (tooling/scripts/ops) read through these, so a mark is found one way.
 *
 * The home page is read by the platform's one page reader (`leadSitePage`: lib/shared/public-page.ts homePage, Firecrawl's
 * scrape). A mark drawn straight off a business's site never shows, because the dashboard's content policy lets images
 * in from three hosts. So the collect asks for the bytes once (`imageBytes`, over the guarded fetch: the page names the
 * picture's address), core judges them (mark-image.ts), and a copy is kept in the public lead-marks bucket under its
 * own hash (`storeLeadMark`), on the Supabase origin the policy already allows. The same logo found by two workspaces
 * is one file, and a file never changes once written, so it is served with a year's cache.
 *
 * All three answer null rather than throwing: a lead without a mark is an ordinary lead, and the next round tries again.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepLeadMark, leadSiteReadsSpent, leadsUnmarked, type Database } from "@chanlytics/db";
import {
  DEADLINE_MARGIN_MS,
  markPlaces,
  siteReadsOf,
  type MarkImage,
  type MarkPlace,
  type SiteReads,
} from "@chanlytics/core";
import { LEAD_MARKS_BUCKET, LEAD_SITE_READ_USD, MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import type { SitePage } from "@chanlytics/channels";
import type { LeadWires } from "./lead-wires.js";
import { errField, logger } from "../shared/log.js";
import { homePage, PAGE_READS, sitePagesReadable } from "../shared/public-page.js";

/**
 * The image read is channels' (site-reads.ts): one reading of a picture a business's own site names, which the
 * dashboard's look for a workspace's logo makes too. Named here for the collect's wires.
 */
export { imageBytes } from "@chanlytics/channels";

/** A lead's home page as a browser drew it, by its website's host: for its mark, and for the judge where a plan reads sites. */
export function leadSitePage(host: string, timeoutMs: number): Promise<SitePage | null> {
  return homePage(`https://${host}/`, { ...PAGE_READS.lead, timeoutMs });
}

const STORE_TIMEOUT_MS = 4_000;
const A_YEAR_S = String(365 * 24 * 60 * 60);

/** `<sha256 of the bytes>.<the kind they were read as>`: the only shape 00161's CHECK lets the column hold. */
export function leadMarkPath(bytes: Uint8Array, image: MarkImage): string {
  return `${createHash("sha256").update(bytes).digest("hex")}.${image.kind}`;
}

/** Keep the copy: the stored path, or null when storage refused or did not answer in time. */
export async function storeLeadMark(
  db: SupabaseClient<Database>,
  bytes: Uint8Array,
  image: MarkImage,
  timeoutMs = STORE_TIMEOUT_MS,
): Promise<string | null> {
  const path = leadMarkPath(bytes, image);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<{ error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: `timed out after ${timeoutMs} ms` } }), timeoutMs);
    });
    // The same bytes are the same name, so writing them again changes nothing a reader could see.
    const upload = db.storage
      .from(LEAD_MARKS_BUCKET)
      .upload(path, bytes, { contentType: image.contentType, cacheControl: A_YEAR_S, upsert: true });
    const { error } = await Promise.race([upload, late]);
    if (!error) return path;
    logger().warn("lead_mark_store_failed", { path, message: String(error.message).slice(0, 200) });
    return null;
  } catch (e) {
    logger().warn("lead_mark_store_failed", {
      path,
      message: String(e instanceof Error ? e.message : e).slice(0, 200),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The leads sweep's clock (00140's `leads-sweep`, every five minutes, on the five). */
const SWEEP_EVERY_MS = 5 * MIN_MS;
/** The most leads one tick reads to try: the step stops at its allowance, and those it did not reach are not tried. */
const MARK_AGAIN_MOST = 60;
/** The step's own time, inside the sweep's deadline: a page drawn as a browser draws it takes seconds. */
const MARK_AGAIN_ALLOWANCE_MS = 20 * SECOND_MS;

/** What this tick read, paid for by each workspace whose lead it read for: no round asked, so its month and today (00541). */
async function settleMarkReads(
  db: SupabaseClient<Database>,
  sites: SiteReads,
  leads: readonly { tenant_id: string; website_host: string }[],
): Promise<void> {
  const byTenant = new Map<string, Set<string>>();
  for (const { tenant_id, website_host } of leads) {
    if (!sites.asked(website_host)) continue;
    byTenant.set(tenant_id, (byTenant.get(tenant_id) ?? new Set()).add(website_host));
  }
  for (const [tenantId, hosts] of byTenant) {
    await leadSiteReadsSpent(db, tenantId, null, hosts.size, hosts.size * LEAD_SITE_READ_USD).catch((e: unknown) => {
      logger({ tenant_id: tenantId }).warn("lead_site_reads_unsettled", { reads: hosts.size, error: errField(e) });
    });
  }
}

/**
 * The leads sweep's second try at the marks a collect had no time for, or a people search's companies, whose collect marks
 * none: the leads found in the five minutes before the last whole slot of its clock, with a site and no copy, read by the
 * collect's own step (core markPlaces) with time of its own, and each copy kept where the lead still has none and is still
 * whole (db keepLeadMark). The window is the slot's, not the tick's: however late a tick runs inside its five minutes, it
 * looks at the same five, so each lead is tried once; a tick that never ran costs its leads the try, and a later round that
 * finds the place fills it. Answers how many were due and how many it kept: a tick with no time left reads none of those
 * due, and one with no reader looks at none.
 */
export async function markLeadsAgain(
  db: SupabaseClient<Database>,
  reads: Pick<LeadWires, "readSite" | "fetchBytes">,
  deadline: number,
  now: () => Date = () => new Date(),
): Promise<{ due: number; kept: number }> {
  if (!sitePagesReadable()) return { due: 0, kept: 0 };
  const at = now().getTime();
  const slot = Math.floor(at / SWEEP_EVERY_MS) * SWEEP_EVERY_MS;
  const leads = await leadsUnmarked(
    db,
    new Date(slot - 2 * SWEEP_EVERY_MS),
    new Date(slot - SWEEP_EVERY_MS),
    MARK_AGAIN_MOST,
  );
  const targets: { lead: (typeof leads)[number]; place: MarkPlace }[] = leads.map((lead) => ({
    lead,
    place: { website_host: lead.website_host, logo_url: null, mark_path: null },
  }));
  const sites = siteReadsOf(reads);
  await markPlaces(
    { ...reads, storeMark: (bytes, image) => storeLeadMark(db, bytes, image), now },
    sites,
    targets.map((t) => t.place),
    Math.min(at + MARK_AGAIN_ALLOWANCE_MS, deadline - DEADLINE_MARGIN_MS),
  );
  await settleMarkReads(db, sites, leads);
  let kept = 0;
  for (const t of targets) {
    if (!t.place.mark_path) continue;
    const m = { id: t.lead.id, tenantId: t.lead.tenant_id, had: t.lead.logo_url, logoUrl: t.place.logo_url };
    if (await keepLeadMark(db, { ...m, markPath: t.place.mark_path })) kept += 1;
  }
  return { due: targets.length, kept };
}
