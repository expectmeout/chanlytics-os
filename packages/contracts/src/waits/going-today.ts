/**
 * What goes on its own today (decision 0064, step 2): Today's "Going today", above what waits for an OK. A customer batch
 * held for a stop, a message sent once and set for later today, and a reach-out's run: each goes at its time unless it is
 * stopped, so each is a row with when it goes and its Stop, soonest first. What waits for an OK is the queue's ("Need
 * you"), and what already went is the day's card. A reply of the receptionist's counting down to go in the owner's name
 * was a row here too; since decision 0071 it is Need you's own row, where it can be stopped, changed and sent
 * (today/today-queue.ts heldRow), and Ask's read says it as needs_you's replies on their way.
 *
 * Pure: the page hands in the runs it holds, the business's zone and the clock; every sentence is said here, from the
 * wait rule's own words (wait-rules.ts waitEndsWords).
 */
import { addressOf } from "../activity/record-address";
import { isReachOutRun } from "../reach-out/reach-out-rules";
import { clockTime, zoneDayKey } from "../shared/clock";
import { HOUR_MS } from "../shared/time";
import { plural } from "../shared/words";
import { waitEndsWords, type WaitKind } from "./wait-rules";

/** A run as the page holds it, as far as Going today reads it. */
export interface GoingRun {
  id: string;
  state: string;
  scheduled_for: string | null;
  playbook_id: string | null;
  recipient_count: number;
  /** Its name as every row says it (contracts runTitleOf). */
  title: string;
  audience?: unknown;
}

/** One row of Going today: what goes, when, in a sentence, and what its Stop stops. */
export interface GoingTodayRowVM {
  key: string;
  kind: "batch" | "one_off";
  name: string;
  /** What it is, as the row's line under its name says it: "Campaign · goes at 10:30 AM". */
  meta: string;
  /** Who it reaches and how its wait ends: "4 people. Goes at 10:30 AM unless you stop it." */
  sentence: string;
  atMs: number;
  /** Its Stop: the run, canceled (Sent's own cancel). */
  stop: { kind: "run"; id: string };
  /** Where the row opens: the run. */
  to: string;
}

/** The words above Going today, and what it says when nothing goes on its own today. */
export const GOING_TODAY_WORDS = {
  title: "Going today",
  /** Beside the count: what each row does, and how many past the rows drawn are in Sent. */
  sub: (n: number, drawn: number) =>
    [
      n === 1 ? "Goes on its own unless you stop it" : "Each goes on its own unless you stop it",
      n > drawn ? `${n - drawn} more in Sent` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  stop: "Stop",
} as const;

/** A row's time and wait, by the business's clock: "at 10:30 AM", and "Goes at 10:30 AM unless you stop it". */
function goes(kind: WaitKind, atMs: number, tz: string): { at: string; ends: string } {
  const at = `at ${clockTime(atMs, tz)}`;
  return { at, ends: waitEndsWords(kind, at) };
}

/**
 * Today's rows of what goes on its own: every run scheduled to start later on the business's day, or within the hour across
 * its midnight (a batch held for a stop, a reach-out's run, a message sent once), soonest first. A run already sending, or
 * one set for a later day, is not today's to stop here.
 */
export function goingTodayOf(input: { runs: readonly GoingRun[]; tz: string; nowMs: number }): GoingTodayRowVM[] {
  const { tz, nowMs } = input;
  const today = zoneDayKey(nowMs, tz);
  const rows: GoingTodayRowVM[] = [];
  for (const r of input.runs) {
    const atMs = r.scheduled_for ? Date.parse(r.scheduled_for) : NaN;
    const soon = atMs - nowMs <= HOUR_MS;
    if (r.state !== "scheduled" || !(atMs > nowMs) || (!soon && zoneDayKey(atMs, tz) !== today)) continue;
    const reach = isReachOutRun(r.audience);
    const kind = r.playbook_id ? "batch" : "one_off";
    const g = goes(kind === "batch" ? "batch_hold" : "one_off", atMs, tz);
    const people = reach
      ? plural(r.recipient_count, "business", "businesses")
      : plural(r.recipient_count, "person", "people");
    const what = reach ? "To leads" : kind === "batch" ? "Campaign" : "Sent once";
    rows.push({
      key: `run-${r.id}`,
      kind,
      name: r.title,
      meta: `${what} · goes ${g.at}`,
      sentence: `${people}. ${g.ends}.`,
      atMs,
      stop: { kind: "run", id: r.id },
      to: addressOf({ kind: "send", id: r.id }),
    });
  }
  return rows.sort((a, b) => a.atMs - b.atMs);
}
