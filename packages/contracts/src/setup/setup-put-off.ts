/**
 * What a member puts off of Setup (moved from setup.ts on 25 Oct 2026, when it passed its 800 lines): the rows put off
 * for good and for a week, as their saved Setup view keeps both (`memberships.views.setup.later` and `.rests`), the
 * rules a "not now" and an answer follow, and the first run's own marks, kept the same way. Nothing here reads Setup's
 * facts, so setup.ts and its rows import from here and never the other way.
 */
import { dateFormat, DAY_MS } from "../shared/time";

/**
 * The rows a member put off for good, as their saved Setup view keeps them (`memberships.views.setup.later`, the door
 * People's own view goes through): short ids, each once, nothing else. A view somebody hand-edited is no rows, never a
 * throw. Every row put off before a put-off could rest (25 Oct 2026) is here, so it stays put off, as it always was.
 */
export function setupLaterOf(view: unknown): string[] {
  const later = view && typeof view === "object" ? (view as { later?: unknown }).later : null;
  if (!Array.isArray(later)) return [];
  return [...new Set(later.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
}

/**
 * What skipping the first run's test call puts off (the member's own, as a row put off is): not the `try` row itself,
 * which Today keeps showing until a call comes in, but the first run's wait for it.
 */
export const TRY_SKIPPED = "try-skipped";

/**
 * Going on from the first run's Your receptionist ("Rehearse it now", decision 0073): the member's own, as a row put off
 * is. The step is done with the facts it answers from AND this, so it is not left behind the moment its last fact lands.
 */
export const RECEPTIONIST_MET = "receptionist-met";

/** What skipping the first run's Rehearse puts off (decision 0073): its wait for a conversation reviewed. */
export const REHEARSE_SKIPPED = "rehearse-skipped";

/**
 * Going on from the first run's Where it answers with no number to choose (no lines provider here, decision 0073): the
 * member's own, as a row put off is. With numbers to buy the step is the number chosen, whatever this mark says.
 */
export const CHANNELS_SEEN = "channels-seen";

/**
 * "Not now" on the first run's Connect it to Google (decision 0073, R17): the member's own, as a row put off is. Your
 * business goes on without it; Setup's Google row keeps Connect for later.
 */
export const GOOGLE_CONNECT_LATER = "google-connect-later";

/**
 * What skipping Today's offer of the day-before reminder puts off (the member's own, as a row put off is). The offer is
 * no row of Setup's, so it has no row id to put off: this names it in the same list.
 */
export const REMIND_SKIPPED = "remind-skipped";

/**
 * Setup's row for the number the business keeps and forwards ("The number you already have"): putting it off is how
 * an owner who chose to keep a number says its forwarding can wait, and the first run's phone step lets them go on.
 */
export const KEEP_ROW = "keep";

/**
 * How long a "not now" puts a row off: a week. The first run's Later rests a row a week, and once it is back the next
 * is for good (putOffEnds). Today's Skip says which it is before it is pressed ("For a week", "I don't need this"), and
 * its week, like Hide's, is always a week (`why: "week"`). Skipped was for ever, and "It stays in Setting up" pointed
 * at a page with no way to it once the first run was done.
 */
export const SETUP_REST_MS = 7 * DAY_MS;

/**
 * The day a week's rest put off now ends, as Today's card says it before and after the press ("It comes back on Sat,
 * Nov 7."), on the business's clock: a week on is never today or tomorrow, so it is always the weekday and the date.
 */
export function restEndsDay(tz: string, nowMs: number): string {
  return dateFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(nowMs + SETUP_REST_MS),
  );
}

/** The rows a member put off for a week, by id, each with the moment it comes back (ISO): their saved view's `rests`. */
export type SetupRests = Readonly<Record<string, string>>;

/** At most this many rests are read: there are fewer rows than this, so more is a view somebody hand-edited. */
const SETUP_RESTS_MAX = 20;

/**
 * The rows a member put off for a week, as their saved Setup view keeps them (`memberships.views.setup.rests`): a short
 * id and a moment that reads as one. Anything else is no rest, never a throw.
 */
export function setupRestsOf(view: unknown): Record<string, string> {
  const rests = view && typeof view === "object" ? (view as { rests?: unknown }).rests : null;
  if (!rests || typeof rests !== "object" || Array.isArray(rests)) return {};
  const kept = Object.entries(rests).filter(
    (e): e is [string, string] =>
      e[0].length > 0 && e[0].length <= 40 && typeof e[1] === "string" && Number.isFinite(Date.parse(e[1])),
  );
  return Object.fromEntries(kept.slice(0, SETUP_RESTS_MAX));
}

/** What a member has put off: for good (`later`) and for a week (`rests`), as their saved Setup view keeps both. */
export interface SetupPutOff {
  later: readonly string[];
  rests: SetupRests;
}

/** When a row put off for a week comes back, epoch ms; null for one with no rest. */
const restUntil = (s: SetupPutOff, id: string): number | null => {
  const until = new Map(Object.entries(s.rests)).get(id);
  return until === undefined ? null : Date.parse(until);
};

/** Off the card and the first run's open rows just now: put off for good, or for a week that has not ended. */
export function setupOffNow(s: SetupPutOff, id: string, nowMs: number): boolean {
  const until = restUntil(s, id);
  return s.later.includes(id) || (until !== null && until > nowMs);
}

/** Put off for a week, and back since it ended: drawn again, and its next put-off is for good (putOffEnds). */
export function setupBack(s: SetupPutOff, id: string, nowMs: number): boolean {
  const until = restUntil(s, id);
  return !s.later.includes(id) && until !== null && until <= nowMs;
}

/**
 * Put off at all, for good or for a week, ended or not: the member said it can wait. The first run's phone step reads
 * it, so a kept number's forwarding back on Today after its week does not open that step again.
 */
export function setupPutOffEver(s: SetupPutOff, id: string): boolean {
  return s.later.includes(id) || restUntil(s, id) !== null;
}

/**
 * What a "not now" does to a row: rests it a week, or, once it is back from one, puts it off for good. Every row alike:
 * "The number you already have" rested every week until its forwarding had a page of its own beside Setup's rows
 * (Settings › How it answers › On calls, 25 Oct 2026).
 */
export function putOffEnds(back: boolean): "week" | "good" {
  return back ? "good" : "week";
}

/**
 * Why a row is put off: `rest`, the first run's Later, a week and then for good, which putOffEnds decides; `week`, a
 * "not now" Today's card names before it is pressed (Skip's "For a week", "Hide for a week"), a week every time, never
 * turned into for good by being pressed again; `answer`, the member said it is not theirs (Skip's "I don't need this",
 * not on Google, a new number and none kept, the test call skipped), which is for good at once.
 */
export type SetupPutOffWhy = "rest" | "week" | "answer";

/** A put-off asked for: rows put off, and why; or taken back. */
export type SetupPutOffChange = { on: true; why: SetupPutOffWhy } | { on: false };

/**
 * The member's put-off rows once `ids` are put off, or taken back. Taking back undoes the last put-off: a row put off
 * for good is back from its week where it had one, and a row resting is as if it had never been put off. A row already
 * off stays as it is.
 */
export function setupPutOffNext(
  s: SetupPutOff,
  ids: readonly string[],
  change: SetupPutOffChange,
  nowMs: number,
): SetupPutOff {
  const later = new Set(s.later);
  const rests = new Map(Object.entries(s.rests));
  for (const id of ids) {
    if (!change.on) {
      if (later.has(id)) later.delete(id);
      else rests.delete(id);
    } else if (!setupOffNow(s, id, nowMs)) {
      const good = change.why === "answer" || (change.why === "rest" && putOffEnds(setupBack(s, id, nowMs)) === "good");
      if (good) later.add(id);
      else rests.set(id, new Date(nowMs + SETUP_REST_MS).toISOString());
    }
  }
  return { later: [...later], rests: Object.fromEntries(rests) };
}

/**
 * What waiting on a kept number's forwarding costs, said wherever it is put off: the phone step's "Set up forwarding
 * later" and Today's Skip of "The number you already have", for a week or for good (putOffEnds).
 */
export const FORWARDING_WAIT_WORDS = "Until it is set up, only calls to your receptionist's own number are answered.";

/** Why putting a row off, or back, did not start: nothing was saved, and the rows stay as they were. */
export const SETUP_LATER_REFUSED = {
  reading: "Setting up is still being read. Try again in a moment.",
  unread: "What you put off could not be read just now, so nothing changed. Try again in a moment.",
} as const;
