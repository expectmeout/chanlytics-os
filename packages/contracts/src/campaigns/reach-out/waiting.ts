/**
 * Cold email that waits for its owner, reminded each morning (decision 0120). A run to leads waiting for an OK has no day
 * to pass: it waits until answered (wait rule `leads_batch`). Told once, when it was made, it could wait for weeks behind a
 * bell row nobody opened. So while one waits, its owner gets one line each morning, by their own clock: how many emails
 * wait, in which sequences, and since when. One line a workspace a day, however many runs wait, and none on the morning
 * a run began waiting, which its own notice already told.
 *
 * Pure: the sweep hands in what waits and the moment (apps/edge/lib/campaigns/reach-out/waits-reminder.ts).
 */
import { clockDate, zoneDayKey } from "../../shared/clock";
import { HOUR_MS } from "../../shared/time";
import { plural } from "../../shared/words";
import { waitEndsWords } from "../../waits/rules";
import { localHour } from "../playbooks/schedule";

/** A run to leads waiting for its owner's OK, as the reminder reads it. */
export interface WaitingColdRun {
  id: string;
  /** The run's name as its row keeps it: its step's name and its day ("Movers in Austin · 2026-09-28"). */
  name: string;
  emails: number;
  /** When it began waiting, ISO. */
  since: string;
}

/** The hours of a business's morning the reminder may go in, by its own clock: from nine, and not after noon. */
const REMINDER_HOURS = { from: 9, until: 12 } as const;

/** How long a run has waited before a morning reminds of it: one made this morning was told of when it was made. */
const REMINDED_AFTER_MS = 12 * HOUR_MS;

/** The most sequences a reminder names; the rest are counted. */
const NAMED = 3;

/** A run's name without its day: the sequence's step, as its owner knows it. */
const stepNameOf = (run: WaitingColdRun): string => run.name.replace(/ · \d{4}-\d{2}-\d{2}$/, "");

/**
 * What the morning's reminder is about for one workspace, or null where none is due: it is not the business's morning,
 * or nothing has waited long enough. `day` is the business's day, which the reminder is kept once under.
 */
export function coldWaitsReminderOf(
  runs: readonly WaitingColdRun[],
  tz: string,
  nowMs: number,
): { day: string; runs: WaitingColdRun[] } | null {
  const hour = localHour(tz, new Date(nowMs));
  if (hour < REMINDER_HOURS.from || hour >= REMINDER_HOURS.until) return null;
  const waited = runs
    .filter((run) => nowMs - Date.parse(run.since) >= REMINDED_AFTER_MS)
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
  return waited.length > 0 ? { day: zoneDayKey(nowMs, tz), runs: waited } : null;
}

/** The name a workspace's reminder for one day is kept once under (the edge's once-only notices). */
export const coldWaitsReminderKey = (tenantId: string, day: string): string => `cold_email_waits:${tenantId}:${day}`;

/**
 * The reminder's words: what waits, since when, and how the wait ends. One run is named by its sequence; several are
 * counted, the longest-waiting named first. The oldest run is the one the bell's row opens.
 */
export function coldWaitsNotice(
  runs: readonly WaitingColdRun[],
  tz: string,
  nowMs: number,
): { subject: string; body: string; runId: string } | null {
  const first = runs[0];
  if (!first) return null;
  const emails = runs.reduce((n, run) => n + run.emails, 0);
  const since = clockDate(Date.parse(first.since), tz, nowMs);
  const named = runs.slice(0, NAMED).map((run) => `${stepNameOf(run)} (${run.emails})`);
  const more = runs.length - named.length;
  const list = more > 0 ? `${named.join(", ")} and ${more} more` : named.join(", ");
  const one = runs.length === 1;
  return {
    subject: one
      ? `${stepNameOf(first)} still waits for your OK`
      : `${plural(runs.length, "cold email run")} still wait for your OK`,
    body: one
      ? `${plural(emails, "email")} to businesses your search found ${emails === 1 ? "has" : "have"} waited since ${since}. Approve ${emails === 1 ? "it" : "them"}, or skip the run. ${waitEndsWords("leads_batch")}.`
      : `${plural(emails, "email")} to businesses your searches found have waited since ${since}: ${list}. Approve or skip each run. ${waitEndsWords("leads_batch")}.`,
    runId: first.id,
  };
}
