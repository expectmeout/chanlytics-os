/**
 * What a campaign asks of the workspace itself: whether it is paused, and the link its review slot is filled with (the
 * owner's own, else the Google listing's).
 *
 * A paused workspace (`tenants.status = 'paused'`: billing stopped it, or a person did) sends nothing: the wire holds every
 * person of a run, each for good. So a run is neither approved nor started by hand while it lasts (core approveRun, the
 * edge's run-now door), and the hourly sweep leaves its playbooks alone (00245 playbooks_due).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure, ownReviewLinkOf, reviewLinkFrom } from "@chanlytics/contracts";
import { getTenantConfigAsMember } from "../workspace/control-plane/config";

type Db = SupabaseClient<Database>;

/**
 * Whether the workspace is paused (tenants.status, written by billing): THE one reading of it for a campaign, which the
 * dashboard's composers and routes (so the page says so where Send would be, and a broadcast made under it is refused),
 * the approval verb and the send job (so a run stops, core broadcast-stops.ts) all ask. A read that fails throws: "we could
 * not check" is not "it is not paused".
 */
export async function isWorkspacePaused(db: Db, tenantId: TenantId): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the workspace");
  return data?.status === "paused";
}

/**
 * The link a customer leaves the business a review at, or null: the owner's own where they gave one (the stored config's
 * `brain.review_link`, Settings › Details), else the one its Google listing keeps (contracts reviewLinkFrom, the one
 * rule). THE one reading of it for a message's review_link slot: the dashboard's template-values port, on the member's
 * session (refused in words where it is null), and the send job. The listing is asked only where the owner gave none, so
 * a business with a link of its own never depends on that table. A failed read throws: "we could not read it" is not
 * "there is none", and the listing's link is never used in place of an owner's that could not be read.
 */
export async function reviewLinkOf(db: Db, tenantId: TenantId): Promise<string | null> {
  // The config as a member's session reads it (the table for an owner and the service role, its door for anyone else).
  return findReviewLink(db, tenantId, (await getTenantConfigAsMember(db, tenantId))?.config);
}

/**
 * The same reading for a caller that already holds the workspace's stored config (the settings read, which every page
 * opens on): the owner's own link off that config, and the listing asked only where there is none, so the config is
 * never read a second time for it.
 */
export async function findReviewLink(db: Db, tenantId: TenantId, config: unknown): Promise<string | null> {
  const own = ownReviewLinkOf(config);
  return reviewLinkFrom({ own, listing: own ? null : await listingReviewLink(db, tenantId) })?.link ?? null;
}

/**
 * The link the workspace's Google listing keeps (google_listings.new_review_uri, 00415: the bound Business Profile
 * location's), or null: no listing, none bound, or a database 00415 has not reached (Postgres's 42703 on that column,
 * and only that), so either app may deploy first. Any other failed read throws.
 */
async function listingReviewLink(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("google_listings")
    .select("new_review_uri")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error && error.code === "42703" && error.message.includes("new_review_uri")) return null;
  if (error) throw new DbFailure(error, "cannot read the workspace's review link");
  return data?.new_review_uri?.trim() || null;
}
