import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  FOLLOW_UP_CONDITIONS,
  LEAD_LIST_MAX,
  PLAYBOOK_CARD_WORDS,
  PROPOSAL_SPECS,
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_DECISIONS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_SAID_OUTCOMES,
  REACH_OUT_STEPS_MAX,
  ReachOutChainSchema,
  SEQUENCE_DRAFT_THEN_MAX,
  SEQUENCE_MODE_WORDS,
  handTitleOf,
  isSequenceMode,
  plural,
  sequenceRoute,
  sequenceRunsNow,
  type SequenceRecordDto,
  AppError,
} from "@chanlytics/contracts";
import { mailboxConnectionsFor } from "../../../connections/mailbox-connections";
import { searchRow } from "../../../leads/leads";
import { load } from "../../../readers";
import { sequence as sequenceReader, sequencePeople } from "../../../readers/sequences";
import {
  UUID,
  actAction,
  askedMessage,
  defineActions,
  noteRow,
  propose,
  refuse,
  stepNamed,
  str,
  unlessNotFound,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { broadcastAction } from "./broadcast";
import { reachOutAddAction } from "./leads/lead-search";
import { messageAction } from "./message";
import { playbookAction } from "./playbook";
import { playbookChangeAction } from "./playbook-change";
import { playbookChannelsAction } from "./playbook-channels";
import { runAction } from "./run";

/**
 * Everything that sends on its own is a sequence (decision 0060; the operator, 15 Oct 2026): this tool proposes them all,
 * each action a card through its page's own door. A sequence's first step is a campaign's own (once: one message on a
 * date; moment: a standing rule at a moment of the journey or when someone joins a list), and a sequence made whole is
 * that first step and up to three after it (make); its steps are added, changed, taken away or given new words, a draft
 * started or let go, people taken out; a batch waiting for an OK is approved or skipped (batch), a sequence paused,
 * resumed, renamed or retimed (change) or sent by more or fewer channels (channels); a new message is written for the
 * Library (message); and to leads, a cold email sequence over a search or a list of chosen leads (cold_email), or leads
 * added to one fed by a list (leads). The actions that were propose_campaign's keep their handlers, under 0060's names.
 */

/** A sequence's record as its page reads it, or the refusal in words. */
async function sequenceOnCard(t: ToolContext, sequenceId: string): Promise<SequenceRecordDto | { refusal: string }> {
  const id = str(sequenceId, 40);
  if (!UUID.test(id)) return { refusal: "sequence_id must be an id sequences with action list returned" };
  const read = await unlessNotFound(load(t.rc, sequenceReader, { id }));
  if (!read) return { refusal: "no such sequence in this workspace" };
  noteRow(t, "playbook", id, read.data.sequence.name, sequenceRoute(id));
  return read.data;
}
const isRefusal = <T>(x: T | { refusal: string }): x is { refusal: string } =>
  !!x && typeof x === "object" && "refusal" in (x as object);

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
  t: ToolContext,
  templateId: string,
): Promise<{ id: string; name: string } | { refusal: string }> {
  const id = str(templateId, 40);
  const token = stepNamed(t, id);
  if (token !== null) return { id, name: `the message step ${token} writes` };
  if (!UUID.test(id)) return { refusal: "template_id must be a message's id from sequences with action messages" };
  const asked = await askedMessage(t, id);
  if ("refusal" in asked) return asked;
  return { id: asked.message.anchor.id, name: asked.message.name };
}

/** The fields of a step after the first, as the step door takes them. */
const STEP_FIELDS = {
  after_days: z.number().int().min(1).max(90).describe("Days after the step before it, 1 to 90."),
  only_if: z
    .array(z.enum(FOLLOW_UP_CONDITIONS))
    .optional()
    .describe("What must still hold for it to go: no_booking, no_reply."),
  name: z.string().optional().describe("The step's name on the page."),
  params: z.array(z.string()).optional().describe("The message's values in order, as action moment takes them."),
};

const THEN_STEP = z.object({ ...STEP_FIELDS, template_id: z.string().describe("The message it sends.") });
type ThenStep = z.output<typeof THEN_STEP>;

/** A wait in words. */
const after = (d: number) => `after ${plural(d, "day", "days")}`;

async function proposeMake(
  t: ToolContext,
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
  const made = await playbookAction.build(t, first.data);
  const card = made.proposal;
  if (!card) return made;
  // The body POST sequences takes for its first step: the one a campaign's card commits (contracts playbookSpec).
  const call = PROPOSAL_SPECS.playbook.commit(
    { id: "", kind: "playbook", payload: card.payload, summary: "" },
    {
      settings: null,
    },
  );
  if (!("route" in call)) return refuse("the first step cannot be made as asked");
  const then: Record<string, unknown>[] = [];
  const said: string[] = [];
  for (const [i, s] of input.then.entries()) {
    const msg = await stepMessage(t, s.template_id);
    if (isRefusal(msg)) return refuse(`step ${i + 2}: ${msg.refusal}`);
    then.push({
      after_days: s.after_days,
      template_id: msg.id,
      ...(s.only_if?.length ? { only_if: s.only_if } : {}),
      ...(s.name?.trim() ? { name: s.name.trim().slice(0, 120) } : {}),
      ...(s.params?.length ? { params: s.params } : {}),
    });
    said.push(
      `step ${i + 2} ${after(s.after_days)}: ${msg.name}${s.only_if?.length ? ` (only if ${s.only_if.join(" and ").replace(/_/g, " ")})` : ""}`,
    );
  }
  const name = typeof card.payload.name === "string" ? card.payload.name : "";
  return propose({
    kind: "sequence_make",
    title: `Sequence: ${name}`,
    summary: `${card.summary}${said.length ? ` · Then ${said.join("; ")}` : ""} · ${input.start ? "Starts once approved" : "Kept as a draft: nothing goes until it is started"}`,
    payload: { first: (call as { body: Record<string, unknown> }).body, then, start: input.start, name },
  });
}

async function proposeStep(
  t: ToolContext,
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
  const rec = await sequenceOnCard(t, input.sequence_id);
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
  const msg = await stepMessage(t, input.template_id);
  if (isRefusal(msg)) return refuse(msg.refusal);
  return propose({
    kind: "sequence_step",
    title: `${rec.sequence.name}: a step after step ${rec.steps.length}`,
    summary: `${after(input.after_days)}: ${msg.name}${input.only_if?.length ? ` · only if ${input.only_if.join(" and ").replace(/_/g, " ")}` : ""}`,
    payload: { sequence_id: rec.sequence.id, template_id: msg.id, name: rec.sequence.name, ...fields },
  });
}

async function proposeStepRemove(
  t: ToolContext,
  input: { sequence_id: string; step_id: string },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(t, input.sequence_id);
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

async function proposeWords(
  t: ToolContext,
  input: { sequence_id: string; step_id: string; template_id: string; params?: string[] },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(t, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const step = rec.steps.find((s) => s.id === str(input.step_id, 40));
  if (!step) return refuse("step_id must be a step of this sequence (sequences with action sequence lists them)");
  if (step.hand) return refuse("that step is a call or a note: it sends no message");
  const msg = await stepMessage(t, input.template_id);
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

async function proposeStart(t: ToolContext, input: { sequence_id: string }): Promise<ProposalOutcome> {
  const id = str(input.sequence_id, 40);
  const token = stepNamed(t, id);
  if (token !== null)
    return propose({
      kind: "sequence_start",
      title: `Start the sequence step ${token} makes`,
      summary: `Its first step runs from its next run: ${PLAYBOOK_CARD_WORDS.asksFirst}.`,
      payload: { sequence_id: id },
    });
  const rec = await sequenceOnCard(t, id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  if (rec.sequence.state !== "draft")
    return refuse(
      `${rec.sequence.name} is ${rec.sequence.state}, not a draft: a paused one is resumed with action change (state running)`,
    );
  return propose({
    kind: "sequence_start",
    title: `Start ${rec.sequence.name}`,
    summary: `Its first step runs from its next run: ${PLAYBOOK_CARD_WORDS.asksFirst}, and after that ${SEQUENCE_MODE_WORDS[isSequenceMode(rec.sequence.mode) ? rec.sequence.mode : "ask"].does}.`,
    payload: { sequence_id: rec.sequence.id, name: rec.sequence.name },
  });
}

async function proposeLeave(
  t: ToolContext,
  input: { sequence_id: string; contact_ids?: string[]; lead_ids?: string[] },
): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(t, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const asked = new Set([...(input.contact_ids ?? []), ...(input.lead_ids ?? [])].map((x) => str(x, 40)));
  if (!asked.size) return refuse("name who leaves by contact_ids (people) or lead_ids (leads)");
  const people = (await load(t.rc, sequencePeople, { id: rec.sequence.id, limit: 500 })).data;
  const rows = people.rows.filter(
    (r) => r.enrollment_id && ((r.contact_id && asked.has(r.contact_id)) || (r.lead_id && asked.has(r.lead_id))),
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
  t: ToolContext,
  input: { sequence_id: string; send_id: string },
  group: "held" | "to_send",
): Promise<{ rec: SequenceRecordDto; name: string; send_id: string } | { refusal: string }> {
  const rec = await sequenceOnCard(t, input.sequence_id);
  if (isRefusal(rec)) return rec;
  const id = str(input.send_id, 40);
  if (!UUID.test(id)) return { refusal: "send_id must be an id sequences with action sequence returned" };
  const people = (await load(t.rc, sequencePeople, { id: rec.sequence.id, limit: 500 })).data;
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

const DECIDE_TITLE: Record<(typeof REACH_OUT_DECISIONS)[number], string> = {
  include: "Let it go as it is",
  rewrite: "Write its opening again",
  skip: "Leave it out of this batch",
  not_a_fit: "Set the business aside",
};

async function proposeSendDecide(
  t: ToolContext,
  input: { sequence_id: string; send_id: string; decision: (typeof REACH_OUT_DECISIONS)[number] },
): Promise<ProposalOutcome> {
  const on = await sendOnCard(t, input, "held");
  if (isRefusal(on)) return refuse(on.refusal);
  return propose({
    kind: "sequence_send_decide",
    title: `${DECIDE_TITLE[input.decision]}: ${on.name}`,
    summary: `The email to ${on.name} that the check held, in ${on.rec.sequence.name}. An email let go may be on its way at once, so nothing undoes it.`,
    payload: { send_id: on.send_id, decision: input.decision, name: on.name, sequence_id: on.rec.sequence.id },
  });
}

async function proposeSendSaid(
  t: ToolContext,
  input: { sequence_id: string; send_id: string; outcome: (typeof REACH_OUT_SAID_OUTCOMES)[number] },
): Promise<ProposalOutcome> {
  const on = await sendOnCard(t, input, "to_send");
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
 * hourly sweep's own, which waits for an OK where its class asks. Only where it runs on the business's day and no batch
 * waits for an OK (contracts sequenceRunsNow, the page's own rule); a batch that waits is action batch's.
 */
async function proposeRunNow(t: ToolContext, input: { sequence_id: string }): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(t, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const row = rec.sequence;
  if (row.needs.waiting > 0)
    return refuse(`${row.name} has a batch waiting for an OK: approve or skip it with action batch`);
  if (!row.first || !sequenceRunsNow(row, { tz: t.timezone, nowMs: t.now.getTime() }))
    return refuse(
      `${row.name} runs nothing today: only a sequence that is on, on a moment or a list and before its last day, runs now`,
    );
  return propose({
    kind: "playbook_run",
    title: `Run ${row.name} now`,
    summary:
      "Its first step runs now, as its hourly run would: it waits for an OK where its class asks, and outside the sending hours it goes when they open.",
    payload: { playbook_id: row.first.id, name: row.name, timezone: t.timezone },
  });
}

async function proposeDiscard(t: ToolContext, input: { sequence_id: string }): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(t, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  if (rec.sequence.state !== "draft" || rec.sequence.last)
    return refuse(`${rec.sequence.name} has been on: it is paused with action change (state paused), never taken away`);
  return propose({
    kind: "sequence_discard",
    title: `Let go of ${rec.sequence.name}`,
    summary: "A draft that never sent, taken away whole. Nothing undoes it.",
    payload: { sequence_id: rec.sequence.id },
  });
}

/** A cold email's step, as the model writes it: a subject (the first email's), its words and its wait. */
const COLD_STEP = z.object({
  subject: z
    .string()
    .optional()
    .describe("The email's subject; the steps after the first may leave it out to reply in the same thread."),
  body: z.string().describe("The email's words; {first_name} and {business_name} are filled for each business."),
  after_days: z
    .number()
    .int()
    .optional()
    .describe(
      `Days after the email before it, ${REACH_OUT_AFTER_DAYS.min} to ${REACH_OUT_AFTER_DAYS.max}; the first has none.`,
    ),
});

/**
 * Whether the workspace has a mailbox that sends now, as a new sequence's make reads it (00459: connected ones only); a
 * read that fails, none.
 */
async function hasMailbox(t: ToolContext): Promise<boolean> {
  const boxes = await mailboxConnectionsFor(t.ctx.supabase, t.tenantId).catch(() => []);
  return boxes.some((m) => m.state === "connected");
}

async function proposeColdEmail(
  t: ToolContext,
  input: {
    name: string;
    search_id: string;
    steps: z.output<typeof COLD_STEP>[];
    gap_minutes?: number;
    owner_sends?: boolean;
    signed_by?: string;
    include_unconfirmed?: boolean;
  },
): Promise<ProposalOutcome> {
  const searchId = str(input.search_id, 40);
  const token = stepNamed(t, searchId);
  let fedBy = `the leads step ${token} keeps`;
  if (token === null) {
    if (!UUID.test(searchId))
      return refuse("search_id must be a search or a list of leads from leads with action searches");
    try {
      const row = await searchRow(t.ctx, t.tenantId, searchId);
      fedBy = `“${row.name ?? "the search"}”`;
    } catch (e) {
      if (e instanceof AppError) return refuse(e.message);
      throw e;
    }
  }
  const chain = {
    name: str(input.name, 80),
    // A token is checked in the shape of the id it stands for, and kept as the token for the commit to fill.
    search_id: token === null ? searchId : "00000000-0000-4000-8000-000000000000",
    include_unconfirmed: input.include_unconfirmed ?? false,
    gap_minutes: input.gap_minutes ?? REACH_OUT_GAP_MINUTES[2],
    mailbox_ids: [],
    // Unsaid, it sends as a new sequence does (00459 sequence_create_leads): from the connected mailboxes while there
    // is one, else handed to the owner to send, so a sequence never waits on a mailbox nobody connected.
    owner_sends: input.owner_sends ?? !(await hasMailbox(t)),
    signed_by: input.signed_by?.trim() || null,
    steps: input.steps.map((s, i) => ({
      subject: s.subject?.trim() || null,
      body: s.body,
      after_days: i === 0 ? null : (s.after_days ?? REACH_OUT_AFTER_DAYS.first),
    })),
  };
  const checked = ReachOutChainSchema.safeParse(chain);
  if (!checked.success) return refuse(checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (checked.data.steps.length > REACH_OUT_STEPS_MAX) return refuse(`at most ${REACH_OUT_STEPS_MAX} emails`);
  const steps = checked.data.steps.map(
    (s, i) =>
      `${i === 0 ? "first" : after(s.after_days ?? 0)}: ${s.subject ? `“${s.subject}”` : "a reply in the same thread"}`,
  );
  return propose({
    kind: "reach_out_make",
    title: `Cold email: ${checked.data.name}`,
    summary: `To ${fedBy}, ${checked.data.owner_sends ? "each email handed to you to send from your own inbox" : "from your connected mailboxes"}, one every ${checked.data.gap_minutes} minutes: ${steps.join("; ")}. Its first run is planned once approved, and waits for your say before an email goes.`,
    // A plan step's token stays the token, for the commit to fill with the list that step made.
    payload: { chain: { ...checked.data, search_id: searchId } },
  });
}

const SEQUENCE_ID = z.string().describe("A sequence's id, from sequences with action list.");
const STEP_ID = z.string().describe("A step's id, from sequences with action sequence.");

export const propose_sequence = defineActions({
  name: "propose_sequence",
  description:
    "Propose what sends on its own, as a card the person approves (every such thing is a sequence): a message sent once, a sequence at a moment of the customer journey or on a list, a whole new sequence with its steps, a step added, changed, taken away or given new words, a draft started or let go, people taken out, a batch waiting for an OK approved or skipped, a sequence paused, resumed, renamed or retimed, its channels, a new saved message, and cold email to leads.",
  tail: `For an offer, a promotion or a whole setup, call propose_plan with action offer instead. Read sequences first: action list and action sequence for what exists and its ids, action lists for who can be sent and the messages a send may use, action moments for the moments offered. When nobody can be sent a message, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to, or no channel that can carry it now (the lists read says which); never propose a send to nobody. A starter the workspace does not hold yet is added at the card's Approve, a typed value left blank is refused in words, and a second running sequence on the same moment, list and message is refused unless they name it apart. A person reads campaign or sequence, never playbook or broadcast; the fields keep those names.`,
  actions: {
    once: broadcastAction,
    moment: playbookAction,
    make: actAction({
      kind: "sequence_make",
      input: z.object({
        first: z
          .record(z.string(), z.unknown())
          .describe("The first step, as action moment takes it, with its template_id."),
        then: z.array(THEN_STEP).describe(`Up to ${SEQUENCE_DRAFT_THEN_MAX} steps after the first.`),
        start: z.boolean().describe("true starts it once approved; false keeps it as a draft."),
      }),
      examples: [
        {
          first: { trigger: "quiet_30", template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70" },
          then: [{ after_days: 4, template_id: "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81", only_if: ["no_reply"] }],
          start: false,
        },
      ],
      label: "Preparing a sequence",
      words: `Action make proposes a whole new sequence to customers: first, its first step exactly as action moment takes it (a moment or a list, its message by template_id, its clock and channels), then up to ${SEQUENCE_DRAFT_THEN_MAX} steps after it (each a wait, what must still hold, its message), and start (true starts it once approved, false keeps it as a draft). Write each message first with action message where the Library has none, in a plan.`,
      build: proposeMake,
    }),
    step: actAction({
      kind: "sequence_step",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        step_id: STEP_ID.optional(),
        template_id: z.string().optional().describe("A new step's message."),
        after_days: STEP_FIELDS.after_days.optional(),
        only_if: STEP_FIELDS.only_if,
        channels: z.array(z.enum(CONSENT_CHANNELS)).optional().describe("The channels the step goes by."),
        name: STEP_FIELDS.name,
        params: STEP_FIELDS.params,
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          after_days: 5,
          template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
        },
      ],
      label: "Preparing a step",
      words:
        "Action step adds a step after the last (after_days and template_id), or changes one after the first by step_id: its wait, what must still hold, its channels, name or values. A step's message is changed with action words.",
      build: proposeStep,
    }),
    step_remove: actAction({
      kind: "sequence_step_remove",
      input: z.object({ sequence_id: SEQUENCE_ID, step_id: STEP_ID }),
      examples: [
        { sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", step_id: "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d" },
      ],
      label: "Preparing the step's removal",
      words: "Action step_remove takes away a step after the first, with the steps after it.",
      build: proposeStepRemove,
    }),
    words: actAction({
      kind: "sequence_words",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        step_id: STEP_ID,
        template_id: z.string().describe("The message the step sends from now."),
        params: STEP_FIELDS.params,
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          step_id: "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d",
          template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
        },
      ],
      label: "Preparing the new words",
      words:
        "Action words gives a step a different message from now (write it first with action message); where WhatsApp has to approve it, the step keeps sending its own until then.",
      build: proposeWords,
    }),
    start: actAction({
      kind: "sequence_start",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing the start",
      words:
        "Action start turns a draft on: its first step runs from its next run. A paused one is resumed with action change.",
      build: proposeStart,
    }),
    run_now: actAction({
      kind: "playbook_run",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing the run",
      words:
        "Action run_now runs a sequence's first step now, as its hourly run would: it waits for an OK where its class asks.",
      build: proposeRunNow,
    }),
    change: playbookChangeAction,
    channels: playbookChannelsAction,
    batch: runAction,
    leave: actAction({
      kind: "sequence_leave",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        contact_ids: z.array(z.string()).optional().describe("People in it, by their ids."),
        lead_ids: z.array(z.string()).min(1).max(LEAD_LIST_MAX).optional().describe("Leads in it, by their ids."),
      }),
      examples: [
        { sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", contact_ids: ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"] },
      ],
      label: "Preparing who leaves",
      words:
        "Action leave takes people or leads out of a sequence; a send of theirs not yet gone is skipped with them.",
      build: proposeLeave,
    }),
    decide: actAction({
      kind: "sequence_send_decide",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        send_id: z.string().describe("A held email's send_id, from sequences with action sequence (waiting_on_you)."),
        decision: z.enum(REACH_OUT_DECISIONS).describe("include, rewrite, skip or not_a_fit."),
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          send_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          decision: "include",
        },
      ],
      label: "Preparing the held email",
      words:
        "Action decide answers an email the check held: include lets it go as it is, rewrite writes its opening again, skip leaves it out of this batch, not_a_fit sets its business aside. Nothing undoes it.",
      build: proposeSendDecide,
    }),
    sent_by_hand: actAction({
      kind: "sequence_send_said",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        send_id: z
          .string()
          .describe("The send_id of an email handed over to send by hand, from sequences with action sequence."),
        outcome: z.enum(REACH_OUT_SAID_OUTCOMES).describe("sent or not_sent."),
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          send_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          outcome: "sent",
        },
      ],
      label: "Preparing what became of the email",
      words:
        "Action sent_by_hand records what became of an email handed over to send by hand from the business's own inbox: sent, or not_sent. Ask them; never say one went that they did not say.",
      build: proposeSendSaid,
    }),
    discard: actAction({
      kind: "sequence_discard",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing to let it go",
      words: "Action discard takes away a draft that never sent; one that has been on is paused instead.",
      build: proposeDiscard,
    }),
    message: messageAction,
    cold_email: actAction({
      kind: "reach_out_make",
      input: z.object({
        name: z.string().describe("What Campaigns calls it."),
        search_id: z
          .string()
          .describe(
            "The search or the list of leads it writes to (leads with action searches), or a plan step's token.",
          ),
        steps: z.array(COLD_STEP).describe(`One to ${REACH_OUT_STEPS_MAX} emails, the first with a subject.`),
        gap_minutes: z
          .number()
          .int()
          .optional()
          .describe(`Minutes between two emails: one of ${REACH_OUT_GAP_MINUTES.join(", ")}.`),
        owner_sends: z
          .boolean()
          .optional()
          .describe(
            "true hands each email to the owner to send from their own inbox; false sends from the connected mailboxes. Leave it out to send from the mailboxes when one is connected, else by the owner.",
          ),
        signed_by: z.string().optional().describe("Who signs the emails."),
        include_unconfirmed: z
          .boolean()
          .optional()
          .describe("true writes to addresses the check could not confirm too."),
      }),
      examples: [
        {
          name: "Businesses near you",
          search_id: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d",
          steps: [
            { subject: "A quick idea for {business_name}", body: "Hi {first_name}, ..." },
            { body: "Following up on my note last week.", after_days: 4 },
          ],
        },
      ],
      label: "Preparing a cold email sequence",
      words:
        "Action cold_email proposes a cold email sequence to the businesses of a search or a list of chosen leads (propose_leads with action list makes one): its emails, their waits and its pace, from the workspace's own mailboxes (or handed over to send by hand). Its first run is planned once approved and waits for their say before an email goes. Write like a person to one business; never claim a relationship that does not exist.",
      build: proposeColdEmail,
    }),
    leads: reachOutAddAction,
  },
});
