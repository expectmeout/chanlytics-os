import { write } from "@/server/route";
import { playbookScope } from "@/server/verbs";
import { PLAYBOOK_PUT_BODY, changePlaybook, deletePlaybook } from "@/server/campaigns/playbook-row";

/**
 * One playbook.
 *
 * PUT    /api/v1/playbooks/:id — one of three bodies, strict (PLAYBOOK_PUT_BODY):
 *        any of { state, name, run_hour, cap_per_run, gap_days, cadence_days,
 *        params, until, trial_until } (its words, its last day and its
 *        trial's end, 00416; a null clears either date), a change in place
 *        judged against the playbook as it stands and written
 *        with its line in the ledger in one transaction (the change_playbook
 *        door; on a database before it, the way it was written before, for one
 *        release), answering what each field held (`was`); { channels } alone,
 *        the channels it goes by and nothing else, answering `was`; or the whole
 *        playbook, re-checked the way a new one is checked and rewritten.
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
  input: PLAYBOOK_PUT_BODY,
  handle: ({ ctx, input, row }) => changePlaybook(ctx, input, row),
});

export const DELETE = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => deletePlaybook(ctx, row),
});
