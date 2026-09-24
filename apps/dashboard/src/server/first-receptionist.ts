import "server-only";

/**
 * The receptionist's first config, set up from what is known (the first run's Check): Google's listing when one is
 * linked, the name typed at sign-up otherwise (contracts firstReceptionistOf). The browser cannot build it, since
 * Google's facts never reach it (LISTING_COLUMNS leaves them out), so the first run asks for it here: after Find links
 * the listing, after the owner says they are not on Google, or from Check's own press.
 *
 * Only where none is set up. A receptionist already there is never replaced, whatever it holds, and a config the
 * parser refuses is never written over: only Chanlytics repairs one (Setup's facts row asks). The write is the
 * settings PUT's: the write schema, the versioned compare-and-swap, its author, and the ledger's row.
 */
import {
  AppError,
  BROKEN_CONFIG_WORDS,
  TenantConfigWriteSchema,
  firstReceptionistOf,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig, type Json } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { listingFactsFor } from "./google";
import { SETTINGS_REFUSED, recordSettingsChanged } from "./settings-write";

/** Whether a receptionist is set up in the config as stored now. */
async function setUpNow(ctx: RouteContext, tenantId: string): Promise<boolean> {
  const row = await getTenantConfig(ctx.supabase, tenantId);
  const parsed = row ? parseTenantConfigResult(row.config) : null;
  return !!parsed && parsed.ok && !!parsed.config.brain;
}

/** Set the first receptionist up, and say whether this call made it (false: one was set up already). */
export async function makeFirstReceptionist(ctx: RouteContext, tenantId: string): Promise<{ made: boolean }> {
  const row = await getTenantConfig(ctx.supabase, tenantId);
  if (!row) throw new AppError("conflict", SETTINGS_REFUSED.missing, 409);
  const parsed = parseTenantConfigResult(row.config);
  if (!parsed.ok) throw new AppError("conflict", BROKEN_CONFIG_WORDS.clause, 409);
  if (parsed.config.brain) return { made: false };
  const [workspace, listing] = await Promise.all([
    ctx.supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    listingFactsFor(ctx.supabase, tenantId),
  ]);
  if (workspace.error) throw new Error(workspace.error.message);
  const brain = firstReceptionistOf({ workspaceName: workspace.data?.name ?? null, listing });
  if (!brain) throw new AppError("validation", "This workspace has no name to give the receptionist yet.");
  // The rules a save has to satisfy, as the PUT holds every config to them. What is built here always passes; a
  // failure is a fault in the builder, said as one rather than stored.
  const next = TenantConfigWriteSchema.safeParse({ ...parsed.config, brain });
  if (!next.success) throw new AppError("internal", "The receptionist could not be set up from what is known.", 500);
  const put = await putTenantConfig(ctx.supabase, tenantId, next.data as Json, row.version, ctx.userId);
  if (!put.ok) {
    // A colleague's save landed between the read and the write. If it set a receptionist up, that one stands.
    if (put.reason === "stale" && (await setUpNow(ctx, tenantId))) return { made: false };
    throw new AppError("conflict", SETTINGS_REFUSED[put.reason], 409);
  }
  await recordSettingsChanged(ctx, tenantId, row.config, next.data, put.row.version);
  return { made: true };
}
