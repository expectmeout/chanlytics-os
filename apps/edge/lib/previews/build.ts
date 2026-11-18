/**
 * A lead's own receptionist built (decision 0079, 00497's preview_build job), as the job runner is handed it: payload
 * { preview_id }, on the sender's workspace (Chanlytics' own, so a failure pages nobody and Health shows it under Ours).
 *
 *   1. The preview and its lead, read; one built already, ended or gone is left as it is.
 *   2. Its website read on the preview's own workspace, as the first run reads one (imports/website-read.ts
 *      readWebsite): kept in business_reads, its look worn. A site that cannot be read leaves the listing alone.
 *   3. The questions its page offers first, written for this business from what its receptionist now knows
 *      (previews/starters.ts): none where they could not be, which fails nothing.
 *   4. Its receptionist written: the one the first run gives a business from its listing (contracts leadAsListing,
 *      firstReceptionistOf), with everything its site said worn at once and no price (withFoundWorn), and the questions
 *      beside it (config `preview.starters`), through the settings' write schema and its compare-and-swap.
 *   5. preview_built: ready, or failed and why (a lead with no name to give it).
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
  parseTenantConfigResult,
  withFoundWorn,
  withStoredKeysKept,
  type BrainConfig,
  type PreviewFailure,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { leadAsListing } from "./lead-as-listing";
import { writePreviewStarters, type StartersKnown, type StartersWriter } from "./starters.js";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db/workspace";
import {
  findLeadForPreview,
  findLeadPreviewById,
  recordPreviewBuilt,
  type LeadPreviewRow,
} from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob, JobContext } from "@chanlytics/jobs";
import { readWebsite, type WebsiteReadKept } from "../imports/website-read.js";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The website's reader, as a port: the real one, or a test's. */
type SiteReader = (db: Db, tenantId: TenantId, url: string, o: { deadline: number }) => Promise<WebsiteReadKept>;

/** What a build reaches the world through: the website's reader, and the writer of its first questions. */
interface BuildPorts {
  read: SiteReader;
  write: StartersWriter;
}

/** A preview's receptionist, and what its first questions are written from: the listing's kind, and that receptionist's record. */
interface ReceptionistMade {
  brain: BrainConfig;
  known: StartersKnown;
}

/** The receptionist from the lead's listing, with what its site said worn; why not, where the lead gives it no name. */
async function receptionistFromListing(
  db: Db,
  leadPreview: LeadPreviewRow & { preview_tenant_id: string },
  deadline: number,
  read: SiteReader,
): Promise<ReceptionistMade | PreviewFailure> {
  const lead = await findLeadForPreview(db, leadPreview.tenant_id, leadPreview.lead_id);
  if (!lead || lead.erased_at || lead.blanked_at) throw new Error("preview_build: the lead is gone");
  const listing = leadAsListing(lead);
  const first = firstReceptionistOf({ workspaceName: listing.name, listing });
  if (!first) return "no_name";
  const site = listing.facts?.website ?? null;
  const brain = site ? await withSiteWorn(db, leadPreview, first, { site, deadline, read }) : first;
  return {
    brain,
    known: {
      business: brain.business_name,
      kind: listing.facts?.primary_type_label ?? null,
      goesToCustomers: listing.facts?.service_area_only === true,
      profile: brain.profile,
    },
  };
}

/** The listing's receptionist with what its site said worn: left as it is where the site could not be read. */
async function withSiteWorn(
  db: Db,
  leadPreview: LeadPreviewRow & { preview_tenant_id: string },
  brain: BrainConfig,
  { site, deadline, read }: { site: string; deadline: number; read: SiteReader },
): Promise<BrainConfig> {
  const kept = await read(db, leadPreview.preview_tenant_id, site, { deadline }).catch((e: unknown) => {
    logger({ tenant_id: leadPreview.tenant_id }).warn("preview_build_failed", {
      preview_id: leadPreview.id,
      step: "site",
      error: errField(e),
    });
    return null;
  });
  if (!kept) return brain;
  const profile = recordOrEmpty(brain.profile);
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

/**
 * The receptionist written on the preview's workspace, and the questions its page offers first beside it (none written,
 * no section), through the settings' write schema and its version.
 */
async function writeReceptionist(db: Db, tenantId: TenantId, brain: BrainConfig, starters: string[]): Promise<void> {
  const row = await getTenantConfig(db, tenantId);
  const parsed = row ? parseTenantConfigResult(row.config) : null;
  if (!row || !parsed?.ok) throw new Error("preview_build: the preview's config could not be read");
  const next = TenantConfigWriteSchema.safeParse({
    ...parsed.config,
    brain,
    ...(starters.length ? { preview: { starters } } : {}),
  });
  if (!next.success) throw new Error(`preview_build: the receptionist was refused: ${next.error.issues[0]?.message}`);
  const put = await putTenantConfig(db, tenantId, withStoredKeysKept(next.data, row.config), row.version, null);
  if (!put.ok) throw new Error(`preview_build: the receptionist's write was ${put.reason}`);
}

/**
 * One preview's build, as the job runner hands it: built, failed, nothing to build (and why), or thrown to be tried
 * again. A build that will not be tried again is marked failed by the ledger (packages/jobs settle.ts), whether its last
 * try threw or a run died on it, so a send waiting on it is skipped with why.
 */
async function buildPreview(
  db: Db,
  job: ClaimedJob,
  deadline: number,
  { read, write }: BuildPorts,
): Promise<void | { skipped: string }> {
  const log = logger({ tenant_id: job.tenant_id });
  const id = typeof job.payload.preview_id === "string" ? job.payload.preview_id : "";
  if (env.LEAD_PREVIEWS !== "on") {
    log.info("preview_build_off", { preview_id: id || null });
    return { skipped: "previews_off" };
  }
  if (!UUID.test(id)) return { skipped: "no_preview" };
  const result = await findLeadPreviewById(db, job.tenant_id, id);
  if (!result || result.state !== "building" || !result.preview_tenant_id) return { skipped: "not_building" };
  const preview = { ...result, preview_tenant_id: result.preview_tenant_id };
  try {
    const receptionist = await receptionistFromListing(db, preview, deadline, read);
    if (typeof receptionist === "string") {
      await recordPreviewBuilt(db, result.id, false, receptionist);
      log.info("preview_build_failed", { preview_id: result.id, why: receptionist });
      return;
    }
    const { brain, known } = receptionist;
    const starters = await write(known, { tenantId: preview.preview_tenant_id, previewId: result.id, deadline });
    await writeReceptionist(db, preview.preview_tenant_id, brain, starters);
    await recordPreviewBuilt(db, result.id, true);
    log.info("preview_built", {
      preview_id: result.id,
      services: brain.profile?.services?.length ?? 0,
      starters: starters.length,
    });
  } catch (e) {
    log.error("preview_build_failed", { preview_id: result.id, step: "build", error: errField(e) });
    throw e;
  }
}

/**
 * The builder the job runner is handed (jobs-tick.ts), bound to the service role's database, the website's reader and
 * the writer of its first questions.
 */
export function previewBuilder(
  db: Db,
  read: SiteReader = readWebsite,
  write: StartersWriter = writePreviewStarters,
): NonNullable<JobContext["previews"]> {
  return { build: (job, deadline) => buildPreview(db, job, deadline, { read, write }) };
}
