/** Sequence: steps. */

import type { ContactId } from "@chanlytics/contracts";
import "server-only";
import { z } from "zod";
import {
  FOLLOW_UP_CONDITIONS,
  HELD_DECIDE_CARD,
  PLAYBOOK_CARD_WORDS,
  type REACH_OUT_DECISIONS,
  type REACH_OUT_SAID_OUTCOMES,
  SEQUENCE_ACT_WHY,
  SEQUENCE_DRAFT_THEN_MAX,
  SEQUENCE_MODE_WORDS,
  handTitleOf,
  isSequenceMode,
  plural,
  sequenceActsOf,
  sequenceRoute,
  type SequenceAct,
  type SequenceActReason,
  type SequenceRecordDto,
  UUID,
  PROPOSAL_SPECS,
} from "@chanlytics/contracts";
import { load } from "../../../../shared/reader";
import { sequence as sequenceReader, sequencePeople } from "../../../../readers/sequences";
import { getAskedMessage, noteRow, stepNamed, str, readUnlessNotFound } from "../../context/tool-reads";
import { propose, refuse } from "../../context/context";
import type { ProposalOutcome, ToolContext } from "../../context/tool-defs";
import { playbookAction } from "../playbook/playbook";

/**
 * Everything that sends on its own is a sequence (decision 0060; the operator, 15 Oct 2026): this tool proposes them all,
 * each action a card through its page's own door. A sequence's first step is a campaign's own (once: one message on a
 * date; moment: a standing rule at a moment of the journey or when someone joins a list), and a sequence made whole is
 * that first step and up to three after it (make); its steps are added, changed, taken away or given new words, a draft
 * started, a sequence let go of (discard) or ended (end), people taken out; a batch waiting for an OK is approved or
 * skipped (batch), a sequence paused, resumed, renamed or retimed (change) or sent by more or fewer channels (channels);
 * a new message is written for the Library (message); and to leads, a cold email sequence over a search or a list of
 * chosen leads (cold_email), or leads added to one fed by a list (leads). The actions that were propose_campaign's keep
 * their handlers, under 0060's names. What a sequence's head offers is the one judge's (contracts sequenceActsOf,
 * decision 0072): a card its page would not draw is refused in the judge's words.
 */

/** A sequence's record as its page reads it, or the refusal in words. */
export async function sequenceOnCard(
  t: ToolContext,
  sequenceId: string,
): Promise<SequenceRecordDto | { refusal: string }> {
  const id = str(sequenceId, 40);
  if (!UUID.test(id)) return { refusal: "sequence_id must be an id sequences with action list returned" };
  const read = await readUnlessNotFound(load(t.rc, sequenceReader, { id }));
  if (!read) return { refusal: "no such sequence in this workspace" };
  noteRow(t, "playbook", id, read.data.sequence.name, sequenceRoute(id));
  return read.data;
}

export const isRefusal = <T>(x: T | { refusal: string }): x is { refusal: string } =>
  !!x && typeof x === "object" && "refusal" in x;

/** The act offered in place of one refused, as this tool's actions name it, for the model. */
const INSTEAD: Record<SequenceAct, string> = {
  start: "start it with action start",
  pause: "pause it with action change (state paused)",
  turn_on: "turn it on with action change (state running)",
  end: "end it with action end",
  discard: "let it go with action discard",
  run_now: "run it with action run_now",
  rename: "rename it with action change (name)",
  cancel_send: "cancel it with action batch (verb skip)",
  send_again: "send it again with action once",
};

/** What the model is told to do where a refusal offers no act in its place. */
const NEXT: Partial<Record<SequenceActReason, string>> = {
  batch_waiting: "approve or skip that batch with action batch",
  email_to_write: "its email is written on its page first: say so, and open it",
  unread: "say so, and ask again in a moment",
};

/**
 * One act of the record's head, as its page offers it (contracts sequenceActsOf, decision 0072: the page and every card
 * ask the one judge), or its refusal: why, in a person's words, then what the model may do instead.
 */
export function refusedAct(rec: SequenceRecordDto, act: SequenceAct, now: Date): string | null {
  const offer = sequenceActsOf(rec, { tz: rec.timezone, nowMs: now.getTime() })[act];
  if (offer.ok) return null;
  const next = offer.instead ? INSTEAD[offer.instead] : NEXT[offer.because];
  return `${rec.sequence.name}: ${SEQUENCE_ACT_WHY[offer.because]}${next ? ` (${next})` : ""}`;
}

/** A step after the first, by its id, in a sequence's record; or the refusal. The first step is the campaign's own. */
function laterStep(rec: SequenceRecordDto, stepId: string) {
  const step = rec.steps.find((s) => s.id === str(stepId, 40));
  if (!step) return { refusal: "step_id must be a step of this sequence (sequences with action sequence lists them)" };
  if (step.place <= 1)
    return {
      refusal:
        "the first step is the sequence's own: change its message, clock or name with action change, its channels with action channels",
    };
  return step;
}

/** A message a step names: an id a read returned, or an earlier plan step's token; or the refusal in its door's words. */
async function stepMessage(
  toolContext: ToolContext,
  templateId: string,
): Promise<{ id: string; name: string } | { refusal: string }> {
  const id = str(templateId, 40);
  const token = stepNamed(toolContext, id);
  if (token !== null) return { id, name: `the message step ${token} writes` };
  if (!UUID.test(id)) return { refusal: "template_id must be a message's id from sequences with action messages" };
  const otherAskedMessage = await getAskedMessage(toolContext, id);
  if ("refusal" in otherAskedMessage) return otherAskedMessage;
  return { id: otherAskedMessage.message.anchor.id, name: otherAskedMessage.message.name };
}

/** The fields of a step after the first, as the step door takes them. */
export const STEP_FIELDS = {
  after_days: z.number().int().min(1).max(90).describe("Days after the step before it, 1 to 90."),
  only_if: z.array(z.enum(FOLLOW_UP_CONDITIONS)).optional().describe("What must still hold for it to go."),
  name: z.string().optional().describe("Its name on the page."),
  params: z.array(z.string()).optional().describe("The message's values in order, as action moment takes them."),
};

export const THEN_STEP = z.object({ ...STEP_FIELDS, template_id: z.string().describe("The message it sends.") });

type ThenStep = z.output<typeof THEN_STEP>;

/** A wait in words. */
export const after = (d: number) => `after ${plural(d, "day", "days")}`;

export async function proposeMake(
  toolContext: ToolContext,
  input: { first: unknown; then: ThenStep[]; start: boolean },
): Promise<ProposalOutcome> {
  if (input.then.length > SEQUENCE_DRAFT_THEN_MAX)
    return refuse(`a sequence takes at most ${SEQUENCE_DRAFT_THEN_MAX} steps after the first`);
  // The first step is a campaign's own, judged by the moment's own builder (its moment, list, message, channels, clock).
  const first = playbookAction.input.safeParse(input.first);
  if (!first.success)
    return refuse(`first: ${first.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  if (!first.data.template_id)
    return refuse("first names its message by template_id: a sequence's first step sends a message the Library holds");
  const created = await playbookAction.build(toolContext, first.data);
  const card = created.proposal;
  if (!card) return created;
  // The body POST sequences takes for its first step: the one a campaign's card commits (contracts playbookSpec).
  const call = PROPOSAL_SPECS.playbook.commit(
    { id: "", kind: "playbook", payload: card.payload, summary: "" },
    {
      settings: null,
    },
  );
  if (!("route" in call)) return refuse("the first step cannot be made as asked");
  const then: Record<string, unknown>[] = [];
  const sentence: string[] = [];
  for (const [i, s] of input.then.entries()) {
    const msg = await stepMessage(toolContext, s.template_id);
    if (isRefusal(msg)) return refuse(`step ${i + 2}: ${msg.refusal}`);
    then.push({
      after_days: s.after_days,
      template_id: msg.id,
      ...(s.only_if?.length ? { only_if: s.only_if } : {}),
      ...(s.name?.trim() ? { name: s.name.trim().slice(0, 120) } : {}),
      ...(s.params?.length ? { params: s.params } : {}),
    });
    sentence.push(
      `step ${i + 2} ${after(s.after_days)}: ${msg.name}${s.only_if?.length ? ` (only if ${s.only_if.join(" and ").replace(/_/g, " ")})` : ""}`,
    );
  }
  const name = typeof card.payload.name === "string" ? card.payload.name : "";
  return propose({
    kind: "sequence_make",
    title: `Sequence: ${name}`,
    summary: `${card.summary}${sentence.length ? ` · Then ${sentence.join("; ")}` : ""} · ${input.start ? "Starts once approved" : "Kept as a draft: nothing goes until it is started"}`,
    payload: { first: (call as { body: Record<string, unknown> }).body, then, start: input.start, name },
  });
}

export async function proposeStep(
  toolContext: ToolContext,
  input: {
    sequence_id: string;
    step_id?: string;
    template_id?: string;
    after_days?: number;
    only_if?: string[];
    channels?: string[];
    name?: string;
    params?: string[];
  },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const fields = {
    ...(input.after_days !== undefined ? { after_days: input.after_days } : {}),
    ...(input.only_if ? { only_if: input.only_if } : {}),
    ...(input.channels?.length ? { channels: input.channels } : {}),
    ...(input.name?.trim() ? { name: input.name.trim().slice(0, 120) } : {}),
    ...(input.params ? { params: input.params } : {}),
  };
  if (input.step_id) {
    const step = laterStep(rec, input.step_id);
    if (isRefusal(step)) return refuse(step.refusal);
    if (input.template_id) return refuse("a step's message is changed with action words");
    if (step.hand && input.params)
      return refuse("a call or a note has no message, so no params: change its wait instead");
    if (step.hand && input.channels?.length)
      return refuse("a call or a note lands on Today and goes by no channel: change its wait instead");
    if (!Object.keys(fields).length) return refuse("say what changes: after_days, only_if, channels, name or params");
    return propose({
      kind: "sequence_step",
      title: `${rec.sequence.name}: step ${step.place}`,
      summary: Object.entries(fields)
        .map(([k, v]) => (k === "after_days" ? after(Number(v)) : `${k.replace(/_/g, " ")}: ${JSON.stringify(v)}`))
        .join(" · "),
      payload: { sequence_id: rec.sequence.id, step_id: step.id, name: rec.sequence.name, ...fields },
    });
  }
  if (input.after_days === undefined) return refuse("a new step names after_days, the wait after the step before it");
  // A call or a note closes a sequence (00465): nothing is added after one.
  if (rec.steps.at(-1)?.hand) return refuse("its last step is a call or a note, and nothing goes after one");
  if (!input.template_id) return refuse("a new step names template_id, the message it sends");
  const msg = await stepMessage(toolContext, input.template_id);
  if (isRefusal(msg)) return refuse(msg.refusal);
  return propose({
    kind: "sequence_step",
    title: `${rec.sequence.name}: a step after step ${rec.steps.length}`,
    summary: `${after(input.after_days)}: ${msg.name}${input.only_if?.length ? ` · only if ${input.only_if.join(" and ").replace(/_/g, " ")}` : ""}`,
    payload: { sequence_id: rec.sequence.id, template_id: msg.id, name: rec.sequence.name, ...fields },
  });
}

export async function proposeStepRemove(
  toolContext: ToolContext,
  input: { sequence_id: string; step_id: string },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const step = laterStep(rec, input.step_id);
  if (isRefusal(step)) return refuse(step.refusal);
  const later = rec.steps.filter((s) => s.place > step.place).length;
  return propose({
    kind: "sequence_step_remove",
    title: `${rec.sequence.name}: take away step ${step.place}`,
    summary: `Step ${step.place} (${step.hand ? handTitleOf(step.hand.kind) : (step.template_name ?? "its message")})${later ? ` and the ${plural(later, "step", "steps")} after it` : ""} go; whoever waited for it is done. Nothing undoes it.`,
    payload: { sequence_id: rec.sequence.id, step_id: step.id },
  });
}

export async function proposeWords(
  toolContext: ToolContext,
  input: { sequence_id: string; step_id: string; template_id: string; params?: string[] },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const step = rec.steps.find((s) => s.id === str(input.step_id, 40));
  if (!step) return refuse("step_id must be a step of this sequence (sequences with action sequence lists them)");
  if (step.hand) return refuse("that step is a call or a note: it sends no message");
  const msg = await stepMessage(toolContext, input.template_id);
  if (isRefusal(msg)) return refuse(msg.refusal);
  return propose({
    kind: "sequence_words",
    title: `${rec.sequence.name}: step ${step.place}'s message`,
    summary: `${step.template_name ?? "Its message"} → ${msg.name}; where WhatsApp has to approve it first, the step sends its own until then.`,
    payload: {
      sequence_id: rec.sequence.id,
      step_id: step.id,
      template_id: msg.id,
      ...(input.params ? { params: input.params } : {}),
    },
  });
}

export async function proposeStart(toolContext: ToolContext, input: { sequence_id: string }): Promise<ProposalOutcome> {
  const id = str(input.sequence_id, 40);
  const token = stepNamed(toolContext, id);
  if (token !== null)
    return propose({
      kind: "sequence_start",
      title: `Start the sequence step ${token} makes`,
      summary: `Its first step runs from its next run: ${PLAYBOOK_CARD_WORDS.asksFirst}.`,
      payload: { sequence_id: id },
    });
  const rec = await sequenceOnCard(toolContext, id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const refused = refusedAct(rec, "start", toolContext.now);
  if (refused) return refuse(refused);
  return propose({
    kind: "sequence_start",
    title: `Start ${rec.sequence.name}`,
    summary: `Its first step runs from its next run: ${PLAYBOOK_CARD_WORDS.asksFirst}, and after that ${SEQUENCE_MODE_WORDS[isSequenceMode(rec.sequence.mode) ? rec.sequence.mode : "ask"].does}.`,
    payload: { sequence_id: rec.sequence.id, name: rec.sequence.name },
  });
}

export async function proposeLeave(
  toolContext: ToolContext,
  input: { sequence_id: string; contact_ids?: ContactId[]; lead_ids?: string[] },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const seen = new Set([...(input.contact_ids ?? []), ...(input.lead_ids ?? [])].map((x) => str(x, 40)));
  if (!seen.size) return refuse("name who leaves by contact_ids (people) or lead_ids (leads)");
  const people = (await load(toolContext.rc, sequencePeople, { id: rec.sequence.id, limit: 500 })).data;
  const rows = people.rows.filter(
    (r) => r.enrollment_id && ((r.contact_id && seen.has(r.contact_id)) || (r.lead_id && seen.has(r.lead_id))),
  );
  if (!rows.length) return refuse(`none of them is in ${rec.sequence.name} now`);
  const names = rows.map((r) => r.name).filter(Boolean);
  return propose({
    kind: "sequence_leave",
    title: `Take ${plural(rows.length, "person", "people")} out of ${rec.sequence.name}`,
    summary: `${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""}: a send of theirs not yet gone is skipped with them.`,
    payload: { sequence_id: rec.sequence.id, enrollment_ids: rows.map((r) => r.enrollment_id as string) },
  });
}

/**
 * A send of a sequence's that waits on the owner, by its id, as its People tab lists it (the operator, 15 Oct 2026): an
 * email the check held (group held), or one handed to the owner to send from their own inbox (to_send); or the refusal.
 */
async function sendOnCard(
  toolContext: ToolContext,
  input: { sequence_id: string; send_id: string },
  group: "held" | "to_send",
): Promise<{ rec: SequenceRecordDto; name: string; send_id: string } | { refusal: string }> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return rec;
  const id = str(input.send_id, 40);
  if (!UUID.test(id)) return { refusal: "send_id must be an id sequences with action sequence returned" };
  const people = (await load(toolContext.rc, sequencePeople, { id: rec.sequence.id, limit: 500 })).data;
  const row = people.rows.find((r) => r.send_id === id);
  if (!row) return { refusal: `no send of ${rec.sequence.name} has that id now` };
  if (row.group !== group)
    return {
      refusal:
        group === "held"
          ? "that email is not held by the check: only a held email is decided"
          : "that email was not handed over to send by hand",
    };
  return { rec, name: row.name ?? "The business", send_id: id };
}

export async function proposeSendDecide(
  toolContext: ToolContext,
  input: { sequence_id: string; send_id: string; decision: (typeof REACH_OUT_DECISIONS)[number]; change?: string },
): Promise<ProposalOutcome> {
  const on = await sendOnCard(toolContext, input, "held");
  if (isRefusal(on)) return refuse(on.refusal);
  const change = input.decision === "rewrite" ? (input.change ?? "").trim() : "";
  return propose({
    kind: "sequence_send_decide",
    title: `${HELD_DECIDE_CARD[input.decision].title}: ${on.name}`,
    summary: `The email to ${on.name} that the check held, in ${on.rec.sequence.name}. ${HELD_DECIDE_CARD[input.decision].after(change)}`,
    payload: { send_id: on.send_id, decision: input.decision, name: on.name, sequence_id: on.rec.sequence.id, change },
  });
}

export async function proposeSendSaid(
  toolContext: ToolContext,
  input: { sequence_id: string; send_id: string; outcome: (typeof REACH_OUT_SAID_OUTCOMES)[number] },
): Promise<ProposalOutcome> {
  const on = await sendOnCard(toolContext, input, "to_send");
  if (isRefusal(on)) return refuse(on.refusal);
  const sent = input.outcome === "sent";
  return propose({
    kind: "sequence_send_said",
    title: `${sent ? "Sent" : "Not sent"}: ${on.name}`,
    summary: sent
      ? `The email to ${on.name} went from your own inbox; ${on.rec.sequence.name} carries on from it.`
      : `The email to ${on.name} did not go; ${on.rec.sequence.name} says so.`,
    payload: { send_id: on.send_id, outcome: input.outcome, name: on.name, sequence_id: on.rec.sequence.id },
  });
}

/**
 * A sequence run now, at the member's request (the page's Run now, POST playbooks/:id/run): its first step's run, the
 * hourly sweep's own, which waits for an OK where its class asks. Only where its page offers Run now (the judge: it runs
 * on the business's day and no batch waits for an OK); a batch that waits is action batch's.
 */
export async function proposeRunNow(
  toolContext: ToolContext,
  input: { sequence_id: string },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const refused = refusedAct(rec, "run_now", toolContext.now);
  if (refused) return refuse(refused);
  const row = rec.sequence;
  return propose({
    kind: "playbook_run",
    title: `Run ${row.name} now`,
    summary:
      "Its first step runs now, as its hourly run would: it waits for an OK where its class asks, and outside the sending hours it goes when they open.",
    payload: { playbook_id: row.first?.id ?? row.id, name: row.name, timezone: toolContext.timezone },
  });
}

/**
 * A sequence that never ran taken away whole, in any state, or a sequence to leads that never wrote (its page's
 * Discard, asked first: decision 0072); one that ran is ended, a sequence to leads paused. Nothing undoes it.
 */
export async function proposeDiscard(
  toolContext: ToolContext,
  input: { sequence_id: string },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const refused = refusedAct(rec, "discard", toolContext.now);
  if (refused) return refuse(refused);
  return propose({
    kind: "sequence_discard",
    title: `Let go of ${rec.sequence.name}`,
    summary: "Nothing of it has gone; it is taken away whole, with its steps. Nothing undoes it.",
    payload: { sequence_id: rec.sequence.id },
  });
}
