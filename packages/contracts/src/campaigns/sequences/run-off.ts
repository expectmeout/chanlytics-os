/**
 * A sequence that is on and whose run did nothing (the Sequences loop review, 17 Oct 2026, item 8): its first step's last
 * run was recorded off, for a reason the owner can see and, most often, mend (no calendar connected, its list gone,
 * WhatsApp not approving its message or limiting the number, its last day passed). Said as the
 * record's one notice (D8) with the door that mends it, until a run goes again. Pure: the reason is the run's own record
 * (core runPlaybook's `skipped`, read from its `playbook.run` event), the day is the run's.
 *
 * And, with it, every sequence that should be going and isn't, as the list's read says it (decision 0128, stage 2; the
 * canvas's call S4): that run, or a running cold email with leads its first step refuses for a reason their owner can
 * mend (sequenceStuckOf). The list files such a row under Needs you, orders it by how long, and says it on the row: the
 * group, the order and the line all ask here, so no two of them can disagree.
 */
import { addressOf } from "../../activity/record-address";
import { clockDate } from "../../shared/clock";
import type { SequenceRowDto } from "./dto";
import { isOneOf } from "../../shared/unknown";

/** Why a run did nothing, as core runPlaybook records it (`skipped`), that a sequence's record says. */
const RUN_OFF_REASONS = [
  "no_calendar",
  "no_list",
  "list_uncounted",
  "template_not_approved",
  "number_flagged",
  "ended",
] as const;
export type RunOffReason = (typeof RUN_OFF_REASONS)[number];

const isRunOffReason = (reason: string): reason is RunOffReason => isOneOf(RUN_OFF_REASONS, reason);

/**
 * What each reason says, and the act that mends it: a door, End it, or none. `brief` where `said` is too long for the
 * list's row on a phone.
 */
const RUN_OFF_WORDS: Record<
  RunOffReason,
  { said: string; brief?: string; act: string | null; mends: "door" | "end" | null }
> = {
  no_calendar: { said: "no calendar is connected", act: "Connect", mends: "door" },
  no_list: { said: "its list is gone", act: null, mends: null },
  list_uncounted: { said: "its list couldn’t be counted", act: null, mends: null },
  template_not_approved: {
    said: "WhatsApp hasn’t approved its message",
    brief: "WhatsApp hasn’t approved it",
    act: "Open it",
    mends: "door",
  },
  number_flagged: {
    said: "WhatsApp has limited your number",
    brief: "WhatsApp limited your number",
    act: "Channels",
    mends: "door",
  },
  ended: { said: "its last day has passed", act: "End it", mends: "end" },
};

/** What a sequence whose last day has passed says, on its record's dock and on the list's row. */
const LAST_DAY_PASSED = "Its last day has passed";

/**
 * The reason a sequence's last run did nothing, where it is on, no cold email or one-off, and that run was recorded off
 * for a reason it says; null where it ran, sent, found nobody, or is not on. The one question the record's notice
 * (sequenceRunOff) and the list (sequenceStuckOf) ask.
 */
function runOffReasonOf(
  row: Pick<SequenceRowDto, "state" | "starts">,
  off: string | null | undefined,
): RunOffReason | null {
  if (row.state !== "on" || row.starts === "leads" || row.starts === "date" || !off || !isRunOffReason(off))
    return null;
  return off;
}

/** A run's business day as a time, its noon, for a clock's words or an order; null where the day is not known. */
const runDayMs = (day: string | null | undefined): number | null => (day ? Date.parse(`${day}T12:00:00Z`) : null);

/** A run that did nothing, on the list's row (decision 0128, stage 2): "Didn’t run · no calendar is connected". */
export function runOffRowWords(reason: RunOffReason): string {
  if (reason === "ended") return LAST_DAY_PASSED;
  const item = RUN_OFF_WORDS[reason];
  return `Didn’t run · ${item.brief ?? item.said}`;
}

/** A run that did nothing, as the record says it: its words, its line and fact for a phone's dock, and how it is mended. */
interface SequenceRunOff {
  reason: RunOffReason;
  words: string;
  line: string;
  fact: string;
  act: string | null;
  mends: "door" | "end" | null;
  /** The door that mends it, where it is one: the channels for a calendar or the number, the message in Messages. */
  to: string | null;
}

/**
 * Why a sequence's last run did nothing, where it is on and its last run was recorded off for a reason it says (the
 * record's `last_run_off`, the run's day `last_run_for`); null where it ran, sent, found nobody, or is not on. "Didn't run
 * today: no calendar is connected"; a last day passed says itself, with End it.
 */
export function sequenceRunOff(
  row: Pick<SequenceRowDto, "state" | "starts" | "first">,
  lastRun: { off: string | null | undefined; for: string | null | undefined },
  clock: { tz: string; nowMs: number },
): SequenceRunOff | null {
  const reason = runOffReasonOf(row, lastRun.off);
  if (!reason) return null;
  const item = RUN_OFF_WORDS[reason];
  const dayMs = runDayMs(lastRun.for);
  const day = dayMs === null ? null : clockDate(dayMs, clock.tz, clock.nowMs);
  const line = reason === "ended" ? LAST_DAY_PASSED : "Its last run did nothing";
  const fact =
    reason === "ended" ? "It sends nothing more" : `${item.said.charAt(0).toUpperCase()}${item.said.slice(1)}`;
  const to =
    item.mends !== "door"
      ? null
      : reason === "template_not_approved" && row.first?.template_name
        ? addressOf({ kind: "template", name: row.first.template_name })
        : addressOf({ kind: "channel" });
  return {
    reason: reason,
    words:
      reason === "ended"
        ? "Its last day has passed: it sends nothing more"
        : `Its last run${day ? ` (${day})` : ""} did nothing: ${item.said}`,
    line,
    fact,
    act: item.act,
    mends: item.mends,
    to,
  };
}

/** Why a run did nothing, in the record's one clause ("WhatsApp has limited your number"); null for any other reason. */
export const runOffClause = (reason: string): string | null =>
  isRunOffReason(reason) ? RUN_OFF_WORDS[reason].said : null;

/**
 * Why a first step refuses a lead, of the reasons their owner can mend, in reach_out_why_not's own word: `unchecked`,
 * an email that came back "Couldn't check", mended by Check again on Leads. One refused for good (written to already, a
 * customer, on the never-again list) asks nothing of its owner and is not here. Nor is a lead that only waits its turn:
 * a cold email takes a day's worth at a time, so most of a long list has stood there for days, and goes.
 */
const STUCK_LEADS_REASONS = ["unchecked"] as const;
export type StuckLeadsReason = (typeof STUCK_LEADS_REASONS)[number];

/** What is stuck in a sequence: leads that cannot start and since when, or a run that did nothing and its day. */
export type SequenceStuck =
  | { kind: "leads"; leads: number; reason: StuckLeadsReason; sinceMs: number }
  | { kind: "run"; reason: RunOffReason; sinceMs: number | null };

/**
 * What is stuck in a sequence, or null where it goes, is not on, or the read is from a server before the fact. A reason
 * this build does not know is not said: the row keeps what it said.
 */
export function sequenceStuckOf(
  row: Pick<SequenceRowDto, "state" | "starts" | "stuck" | "last_run_off" | "last_run_for">,
): SequenceStuck | null {
  const stuck = row.stuck;
  if (
    row.state === "on" &&
    row.starts === "leads" &&
    stuck &&
    stuck.leads > 0 &&
    isOneOf(STUCK_LEADS_REASONS, stuck.reason)
  )
    return { kind: "leads", leads: stuck.leads, reason: stuck.reason, sinceMs: Date.parse(stuck.since) };
  const reason = runOffReasonOf(row, row.last_run_off);
  return reason ? { kind: "run", reason, sinceMs: runDayMs(row.last_run_for) } : null;
}
