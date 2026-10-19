/**
 * While you were away: the bell's unread rows as Today reads them (what the page already draws above dropped, like rows
 * grouped, warnings first), and the bell itself read the same way, new above earlier. The rows are notifications.ts's.
 *
 * ONE GROUPING. The away card is the bell's "New" section less what Today draws elsewhere, in the order a warning asks:
 * it groups through `bellSections`, the one function, so the bell and the card say "9 calls" about the same nine calls and a
 * group opens the same way in both (a press unfolds the notes under it, each of which opens its own record and is read as it
 * is opened: AwayGroupVM.members). What differs is the bell's to keep and the card's to leave: the bell holds read notes under
 * Earlier and can dismiss one, the card lists the unread ones alone, minus the queue's (task 5.2, D1-notice-two-drawings).
 */
import { reviewNoticeIsAbout } from "../google/google";
import { conversationOfNeedsKey, callOfKey, kindListDoor, unreadCount } from "./notifications";

/* --------------------------- while you were away ------------------------- */

/** A bell row as the bell publishes it, as far as this reads it. */
export interface AwayRowLike {
  id?: string;
  key?: string;
  kind?: string;
  unread: boolean;
  title: string;
  message: string;
  tone: "" | "ok" | "warn";
  icon: string;
  about?: { type: string; id: string } | null;
  /** Where the row's button goes (the bell's rows carry it as actions[0].to): a held draft is keyed by its message and names its thread only here. */
  to?: string;
  actions?: Array<{ to: string }>;
}

/**
 * What the page draws above the card is about, for the away card's dedupe: a queue row's thread, its call, or both (a bare string
 * is a thread), a waiting search by its door (`searchTo`, leadQuestionRoute), which the bell's question row about it opens too, a
 * run the queue draws by its name, and the review the card's line draws (`review`, contracts GoogleVM.todayLine), whose notice is
 * the same news a second time.
 */
export type AwayQueueRef =
  | string
  | {
      conversationId?: string | null;
      callId?: string | null;
      runLabel?: string | null;
      searchTo?: string | null;
      review?: { id: string; reviewId?: string | null } | null;
    };

/**
 * The titles the edge gives a run held for a word: `Campaign “Win-back · quiet 30 days” is ready: 1 person` (core
 * run-playbook.ts), and `Playbook “…” is ready` before a person read "campaign" everywhere (decision 19 of 9 Oct 2026):
 * the bell keeps rows written before, and production holds them. A row kept before the notice named its run carries no
 * `about` and its door is `outbound`, so the run's own name is the one thing every such row shares with the queue's row
 * about the same run.
 */
const readyRunTitles = (label: string) => [`Campaign “${label}” is ready`, `Playbook “${label}” is ready`];

export interface AwayGroupVM<T extends AwayRowLike> {
  /** The row itself when it stands alone; the newest of the group otherwise. */
  row: T;
  /** How many rows this stands for. 1 is an ordinary row. */
  count: number;
  /** The group's words when it stands for more than one. */
  title: string | null;
  /** Every row it swallowed, so read and dismiss reach all of them. */
  ids: string[];
  /** Every row it stands for, in the order the bell holds them: what a group shows when it is opened, each note opening its own record. */
  members: T[];
  /**
   * Where the rows of a group are held together. A row alone opens its own; a group whose rows all point at one place (one thread,
   * one page) names that place; a group whose rows point at different records names the list that holds them (kindListDoor),
   * since the newest one's record is one of several. Null where no row names a door. A press on a group opens the notes under it,
   * as the bell's does; this is where "all of them" is, for a reader that wants it.
   */
  door: string | null;
  /** The words of a list's door ("Open the Inbox"), for a group that opens one; null where the newest row's own button says it. */
  action: string | null;
}

/**
 * One noun per kind: a group of like rows says how many, and links where all
 * of them live. A kind with no noun here never groups, so a new kind of alert
 * shows itself rather than being counted into a total nobody can read. Never
 * derived from the kind's spelling.
 */
const AWAY_NOUN: Record<string, [one: string, many: string]> = {
  call: ["call", "calls"],
  job_failed: ["job did not finish", "jobs did not finish"],
  review: ["new rating on Google", "new ratings on Google"],
  calendar_people: ["person added from your calendar", "people added from your calendar"],
  booking_notice: ["booking email needs a look", "booking emails need a look"],
  handoff: ["conversation needs you", "conversations need you"],
  playbook: ["campaign is ready", "campaigns are ready"],
  // One sync can approve several at once, and several rejections read as one
  // problem with the wording, not as five separate pieces of news.
  template_ready: ["template is ready to send", "templates are ready to send"],
  template_blocked: ["template cannot be sent", "templates cannot be sent"],
  // "A broadcast finished" is already this repo's word for the event
  // (activity.ts, kind broadcast.sent), so the bell and the Activity log say
  // the same thing about the same fact.
  broadcast_sent: ["run finished", "runs finished"],
  broadcast_stopped: ["run did not go out", "runs did not go out"],
  note_for_you: ["note left for you", "notes left for you"],
  // A search that stopped to ask: it waits a day for the answer, then stops and keeps what it found.
  leads_question: ["search is waiting for your answer", "searches are waiting for your answer"],
  // Searches finish in runs (a morning's round of eight), and eight "is done" rows buried the bell's first screen.
  leads_ready: ["search finished", "searches finished"],
  // A reach-out that wrote to several businesses hears back from several (Reach out Part 5).
  reach_out_replied: ["reply from a lead", "replies from leads"],
  // A campaign's unsubscribes and STOPs come in a run (decision 0048): several are one pattern, in the Inbox's words.
  opted_out: ["person asked to stop", "people asked to stop"],
  // A day of bookings is one pattern, each its own visit (S1-01); a read of the calendar that found several is one row already.
  booking: ["new booking", "new bookings"],
  // Two invitations accepted the same morning read as a team that grew.
  member_joined: ["teammate joined", "teammates joined"],
  member_left: ["teammate left", "teammates left"],
  // A morning's corrections can suggest several notes: one pile, each kept or dismissed on the Autonomy pane.
  note_to_keep: ["note to keep for the receptionist", "notes to keep for the receptionist"],
};

/**
 * A group's words count what its rows are ABOUT, not the rows: sixteen nightly alerts about one thread read
 * "16 conversations need you" (the 2 Oct 2026 audit). A row with no subject stands for itself. Said once, for the
 * away card and the bell, so the two cannot count one pile two ways.
 */
function groupTitle<T extends { about?: { type: string; id: string } | null }>(
  members: readonly T[],
  noun: [one: string, many: string],
  idOf: (r: T) => string,
): string {
  const subjects = new Set(members.map((m) => (m.about ? `${m.about.type}:${m.about.id}` : idOf(m)))).size;
  return `${subjects} ${noun[subjects === 1 ? 0 : 1]}`;
}

/** A warning outranks good news, whatever their clocks say. */
const AWAY_TONE_RANK: Record<string, number> = { warn: 0, "": 1, ok: 2 };

/** Two of a kind is already a pattern; one is news. */
const AWAY_GROUP_MIN = 2;

/** Nothing unread anywhere: the one state this card may congratulate. */
const AWAY_EMPTY_CLEAR = "All caught up.";

/**
 * Nothing to draw, but the bell is not empty: every unread row is a
 * conversation the queue at the top of this page is already showing.
 *
 * Beside a bell of 4 this card printed a green check and "All caught up."
 * -- a congratulation over four unread things, and the plainest untrue
 * sentence on the page.
 */
const AWAY_EMPTY_QUEUED = "Everything new is already in the queue above.";

/**
 * The foot.
 *
 * Every row it counts IS in the bell -- the ones under the cap and the ones
 * this card dropped because the queue above already has them -- which is
 * what makes the sentence true. It used to count only the first kind and say
 * "in the bell" about it, so a card showing five of seven unread rows, two of
 * them queued, drew no foot at all while the bell held two more.
 *
 * The number comes first in every wording: the head is this number plus what
 * is on screen, and that is what a reader (and e2e/signals.ts) adds up. With
 * no row drawn there is no foot: the head has said the number and the empty
 * line has said where they are, and a card says each number once.
 */
function awayFoot(more: number, queued: number, drew: boolean): string | null {
  if (more <= 0 || !drew) return null;
  const head = `${more} more in the bell`;
  if (queued <= 0) return head;
  return queued === more
    ? `${head}, already in the queue above`
    : `${head}, ${queued} of them already in the queue above`;
}

/**
 * Where a group of two or more rows opens (AwayGroupVM.door): the one place their doors share, else the list that holds
 * every row of their kind. A kind with no list falls back to the first door there is, which the table in
 * tooling/scripts/tests/today/today-away-page.test.mjs keeps from happening to a kind that groups.
 */
function groupDoor(
  kind: string,
  doors: ReadonlyArray<string | undefined>,
): Pick<AwayGroupVM<AwayRowLike>, "door" | "action"> {
  const first = doors[0];
  if (first !== undefined && doors.every((d) => d === first)) return { door: first, action: null };
  const list = kindListDoor(kind);
  return list ? { door: list.to, action: list.action } : { door: first ?? null, action: null };
}

/** The away card: the rows it draws, the numbers beside them, and every sentence it says. */
export interface TodayAwayVM<T extends AwayRowLike> {
  /** What it draws, grouped and capped. */
  groups: Array<AwayGroupVM<T>>;
  /**
   * The head's number: EVERY unread row the bell holds, including the ones
   * this card does not draw. The card and the badge are two readings of one
   * set, and a head counting only what survived the queue rule read 0 beside
   * a bell of 4. "Mark all read" sits against this number and clears exactly
   * this set.
   */
  total: number;
  /** Of `total`, how many are not on screen: under the cap, or in the queue above. */
  more: number;
  /** Of `more`, the ones dropped because the queue above already holds what they are about: their thread or their call. */
  queued: number;
  /** The foot, when a row is drawn and something unread is not on screen. */
  foot: string | null;
  /** What the card says when it draws no row, and the glyph beside it. */
  empty: { icon: string; text: string } | null;
}

/**
 * What happened while the owner was away, as Today reads it rather than as
 * the bell lists it.
 *
 * Three rules, and each one was a real page: a row about anything already sitting
 * in the queue at the top of this page (its thread or its call) is NOT repeated here; twelve calls
 * from the same line become one row that says twelve, because five identical
 * "No conversation happened" cards pushed a WhatsApp quality downgrade and
 * three failed jobs off the bottom; and a warning sorts above good news, so
 * the downgrade is not outranked by a five-star rating that landed later.
 */
export function todayAwayGrouped<T extends AwayRowLike>(
  rows: readonly T[],
  inQueue: readonly AwayQueueRef[] = [],
  max = 5,
  // The unread kept rows the bell does not list (older than its newest BELL_LIST_ROWS): counted in the head, said alone.
  older = 0,
): TodayAwayVM<T> {
  const convs = new Set(
    inQueue.flatMap((q) => {
      const id = typeof q === "string" ? q : q.conversationId;
      return id ? [id] : [];
    }),
  );
  const callsQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.callId ? [] : [q.callId])));
  const runsQueued = inQueue.flatMap((q) => (typeof q === "string" || !q.runLabel ? [] : readyRunTitles(q.runLabel)));
  const searchesQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.searchTo ? [] : [q.searchTo])));
  const reviewsDrawn = inQueue.flatMap((q) => (typeof q === "string" || !q.review ? [] : [q.review]));
  const idOf = (r: T) => r.id ?? r.key ?? "";
  // A row about a conversation says so in three different ways, and only one of
  // them is `about`. A KEPT row (the edge wrote it) carries the subject; a
  // DERIVED "needs you" row is computed from the Inbox this browser holds and
  // carries nothing but its key; a DERIVED held draft is keyed by its message
  // and names its thread only through its door. A call is a kept row's subject
  // or a derived missed call's key. Reading `about` alone printed the three
  // conversations at the top of the page again, here; reading the thread key
  // alone covered two of the queue's four kinds, so a closing window's thread
  // printed again and a call's row never could be covered.
  const door = (r: T) => r.to ?? (r.actions && r.actions[0] ? r.actions[0].to : undefined);
  const aboutQueued = (r: T) => {
    // A run waiting for a word is a row of the queue; the bell's "is ready" about the same run says it again.
    if (r.kind === "playbook" && runsQueued.some((title) => r.title.startsWith(title))) return true;
    // A search waiting on its answer is a row of the queue; the bell's question row about it opens the same pile (00163).
    if (r.kind === "leads_question" && searchesQueued.has(door(r) ?? "")) return true;
    // A new review is a line of the card above (GoogleVM.todayLine) for as long as it is news and unanswered; the bell's notice of
    // the same review is that news a second time, and opening either left the other and the badge as they were.
    if (r.kind === "review" && reviewsDrawn.some((review) => reviewNoticeIsAbout(r.about, review))) return true;
    if (r.about && r.about.type === "conversation" && convs.has(r.about.id)) return true;
    if (r.about && r.about.type === "call" && callsQueued.has(r.about.id)) return true;
    const cv = conversationOfNeedsKey(idOf(r));
    if (cv !== null && convs.has(cv)) return true;
    const call = callOfKey(idOf(r));
    if (call !== null && callsQueued.has(call)) return true;
    const to = door(r);
    return !!to && to.startsWith("inbox/th-") && convs.has(to.slice("inbox/th-".length));
  };
  const fresh = rows.filter((r) => r.unread && !aboutQueued(r));

  // The bell's own grouping (bellSections), over what is unread and not drawn above: every row here is new, so its one section
  // is "New", and its lines are the card's groups, each kind said once where the newest of it stood.
  const groups = bellSections(fresh)
    .flatMap((section) => section.lines)
    .map((line): AwayGroupVM<T> => {
      const { row, members } = line;
      if (line.count < AWAY_GROUP_MIN)
        return { row, count: 1, title: null, ids: [idOf(row)], members, door: door(row) ?? null, action: null };
      return {
        row,
        count: line.count,
        title: line.title,
        ids: members.map(idOf),
        members,
        ...groupDoor(
          row.kind ?? "",
          members.map((m) => door(m)),
        ),
      };
    });

  const rank = (g: AwayGroupVM<T>) => AWAY_TONE_RANK[g.row.tone] ?? 1;
  const sorted = groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => rank(x.g) - rank(y.g) || x.i - y.i)
    .map((x) => x.g);
  // The head says how many unread things the BELL holds and the foot how many
  // of them are not on screen, so the two add up: a group of twelve stands for
  // twelve, not for one (counting groups read as "22 ... and 2 more").
  //
  // The head is the bell's own number, not what is left after the queue rule.
  // A row this card drops because the queue above already shows it is still a
  // row in the bell, so it is counted in BOTH numbers rather than in neither:
  // the card said 0 and "All caught up." while the badge two inches away said
  // 4, and no foot was drawn at all while the bell held four.
  const shown = sorted.slice(0, max);
  const stoodFor = shown.reduce((n, g) => n + g.count, 0);
  const total = unreadCount(rows) + older;
  const queued = unreadCount(rows) - fresh.length;
  const more = Math.max(0, total - stoodFor);
  // Keyed on `fresh`, not on what the cap left: a card with nothing to draw is
  // empty because the queue holds everything, and that is only true of `fresh`.
  // Only older rows unread: the card says so, with the act that clears them.
  const empty = fresh.length
    ? null
    : total === 0
      ? { icon: "check", text: AWAY_EMPTY_CLEAR }
      : queued > 0
        ? // The queue above holds the new rows, and the older ones are said beside it: the head counted both.
          { icon: "arrow-up", text: older > 0 ? `${AWAY_EMPTY_QUEUED} ${bellOlderWords(older)}` : AWAY_EMPTY_QUEUED }
        : { icon: "bell", text: bellOlderWords(older) };
  return { groups: shown, total, more, queued, foot: awayFoot(more, queued, shown.length > 0), empty };
}

/** What the bell's grouping reads of a note: who it is, what kind, and whether it is new. */
export interface BellNoteLike {
  id?: string;
  key?: string;
  kind?: string;
  unread: boolean;
  /** What a kept note is about, when the edge said: a group's words count the subjects, not the notes. */
  about?: { type: string; id: string } | null;
}

/** One line of the bell: a note, or several notes of one kind said once ("9 calls"), which open with a tap. */
export interface BellLineVM<T extends BellNoteLike> {
  /** Stable across repaints: the note's own id, or the section and kind for a group. */
  key: string;
  /** The note itself when it stands alone; the newest of the group otherwise. */
  row: T;
  /** How many notes this stands for. 1 is an ordinary note. */
  count: number;
  /** The group's words when it stands for more than one. */
  title: string | null;
  /** Every note it stands for, newest first: what the group shows when it is opened. */
  members: T[];
}

export interface BellSectionVM<T extends BellNoteLike> {
  /** "New", "Earlier", or the sentence for the unread rows the bell does not list (bellOlderWords), which has no lines. */
  label: string;
  lines: Array<BellLineVM<T>>;
}

/** The unread kept rows the bell does not list, and the act that clears them (the bell lists its newest BELL_LIST_ROWS). */
const bellOlderWords = (n: number): string =>
  n === 1
    ? "1 older unread notice is not listed. Mark all read clears it."
    : `${n} older unread notices are not listed. Mark all read clears them.`;

/**
 * The bell, read the way the away card reads it: new above earlier, and notes of one kind said once, where the
 * newest of them stood. On the salon's phone the bell was 48 notes and 6,677px, nine of them "… phoned · 12 s" and
 * eight "Your search for … is done", every one a card with its own button. The nouns are the away card's, so the
 * bell and Today say "9 calls" about the same nine calls. A kind with no noun (a thread that needs you) is never
 * folded: each of those is its own decision.
 */
export function bellSections<T extends BellNoteLike>(rows: readonly T[], older = 0): Array<BellSectionVM<T>> {
  const idOf = (r: T) => r.id ?? r.key ?? "";
  const part = (label: BellSectionVM<T>["label"], list: T[]): BellSectionVM<T> => {
    const order: string[] = [];
    const byKind = new Map<string, T[]>();
    for (const r of list) {
      const k = r.kind && AWAY_NOUN[r.kind] ? r.kind : `@${idOf(r)}`;
      if (!byKind.has(k)) {
        byKind.set(k, []);
        order.push(k);
      }
      byKind.get(k)!.push(r);
    }
    const lines: Array<BellLineVM<T>> = [];
    for (const k of order) {
      const members = byKind.get(k) ?? [];
      const noun = AWAY_NOUN[k];
      if (!noun || members.length < AWAY_GROUP_MIN) {
        for (const r of members) lines.push({ key: idOf(r), row: r, count: 1, title: null, members: [r] });
        continue;
      }
      lines.push({
        key: `${label}:${k}`,
        row: members[0],
        count: members.length,
        title: groupTitle(members, noun, idOf),
        members,
      });
    }
    return { label, lines };
  };
  return [
    part(
      "New",
      rows.filter((r) => r.unread),
    ),
    part(
      "Earlier",
      rows.filter((r) => !r.unread),
    ),
  ]
    .filter((s) => s.lines.length > 0)
    .concat(older > 0 ? [{ label: bellOlderWords(older), lines: [] }] : []);
}
