/**
 * A lead's own receptionist built (decision 0079, 00497's preview_build job), as the job runner is handed it: payload
 * { preview_id }, on the sender's workspace (Chanlytics' own, so a failure pages nobody and Health shows it under Ours).
 *
 *   1. The preview and its lead, read; one built already, ended or gone is left as it is.
 *   2. Its website read on the preview's own workspace, as the first run reads one (imports/website-read.ts
 *      readWebsite): kept in business_reads, its look worn. A site that cannot be read leaves the listing alone.
 *   3. Its receptionist written: the one the first run gives a business from its listing (contracts leadAsListing,
 *      firstReceptionistOf), with everything its site said worn at once and no price (withFoundWorn), through the
 *      settings' write schema and its compare-and-swap.
 *   4. preview_built: ready, or failed and why (a lead with no name to give it).
 *
 * The switch (LEAD_PREVIEWS) off builds nothing and leaves the preview building. A throw is tried once more
 * (packages/jobs RETRY_WAITS_MS, as retryWait reads it); the last try marks the preview failed itself, so a send waiting on it is skipped with
 * why, never left waiting. Platform-spent, as the website read is.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TenantConfigWriteSchema,
  UUID,
  businessReadFactsOf,
  firstReceptionistOf,
  foundOf,
  foundRecordOf,
  leadAsListing,
  parseTenantConfigResult,
  withFoundWorn,
  withStoredKeysKept,
  type BrainConfig,
  type PreviewFailure,
} from "../packages/contracts.js";
import {
  getTenantConfig,
  leadForPreview,
  leadPreviewById,
  previewBuilt,
  putTenantConfig,
  type Database,
  type LeadPreviewRow,
} from "../packages/db.js";
import { retryWait, type ClaimedJob, type JobContext } from "../packages/jobs.js";
import { readWebsite, type WebsiteReadKept } from "../imports/website-read.js";
import { env } from "../env.js";
import { errField, logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** The website's reader, as a port: the real one, or a test's. */
type SiteReader = (db: Db, tenantId: string, url: string, deadline: number) => Promise<WebsiteReadKept>;

/** The receptionist from the lead's listing, with what its site said worn; null where the lead gives it no name. */
async function receptionistFromListing(
  db: Db,
  p: LeadPreviewRow & { preview_tenant_id: string },
  deadline: number,
  read: SiteReader,
): Promise<BrainConfig | PreviewFailure> {
  const lead = await leadForPreview(db, p.tenant_id, p.lead_id);
  if (!lead || lead.erased_at || lead.blanked_at) throw new Error("preview_build: the lead is gone");
  const listing = leadAsListing(lead);
  const brain = firstReceptionistOf({ workspaceName: listing.name, listing });
  if (!brain) return "no_name";
  const site = listing.facts?.website ?? null;
  if (!site) return brain;
  const kept = await read(db, p.preview_tenant_id, site, deadline).catch((e: unknown) => {
    logger({ tenant_id: p.tenant_id }).warn("preview_build_failed", {
      preview_id: p.id,
      step: "site",
      error: errField(e),
    });
    return null;
  });
  if (!kept) return brain;
  const profile = (brain.profile ?? {}) as Record<string, unknown>;
  const found = foundOf(
    [
      {
        source: "website",
        facts: businessReadFactsOf(kept.facts),
        read_from: site,
        read_at: new Date().toISOString(),
        error: kept.error,
      },
    ],
    foundRecordOf(profile),
  );
  return { ...brain, profile: withFoundWorn(profile, found) };
}

/** The receptionist written on the preview's workspace, through the settings' write schema and its version. */
async function writeReceptionist(db: Db, tenantId: string, brain: BrainConfig): Promise<void> {
  const row = await getTenantConfig(db, tenantId);
  const parsed = row ? parseTenantConfigResult(row.config) : null;
  if (!row || !parsed?.ok) throw new Error("preview_build: the preview's config could not be read");
  const next = TenantConfigWriteSchema.safeParse({ ...parsed.config, brain });
  if (!next.success) throw new Error(`preview_build: the receptionist was refused: ${next.error.issues[0]?.message}`);
  const put = await putTenantConfig(db, tenantId, withStoredKeysKept(next.data, row.config), row.version, null);
  if (!put.ok) throw new Error(`preview_build: the receptionist's write was ${put.reason}`);
}

/** One preview's build, as the job runner hands it: built, failed, or thrown to be tried again. */
async function buildPreview(db: Db, job: ClaimedJob, deadline: number, read: SiteReader = readWebsite): Promise<void> {
  const L = logger({ tenant_id: job.tenant_id });
  const id = typeof job.payload.preview_id === "string" ? job.payload.preview_id : "";
  if (env.LEAD_PREVIEWS !== "on") {
    L.info("preview_build_off", { preview_id: id || null });
    return;
  }
  if (!UUID.test(id)) return;
  const p = await leadPreviewById(db, job.tenant_id, id);
  if (!p || p.state !== "building" || !p.preview_tenant_id) return;
  const preview = { ...p, preview_tenant_id: p.preview_tenant_id };
  try {
    const brain = await receptionistFromListing(db, preview, deadline, read);
    if (typeof brain === "string") {
      await previewBuilt(db, p.id, false, brain);
      L.info("preview_build_failed", { preview_id: p.id, why: brain });
      return;
    }
    await writeReceptionist(db, preview.preview_tenant_id, brain);
    await previewBuilt(db, p.id, true);
    L.info("preview_built", { preview_id: p.id, services: brain.profile?.services?.length ?? 0 });
  } catch (e) {
    if (retryWait({ kind: job.kind, attempts: job.attempts ?? 1 }) !== null) throw e;
    L.error("preview_build_failed", { preview_id: p.id, step: "build", error: errField(e) });
    await previewBuilt(db, p.id, false, "build_failed");
  }
}

/** The builder the job runner is handed (jobs-tick.ts), bound to the service role's database and the website's reader. */
export function previewBuilder(db: Db, read: SiteReader = readWebsite): NonNullable<JobContext["previews"]> {
  return { build: (job, deadline) => buildPreview(db, job, deadline, read) };
}
