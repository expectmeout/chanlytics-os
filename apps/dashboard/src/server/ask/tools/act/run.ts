import "server-only";
import { z } from "zod";
import {
  BROADCAST_STATE_LABELS,
  RUN_VERBS,
  SENDING_HOURS_WORDS,
  clockTime,
  fmtDay,
  isReachOutRun,
  localDate,
  nextOpenMoment,
  noteRows,
  plural,
  runApprovalRefusal,
  toApprovalVM,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { broadcast as broadcastReader } from "../../../readers/broadcasts";
import {
  UUID,
  actAction,
  propose,
  refuse,
  str,
  unlessNotFound,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/** Where a waiting run's id is read, said as the model calls it. */
const RUN_FROM = "sequences with action moments (a playbook's waiting) or action sent (waiting_on_you)";

async function proposeRun(
  t: ToolContext,
  input: { broadcast_id: string; verb: (typeof RUN_VERBS)[number] },
): Promise<ProposalOutcome> {
  const id = str(input.broadcast_id, 40);
  if (!UUID.test(id)) return refuse(`broadcast_id must be a waiting run's id, as ${RUN_FROM} gives it`);
  // The run as its sheet reads it (readers/broadcasts.ts broadcast, GET broadcasts/[id]'s own read), once a turn.
  const read = await unlessNotFound(load(t.rc, broadcastReader, { id }));
  if (!read) return refuse("no such run in this workspace");
  // The run is a row the answer may cite, opened where its sheet is.
  noteRows(t.read, read.rows);
  const run = read.data.broadcast;
  // A reach-out's run is cold email to leads, each send checked before it goes: the same route would approve it, so it
  // is refused here (the Phase 4 plan, D11), and approved on its own sheet, where the checks are shown.
  if (isReachOutRun(run.audience))
    return refuse(
      `a reach-out run is cold email to leads, approved on its own sheet where each email's check is shown, never from here: say so, and open broadcasts/run:${run.id}`,
    );
  if (!run.playbook_id)
    return refuse(
      "that broadcast is not a playbook's run: only a playbook's run waits for a person to approve or skip",
    );
  if (run.state !== "pending_approval")
    return refuse(`that run is not waiting for approval: it is ${BROADCAST_STATE_LABELS[run.state]}`);
  // When an approval now sends it by the business's clock (approveRun's next open moment).
  const open = nextOpenMoment(t.timezone, t.now);
  const days = { today: localDate(t.timezone, t.now), sendsOn: localDate(t.timezone, open.at) };
  // A day's run approved on a later day, or a visit's run that would go out on one: the route's refusal, in its words
  // (contracts runApprovalRefusal), before a card; a skip still ends it.
  const late = input.verb === "approve" ? runApprovalRefusal(run, days) : null;
  if (late) return refuse(late);
  // What its sheet says of it (contracts toApprovalVM, as the Broadcasts page draws a waiting run): how many it reaches,
  // when an approval now sends it, and what a skip costs. The words' values are not on the card, so no business name is
  // read for them.
  const vm = toApprovalVM(read.data, {
    playbook: null,
    businessName: "",
    // The card reads no readiness (the run's own read carries none, and a pause is one more read): a paused workspace is
    // refused when the card is confirmed, by approveRun, in the words every campaign says it.
    paused: null,
    today: days.today,
    open: { time: clockTime(open.at.getTime(), t.timezone), moved: open.moved, on: days.sendsOn },
    day: fmtDay,
  });
  const approve = input.verb === "approve";
  return propose({
    kind: "run",
    title: `${approve ? "Approve" : "Skip"} the run: ${run.name}`,
    summary: `${plural(vm.will, "person", "people")} · ${approve ? vm.goes : vm.skip}`,
    payload: { broadcast_id: run.id, verb: input.verb, name: run.name, people: vm.will, timezone: t.timezone },
  });
}

/** A playbook's run that waits for a person, approved or skipped (the Phase 4 plan, D11): propose_sequence's action batch. */
export const runAction = actAction({
  kind: "run",
  input: z.object({ broadcast_id: z.string(), verb: z.enum(RUN_VERBS) }),
  examples: [{ broadcast_id: "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b", verb: "approve" }],
  label: "Preparing a run's approval",
  words: `Action batch takes broadcast_id, a playbook's run that waits for a person, as ${RUN_FROM} gives it, and verb: approve, which sends it now (asked outside the hours a message may go out in, ${SENDING_HOURS_WORDS.between} by the business's clock, it goes at ${SENDING_HOURS_WORDS.first}), or skip, which ends this run unsent and leaves the playbook running. Always give verb, from their words: it has no default, and the card says it back. A run made for a day that has passed can only be skipped, and a reach-out run, cold email to leads, is approved on its own sheet and never here.`,
  build: proposeRun,
});
