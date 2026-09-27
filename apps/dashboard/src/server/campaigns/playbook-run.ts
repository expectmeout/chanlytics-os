import "server-only";
import { deployment } from "../deployment";
import { edgeHeaders, edgeUrl } from "../edge";

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
  const r = await fetch(`${edgeUrl()}/api/admin/playbooks-run`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/playbooks-run", { workspace: tenantId, user: userId }),
    body: JSON.stringify({ tenant_id: tenantId, playbook_id: playbookId, user_id: userId }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    outcome?: string;
    eligible?: number;
    broadcast_id?: string;
    skipped?: string;
    scheduled_for?: unknown;
    moved_from?: unknown;
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
    };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}
