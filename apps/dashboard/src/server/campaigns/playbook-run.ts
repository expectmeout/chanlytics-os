import "server-only";
import { deployment } from "../deployment";
import { edgeHeaders, edgeUrl } from "../edge";

/* ---- Playbooks: one run now, the same implementation the hourly sweep uses ---- */

type RunPlaybookOutcome =
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
  | { ok: false; reason: string; detail?: string };

/**
 * The edge runs it (lib/playbooks.ts) as this person's decision: it sends
 * now unless the class is set to never, one run per local day.
 */
export async function runPlaybookNow(
  tenantId: string,
  playbookId: string,
  userId: string,
): Promise<RunPlaybookOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  // An edge that cannot be reached is said as such: the hourly sweep runs what it would have (R14).
  const r = await fetch(`${edgeUrl()}/api/admin/playbooks-run`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/playbooks-run", { workspace: tenantId, user: userId }),
    body: JSON.stringify({ tenant_id: tenantId, playbook_id: playbookId, user_id: userId }),
  }).catch(() => null);
  if (!r) return { ok: false, reason: "edge_unreachable" };
  const j = (await r.json().catch(() => ({}))) as {
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
    error?: string;
    detail?: string;
  };
  if (r.ok && j.ok && (j.outcome === "sent" || j.outcome === "held" || j.outcome === "empty" || j.outcome === "off")) {
    // When a sent run really goes, and what was asked for when the hours moved it; an edge older than this gives neither.
    const at = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      ok: true,
      outcome: j.outcome,
      eligible: j.eligible,
      broadcastId: j.broadcast_id,
      skipped: j.skipped,
      scheduledFor: at(j.scheduled_for),
      movedFrom: at(j.moved_from),
      reason: at(j.reason),
      planned: typeof j.planned === "number" ? j.planned : undefined,
      runId: at(j.run_id),
    };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}
