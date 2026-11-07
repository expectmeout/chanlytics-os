/** Words: lines. */

import { PERSON_CHANNEL_WORDS } from "../../../people/person-words";
import { plural } from "../../../shared/words";
import { type MixEntry } from "../../mix";
import { REPORT_MIN_N } from "../../tiles";
import type { PeopleNowDto } from "../now";
import type { PeopleSeriesDto } from "../record";
import { UNRECORDED, lastOf, listDoor, ranked, type Counts, type Words } from "./heads";

export const YESES_LINE = "Each person is counted once for each kind of message they said yes to.";

export const YESES_EMPTY = "Nobody said yes in this period.";

export const STOPS_LINE = "Each person is counted once for each kind of message they stopped.";

export const STOPS_EMPTY = "Nobody asked to stop in this period.";

/* the steps done */

/** The steps done in the period, on or before their day and after it: the rows that have a step in them. */
export function stepsDoneEntries(steps: PeopleSeriesDto["steps"]): MixEntry[] {
  const rows: MixEntry[] = [
    ["on_time", "Done on or before their day", steps.on_time],
    ["late", "Done after their day", Math.max(0, steps.done - steps.on_time)],
  ];
  return rows.filter(([, , n]) => n > 0);
}

/** A share of the steps done on time, said only of five or more steps; fewer are only counted. */
export const stepsDoneLine = (steps: PeopleSeriesDto["steps"]): string =>
  steps.done >= REPORT_MIN_N
    ? `${steps.on_time} of ${steps.done} were done on or before their day.`
    : `${plural(steps.done, "step was", "steps were")} done in this period.`;

export const STEPS_DONE_EMPTY = "No step was done in this period.";

/* the addresses that stopped working */

const EMAIL_STOP_WORDS: Words = {
  hard_bounce: "Bounced for good",
  complaint: "Marked as spam",
  provider: "Stopped by the email provider",
  [UNRECORDED]: "Reason not recorded",
};

/** "Reason not recorded" is a catch-all, so it reads last whatever its count. */
export const emailStoppedEntries = (byReason: Counts): MixEntry[] =>
  lastOf(ranked(byReason, EMAIL_STOP_WORDS), UNRECORDED);

export const emailStoppedLine = (total: number): string =>
  `${plural(total, "address", "addresses")} stopped working in this period.`;

export const EMAIL_STOPPED_EMPTY = "No address stopped working in this period.";

/* ------------------------------------------------------------------- the book */

export const BOOK_EMPTY = "Nobody is in your book yet.";

const WIRE_ROWS: readonly (readonly [key: keyof PeopleNowDto["wires"], label: string])[] = [
  ["whatsapp_only", `${PERSON_CHANNEL_WORDS.whatsapp} only`],
  ["sms_only", `${PERSON_CHANNEL_WORDS.sms} only`],
  ["phone_only", `${PERSON_CHANNEL_WORDS.voice} only`],
  ["email_only", `${PERSON_CHANNEL_WORDS.email} only`],
  ["instagram_only", `${PERSON_CHANNEL_WORDS.instagram} only`],
  ["several", "More than one way"],
  ["none", "None yet"],
];

/** The ways people reach the business now, in the order the lens draws them: a way nobody has no row. */
export const wireEntries = (wires: PeopleNowDto["wires"]): MixEntry[] =>
  WIRE_ROWS.map(([key, label]): MixEntry => [key, label, wires[key]]).filter(([, , n]) => n > 0);

/** The book is counted as of today, whatever days the owner picked, so the line says so. */
export const wiresLine = (several: number, people: number): string =>
  `${several} of ${people} have reached you more than one way, as of today.`;

/* The days of the middle rows are People's Quiet window (person-state.ts QUIET_AFTER_DAYS): the tests hold them to it. */
const FRESH_ROWS: readonly (readonly [key: keyof PeopleNowDto["fresh"], label: string])[] = [
  ["under_7", "Under 7 days"],
  ["d7_30", "7 to 30 days"],
  ["d31_60", "31 to 60 days"],
  ["d61_90", "61 to 90 days"],
  ["d91_up", "91 days or more"],
  ["never", "Never heard from"],
];

/** How long since they last wrote or called, in time order, every bucket kept: a bucket of none is a true count. */
export const freshEntries = (fresh: PeopleNowDto["fresh"]): MixEntry[] =>
  FRESH_ROWS.map(([key, label]): MixEntry => [key, label, fresh[key]]);

/** The book is counted as of today, whatever days the owner picked, so the line says so. */
export const freshLine = (people: number): string =>
  `Of ${plural(people, "person", "people")} as of today: the days since they last wrote or called. Your own messages do not count.`;

/** The foot of the freshness card: how many have been quiet, and the list that opens them; none where nobody has. */
export function quietDoor(quiet: number): { line: string; door: string; label: string } | null {
  if (quiet === 0) return null;
  return {
    line: `${plural(quiet, "person has", "people have")} been quiet for more than 30 days.`,
    door: listDoor("quiet"),
    label: "Quiet 30+ days",
  };
}

/* ---------------------------------------------------------- stuck now, where it stands */

export const stepsOverdueMeta = (overdue: number): string =>
  overdue === 0 ? "no next step is past its day" : "people whose next step is past its day";

export const stepsDueTodayMeta = (due: number): string =>
  due === 0 ? "no next step is due today" : "people whose next step is due today";

export const emailStoppedNowMeta = (stopped: number): string =>
  stopped === 0 ? "every address works" : "people whose address no longer receives your email";

/** Under a figure of the book: how many people it is of. */
export const standMeta = (people: number): string =>
  people === 0 ? "nobody is in your book yet" : `of ${plural(people, "person", "people")}`;
