import "server-only";
import { z } from "zod";
import {
  BROADCAST_STATE_LABELS,
  RUN_VERBS,
  SENDING_HOURS_WORDS,
  SEQUENCE_ACT_WHY,
  SEQUENCE_FLOW_WORDS,
  batchOkSendsNothing,
  clockTime,
  fmtDay,
  heldByCheckWords,
  isReachOutRun,
  localDate,
  nextOpenMoment,
  noteRows,
  plural,
  runApprovalRefusal,
  sequenceActsOf,
  toApprovalVM,
  type ReachOutRunDto,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { sequenceOverview } from "@chanlytics/db";
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

/** Where a held email's send_id is read, said as the model calls it (action decide's own words). */
const HELD_FROM = "sequences with action sequence, waiting_on_you";

/** A broadcast that is neither a playbook's run nor a one-off of its own: nothing here waits on a person for it. */
const NOT_A_RUN = "that broadcast is not a playbook's run: only a playbook's run waits for a person to approve or skip";

/**
 * A one-off's send cancelled (its record's Cancel this send, asked first): its sequence's row read by its batch's id (a
 * one-off's batch is its sequence, 00440), the row its record draws, and offered where the judge offers it (contracts
 * sequenceActsOf: one waiting for its day, never one already going, which would reach some of its people and not
 * others), else refused in the judge's words. Null where it is no one-off.
 */
async function proposeOneOffCancel(
  t: ToolContext,
  run: { id: string; recipient_count: number },
): Promise<ProposalOutcome | null> {
  const [row] = await sequenceOverview(t.ctx.supabase, t.tenantId, run.id);
  if (!row || row.starts !== "date") return null;
  const offer = sequenceActsOf({ sequence: row }, { tz: t.timezone, nowMs: t.now.getTime() }).cancel_send;
  if (!offer.ok) return refuse(`${row.name}: ${SEQUENCE_ACT_WHY[offer.because]}`);
  return propose({
    kind: "run",
    title: `Cancel ${row.name}`,
    summary: SEQUENCE_FLOW_WORDS.cancelDetail,
    payload: { broadcast_id: run.id, verb: "skip", name: row.name, people: row.date?.people ?? run.recipient_count },
  });
}

/**
 * A batch to leads waiting for an OK, approved or skipped: how many emails it holds, how many the check is still reading,
 * and how many it held, which stay held until each is decided on the sequence's People (an approval sends none of them).
 * Each email goes at its own time (core approveRun's reach-out branch), so the card names no single hour. One with none
 * ready and some held is not approved: an OK would send nothing, so its sequence asks for none (contracts
 * batchOkSendsNothing), and the model is told to decide each held email instead.
 */
function proposeLeadsBatch(
  input: { verb: (typeof RUN_VERBS)[number] },
  run: { id: string; name: string; state: keyof typeof BROADCAST_STATE_LABELS; recipient_count: number },
  r: ReachOutRunDto | null,
): ProposalOutcome {
  if (run.state !== "pending_approval")
    return refuse(`that batch is not waiting for an OK: it is ${BROADCAST_STATE_LABELS[run.state]}`);
  // The emails it holds, as its leads' read says them; the batch's own count where that read has none.
  const emails = r?.planned.length ?? run.recipient_count;
  const approve = input.verb === "approve";
  if (approve && r && batchOkSendsNothing(emails, r.held.length))
    return refuse(
      `an OK sends none of ${r.chain_name || run.name}: ${heldByCheckWords(r.held.length)}, and each is decided on its own, with action decide by its send_id (${HELD_FROM})`,
    );
  const said = [
    plural(emails, "email", "emails"),
    ...(r && r.checking > 0 ? [`${r.checking} still being checked`] : []),
    ...(r && r.held.length > 0
      ? [`${plural(r.held.length, "email", "emails")} the check held stay held until you decide them`]
      : []),
    approve ? "each goes at its own time" : "none of them goes, and the sequence keeps running",
  ];
  return propose({
    kind: "run",
    title: `${approve ? "Approve" : "Skip"} the batch: ${r?.chain_name || run.name}`,
    summary: said.join(" · "),
    payload: { broadcast_id: run.id, verb: input.verb, name: r?.chain_name || run.name, people: emails },
  });
}

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
  // A batch to leads is cold email, each email checked before it goes: approved or skipped as its sequence's page does it
  // (decision 0060: Ask runs every sequence; the record's notice presses the same route), the card saying what the check
  // has done so far, as People lays it out.
  if (isReachOutRun(run.audience)) return proposeLeadsBatch(input, run, read.data.reach_out ?? null);
  if (!run.playbook_id) {
    // A one-off (a sequence on a date: its batch is its sequence, 0060) is cancelled as its page's Cancel this send
    // cancels it, where the judge offers that (decision 0072): a skip is its cancel.
    const once = input.verb === "skip" ? await proposeOneOffCancel(t, run) : null;
    return once ?? refuse(NOT_A_RUN);
  }
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
  words: `Action batch takes broadcast_id, a playbook's run that waits for a person, as ${RUN_FROM} gives it, and verb: approve, which sends it now (asked outside the hours a message may go out in, ${SENDING_HOURS_WORDS.between} by the business's clock, it goes at ${SENDING_HOURS_WORDS.first}), or skip, which ends this run unsent and leaves the playbook running. Always give verb, from their words: it has no default, and the card says it back. A run made for a day that has passed can only be skipped, and a batch to leads (cold email) is approved or skipped the same way, its card saying what the check held. A one-off waiting for its day is cancelled with verb skip, by its batch's id (its sequence's own): nobody gets it; one already going is not cancelled.`,
  build: proposeRun,
});
