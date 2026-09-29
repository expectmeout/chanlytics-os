/**
 * A reach-out run on Broadcasts (Reach out, Part 4 PR 7; F13, R20–R22): the block its run draws for as long as it is
 * live, waiting for its owner or not. What approvalWordsOf says of a run waiting (its share and the rest, the held with
 * their doors, how many are still being checked, the first ready business's email), and around it what a live run says
 * whatever its state: the skipped by reason, who gets it (the checked only), and the notice the check sends the first
 * time it holds a send in a run that is not waiting. Pure: the page and the edge say every sentence from here.
 */
import { clockWhen } from "../shared/clock";
import { plural } from "../shared/words";
import type { ReachOutRunDto } from "./reach-out-dtos";
import { holdDoors, HOLD_DOOR_WORDS, type ReachOutHold } from "./reach-out-words";
import { approvalWordsOf, chainPaceOf } from "./reach-out-sheet";

/** Why a send of the run was skipped, as the block's line says it after the count. */
function skippedReasonWords(reason: string): string {
  switch (reason) {
    case "closed_every_day":
      return "keep no open hour all week";
    case "missing_value":
      return "missing a value your words name";
    case "owner_skipped":
      return "skipped by you";
    case "owner_stopped":
    case "outreach_stopped":
      return "you stopped writing to them";
    case "not_a_fit":
      return "marked Not a fit";
    case "kept_waiting":
      return "waited past fourteen days";
    case "step_removed":
      return "their step was removed";
    case "run_canceled":
      return "the run was stopped";
    case "erased":
      return "their record was erased";
    default:
      return "could not be written to";
  }
}

/** The skipped, most first, one line each: "3 skipped · keep no open hour all week". */
function skippedWordsOf(skipped: Record<string, number>): string[] {
  return Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) => `${n} skipped · ${skippedReasonWords(reason)}`);
}

/** A live run's state as the block's head says it; a run waiting is the approval sheet's own. */
const STATE_WORDS: Record<string, string> = {
  pending_approval: "Waiting on you",
  scheduled: "Scheduled",
  sending: "Sending",
};

/**
 * The block a live reach-out run draws (R20): approvalWordsOf for a run waiting on its owner, and for one that is
 * scheduled or sending, the same facts without an Approve (it was approved, or its mode was veto). `today` is the
 * workspace's day, `now` the moment it is said and `timezone` the zone; the share a day is the run's own domains' (R22).
 */
export function reachOutRunWordsOf(
  r: ReachOutRunDto,
  p: { state: string; timezone: string; today: string; now: number },
) {
  const share = chainPaceOf(r).share;
  const a = approvalWordsOf(r, { timezone: p.timezone, share, today: p.today, now: p.now });
  const waiting = p.state === "pending_approval";
  const earlier = !!r.run_for && r.run_for < p.today;
  // Who gets it: only the checked, ready sends, by name and time (R21); the rest are being checked.
  const checked = r.planned.filter((x) => x.checked);
  const step = r.step_n === null ? "a step since removed" : `step ${r.step_n + 1}`;
  return {
    ...a,
    k: STATE_WORDS[p.state] ?? "Reach-out",
    sub: waiting
      ? a.sub
      : `Reach-out · ${step} · ${p.state === "sending" ? "going now" : "goes"}, one every ${r.gap_minutes} minutes as each business opens`,
    approve: waiting ? a.approve : null,
    approveNote: waiting ? a.approveNote : null,
    note: waiting ? a.note : null,
    skipped: skippedWordsOf(r.skipped),
    // Today's and the coming days' as the reach line counts them: "See the 30 today and 12 later".
    see:
      checked.length === 0
        ? null
        : checked.length > r.today
          ? `See the ${r.today} today and ${checked.length - r.today} later`
          : `See the ${checked.length}`,
    // By day and time; a run from an earlier day, or a time already past, is re-timed when it goes, never a past time.
    list: checked.map((x) => {
      const ms = Date.parse(x.send_at);
      const retimed = earlier || Number.isNaN(ms) || ms <= p.now;
      return { id: x.send_id, name: x.business_name, at: retimed ? RETIMED : clockWhen(ms, p.timezone, p.now) };
    }),
    skipAsk: `Skip ${r.chain_name}'s run?`,
    // What Approve released, as the flash says it: the checked sends due today, never the run's whole count (R21).
    // Nothing today (planned after hours, or on a closed day) says when they go instead of "0 emails today".
    approved:
      r.today === 0 && r.later > 0
        ? `${r.chain_name} approved — ${plural(r.later, "email", "emails")} in the coming days, in their hours`
        : `${r.chain_name} approved — ${plural(r.today, "email", "emails")} today, in their hours`,
    labels: REACH_OUT_RUN_LABELS,
    listHead:
      r.checking > 0 ? `Who gets it · ${plural(r.checking, "more is", "more are")} being checked` : "Who gets it",
  };
}

/** A send whose time has passed, or whose run is from an earlier day: it goes in their hours once it may. */
const RETIMED = "re-timed in their hours";

/** The block's own acts. */
const REACH_OUT_RUN_LABELS = {
  back: "Back to Broadcasts",
  approving: "Approving…",
  skip: "Skip this run",
  skipYes: "Yes, skip it",
  hide: "Hide the list",
  hideHeld: "Hide them",
  deciding: "Saying so…",
  rechecking: "Checking again…",
  gated: "decide a held email or approve a run",
} as const;

/** How often the block reads its run again while the check still has sends of it to read (R21). */
export const REACH_OUT_RUN_REREAD_MS = 15_000;

/** The notice the check sends the first time it holds a send in a run that is not waiting on its owner (R20). */
export function heldNoticeWords(p: { name: string; held: number; reasons: ReachOutHold[] }): {
  subject: string;
  body: string;
} {
  // What the owner may do with them is what their holds offer (holdDoors), in the doors' own words.
  const doors = [...new Set(p.reasons.flatMap(holdDoors))].map((d) => HOLD_DOOR_WORDS[d].toLowerCase());
  const say = doors.length > 1 ? `${doors.slice(0, -1).join(", ")} or ${doors[doors.length - 1]}` : (doors[0] ?? "");
  return {
    subject: `The check held ${plural(p.held, "email", "emails")} in ${p.name}`,
    body: `${p.held === 1 ? "It waits" : "They wait"} for your say on the run in Broadcasts${say ? `: ${say}` : ""}. The rest of the run goes as planned.`,
  };
}
