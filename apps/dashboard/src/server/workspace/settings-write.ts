import "server-only";

/**
 * What a write of the settings says when it cannot land, and what it records when it does: the settings PUT's, and
 * the first receptionist's (first-receptionist.ts), which write the one config row the same versioned way.
 */
import { changedConfigFields } from "@chanlytics/contracts";
import { recordEvent } from "@chanlytics/db";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";
import { serviceDb } from "@/server/service-db";
import { callEdge, edgeConfigured } from "@/server/edge";

/** How long the edge has to queue a read of the website: one insert. */
const WEBSITE_ASK_MS = 5_000;

/** The website a config names (brain.profile.website), or null. */
function websiteIn(config: unknown): string | null {
  const brain = config && typeof config === "object" ? (config as { brain?: unknown }).brain : null;
  const profile = brain && typeof brain === "object" ? (brain as { profile?: unknown }).profile : null;
  const site = profile && typeof profile === "object" ? (profile as { website?: unknown }).website : null;
  return typeof site === "string" && site.trim() ? site.trim() : null;
}

/**
 * A website newly named is read for the first run's Check (decision 0073, R10): its services, prices and rules, offered
 * for the owner to tap in. Asked of the edge, which holds the reader and the model; best effort, never the save's failure.
 */
async function askWebsiteRead(ctx: RouteContext, tenantId: string): Promise<void> {
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
    "This workspace has no settings record yet, so there was nothing to update. It needs provisioning before settings can be saved.",
  stale: "Someone else saved settings after you loaded them — reload and reapply.",
} as const;

/**
 * The change, in the ledger every other consequential act lands in. Fields, never values -- see changedConfigFields.
 * Best effort by design: an audit row that failed to write must not fail the save the owner just made and watched
 * succeed. Written as the service role: a session may not insert into events (no policy lets it), so this row, written
 * on the session, never reached the ledger.
 */
export async function recordSettingsChanged(
  ctx: RouteContext,
  tenantId: string,
  before: unknown,
  after: unknown,
  version: number,
): Promise<void> {
  const fields = changedConfigFields(before, after);
  if (!fields.length) return;
  // `via` says a card was tapped rather than a form saved, as the decisions ledger says it.
  const { error } = await recordEvent(serviceDb(), tenantId, "settings.changed", "workspace", tenantId, {
    fields,
    by: ctx.userId,
    version,
    ...(ctx.via ? { via: ctx.via } : {}),
  });
  // Under its own name, as it always was: the name is what alerting greps for.
  if (error) log.error("settings_event_failed", { error });
  const site = websiteIn(after);
  if (site && site !== websiteIn(before)) await askWebsiteRead(ctx, tenantId);
}
