import "server-only";

/**
 * What a write of the settings says when it cannot land, and what it records when it does: the settings PUT's, and
 * the first receptionist's (first-receptionist.ts), which write the one config row the same versioned way.
 */
import { changedConfigFields } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { serviceDb } from "@/server/service-db";

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
  await emitEvent(
    serviceDb(),
    tenantId,
    "settings.changed",
    { type: "workspace", id: tenantId },
    {
      fields,
      by: ctx.userId,
      version,
      ...(ctx.via ? { via: ctx.via } : {}),
    },
  );
}
