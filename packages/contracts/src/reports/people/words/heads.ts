/** Words: heads. */

import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "../../../people/person-words";
import { capitalize, plural } from "../../../shared/words";
import { ownWord, rankedEntries, type MixEntry } from "../../mix";
import { REPORT_MIN_N, beforeWords } from "../../tiles";
import { rangeLabelOf } from "../../reports";
import type { PeopleNowDto } from "../now";
import type { PeopleSeriesDto } from "../record";

export type Counts = Readonly<Record<string, number>>;

export type Words = Readonly<Record<string, string>>;

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
 * is compared where it had anybody (`priorHad`, which people/report.ts works out once for the head and the strip alike).
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
export function ranked(counts: Counts, words: Words): MixEntry[] {
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
export const lastOf = (entries: MixEntry[], id: string): MixEntry[] => [
  ...entries.filter(([key]) => key !== id),
  ...entries.filter(([key]) => key === id),
];

/* how they reached you */

export const channelEntries = (byChannel: Counts): MixEntry[] => ranked(byChannel, PERSON_CHANNEL_WORDS);

export const CHANNELS_LINE = "A person who reached you more than one way is counted in each.";

export const CHANNELS_EMPTY = "Nobody reached you in this period.";

/* how the new ones first came */

export const UNRECORDED = "unknown";

const FIRST_CAME_WORDS: Words = { ...PERSON_CAME_FROM_WORDS, ad: "An ad", [UNRECORDED]: "Not recorded" };

/** "Not recorded" is a catch-all, so it reads last whatever its count. */
export const firstCameEntries = (byVia: Counts): MixEntry[] => lastOf(ranked(byVia, FIRST_CAME_WORDS), UNRECORDED);

/** Whether an entry is a way in that was kept. */
export const firstCameRecorded = (id: string): boolean => id !== UNRECORDED;

/** How many of the entries are a way in that was kept: a person whose way was not is counted in none. */
export const firstCameKnown = (entries: readonly MixEntry[]): number =>
  entries.filter(([id]) => firstCameRecorded(id)).reduce((n, [, , value]) => n + value, 0);

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
