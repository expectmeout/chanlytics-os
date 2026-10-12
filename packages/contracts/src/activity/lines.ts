import { activitySubjectHome } from "./subjects";
import {
  CALL_MISSED_WORDS,
  CALL_UNANSWERED_WORDS,
  REACH_OUT_EMAILED_WORDS,
  activityKindWords,
} from "../workspace/activity";

/**
 * The activity log, read the way the bell reads its notes (today/today-away.ts bellSections): rows of one kind by one
 * hand on one day are said once, where the newest of them stood, and open with a press.
 *
 * On the owner's own log a hundred lines in one minute read "Ruben Segura · Listened to a call's recording", every one
 * a row with its own door, and the page of a hundred held nothing else (8 Oct 2026). The bell had the same shape of
 * trouble and folds it; the log folds by the same rule. A day is the log's section, as New and Earlier are the bell's.
 * A kind with no words here never folds, so a new kind shows itself, and none of the kinds that failed or were stopped
 * (activityTone's danger and warn) has words: each of those is its own news. Never derived from a kind's spelling.
 */

/** What the fold reads of a row: enough to say whose it is, what kind, and what it is about. */
export interface ActivityFoldRow {
  id: string;
  at: string;
  kind: string;
  actor_user_id: string | null;
  actor_type: string | null;
  subject_type: string | null;
  subject_id: string | null;
  text: string;
}

/**
 * How a kind folds: what its number counts, and the sentence for more than one.
 *
 * `rows` counts the rows where the noun is what happened (a message, a note); `subjects` counts what the rows are
 * about where the noun is that thing (a call, a person, a thread), so two rows about one call never read "2 calls"
 * (the bell's rule, groupTitle: sixteen alerts about one thread read "16 conversations need you"). `split` keeps apart
 * rows of one kind that say different things (a lead emailed by hand, and by a reach-out).
 */
interface FoldWords {
  counts: "rows" | "subjects";
  many: (n: number, newest: ActivityFoldRow) => string;
  split?: (row: ActivityFoldRow) => string;
}

const rows = (many: (n: number) => string): FoldWords => ({ counts: "rows", many });
const subjects = (many: (n: number) => string): FoldWords => ({ counts: "subjects", many });

const FOLD_WORDS: Record<string, FoldWords> = {
  // decisions: what one member, or the receptionist, did again and again
  approve: rows((n) => `Approved ${n} replies`),
  edit: rows((n) => `Edited ${n} replies`),
  reply: rows((n) => `Replied ${n} times from the dashboard`),
  archive: subjects((n) => `Archived ${n} threads`),
  wake: subjects((n) => `Woke ${n} threads`),
  resolve: rows((n) => `Resolved ${n} escalations`),
  open_recording: subjects((n) => `Listened to ${n} calls' recordings`),
  whisper: rows((n) => `Whispered to the phone receptionist ${n} times`),
  consent_change: rows((n) => `Recorded ${n} consent answers`),
  // One row per part of fifty (00170): the parts are one import, and each part's counts are a press away.
  import: rows((n) => `Imported people from a spreadsheet, in ${n} parts`),
  // events: the day's routine
  "message.received": rows((n) => `${n} messages came in`),
  "message.sent": rows((n) => `${n} messages went out`),
  "contact.added": subjects((n) => `${n} people were added`),
  "contact.named": subjects((n) => `${n} people were named`),
  "contact.noted": rows((n) => `${n} notes were written`),
  "contact.note_changed": rows((n) => `${n} notes were changed`),
  "contact.note_removed": rows((n) => `${n} notes were taken away`),
  "contact.note_suggested": rows((n) => `The receptionist suggested ${n} notes`),
  "contact.note_kept": rows((n) => `${n} suggested notes were kept`),
  "contact.note_dismissed": rows((n) => `${n} suggested notes were dismissed`),
  "contact.note_done": rows((n) => `${n} steps were done`),
  "contact.note_undone": rows((n) => `${n} steps were opened again`),
  "contact.consent_changed": rows((n) => `${n} consent answers changed`),
  "contact.email_set": subjects((n) => `${n} people's email addresses changed`),
  "conversation.reopened": subjects((n) => `${n} threads reopened`),
  "conversation.pause_expired": rows((n) => `${n} pauses ended`),
  "conversation.snooze_expired": rows((n) => `${n} snoozes ended`),
  // A call that never connected is not one that was recorded: each says its own, and folds with its own.
  "call.recorded": {
    counts: "subjects",
    split: (row) => row.text,
    many: (n, newest) =>
      newest.text === CALL_MISSED_WORDS
        ? `${n} calls were missed`
        : newest.text === CALL_UNANSWERED_WORDS
          ? `${n} calls we placed did not connect`
          : `${n} calls were recorded`,
  },
  "lead.kept": subjects((n) => `${n} leads were kept from Needs review`),
  "lead.excluded": subjects((n) => `${n} leads were left out of Needs review`),
  "lead.put_back": subjects((n) => `${n} leads were put back in Needs review`),
  // What was decided is the sentence, so each decision folds with its own: "… was skipped · 40 times".
  "reach_out.send_decided": {
    counts: "rows",
    split: (row) => row.text,
    many: (n, newest) => `${newest.text} · ${n} times`,
  },
  "appointment.booked": rows((n) => `${n} bookings arrived by email`),
  "lead.emailed": {
    counts: "subjects",
    split: (row) => row.text,
    many: (n, newest) =>
      newest.text === REACH_OUT_EMAILED_WORDS
        ? `${n} reach-out emails went to leads`
        : `${n} leads were marked as emailed`,
  },
  "lead.call": rows((n) => `${n} calls to leads were logged`),
  "google.reviews": rows((n) => `New Google reviews were read ${n} times`),
  "playbook.run": rows((n) => `Campaigns ran ${n} times`),
};

/** The kinds that fold, as the ledgers spell them: what a test holds to the closed sets and the tones. */
export const ACTIVITY_FOLD_KINDS: readonly string[] = Object.keys(FOLD_WORDS);

/** Two of a kind is already a pattern; one is news (the bell's AWAY_GROUP_MIN). */
const FOLD_MIN = 2;

/** Whose a row is: the member, else the kind of hand (the receptionist, the system), else nobody's. */
const handOf = (r: ActivityFoldRow): string => r.actor_user_id ?? r.actor_type ?? "";

/**
 * The line a row belongs to: its day, its kind, its hand, and what a split kind says. A kind with no words here is a
 * line of its own, keyed by the row.
 */
function lineKey(r: ActivityFoldRow, day: string): string {
  const words = FOLD_WORDS[r.kind];
  if (!words) return `@${r.id}`;
  return [day, r.kind, handOf(r), words.split ? words.split(r) : ""].join("|");
}

/** One line of the log: a row, or several rows of one kind by one hand on one day said once. */
export interface ActivityLineVM<T extends ActivityFoldRow> {
  /** Stable across pages and repaints: the row's own id, or the day, kind and hand of a fold. */
  key: string;
  /** The row itself when it stands alone; the newest of the fold otherwise. */
  row: T;
  /** How many rows this stands for. 1 is an ordinary row. */
  count: number;
  /** The fold's sentence when it stands for more than one; null for a row, which says its own. */
  title: string | null;
  /** Every row it stands for, newest first: what the fold shows when it is opened. */
  members: T[];
  /** When the oldest of a fold happened; null for a row. */
  since: string | null;
}

/** What a fold of these rows says: its count of what the kind counts, in the kind's words. */
function foldTitle(members: readonly ActivityFoldRow[], words: FoldWords): string {
  const newest = members[0];
  if (!newest) return "";
  const n =
    words.counts === "rows"
      ? members.length
      : new Set(members.map((m) => (m.subject_id ? `${m.subject_type ?? ""}:${m.subject_id}` : `@${m.id}`))).size;
  // Several rows about one thing (a call's recording opened in two different hours) are that thing, said once, and how
  // often: "Listened to 1 calls' recordings" is not a sentence.
  return n === 1 ? `${activityKindWords(newest.kind)} · ${members.length} times` : words.many(n, newest);
}

/**
 * The log's rows as its lines, newest first. `dayOf` says which day a row belongs to by the business's clock (the
 * page's and the server's own: clock.ts zoneDayKey); `fold` is off where the log was narrowed to one kind, since rows
 * asked for by name are what the reader came to read.
 */
export function activityLines<T extends ActivityFoldRow>(
  list: readonly T[],
  dayOf: (at: string) => string,
  fold = true,
): ActivityLineVM<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const r of list) {
    const k = fold ? lineKey(r, dayOf(r.at)) : `@${r.id}`;
    const bucket = byKey.get(k);
    if (bucket) bucket.push(r);
    else {
      byKey.set(k, [r]);
      order.push(k);
    }
  }
  const lines: ActivityLineVM<T>[] = [];
  for (const k of order) {
    const members = byKey.get(k) ?? [];
    const newest = members[0];
    if (!newest) continue;
    const words = FOLD_WORDS[newest.kind];
    if (!words || members.length < FOLD_MIN) {
      for (const r of members) lines.push({ key: r.id, row: r, count: 1, title: null, members: [r], since: null });
      continue;
    }
    lines.push({
      key: k,
      row: newest,
      count: members.length,
      title: foldTitle(members, words),
      members,
      since: members[members.length - 1]?.at ?? null,
    });
  }
  return lines;
}

/**
 * How many of the newest rows make `max` lines: the longest run from the top that folds to no more than that. A reader
 * that says only so many lines reads this many rows, and the next read starts right after the last of them, so nothing
 * is said twice and nothing is skipped (a fold cut here goes on as a line of the next read).
 */
export function activityRowsForLines<T extends ActivityFoldRow>(
  list: readonly T[],
  dayOf: (at: string) => string,
  max: number,
  fold = true,
): number {
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (!r) continue;
    const k = fold ? lineKey(r, dayOf(r.at)) : `@${r.id}`;
    if (seen.has(k)) continue;
    if (seen.size >= max) return i;
    seen.add(k);
  }
  return list.length;
}

/**
 * Where a row opens: the page of what it is about, as a route without its slash, from its subject (the table in
 * subjects.ts says where each kind of thing opens, or why it opens nowhere). Null where the row alone cannot name the
 * page: a subject whose page the server looks up (a message's thread, a deal's person, a list's own kind of page), one with
 * no page (a workspace), and one nobody declared. A visit opens its panel on the Calendar, and its day is the server's to
 * add (a visit's own address, calendar/<day>:a-<id>): the id alone is the shape the board reads without one.
 */
export function activityDoor(r: Pick<ActivityFoldRow, "subject_type" | "subject_id">): string | null {
  const home = activitySubjectHome(r.subject_type);
  return home && "door" in home ? home.door(r.subject_id) : null;
}

/**
 * What a row says of its subject, beside its own sentence. A fold's member whose sentence is its kind's words and no
 * more ("Listened to a call's recording") is said by the name alone under the fold, which has said the rest; a row
 * with more to say (a call's outcome, an import's counts) keeps its sentence, then the name.
 */
export function activityMemberWords(row: Pick<ActivityFoldRow, "kind" | "text">, about: string | null): string {
  if (!about) return row.text;
  return row.text === activityKindWords(row.kind) ? about : `${row.text} · ${about}`;
}
