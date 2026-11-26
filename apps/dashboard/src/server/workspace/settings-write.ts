import "server-only";

/**
 * What a write of the settings says when it cannot land, and what it tells when it does: the settings PUT's, and
 * the first receptionist's (first-receptionist.ts), which write the one config row the same versioned way.
 */
import { changedConfigFields, valueAt } from "@chanlytics/contracts";
import { log } from "@/server/shared/log";
import type { RouteContext } from "@/server/shared/with-route";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import type { TenantId } from "@chanlytics/contracts";
import type { SettingsTold } from "@chanlytics/db/workspace";

/** How long the edge has to queue a read of the website: one insert. */
const WEBSITE_ASK_MS = 5_000;

/** The website a config names (brain.profile.website), or null. */
function websiteIn(config: unknown): string | null {
  const site = valueAt(config, "brain", "profile", "website");
  return typeof site === "string" && site.trim() ? site.trim() : null;
}

/**
 * A website newly named is read for the first run's Check (decision 0073, R10): its services, prices and rules, offered
 * for the owner to tap in. Asked of the edge, which holds the reader and the model; best effort, never the save's failure.
 */
async function askWebsiteRead(ctx: RouteContext, tenantId: TenantId): Promise<void> {
  if (!edgeConfigured()) return;
  const a = await callEdge(
    "/api/admin/imports/website-read",
    { tenant_id: tenantId, user_id: ctx.userId },
    { workspace: tenantId, user: ctx.userId, timeoutMs: WEBSITE_ASK_MS },
  );
  if (a.status !== 200) log.warn("website_read_unasked", { tenant_id: tenantId, status: a.status });
}

/**
 * The two ways a versioned write fails, which used to share one message. Telling an owner "someone else saved
 * settings" when the row simply does not exist blames an imaginary colleague and prescribes a reload that can never
 * help. Provisioning (migration 00017) makes the second case unreachable for tenants created from now on; this stays
 * honest about the rest.
 */
export const SETTINGS_REFUSED = {
  missing:
    "Settings aren't ready for this workspace yet, so nothing was saved. Use Get help and Chanlytics finishes setting it up.",
  stale: "Someone else saved settings after you loaded them — reload and reapply.",
} as const;

/**
 * What a save says of the change, for the ledger every other consequential act lands in: which parts changed, never their
 * values (changedConfigFields), and where a card was tapped rather than a form saved, which (`via`, as the decisions
 * ledger says it). The settings' door writes it with the row, in one transaction (00722 tenant_config_write); undefined
 * where nothing changed, and nothing is written for it.
 */
export function settingsTold(ctx: RouteContext, before: unknown, after: unknown): SettingsTold | undefined {
  const fields = changedConfigFields(before, after);
  if (!fields.length) return undefined;
  return { fields, ...(ctx.via ? { via: ctx.via } : {}) };
}

/** After a save: a website newly named is read for the first run's Check. */
export async function settingsSaved(
  ctx: RouteContext,
  tenantId: TenantId,
  before: unknown,
  after: unknown,
): Promise<void> {
  const site = websiteIn(after);
  if (site && site !== websiteIn(before)) await askWebsiteRead(ctx, tenantId);
}
