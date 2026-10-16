import "server-only";
import { z } from "zod";
import {
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
  campaignDayWords,
  clockHour,
  effectiveMode,
  isPlaybookState,
  noteRows,
  planRun,
  trialDayWords,
  triggerOf,
  type PlaybookPatch,
  type PlaybookPatchKey,
  type PlaybookPolicyClass,
} from "@chanlytics/contracts";
import { checkPlaybookPatch, untilOf } from "@chanlytics/core";
import { listPolicies, playbookForChange } from "@chanlytics/db";
import { playbookPatchPorts } from "../../../campaigns/playbooks";
import { UUID, actAction, propose, refuse, stepNamed, str, type ProposalOutcome, type ToolContext } from "../context";
import { paramSpecsOf } from "./playbook";
import { MODE_WORDS } from "./playbook-card";

/** Where a playbook's id is read, said as the model calls it. */
const PLAYBOOK_FROM = "sequences with action moments";

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

/**
 * What a change asked that the campaign already holds: the keys asked that its judgement (core checkPlaybookPatch) left
 * out of `set`, each with the value asked, which is the one it holds. The card leaves them as they are and says so.
 */
function heldAlready(given: PlaybookPatch, set: PlaybookPatch): PlaybookPatch {
  const held: PlaybookPatch = { ...given };
  for (const k of PLAYBOOK_PATCH_KEYS) if (given[k] === undefined || k in set) delete held[k];
  return held;
}

/** Each part a campaign already holds, as the campaign stands (the value asked, which is its own). */
const ALREADY: Record<PlaybookPatchKey, (held: PlaybookPatch) => string> = {
  state: (h) => (h.state === "paused" ? "is already paused" : "is already running"),
  name: (h) => `is already named “${h.name ?? ""}”`,
  run_hour: (h) => `already runs at ${clockHour(h.run_hour ?? 0)}`,
  cap_per_run: (h) => `already reaches up to ${h.cap_per_run ?? 0} people a run`,
  gap_days: (h) => `already waits ${h.gap_days ?? 0} days before reaching a person again`,
  cadence_days: (h) => `already runs every ${h.cadence_days ?? 0} days`,
  params: () => "already says those words",
  until: (h) => (h.until ? "already ends that day" : "already has no last day"),
  trial_until: (h) => (h.trial_until ? "is already on trial until then" : "is already off trial"),
};

/**
 * What a change asked that the campaign already holds, in one sentence, said on its card and beside it. Null where it
 * holds none of it.
 */
function alreadyHeldWords(name: string, held: PlaybookPatch): string | null {
  const parts = PLAYBOOK_PATCH_KEYS.filter((k) => k in held).map((k) => ALREADY[k](held));
  const last = parts.pop();
  if (last === undefined) return null;
  return `“${name}” ${parts.length ? `${parts.join(", ")} and ${last}` : last}, so the card leaves that as it is`;
}

/**
 * What a change says beside its card besides what it changes (the operator stress run, 15 Oct 2026: "pause the Win-back
 * and make it send twice as often", of a Win-back already paused, made the gap's card 3 of 3 and never said it was
 * paused, and the model, seeing it paused, asked the gap alone): a part asked that it already holds, and that a campaign
 * left paused runs none of a change to its runs until it is resumed. Undefined where there is nothing to say.
 */
function changeNoted(row: { name: string; state: string }, given: PlaybookPatch, set: PlaybookPatch) {
  const held = alreadyHeldWords(row.name, heldAlready(given, set));
  const runs = PLAYBOOK_PATCH_KEYS.some((k) => k !== "state" && k !== "name" && k in set);
  const paused =
    row.state === "paused" && given.state === undefined && runs
      ? `“${row.name}” is paused, so none of this runs until it is resumed`
      : null;
  return [held, paused].filter((s) => s !== null).join("; ") || undefined;
}

/** A change as the model asks it: the patch's keys, its message's values as slot text (as action moment takes them). */
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
  // A part asked that it holds already (a pause of one paused) is no part of the card, and a change to a paused one's
  // runs waits for its resume: each said on the card and beside it.
  const noted = changeNoted(row, given, set);
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
  return propose(
    {
      kind: "playbook_change",
      title: PLAYBOOK_PATCH_WORDS.title(set, row.name),
      summary: [
        ...changeParts(
          set,
          was,
          { cls, mode: mode ?? "ask", classMode: classMode ?? "ask", waits },
          { tz: t.timezone, now: t.now },
        ),
        ...(noted ? [noted] : []),
      ].join(" · "),
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
    },
    noted,
  );
}

/** A playbook that exists, changed in place: propose_sequence's action change. */
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
  words: `Action change takes playbook_id, a playbook that exists, as ${PLAYBOOK_FROM} gives it (or the page's rows), and only what they asked to change: state (paused stops its next runs; running starts them again under its class's autonomy mode), name (at most ${PLAYBOOK_NAME_MAX} characters), run_hour (${PLAYBOOK_LIMITS.run_hour.min} to ${PLAYBOOK_LIMITS.run_hour.max} by the business's clock), cap_per_run (${PLAYBOOK_LIMITS.cap_per_run.min} to ${PLAYBOOK_LIMITS.cap_per_run.max} people a run), gap_days (${PLAYBOOK_LIMITS.gap_days.min} to ${PLAYBOOK_LIMITS.gap_days.max} days before a person is reached again), cadence_days (${PLAYBOOK_LIMITS.cadence_days.min} to ${PLAYBOOK_LIMITS.cadence_days.max}, the month's offer alone), params (its message's values in order, as action moment takes them: new text in the same message, never a new message), until (its last day, YYYY-MM-DD by the business's clock, today or later; it runs nothing after) or trial_until (an ISO time still to come, with its offset, until which each run its class would send on its own waits ${PLAYBOOK_VETO_DELAY_WORDS} for a Stop, or null to end its trial now). Nothing else about it moves: its moment, message and list are its drawer's, and its channels are action channels'. A run already waiting for approval stays waiting after a pause, and the card says so: propose action batch with verb skip beside it when they want that run gone. A reach-out's step, a value outside its bounds and a playbook that already reads so are refused in words; a part of the change it already holds (a pause of one paused) is left off the card, which says so, and the answer says it too.`,
  build: proposePlaybookChange,
});
