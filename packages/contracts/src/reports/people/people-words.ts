/**
 * Reports › People — the words of the lens's own parts: the sentence at its head, the metas under its figures, the labels of
 * how people reached the business, how the new ones first came, how a yes was won and a stop came and why an address
 * stopped, the book's wires and freshness, and the sentence under each part, said once. Pure; people-report.ts puts them
 * in the view model, and only Reports' page reads them (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 * The two maps of People's own (a wire's name, how a person first came) are read from person-words.ts, a leaf, so this
 * drags nothing of People into the page.
 *
 * A mix names a key the words do not know in a way that cannot lose a person: a way in is said as it was kept, a source
 * of an answer is summed into "Another way" (so the rows add up to the figure over them), and a reason an address stopped
 * is said as it was kept. A source or a reason the database could not name (00393 says `unknown`) is last, as it is the
 * least said.
 */
import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "../../people/person-words";
import { capitalize, plural } from "../../shared/words";
import { ownWord, rankedEntries, type MixEntry } from "../report-mix";
import { REPORT_MIN_N, beforeWords } from "../report-tiles";
import { rangeLabelOf } from "../reports";
import type { PeopleNowDto } from "./people-now";
import type { PeopleSeriesDto } from "./people-record";

type Counts = Readonly<Record<string, number>>;
type Words = Readonly<Record<string, string>>;
type Reached = PeopleSeriesDto["reached"];
type Purposes = PeopleSeriesDto["consent"]["now"]["yes"]["by_purpose"];

/** The kept rhythm card's unit: the frame's week and hours count a connected call in either direction beside the messages. */
export const PEOPLE_RHYTHM_UNIT = "messages and calls";

/** What the kept rhythm card says, in place of a radar and a strip of zeros, for a period nobody wrote or called in. */
export const PEOPLE_RHYTHM_EMPTY = "Nobody wrote or called in this period.";

/** The page a People list opens on, by the list's id (People's own built-in lists). */
export const listDoor = (id: string): string => `clients/seg:${id}`;

/* --------------------------------------------------------------------- the head */

const HEAD_NOBODY = "Nobody reached you in this period";

/** " (8 the 30 days before)": how many were new in the period before, where the period before is compared (`priorHad`). */
function newBeforeWords(before: Reached["before"], days: number, priorHad: boolean): string {
  if (!priorHad) return "";
  return ` (${before.new === 0 ? "none" : before.new} ${beforeWords(rangeLabelOf(days))})`;
}

/** "; 340 of 520 have said yes to messages": the book's share, said only of five people or more. */
function bookYesWords(book: PeopleNowDto | null): string {
  return book !== null && book.people >= REPORT_MIN_N
    ? `; ${book.lists.opted_in} of ${book.people} have said yes to messages`
    : "";
}

/**
 * The lens's sentence: how many people reached the business, how many of them were new and how that was the period before
 * (all of the window), then, where the book was counted and is of five or more, how many of it have said yes to messages
 * (both of the pool). A period in which nobody reached the business says that, and still says the book. The period before
 * is compared where it had anybody (`priorHad`, which people-report.ts works out once for the head and the strip alike).
 */
export function headWords(reached: Reached, days: number, book: PeopleNowDto | null, priorHad: boolean): string {
  const { now, before } = reached;
  const reachedWords =
    now.people === 0
      ? HEAD_NOBODY
      : `${plural(now.people, "person", "people")} reached you, ${now.new} new${newBeforeWords(before, days, priorHad)}`;
  return `${reachedWords}${bookYesWords(book)}.`;
}

/* -------------------------------------------------------------------- the strip */

/** The parts of a meta that happened, in order: "6 to messages · 2 to offers". */
const happened = (parts: readonly (readonly [n: number, words: string])[]): string =>
  parts
    .filter(([n]) => n > 0)
    .map(([n, words]) => `${n} ${words}`)
    .join(" · ");

export const reachedMeta = (people: number, fresh: number): string =>
  people === 0 ? "nobody wrote or called in this period" : `${fresh} new · ${people - fresh} you knew already`;

export const newMeta = (people: number, fresh: number): string =>
  fresh === 0 ? "nobody new" : `of the ${people} who reached you`;

export const yesesMeta = (by: Purposes): string =>
  happened([
    [by.messages, "to messages"],
    [by.offers, "to offers"],
    [by.email_offers, "to email offers"],
  ]) || "nobody said yes in this period";

export const stopsMeta = (by: Purposes): string =>
  happened([
    [by.messages, "stopped all messages"],
    [by.offers, "stopped offers"],
    [by.email_offers, "stopped email offers"],
  ]) || "nobody asked to stop in this period";

/* -------------------------------------------------------------------- the mixes */

/** A key's words, or the key as it was kept, spaced and capitalized. */
const keptAsWords = (key: string): string => capitalize(key.replace(/_/g, " "));

/**
 * A count by key as rows, most first; between equals in the order the words list their keys, then by name (a key they do
 * not list comes after those they do): a tie is never left to the order the database's object happened to hold.
 */
function ranked(counts: Counts, words: Words): MixEntry[] {
  const order = Object.keys(words);
  const place = (key: string): number => {
    const at = order.indexOf(key);
    return at === -1 ? order.length : at;
  };
  return rankedEntries(counts, (key) => ownWord(words, key) ?? keptAsWords(key)).sort(
    (a, b) => b[2] - a[2] || place(a[0]) - place(b[0]),
  );
}

/** The row `id` moved to the end, where it is: the row of what could not be named. */
const lastOf = (entries: MixEntry[], id: string): MixEntry[] => [
  ...entries.filter(([key]) => key !== id),
  ...entries.filter(([key]) => key === id),
];

/* how they reached you */

export const channelEntries = (byChannel: Counts): MixEntry[] => ranked(byChannel, PERSON_CHANNEL_WORDS);

export const CHANNELS_LINE = "A person who reached you more than one way is counted in each.";
export const CHANNELS_EMPTY = "Nobody reached you in this period.";

/* how the new ones first came */

const UNRECORDED = "unknown";
const FIRST_CAME_WORDS: Words = { ...PERSON_CAME_FROM_WORDS, ad: "An ad", [UNRECORDED]: "Not recorded" };

/** "Not recorded" is a catch-all, so it reads last whatever its count. */
export const firstCameEntries = (byVia: Counts): MixEntry[] => lastOf(ranked(byVia, FIRST_CAME_WORDS), UNRECORDED);

/** How many of the entries are a way in that was kept: a person whose way was not is counted in none. */
export const firstCameKnown = (entries: readonly MixEntry[]): number =>
  entries.filter(([id]) => id !== UNRECORDED).reduce((n, [, , value]) => n + value, 0);

export const firstCameLine = (known: number, fresh: number): string =>
  `${known} of ${fresh} new people have a recorded way in.`;
export const FIRST_CAME_NOBODY = "Nobody new reached you in this period.";
export const firstCameNone = (fresh: number): string =>
  `No way in is recorded for the ${plural(fresh, "new person", "new people")}.`;

/* how the yeses were won and the stops came */

const OTHER = "other";
const MEMBER = "member";
const YES_ROWS: Words = {
  customer_message: "Their own message",
  form: "A form",
  in_person: "In person",
  phone: "By phone",
  [OTHER]: "Another way",
};
const STOP_ROWS: Words = {
  customer_message: "Their own STOP",
  carrier: "The carrier",
  unsubscribe: "An unsubscribe",
  complaint: "A complaint",
  reply: "A reply",
  whatsapp: "WhatsApp's offers stop",
  [MEMBER]: "Recorded by a member",
  [OTHER]: "Another way",
};
/** The four ways a member of the team records an answer at the desk: one row. */
const MEMBER_SOURCES: readonly string[] = ["in_person", "phone", "form", "operator"];

/**
 * The answers by who gave them, summed into the rows the words name (`rowOf` says which): a source they do not name, or
 * none (`unknown`), is "Another way", so the rows always add up to the figure they sit under.
 */
function answerEntries(bySource: Counts, rowWords: Words, rowOf: (source: string) => string): MixEntry[] {
  const rows: Record<string, number> = {};
  for (const [source, n] of Object.entries(bySource)) {
    const row = rowOf(source);
    rows[row] = (rows[row] ?? 0) + n;
  }
  // "Another way" is a catch-all, so it reads last whatever its count.
  return lastOf(ranked(rows, rowWords), OTHER);
}

const rowIn = (rowWords: Words, source: string): string => (Object.hasOwn(rowWords, source) ? source : OTHER);

export const yesEntries = (bySource: Counts): MixEntry[] =>
  answerEntries(bySource, YES_ROWS, (source) => rowIn(YES_ROWS, source));

export const stopEntries = (bySource: Counts): MixEntry[] =>
  answerEntries(bySource, STOP_ROWS, (source) => (MEMBER_SOURCES.includes(source) ? MEMBER : rowIn(STOP_ROWS, source)));

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
