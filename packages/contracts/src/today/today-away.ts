/**
 * While you were away: the bell's unread rows as Today reads them (the queue's subjects dropped, like rows
 * grouped, warnings first), and the bell itself read the same way, new above earlier. The rows are
 * notifications.ts's.
 */
import { conversationOfNeedsKey, callOfKey, unreadCount } from "./notifications";

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
 * What a queue row is about, for the away card's dedupe: its thread, its call, or both. A bare string is a thread.
 * `searchTo` is a waiting search's door (leadQuestionRoute), which the bell's question row about it opens too.
 */
export type AwayQueueRef =
  | string
  | { conversationId?: string | null; callId?: string | null; runLabel?: string | null; searchTo?: string | null };

/**
 * The title the edge gives a run held for a word: `Playbook “Win-back · quiet 30 days” is ready: 1 person`
 * (core run-playbook.ts). The row carries no `about` and its door is `outbound`, so the run's own name is
 * the only thing it shares with the queue's row about the same run.
 */
const readyRunTitle = (label: string) => `Playbook “${label}” is ready`;

export interface AwayGroupVM<T extends AwayRowLike> {
  /** The row itself when it stands alone; the newest of the group otherwise. */
  row: T;
  /** How many rows this stands for. 1 is an ordinary row. */
  count: number;
  /** The group's words when it stands for more than one. */
  title: string | null;
  /** Every row it swallowed, so read and dismiss reach all of them. */
  ids: string[];
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
  handoff: ["conversation needs you", "conversations need you"],
  playbook: ["playbook is ready", "playbooks are ready"],
  // One sync can approve several at once, and several rejections read as one
  // problem with the wording, not as five separate pieces of news.
  template_ready: ["template is ready to send", "templates are ready to send"],
  template_blocked: ["template cannot be sent", "templates cannot be sent"],
  // "A broadcast finished" is already this repo's word for the event
  // (activity.ts, kind broadcast.sent), so the bell and the Activity log say
  // the same thing about the same fact.
  broadcast_sent: ["broadcast finished", "broadcasts finished"],
  broadcast_stopped: ["broadcast did not go out", "broadcasts did not go out"],
  note_for_you: ["note left for you", "notes left for you"],
  // A search that stopped to ask: it waits a day for the answer, then stops and keeps what it found.
  leads_question: ["search is waiting for your answer", "searches are waiting for your answer"],
  // Searches finish in runs (a morning's round of eight), and eight "is done" rows buried the bell's first screen.
  leads_ready: ["search finished", "searches finished"],
  // A reach-out that wrote to several businesses hears back from several (Reach out Part 5).
  reach_out_replied: ["reply to a reach-out", "replies to a reach-out"],
};

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
): TodayAwayVM<T> {
  const convs = new Set(
    inQueue.flatMap((q) => {
      const id = typeof q === "string" ? q : q.conversationId;
      return id ? [id] : [];
    }),
  );
  const callsQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.callId ? [] : [q.callId])));
  const runsQueued = inQueue.flatMap((q) => (typeof q === "string" || !q.runLabel ? [] : [readyRunTitle(q.runLabel)]));
  const searchesQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.searchTo ? [] : [q.searchTo])));
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

  const order: string[] = [];
  const byKind = new Map<string, T[]>();
  for (const r of fresh) {
    const k = r.kind && AWAY_NOUN[r.kind] ? r.kind : `@${idOf(r)}`;
    let bucket = byKind.get(k);
    if (!bucket) {
      bucket = [];
      byKind.set(k, bucket);
      order.push(k);
    }
    bucket.push(r);
  }

  const groups: Array<AwayGroupVM<T>> = [];
  for (const k of order) {
    const members = byKind.get(k) ?? [];
    const noun = AWAY_NOUN[k];
    if (!noun || members.length < AWAY_GROUP_MIN) {
      for (const r of members) groups.push({ row: r, count: 1, title: null, ids: [idOf(r)] });
      continue;
    }
    groups.push({
      row: members[0],
      count: members.length,
      title: `${members.length} ${noun[1]}`,
      ids: members.map(idOf),
    });
  }

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
  const total = unreadCount(rows);
  const queued = total - fresh.length;
  const more = Math.max(0, total - stoodFor);
  // Keyed on `fresh`, not on what the cap left: a card with nothing to draw is
  // empty because the queue holds everything, and that is only true of `fresh`.
  const empty = fresh.length
    ? null
    : total === 0
      ? { icon: "check", text: AWAY_EMPTY_CLEAR }
      : { icon: "arrow-up", text: AWAY_EMPTY_QUEUED };
  return { groups: shown, total, more, queued, foot: awayFoot(more, queued, shown.length > 0), empty };
}

/** What the bell's grouping reads of a note: who it is, what kind, and whether it is new. */
export interface BellNoteLike {
  id?: string;
  key?: string;
  kind?: string;
  unread: boolean;
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
  label: "New" | "Earlier";
  lines: Array<BellLineVM<T>>;
}

/**
 * The bell, read the way the away card reads it: new above earlier, and notes of one kind said once, where the
 * newest of them stood. On the salon's phone the bell was 48 notes and 6,677px, nine of them "… phoned · 12 s" and
 * eight "Your search for … is done", every one a card with its own button. The nouns are the away card's, so the
 * bell and Today say "9 calls" about the same nine calls. A kind with no noun (a thread that needs you) is never
 * folded: each of those is its own decision.
 */
export function bellSections<T extends BellNoteLike>(rows: readonly T[]): Array<BellSectionVM<T>> {
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
        title: `${members.length} ${noun[1]}`,
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
  ].filter((s) => s.lines.length > 0);
}
