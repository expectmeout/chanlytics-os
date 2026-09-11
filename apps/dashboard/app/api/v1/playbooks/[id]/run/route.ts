import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { playbookScope } from "@/server/verbs";
import { runPlaybookNow } from "@/server/service";

/**
 * POST /api/v1/playbooks/:id/run — run it now, at this person's request.
 *
 * The edge runs it with the same implementation the hourly sweep uses. A
 * person who asks has decided: the run sends now unless the class is set to
 * never, and the ledger names them. One run per local day, so a playbook
 * that already ran today says so. Owner or operator, judged where the
 * playbook lives (playbookScope).
 */
const SAID: Record<string, string> = {
  preview: "Running only works on the production dashboard.",
  not_found: "Playbook not found.",
  never: "This playbook's class is set to Never in Settings › Autonomy, so nothing runs.",
  template_not_approved: "Its template is no longer approved by WhatsApp. Pick another template.",
  number_flagged: "WhatsApp flagged this number's quality; wait for it to recover.",
  already_ran_today: "It already ran today. It runs again tomorrow at its hour.",
};

export const POST = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: async ({ ctx, row: p }) => {
    const id = p.id;
    const r = await runPlaybookNow(p.tenant_id, id, ctx.userId);
    if (!r.ok) {
      const said = SAID[r.reason] ?? `The run did not happen (${r.reason}).`;
      throw new AppError(r.reason === "not_found" ? "not_found" : "upstream_meta", said, r.reason === "not_found" ? 404 : 502);
    }
    if (r.outcome === "off") throw new AppError("conflict", SAID[r.skipped ?? ""] ?? `Nothing ran (${r.skipped}).`, 409);
    return { id, outcome: r.outcome, eligible: r.eligible ?? 0, broadcast_id: r.broadcastId ?? null, name: p.name };
  },
});
