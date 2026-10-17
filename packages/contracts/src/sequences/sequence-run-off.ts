/**
 * A sequence that is on and whose run did nothing (the Sequences loop review, 17 Oct 2026, item 8): its first step's last
 * run was recorded off, for a reason the owner can see and, most often, mend (no calendar connected, its list gone,
 * WhatsApp not approving its message or limiting the number, the class set to Never, its last day passed). Said as the
 * record's one notice (D8) with the door that mends it, until a run goes again. Pure: the reason is the run's own record
 * (core runPlaybook's `skipped`, read from its `playbook.run` event), the day is the run's.
 */
import { addressOf } from "../activity/record-address";
import { clockDate } from "../shared/clock";
import type { SequenceRowDto } from "./sequence-dto";

/** Why a run did nothing, as core runPlaybook records it (`skipped`), that a sequence's record says. */
const RUN_OFF_REASONS = [
  "no_calendar",
  "no_list",
  "list_uncounted",
  "template_not_approved",
  "number_flagged",
  "deals_off",
  "never",
  "ended",
] as const;
export type RunOffReason = (typeof RUN_OFF_REASONS)[number];

const isRunOffReason = (why: string): why is RunOffReason => (RUN_OFF_REASONS as readonly string[]).includes(why);

/** What each reason says, and the act that mends it: a door, Who approves (Autonomy), End it, or none. */
const RUN_OFF_WORDS: Record<
  RunOffReason,
  { said: string; act: string | null; mends: "door" | "autonomy" | "end" | null }
> = {
  no_calendar: { said: "no calendar is connected", act: "Connect", mends: "door" },
  no_list: { said: "its list is gone", act: null, mends: null },
  list_uncounted: { said: "its list couldn’t be counted", act: null, mends: null },
  template_not_approved: { said: "WhatsApp hasn’t approved its message", act: "Open it", mends: "door" },
  number_flagged: { said: "WhatsApp has limited your number", act: "Channels", mends: "door" },
  deals_off: { said: "deals are off", act: null, mends: null },
  never: { said: "this kind of message is set to Never", act: "Who approves", mends: "autonomy" },
  ended: { said: "its last day has passed", act: "End it", mends: "end" },
};

/** A run that did nothing, as the record says it: its words, its line and fact for a phone's dock, and how it is mended. */
interface SequenceRunOff {
  reason: RunOffReason;
  words: string;
  line: string;
  fact: string;
  act: string | null;
  mends: "door" | "autonomy" | "end" | null;
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
  const why = lastRun.off;
  if (row.state !== "on" || row.starts === "leads" || row.starts === "date" || !why || !isRunOffReason(why))
    return null;
  const w = RUN_OFF_WORDS[why];
  const day = lastRun.for ? clockDate(Date.parse(`${lastRun.for}T12:00:00Z`), clock.tz, clock.nowMs) : null;
  const line = why === "ended" ? "Its last day has passed" : "Its last run did nothing";
  const fact = why === "ended" ? "It sends nothing more" : `${w.said.charAt(0).toUpperCase()}${w.said.slice(1)}`;
  const to =
    w.mends !== "door"
      ? null
      : why === "template_not_approved" && row.first?.template_name
        ? addressOf({ kind: "template", name: row.first.template_name })
        : addressOf({ kind: "channel" });
  return {
    reason: why,
    words:
      why === "ended"
        ? "Its last day has passed: it sends nothing more"
        : `Its last run${day ? ` (${day})` : ""} did nothing: ${w.said}`,
    line,
    fact,
    act: w.act,
    mends: w.mends,
    to,
  };
}
