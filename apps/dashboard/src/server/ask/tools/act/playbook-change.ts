import "server-only";
import { z } from "zod";
import {
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  PLAYBOOK_STATES,
  isPlaybookState,
  noteRows,
  triggerOf,
  type PlaybookPatch,
  type PlaybookPolicyClass,
} from "@chanlytics/contracts";
import { checkPlaybookPatch } from "@chanlytics/core";
import { listPolicies, playbookForChange } from "@chanlytics/db";
import { archivedListRefusal } from "../../../campaigns/playbooks";
import { UUID, actAction, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";
import { MODE_WORDS } from "./playbook";

/** Where a playbook's id is read, said as the model calls it. */
const PLAYBOOK_FROM = "campaigns with action playbooks";

/** How a resumed playbook's runs go, in full (D7): under auto, that nobody approves a run before it sends. */
const resumeDoes = (mode: string): string =>
  mode === "auto"
    ? `${MODE_WORDS.auto}, unattended: nobody approves a run before it sends`
    : (MODE_WORDS[mode] ?? mode);

/** A change's parts, in the card's words and the keys' order. */
function changeParts(set: PlaybookPatch, was: PlaybookPatch, how: { cls: string; mode: string; waits: number | null }) {
  const W = PLAYBOOK_PATCH_WORDS;
  const parts: string[] = [];
  if (set.state === "paused") parts.push(W.paused, ...(how.waits === null ? [] : [W.pausedWaits(how.waits)]));
  if (set.state === "running") parts.push(W.resumed(how.cls, how.mode, resumeDoes(how.mode)));
  if (set.name !== undefined) parts.push(W.name(set.name));
  for (const k of ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const) {
    const to = set[k];
    if (to !== undefined) parts.push(W[k](to, was[k] ?? to));
  }
  return parts;
}

/**
 * A playbook that exists, paused, resumed, renamed or retimed (the moment spec §4.9 A5): what its drawer does, proposed
 * as a card. It reads the one playbook (packages/db playbookForChange: its row, and a run of it that waits), never the
 * Playbooks page, and judges what is asked by the PUT's own judgement (core checkPlaybookPatch, against the playbook as
 * it stands), so a value its Approve would refuse is refused here in the same words. The card carries what changes and
 * what each field held, and nothing else of the playbook, so its Approve and its Undo change nothing else. A pause leaves
 * a run that waits waiting, and says so (D8); a resume says its class's mode, in full under auto (D7). A reach-out's step
 * is changed on its own sheet, never here.
 */
async function proposePlaybookChange(
  t: ToolContext,
  input: PlaybookPatch & { playbook_id: string },
): Promise<ProposalOutcome> {
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
  const asked = Object.fromEntries(PLAYBOOK_PATCH_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
  let judged: { set: PlaybookPatch; was: PlaybookPatch };
  try {
    judged = await checkPlaybookPatch({ archivedList: (r) => archivedListRefusal(t.ctx, r) }, row, asked);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const { set, was } = judged;
  if (Object.keys(set).length === 0) return refuse(PLAYBOOK_PATCH_WORDS.same(row.name));
  // The table's check holds the class to the set (playbooks.policy_class).
  const cls = PLAYBOOK_CLASS_LABEL[row.policy_class as PlaybookPolicyClass];
  // The mode its runs go under, read only for a resume, the one card that says it (D7: under auto a resume sends
  // unattended). A read that fails makes no card: the card would say a mode it does not know.
  const policies = set.state === "running" ? await listPolicies(t.ctx.supabase, t.tenantId).catch(() => null) : [];
  if (!policies)
    return refuse(
      `the sending mode of “${cls}” could not be read just now, so a resume cannot say what its runs would do; say so, and try again in a moment`,
    );
  // A class with no row of its own runs under ask, as a run reads it (core run-playbook).
  const mode = policies.find((r) => r.class === row.policy_class)?.mode ?? "ask";
  const waits = row.waiting ? row.waiting.recipient_count : null;
  return propose({
    kind: "playbook_change",
    title: PLAYBOOK_PATCH_WORDS.title(set, row.name),
    summary: changeParts(set, was, { cls, mode, waits }).join(" · "),
    payload: {
      playbook_id: row.id,
      playbook_name: row.name,
      ...set,
      was,
      run_waits: row.waiting !== null,
      timezone: t.timezone,
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
  }),
  examples: [
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", state: "paused" },
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", name: "Win-back for past clients", run_hour: 9 },
  ],
  label: "Preparing a campaign's change",
  words: `Action change takes playbook_id, a playbook that exists, as ${PLAYBOOK_FROM} gives it (or the page's rows), and only what they asked to change: state (paused stops its next runs; running starts them again under its class's autonomy mode), name (at most ${PLAYBOOK_NAME_MAX} characters), run_hour (${PLAYBOOK_LIMITS.run_hour.min} to ${PLAYBOOK_LIMITS.run_hour.max} by the business's clock), cap_per_run (${PLAYBOOK_LIMITS.cap_per_run.min} to ${PLAYBOOK_LIMITS.cap_per_run.max} people a run), gap_days (${PLAYBOOK_LIMITS.gap_days.min} to ${PLAYBOOK_LIMITS.gap_days.max} days before a person is reached again) or cadence_days (${PLAYBOOK_LIMITS.cadence_days.min} to ${PLAYBOOK_LIMITS.cadence_days.max}, the month's offer alone). Nothing else about it moves: its moment, message and list are its drawer's, and its channels are action channels'. A run already waiting for approval stays waiting after a pause, and the card says so: propose action run with verb skip beside it when they want that run gone. A reach-out's step, a value outside its bounds and a playbook that already reads so are refused in words.`,
  build: proposePlaybookChange,
});
