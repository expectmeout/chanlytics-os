import { write } from "@/server/route";
import { playbookScope } from "@/server/verbs";
import { changePlaybook, deletePlaybook } from "@/server/campaigns/playbook-row";

/**
 * One playbook.
 *
 * PUT    /api/v1/playbooks/:id — { state } pauses or resumes (the ledger
 *        records which); any other field re-checks the whole playbook the
 *        way a new one is checked and rewrites it.
 * DELETE /api/v1/playbooks/:id — the rule goes; its runs stay as broadcasts
 *        with their numbers. Recorded as a pause with `deleted`. Never a
 *        reach-out's step: its sends would go with it (R16); a chain is
 *        removed through its own door before it writes, and paused after.
 *
 * Owner or operator; the playbook is the row (playbookScope), found under
 * RLS, so one the caller cannot see is 404, and the role judged where it
 * lives.
 *
 * The handles are changePlaybook and deletePlaybook in src/server/campaigns/playbook-row.ts: each route is its
 * declaration (who may, how often), each verb is what it does.
 */
export const PUT = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, req, row }) => changePlaybook(ctx, req, row),
});

export const DELETE = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => deletePlaybook(ctx, row),
});
