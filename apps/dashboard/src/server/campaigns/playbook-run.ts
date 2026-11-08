import "server-only";
import { deployment } from "../shared/env";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../shared/edge";
import type { TenantId } from "@chanlytics/contracts";

/** A run now plans its sends and may start them: the edge's work for one playbook, as long as its door may take. */
const RUN_TIMEOUT_MS = MIN_MS;

/* ---- Playbooks: one run now, the same implementation the hourly sweep uses ---- */

export type RunPlaybookOutcome =
  | {
      ok: true;
      outcome: "sent" | "held" | "empty" | "off";
      eligible?: number;
      broadcastId?: string;
      skipped?: string;
      scheduledFor: string | null;
      movedFrom: string | null;
      /** A reach-out's root (Part 4, R14): why it held, came back empty or is off, what it planned, its run. */
      reason?: string | null;
      planned?: number;
      runId?: string | null;
    }
  | { ok: false; reason: EdgeReason; detail?: string };

/**
 * The edge runs it (lib/campaigns/playbooks/playbooks.ts) as this person's decision: it sends
 * now unless the class is set to never, one run per local day.
 */
export async function runPlaybookNow(
  tenantId: TenantId,
  playbookId: string,
  userId: string,
): Promise<RunPlaybookOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  // An edge that cannot be reached is said as such: the hourly sweep runs what it would have (R14).
  const answer = await callEdge(
    "/api/admin/playbooks-run",
    { tenant_id: tenantId, playbook_id: playbookId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: RUN_TIMEOUT_MS },
  );
  if (answer.status === 503 && answer.body?.error === "edge_unreachable")
    return { ok: false, reason: "edge_unreachable" };
  const body = (answer.body ?? {}) as {
    ok?: boolean;
    outcome?: string;
    eligible?: number;
    broadcast_id?: string;
    skipped?: string;
    scheduled_for?: unknown;
    moved_from?: unknown;
    reason?: unknown;
    planned?: unknown;
    run_id?: unknown;
    detail?: string;
  };
  if (
    edgeAnswered(answer) &&
    body.ok &&
    (body.outcome === "sent" || body.outcome === "held" || body.outcome === "empty" || body.outcome === "off")
  ) {
    // When a sent run really goes, and what was asked for when the hours moved it; an edge older than this gives neither.
    const at = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      ok: true,
      outcome: body.outcome,
      eligible: body.eligible,
      broadcastId: body.broadcast_id,
      skipped: body.skipped,
      scheduledFor: at(body.scheduled_for),
      movedFrom: at(body.moved_from),
      reason: at(body.reason),
      planned: typeof body.planned === "number" ? body.planned : undefined,
      runId: at(body.run_id),
    };
  }
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}

/** What Offer it came to: offered, to how many and whether it waits for an OK, or not, and why. */
type OfferFreedOutcome =
  | { ok: true; offered: true; people: number; waits: boolean }
  | { ok: true; offered: false; why: string; detail?: string }
  | { ok: false; reason: EdgeReason; detail?: string };

/**
 * An hour a cancellation freed, offered now (Today in three zones, 2 Nov 2026; decision 0082): the edge makes the offer it
 * makes when the cancellation arrives (api/admin/calendar/freed-time), once per appointment, as this person's press, over
 * the time it reads from the visit itself.
 */
export async function offerFreedNow(
  tenantId: TenantId,
  userId: string,
  appointmentId: string,
): Promise<OfferFreedOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/calendar/freed-time",
    { tenant_id: tenantId, user_id: userId, appointment_id: appointmentId },
    { workspace: tenantId, user: userId, timeoutMs: RUN_TIMEOUT_MS },
  );
  const body = (answer.body ?? {}) as {
    ok?: boolean;
    offered?: boolean;
    people?: number;
    waits?: boolean;
    why?: string;
    detail?: string;
  };
  if (edgeAnswered(answer) && body.ok)
    return body.offered
      ? { ok: true, offered: true, people: body.people ?? 0, waits: body.waits === true }
      : { ok: true, offered: false, why: body.why ?? "nobody", ...(body.detail ? { detail: body.detail } : {}) };
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}
