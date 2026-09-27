import "server-only";

/**
 * The receptionist, from what is known (the first run's Check): set up where there is none, from Google's listing when
 * one is linked and the name typed at sign-up otherwise (contracts firstReceptionistOf); and, for one set up before its
 * listing was linked, what Google says filled in where it states nothing yet (googleFillsOf), never over what is there.
 * The browser cannot do either, since Google's facts never reach it (LISTING_COLUMNS leaves them out), so the first run
 * asks here: after Find links the listing, after the owner says they are not on Google, or from Check's own press.
 *
 * A config the parser refuses is never written over: only Chanlytics repairs one (Setup's facts row asks). The write is
 * the settings PUT's: the write schema, the versioned compare-and-swap, its author, and the ledger's row.
 */
import {
  AppError,
  BROKEN_CONFIG_WORDS,
  TenantConfigWriteSchema,
  firstReceptionistOf,
  googleFillsOf,
  parseTenantConfigResult,
  receptionistOf,
  type BrainConfig,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig, type Json } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { listingFactsFor } from "../connections/google";
import { SETTINGS_REFUSED, recordSettingsChanged } from "../workspace/settings-write";

/** The config row as stored now, parsed, and whether it holds a receptionist (the one test, receptionistOf). */
async function storedNow(ctx: RouteContext, tenantId: string) {
  const row = await getTenantConfig(ctx.supabase, tenantId);
  const parsed = row ? parseTenantConfigResult(row.config) : null;
  return { row, parsed, receptionist: receptionistOf(parsed) };
}

/** The receptionist from what is known, and whether this call wrote it (false: there was nothing to add). */
export async function receptionistFromWhatIsKnown(ctx: RouteContext, tenantId: string): Promise<{ wrote: boolean }> {
  const { row, parsed, receptionist } = await storedNow(ctx, tenantId);
  if (!row || !parsed) throw new AppError("conflict", SETTINGS_REFUSED.missing, 409);
  if (!parsed.ok) throw new AppError("conflict", BROKEN_CONFIG_WORDS.clause, 409);
  const listing = await listingFactsFor(ctx.supabase, tenantId);
  let brain: BrainConfig | null;
  if (receptionist === "set" && parsed.config.brain) {
    brain = googleFillsOf(parsed.config.brain, listing);
    if (!brain) return { wrote: false };
  } else {
    // The name typed at sign-up, which the resolver takes where no listing names the business.
    const workspace = await ctx.supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (workspace.error) throw new Error(workspace.error.message);
    brain = firstReceptionistOf({ workspaceName: workspace.data?.name ?? null, listing });
    if (!brain) throw new AppError("validation", "This workspace has no name to give the receptionist yet.");
  }
  // The rules a save has to satisfy, as the PUT holds every config to them. What is built here always passes; a
  // failure is a fault in the builder, said as one rather than stored.
  const next = TenantConfigWriteSchema.safeParse({ ...parsed.config, brain });
  if (!next.success) throw new AppError("internal", "The receptionist could not be set up from what is known.", 500);
  const put = await putTenantConfig(ctx.supabase, tenantId, next.data as Json, row.version, ctx.userId);
  if (!put.ok) {
    // A colleague's save landed between the read and the write. Where none was set up and it set one up, theirs
    // stands; anything else is the settings' own conflict, and a second press reads what is there now.
    if (put.reason === "stale" && receptionist === "none" && (await storedNow(ctx, tenantId)).receptionist === "set")
      return { wrote: false };
    throw new AppError("conflict", SETTINGS_REFUSED[put.reason], 409);
  }
  await recordSettingsChanged(ctx, tenantId, row.config, next.data, put.row.version);
  return { wrote: true };
}
