import "server-only";
import { z } from "zod";
import {
  FOLLOW_UP_CONDITIONS,
  LIFECYCLE_WORDS,
  PLAN_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  PLAYBOOK_STATES,
  PLAYBOOK_VETO_DELAY_WORDS,
  SEQUENCE_CARD_WORDS,
  SEQUENCE_EDIT_WORDS,
  SEQUENCE_FLOW_WORDS,
  SEQUENCE_WAIT_DAYS,
  campaignDayWords,
  effectiveMode,
  isPlaybookState,
  noteRows,
  planRun,
  trialDayWords,
  triggerOf,
  type FollowUpCondition,
  type PlaybookPatch,
  type PlaybookPolicyClass,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { checkPlaybookPatch, untilOf } from "@chanlytics/core";
import { listPolicies, playbookForChange } from "@chanlytics/db";
import { playbookPatchPorts } from "../../../campaigns/playbooks";
import { load } from "../../../readers";
import { sequence } from "../../../readers/sequences";
import {
  UUID,
  actAction,
  propose,
  refuse,
  stepNamed,
  str,
  unlessNotFound,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { paramSpecsOf } from "./playbook";
import { MODE_WORDS } from "./playbook-card";

/** Where a playbook's id is read, said as the model calls it. */
const PLAYBOOK_FROM = "campaigns with action playbooks";

/**
 * How a resumed playbook's runs go, in full (D7): under auto, that it sends on its own and nothing waits for approval, in
 * the drawer's Resume sentence (LIFECYCLE_WORDS.ledger.resume.auto), which a pause card's undo says too: one fact, one
 * sentence. `mode` is the one its runs go under (contracts effectiveMode): a campaign on trial goes as veto, and says so.
 */
const resumeDoes = (mode: string): string =>
  mode === "auto" ? LIFECYCLE_WORDS.ledger.resume.auto : (MODE_WORDS[mode] ?? mode);

/**
 * What a change of its trial says (00416): its last day, by the business's calendar (contracts trialDayWords), and what
 * the trial does, by its class's mode. Where a run sends by itself or after a Stop (contracts planRun: auto, veto) each
 * waits for a Stop; under ask or never the trial changes nothing, and the card says so with what a run does there,
 * never that each run waits for a Stop. Null ends it, which reads the same under any mode.
 */
function trialSaid(set: PlaybookPatch, how: { cls: string; classMode: string }, at: { tz: string; now: Date }): string {
  const day = trialDayWords(set, at.tz, at.now);
  if (!day || planRun(how.classMode, at.now).kind === "send") return PLAYBOOK_PATCH_WORDS.trial_until(day);
  return PLAYBOOK_PATCH_WORDS.trialInert(day, how.cls, how.classMode, MODE_WORDS[how.classMode] ?? how.classMode);
}

/**
 * A change's parts, in the card's words and the keys' order. Its words are quoted as the run fills them; its last day
 * is said by the business's calendar at `at` (contracts campaignDayWords: "Nov 30"), and its trial by trialSaid.
 */
function changeParts(
  set: PlaybookPatch,
  was: PlaybookPatch,
  how: { cls: string; mode: string; classMode: string; waits: number | null },
  at: { tz: string; now: Date },
) {
  const W = PLAYBOOK_PATCH_WORDS;
  const parts: string[] = [];
  if (set.state === "paused") parts.push(W.paused, ...(how.waits === null ? [] : [W.pausedWaits(how.waits)]));
  if (set.state === "running") parts.push(W.resumed(how.cls, how.mode, resumeDoes(how.mode)));
  if (set.name !== undefined) parts.push(W.name(set.name));
  for (const k of ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const) {
    const to = set[k];
    if (to !== undefined) parts.push(W[k](to, was[k] ?? to));
  }
  if (set.params !== undefined) parts.push(W.params(set.params));
  if (set.until !== undefined) parts.push(W.until(set.until && campaignDayWords(set.until, at.tz, at.now)));
  if (set.trial_until !== undefined) parts.push(trialSaid(set, how, at));
  return parts;
}

/** A change as the model asks it: the patch's keys, its message's values as slot text (as action playbook takes them). */
type ChangeAsked = Omit<PlaybookPatch, "params"> & { playbook_id: string; params?: string[] };

/**
 * A change to the campaign an earlier step of Ask's plan makes (`@step:n`, context.ts stepNamed), today named by no plan:
 * there is no row to judge it against yet, so it takes only what is said without one (a pause, new words, a last day),
 * each judged as a value by its own judge (paramSpecsOf; core untilOf), and the PUT judges it against the campaign at
 * its press, the token filled with the campaign's id by then. The card says the campaign is the one step `step` makes.
 */
async function proposeChangeOnStep(t: ToolContext, input: ChangeAsked, step: number): Promise<ProposalOutcome> {
  const { playbook_id: token, state, params, until, ...rest } = input;
  const others = Object.values(rest).some((v) => v !== undefined);
  if (others || (state !== undefined && state !== "paused")) return refuse(PLAN_WORDS.stepChangeOnly(step));
  const words = params === undefined ? undefined : paramSpecsOf(params);
  if (words && "refusal" in words) return refuse(words.refusal);
  let end: string | null | undefined;
  try {
    end = await untilOf({ timezone: () => Promise.resolve(t.timezone) }, until, { now: t.now, undo: false });
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const named: PlaybookPatch = {
    ...(state ? { state } : {}),
    ...(words ? { params: words.specs } : {}),
    ...(end ? { until: end } : {}),
  };
  if (Object.keys(named).length === 0) return refuse(PLAYBOOK_PATCH_WORDS.nothing);
  const name = PLAN_WORDS.stepCampaign(step);
  const at = { tz: t.timezone, now: t.now };
  return propose({
    kind: "playbook_change",
    title: PLAYBOOK_PATCH_WORDS.title(named, name),
    // A pause, words and an end need nothing of the campaign's row to be said.
    summary: changeParts(named, {}, { cls: "", mode: "ask", classMode: "ask", waits: null }, at).join(" · "),
    payload: {
      playbook_id: str(token, 40),
      playbook_name: name,
      ...named,
      was: {},
      run_waits: false,
      timezone: t.timezone,
    },
  });
}

/**
 * A playbook that exists, paused, resumed, renamed or retimed (the moment spec §4.9 A5), and since 00416 given new
 * words, a last day or a trial's end (D5: null ends its trial): what its drawer does, proposed as a card. It reads the
 * one playbook (packages/db playbookForChange: its row, and a run of it that waits), never the Playbooks page, and judges
 * what is asked by the PUT's own judgement (core checkPlaybookPatch, against the playbook as it stands), so a value its
 * Approve would refuse is refused here in the same words. The card carries what changes and what each field held, and
 * nothing else of the playbook, so its Approve and its Undo change nothing else. A pause leaves a run that waits
 * waiting, and says so (D8); a resume says its class's mode, in full under auto (D7). A reach-out's step is changed on
 * its own sheet, never here.
 */
async function proposePlaybookChange(t: ToolContext, input: ChangeAsked): Promise<ProposalOutcome> {
  // The campaign an earlier step of Ask's plan makes, named by its token: no row to read yet (proposeChangeOnStep).
  const step = stepNamed(t, str(input.playbook_id, 40));
  if (step !== null) return proposeChangeOnStep(t, input, step);
  // An id is one id in either case: the pattern takes both, so the row is asked for as the table writes it.
  const id = str(input.playbook_id, 40).toLowerCase();
  if (!UUID.test(id)) return refuse(`playbook_id must be a playbook's id, as ${PLAYBOOK_FROM} gives it`);
  const read = await playbookForChange(t.ctx.supabase, t.tenantId, id);
  if (!read) return refuse(`no such playbook in this workspace; ${PLAYBOOK_FROM} names them`);
  if (triggerOf(read.trigger)?.kind === "reach_out")
    return refuse("a reach-out is changed on its own sheet: say so, and open campaigns");
  // The table's check holds a state to the two; one it does not know is no row a change is judged against (the PUT's rule).
  if (!isPlaybookState(read.state))
    throw new Error(`playbook ${read.id} holds a state the check does not: ${read.state}`);
  const row = { ...read, state: read.state };
  // The playbook is a row the answer may cite, opened where its drawer is.
  noteRows(t.read, [{ kind: "playbook" as const, id: row.id, route: `campaigns/moment:${row.id}`, label: row.name }]);
  // Its words as the model writes them ("@first_name", typed text), turned into the specs the route stores as a new
  // playbook's are (act/playbook.ts paramSpecsOf); core then holds them to its message's slots.
  const words = input.params === undefined ? undefined : paramSpecsOf(input.params);
  if (words && "refusal" in words) return refuse(words.refusal);
  const given: PlaybookPatch = { ...input, params: words?.specs };
  const asked = Object.fromEntries(PLAYBOOK_PATCH_KEYS.filter((k) => given[k] !== undefined).map((k) => [k, given[k]]));
  let judged: { set: PlaybookPatch; was: PlaybookPatch };
  try {
    // A card is never an undo: its dates are still to come.
    judged = await checkPlaybookPatch(playbookPatchPorts(t.ctx, t.tenantId), row, asked, { now: t.now, undo: false });
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const { set, was } = judged;
  if (Object.keys(set).length === 0) return refuse(PLAYBOOK_PATCH_WORDS.same(row.name));
  // The table's check holds the class to the set (playbooks.policy_class).
  const cls = PLAYBOOK_CLASS_LABEL[row.policy_class as PlaybookPolicyClass];
  // The mode its runs go under, read for a resume, which says it (D7: under auto a resume sends on its own), for a
  // pause, whose undo resumes it and says it the same way, and for a trial set, whose words follow it (trialSaid). A
  // resume or a trial whose read fails makes no card: the card would say a mode it does not know, in the words a new
  // campaign's card declines in (PLAYBOOK_CARD_REFUSALS.modeUnread). A pause needs none, so it is still a card, and its
  // undo claims no mode (`mode` null); a trial ended says the same under any mode.
  const trialSet = typeof set.trial_until === "string";
  const policies = set.state || trialSet ? await listPolicies(t.ctx.supabase, t.tenantId).catch(() => null) : [];
  if (!policies && (set.state === "running" || trialSet)) return refuse(PLAYBOOK_CARD_REFUSALS.modeUnread);
  // A class with no row of its own runs under ask, as a run reads it (core run-playbook). And a run goes as the campaign
  // will stand after this change: under auto while it is on trial, as veto does (contracts effectiveMode, 00416), so the
  // card and a pause's undo say how its runs go, never its class's mode alone.
  const classMode = policies ? (policies.find((r) => r.class === row.policy_class)?.mode ?? "ask") : null;
  const mode = classMode === null ? null : effectiveMode({ ...row, ...set }, classMode, t.now);
  const waits = row.waiting ? row.waiting.recipient_count : null;
  return propose({
    kind: "playbook_change",
    title: PLAYBOOK_PATCH_WORDS.title(set, row.name),
    summary: changeParts(
      set,
      was,
      { cls, mode: mode ?? "ask", classMode: classMode ?? "ask", waits },
      { tz: t.timezone, now: t.now },
    ).join(" · "),
    payload: {
      playbook_id: row.id,
      playbook_name: row.name,
      ...set,
      was,
      run_waits: row.waiting !== null,
      timezone: t.timezone,
      // A pause's undo resumes it: the mode it would resume under, as read now (contracts playbookChangeSpec's undo).
      ...(set.state === "paused" ? { mode } : {}),
    },
  });
}

/** A playbook that exists, changed in place: propose_campaign's action change. */
export const playbookChangeAction = actAction({
  kind: "playbook_change",
  input: z.object({
    playbook_id: z.string(),
    state: z.enum(PLAYBOOK_STATES).optional(),
    name: z.string().optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    gap_days: z.number().optional(),
    cadence_days: z.number().optional(),
    params: z.array(z.string()).optional(),
    until: z.string().optional(),
    trial_until: z.string().nullable().optional(),
  }),
  examples: [
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", state: "paused" },
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", name: "Win-back for past clients", run_hour: 9 },
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", params: ["@first_name", "15% off"], until: "2026-11-30" },
  ],
  label: "Preparing a campaign's change",
  words: `Action change takes playbook_id, a playbook that exists, as ${PLAYBOOK_FROM} gives it (or the page's rows), and only what they asked to change: state (paused stops its next runs; running starts them again under its class's autonomy mode), name (at most ${PLAYBOOK_NAME_MAX} characters), run_hour (${PLAYBOOK_LIMITS.run_hour.min} to ${PLAYBOOK_LIMITS.run_hour.max} by the business's clock), cap_per_run (${PLAYBOOK_LIMITS.cap_per_run.min} to ${PLAYBOOK_LIMITS.cap_per_run.max} people a run), gap_days (${PLAYBOOK_LIMITS.gap_days.min} to ${PLAYBOOK_LIMITS.gap_days.max} days before a person is reached again), cadence_days (${PLAYBOOK_LIMITS.cadence_days.min} to ${PLAYBOOK_LIMITS.cadence_days.max}, the month's offer alone), params (its message's values in order, as action playbook takes them: new text in the same message, never a new message), until (its last day, YYYY-MM-DD by the business's clock, today or later; it runs nothing after) or trial_until (an ISO time still to come, with its offset, until which each run its class would send on its own waits ${PLAYBOOK_VETO_DELAY_WORDS} for a Stop, or null to end its trial now). Nothing else about it moves: its moment, message and list are its drawer's, and its channels are action channels'. A run already waiting for approval stays waiting after a pause, and the card says so: propose action run with verb skip beside it when they want that run gone. A reach-out's step, a value outside its bounds and a playbook that already reads so are refused in words.`,
  build: proposePlaybookChange,
});

/* ------------------------------------------------ a sequence's steps (decision 0060; the parity review's W1) */

/** Where a sequence's id and its steps' ids are read, said as the model calls it. */
const SEQUENCE_FROM = "campaigns with action sequence";

/**
 * What the model asks, in as few fields as the tools block holds (its ceiling): a step named, or none for a new one at
 * the end; its wait, its words, or `remove`. The card says which of the page's verbs it is by its `op`.
 */
type SequenceAsked = {
  sequence_id: string;
  step_id?: string;
  after_days?: number;
  only_if?: string[];
  template_id?: string;
  params?: string[];
  remove?: boolean;
};

const isCondition = (c: string): c is FollowUpCondition => (FOLLOW_UP_CONDITIONS as readonly string[]).includes(c);

/** A wait in days the door takes (00441: one to ninety), or a refusal in the model's words. */
const waitOf = (days: number | undefined): number | string | null =>
  days === undefined
    ? null
    : Number.isInteger(days) && days >= SEQUENCE_WAIT_DAYS.min && days <= SEQUENCE_WAIT_DAYS.max
      ? days
      : `after_days is ${SEQUENCE_WAIT_DAYS.min} to ${SEQUENCE_WAIT_DAYS.max} whole days`;

/** The step's message and its values as the door stores them (act/playbook.ts paramSpecsOf), or a refusal. */
function stepWordsOf(input: SequenceAsked): { template_id: string; params: unknown[] } | string {
  const template = str(input.template_id, 40);
  if (!UUID.test(template)) return "template_id must be a message's id, as campaigns with action audiences lists it";
  const specs = paramSpecsOf(input.params ?? []);
  return "refusal" in specs ? specs.refusal : { template_id: template, params: specs.specs };
}

/** What a sequence card is asked over: the sequence read as its record reads it, the step named, and its wait. */
interface SequenceAsk {
  input: SequenceAsked;
  row: SequenceRecordDto["sequence"];
  steps: SequenceStepDto[];
  step: SequenceStepDto | null;
  wait: number | null;
  onlyIf: FollowUpCondition[] | undefined;
}

const CARD = SEQUENCE_CARD_WORDS;

/** A step after the first taken away, with the steps after it. */
function proposeStepRemove({ row, step }: SequenceAsk): ProposalOutcome {
  if (!step || step.place === 1) return refuse("say which step after the first to take away, by its step_id");
  return propose({
    kind: "sequence",
    title: CARD.remove(step.place, row.name),
    summary: SEQUENCE_FLOW_WORDS.takeAwayDetail,
    payload: { sequence_id: row.id, op: "remove", step_id: step.id },
  });
}

/** A step's new message: at once, or waiting for WhatsApp while the step sends its own. Its wait is another card. */
function proposeStepWords({ input, row, step, wait, onlyIf }: SequenceAsk): ProposalOutcome {
  if (!step) return refuse("say which step takes the new words, by its step_id");
  if (wait !== null || onlyIf) return refuse("change a step's words and its wait in two cards, one at a time");
  const words = stepWordsOf(input);
  if (typeof words === "string") return refuse(words);
  return propose({
    kind: "sequence",
    title: CARD.words(step.place, row.name),
    summary: `${SEQUENCE_EDIT_WORDS.reaches(step.place === 1)} · ${SEQUENCE_EDIT_WORDS.whatsAppFirst}`,
    payload: { sequence_id: row.id, op: "words", step_id: step.id, ...words },
  });
}

/** A step after the first given a new wait, or a new condition: what reaches everyone who gets the step before from now. */
function proposeStepWait({ row, step, wait, onlyIf }: SequenceAsk & { step: SequenceStepDto }): ProposalOutcome {
  if (step.place === 1) return refuse("the first step goes at its moment and has no wait: change its hour on the page");
  if (wait === null && onlyIf === undefined) return refuse("say the step's new after_days or only_if");
  return propose({
    kind: "sequence",
    title: CARD.wait(step.place, row.name),
    summary: `${CARD.after(wait ?? step.after_days ?? 1, onlyIf ?? step.only_if)} · ${SEQUENCE_EDIT_WORDS.reaches(false)}`,
    payload: {
      sequence_id: row.id,
      op: "step",
      step_id: step.id,
      ...(wait !== null ? { after_days: wait } : {}),
      ...(onlyIf ? { only_if: onlyIf } : {}),
    },
  });
}

/** A step at the end, with its message, its wait (three days unless said) and what must still hold (no booking). */
function proposeStepAdd({ input, row, steps, wait, onlyIf }: SequenceAsk): ProposalOutcome {
  const words = stepWordsOf(input);
  if (typeof words === "string") return refuse(words);
  const days = wait ?? 3;
  const holds = onlyIf ?? ["no_booking"];
  return propose({
    kind: "sequence",
    title: CARD.add(steps.length + 1, row.name),
    summary: CARD.after(days, holds),
    payload: { sequence_id: row.id, op: "step", after_days: days, only_if: holds, ...words },
  });
}

/**
 * A sequence that exists, changed by one of its page's own verbs: a step after the first added at the end, or its wait
 * changed (op step), a step given new words (op words), or a step after the first taken away with the steps after it
 * (op remove). It reads the sequence as its record does (readers/sequences.ts), so a step is named by the id the read
 * gave, and what the door would refuse (a sequence that takes no steps, the first step's wait, a wait out of bounds) is
 * refused here in words; the door judges the message against its values as the page's editor does. Its state, name and a
 * batch's OK are action change's and action run's.
 */
async function proposeSequence(t: ToolContext, input: SequenceAsked): Promise<ProposalOutcome> {
  const id = str(input.sequence_id, 40).toLowerCase();
  if (!UUID.test(id)) return refuse(`sequence_id must be a sequence's id, as ${SEQUENCE_FROM}s gives it`);
  const read = await unlessNotFound(load(t.rc, sequence, { id }));
  if (!read) return refuse(`no such sequence in this workspace; ${SEQUENCE_FROM}s names them`);
  noteRows(t.read, read.rows);
  const { sequence: row, steps } = read.data;
  if (row.starts !== "moment" && row.starts !== "list")
    return refuse("only a customer's sequence, on a moment or a list, takes steps after its first; say so");
  const named = input.step_id ? str(input.step_id, 40).toLowerCase() : null;
  const step = named ? (steps.find((s) => s.id === named) ?? null) : null;
  if (named && !step) return refuse(`step_id must be one of its steps' step_id, as ${SEQUENCE_FROM} gives them`);
  const wait = waitOf(input.after_days);
  if (typeof wait === "string") return refuse(wait);
  if (input.only_if && !input.only_if.every(isCondition))
    return refuse(`only_if holds ${FOLLOW_UP_CONDITIONS.join(" or ")}, or both`);
  const onlyIf = input.only_if ? [...new Set(input.only_if.filter(isCondition))] : undefined;
  const ask: SequenceAsk = { input, row, steps, step, wait, onlyIf };
  if (input.remove) return proposeStepRemove(ask);
  if (step && input.template_id) return proposeStepWords(ask);
  return step ? proposeStepWait({ ...ask, step }) : proposeStepAdd(ask);
}

/** A sequence that exists, changed: propose_campaign's action sequence. */
export const sequenceAction = actAction({
  kind: "sequence",
  input: z.object({
    sequence_id: z.string(),
    step_id: z.string().optional(),
    after_days: z.number().optional(),
    only_if: z.array(z.string()).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    remove: z.boolean().optional(),
  }),
  label: "Preparing a sequence's change",
  examples: [
    {
      sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
      after_days: 7,
      only_if: ["no_booking"],
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
    },
  ],
  words: `Action sequence changes a customer's sequence (ids from ${SEQUENCE_FROM}): a step's after_days (${SEQUENCE_WAIT_DAYS.min} to ${SEQUENCE_WAIT_DAYS.max}), only_if (${FOLLOW_UP_CONDITIONS.join(", ")}), template_id and params, or remove true; no step_id adds one.`,
  build: proposeSequence,
});
