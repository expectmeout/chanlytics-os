/**
 * What the reader has seen, in this tab, between two reads of the server (00349; contracts conversations/standing.ts
 * isUnseen says what the server holds).
 *
 * A row says it is new to the reader from the last read: the customer wrote or called after the reader last opened the
 * person. Opening a person is the reader's own mark (PUT contacts/:id/seen), kept, so the row stays read on the next
 * read and on their other screens. This is the moment between: the row reads as read the instant it is opened, and
 * stays so over a read that left before the mark landed. Mark as unread is the same door the other way, and holds the
 * row unread while the reader stays on it.
 *
 * The tab's word lasts only until a read carries its own mark back. Every mark is stamped by the server as it is
 * written (`marked_at`), the door answers with that stamp, and every row carries the stamp of the mark it was read
 * with: a row whose stamp has reached this tab's is the server's word again, whatever it says, so a person put back
 * on the reader's phone reads unread on their desk too. And no clock of this device's judges a row: the mark says how
 * far the reader has seen in the customer's own moments (the row's `heardAtMs`), never when this device thinks it is.
 *
 * And the bell's half: a person with a note about them still unread in the bell says so on their row too, and opening
 * them reads the note, so the bell and the lists never disagree about who is new (Ruben, 7 Oct 2026).
 *
 * One store for the Inbox, Conversations and People, which show the same people: a person opened in one is read in
 * all three at once. Nothing here is kept past the tab; the server's marks, and the bell's, are the record.
 */
import { noteWhose, readingOf, type SeenOf, type SeenReading } from "@chanlytics/contracts";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/legacy-bridge/api";
import type { BellApi } from "@/legacy-bridge/notifications";
import { resnapshotSurface } from "@/legacy-bridge/surface-cache";
import { object } from "./shell-doors";
import { onSurfaceValue, type SurfaceKey } from "./surface-values";

/** Whose row it is: the person, and their conversation where the row knows it. */
interface RowOf {
  personId?: string | null;
  conversationId?: string | null;
}

/** What a row's last read said of its reader, when it said nothing: not new, never heard from, no mark. */
const NO_READING: SeenReading = { unseen: false, heardAtMs: 0, markAtMs: 0 };

/**
 * What this tab did to a person and has not yet read back: opened them, having seen up to `upTo` (when they had last
 * written or called, as the row opened said it), or put them back. `at` is the server's stamp of that mark, null
 * while the request is out.
 */
interface Mine {
  seen: boolean;
  upTo: number;
  at: number | null;
}
const mine = new Map<string, Mine>();
/**
 * The people put back while on screen: opening anyone lets go of them, so a row put back is not read again by staying on
 * it. Several at once where a pick put them back (inbox/pages/pick.tsx): the one open among them stays unread too.
 */
const heldUnread = new Set<string>();
/** The people whose last mark did not land, and when: the row on screen is not marked again at once (seeWhileOpen). */
const failedAt = new Map<string, number>();
/** How long a person on screen whose mark failed waits before it is tried again by itself; a press tries at once. */
const RETRY_AFTER_MS = 30_000;

/**
 * The pages that draw rows draw them again as the store moves: the Inbox, Conversations and People hear it (useSeen).
 * A count and its hearers, read through React's own hook for a store outside it: a mark made in the commit a page
 * mounts in (the thread on screen, read as the Inbox lands) came before the page's listener was on, and its row
 * stayed unread under the thread it had just read.
 */
let moves = 0;
const hearers = new Set<() => void>();
const told = () => {
  moves += 1;
  for (const hear of [...hearers]) hear();
};
const hearStore = (hear: () => void) => {
  hearers.add(hear);
  return () => {
    hearers.delete(hear);
  };
};
const movesNow = () => moves;

/**
 * The mark itself, and the tab's word for it until a read carries it back. Quiet: nothing is re-read behind it
 * (refresh-map). A mark that does not land takes the tab's word with it, so the row says what the server says again,
 * and the next opening makes it again: the client answers a refusal, a timeout and a lost connection as `ok: false`,
 * never a rejection, so a mark left standing on a failed request read as done here and nowhere else.
 */
function send(personId: string, did: { seen: boolean; upTo: number }): void {
  const entry: Mine = { ...did, at: null };
  mine.set(personId, entry);
  failedAt.delete(personId);
  const lost = () => {
    if (mine.get(personId) !== entry) return;
    mine.delete(personId);
    failedAt.set(personId, Date.now());
    told();
  };
  const body =
    did.seen && did.upTo > 0 ? { seen: true, heard_at: new Date(did.upTo).toISOString() } : { seen: did.seen };
  // `refresh: false`: the mark re-reads nothing (refresh-map says so too), and its answer is not kept waiting on the
  // map of what a write makes stale, which a tab loads at its first write.
  void api()("PUT contacts/[id]/seen", { params: { id: personId }, body, refresh: false }).then((res) => {
    if (!res.ok) return lost();
    // A later act of this tab's has taken this one's place: its own answer stamps it.
    if (mine.get(personId) !== entry) return undefined;
    const at = Date.parse(res.data.marked_at ?? "");
    // No stamp to hold a read against: the server's word from here.
    if (!Number.isFinite(at)) {
      mine.delete(personId);
      return undefined;
    }
    entry.at = at;
    // The door's own word on this person, into the rows that draw them, and the tab's cache with them (carriesMark).
    carry(personId, {
      seen_at: res.data.seen_at,
      marked_unread: res.data.marked_unread,
      marked_at: res.data.marked_at,
    });
    return undefined;
  }, lost);
}

/* ------------------------------------------------------------ the mark, carried into the rows */

/**
 * The door's answer is carried into the rows it is about. A surface's value is the server's last word, and the tab's
 * cache paints it on the next load (legacy-bridge/surface-cache.ts); the mark re-reads nothing (refresh-map.ts), so every
 * person opened since a surface's last read was painted unread again on a reload, until the read landed, and one put
 * back was painted read (20 Oct 2026). The answer is the server's own word on the person, so it goes into each surface's
 * rows as it lands, by the read's own rule (contracts readingOf), and the cache follows as it does a saved view.
 */

/** How a surface takes a mark into its rows: true when what it holds changed, and was published. */
type MarkCarrier = (personId: string, mark: SeenOf) => boolean;

/** What a carrier's surface is published and cached under (legacy-bridge/surface-data.ts SurfaceOverride). */
interface CarrierOf {
  key: string;
  value?: SurfaceKey;
  globals?: string[];
  events?: string[];
}

/** The surfaces that draw the dot, each with how it carries a mark (carriesMark). */
const carriers = new Map<string, { of: CarrierOf; carry: MarkCarrier }>();
/** The marks the door stamped for this tab, by person, the latest of each: handed to a surface again as it publishes. */
const carriedMarks = new Map<string, SeenOf>();

/** The workspace the server resolved, which the cache keys its rows by (surface-runner.ts viewedWorkspace). */
const viewedWorkspace = (): string | null => window.__ACTIVE_WORKSPACE ?? null;

/** One surface handed one mark: what changed is cached as a saved view is (resnapshotSurface), and its rows are said to have moved. */
function carryInto(of: CarrierOf, into: MarkCarrier, personId: string, mark: SeenOf): void {
  if (!into(personId, mark)) return;
  resnapshotSurface(of.key, of.globals ?? [], viewedWorkspace(), of.value);
  for (const e of of.events ?? []) window.dispatchEvent(new CustomEvent(e));
}

/** The door's answer, into every surface that draws the person. */
function carry(personId: string, mark: SeenOf): void {
  carriedMarks.set(personId, mark);
  for (const { of, carry: into } of carriers.values()) carryInto(of, into, personId, mark);
}

/**
 * A surface says how a mark is carried into its rows, and is handed every mark of this tab's again whenever it publishes:
 * a read that left before the mark and lands after it holds the server's older word, which the next load would paint. A
 * carrier changes nothing where a row carries the mark or a later one made elsewhere (carriedReading).
 */
export function carriesMark(of: CarrierOf, into: MarkCarrier): void {
  carriers.set(of.key, { of, carry: into });
  if (!of.value) return;
  onSurfaceValue(of.value, () => {
    for (const [personId, mark] of carriedMarks) carryInto(of, into, personId, mark);
  });
}

/**
 * A row's reading under a mark carried into it (contracts readingOf, the read's own rule), or null where the row keeps
 * its own: it carries this mark already, or a later one.
 */
export function carriedReading(row: { heardAtMs?: number; markAtMs?: number }, mark: SeenOf): SeenReading | null {
  const reading = readingOf(row.heardAtMs ?? 0, mark);
  return (row.markAtMs ?? 0) >= reading.markAtMs ? null : reading;
}

/* ------------------------------------------------------------ the bell's half */

/** The bell's unread notes about one person, as their keys: by the person, and by their conversation. */
interface Notes {
  byPerson: Map<string, string[]>;
  byConversation: Map<string, string[]>;
  /** What the notes are, in one word: two readings that say the same draw nothing again. */
  says: string;
}

/** The notes this tab read by opening who they are about: read here at once, before the bell's own read says so. */
const notesRead = new Set<string>();
/** The bell's unread notes, worked out once per change of the bell and never per row; none before the first row asks. */
let notes: Notes | null = null;
/** The bell this tab listens to: the top bar's, once it is there. */
let heardBell: BellApi | null = null;

const bell = (): BellApi | undefined => (typeof window === "undefined" ? undefined : object<BellApi>("__notifs"));

const NO_NOTES: Notes = { byPerson: new Map(), byConversation: new Map(), says: "" };

function readNotes(from: BellApi): Notes {
  const byPerson = new Map<string, string[]>();
  const byConversation = new Map<string, string[]>();
  const keep = (map: Map<string, string[]>, id: string, key: string) => {
    const held = map.get(id);
    if (held) held.push(key);
    else map.set(id, [key]);
  };
  const keys: string[] = [];
  for (const row of from.feed()) {
    if (!row.unread || notesRead.has(row.id)) continue;
    const whose = noteWhose({ about: row.about, to: row.actions[0]?.to ?? "" });
    if (!whose) continue;
    if (whose.conversationId) keep(byConversation, whose.conversationId, row.id);
    if (whose.personId) keep(byPerson, whose.personId, row.id);
    keys.push(row.id);
  }
  return { byPerson, byConversation, says: keys.sort().join(" ") };
}

/** The bell's unread notes about people, read again only when the bell says it changed. */
function unreadNotes(): Notes {
  const from = bell();
  if (!from) return NO_NOTES;
  if (heardBell !== from) {
    heardBell = from;
    notes = null;
    from.onChange(() => {
      const was = notes;
      notes = readNotes(from);
      if (was && was.says !== notes.says) told();
    });
  }
  return (notes ??= readNotes(from));
}

/** The keys of the bell's unread notes about this person or their conversation. */
function notesAbout(who: RowOf): string[] {
  const all = unreadNotes();
  if (all === NO_NOTES) return [];
  return [
    ...((who.personId && all.byPerson.get(who.personId)) || []),
    ...((who.conversationId && all.byConversation.get(who.conversationId)) || []),
  ];
}

/* ------------------------------------------------------------ the reader's own marks */

/**
 * The reader opened this person: their row is read from now, here at once and on the server, and so is every note the
 * bell holds about them. `reading` is what the row opened said: the mark says they have seen up to when the customer
 * had last written or called then, so what comes in after is new whatever any clock says.
 */
export function seePerson(who: RowOf, reading: SeenReading = NO_READING): void {
  markSeen(who, reading);
  heldUnread.clear();
  told();
}

/** The mark that a person is read, and the bell's notes about them with it: nothing drawn again yet. */
function markSeen(who: RowOf, reading: SeenReading): void {
  const from = bell();
  for (const key of notesAbout(who)) {
    notesRead.add(key);
    from?.read(key);
  }
  if (from) notes = readNotes(from);
  // Marked once for what they last said: a note about them read later (the bell's own read landing after the list's)
  // is the note's alone, and asks nothing more of the server.
  const id = who.personId;
  const done = id ? mine.get(id) : undefined;
  if (id && !(done && done.seen && done.upTo === reading.heardAtMs)) send(id, { seen: true, upTo: reading.heardAtMs });
}

/**
 * The reader marked several people as read at once, from a pick, without opening any: each as `seePerson` marks one,
 * the pages told once. Nobody was opened, so a person put back while on screen stays held unless they are among these.
 */
export function seePeople(rows: ReadonlyArray<{ who: RowOf; reading: SeenReading }>): void {
  for (const row of rows) {
    markSeen(row.who, row.reading);
    if (row.who.personId) heldUnread.delete(row.who.personId);
  }
  told();
}

/** The reader put this person back as unread: their row says so until they open it again. */
export function unseePerson(personId: string): void {
  unseePeople([{ personId }]);
}

/** The reader put several people back as unread at once, from a pick: the pages are told once. */
export function unseePeople(people: ReadonlyArray<RowOf>): void {
  for (const who of people) {
    if (!who.personId) continue;
    heldUnread.add(who.personId);
    send(who.personId, { seen: false, upTo: 0 });
  }
  told();
}

/**
 * Whether a row reads as unread now: what its last read said (`reading`), under what this tab did since and has not
 * read back, or a note about them the bell still holds unread.
 */
export function unreadHere(who: RowOf, reading: SeenReading): boolean {
  if (notesAbout(who).length) return true;
  const id = who.personId;
  const did = id ? mine.get(id) : undefined;
  if (!id || !did) return reading.unseen;
  // The read carries this tab's mark, or one made since (on another screen of theirs): the server's word from here.
  if (did.at !== null && reading.markAtMs >= did.at) {
    mine.delete(id);
    return reading.unseen;
  }
  if (!did.seen) return true;
  // Read here up to what they had said then; something newer is new, as the read says.
  return did.upTo >= reading.heardAtMs ? false : reading.unseen;
}

/**
 * The person on screen got something new while the reader has them open: it is read as it lands, while the tab is in
 * view. Never a person the reader just put back, who stays unread until they open someone; and not one whose mark has
 * just failed, which a press makes again and staying on them does only after a while.
 */
function seeWhileOpen(who: RowOf, reading: SeenReading): void {
  const id = who.personId;
  if (id && heldUnread.has(id)) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const failed = id ? failedAt.get(id) : undefined;
  if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) return;
  if (unreadHere(who, reading)) seePerson(who, reading);
}

/* ------------------------------------------------------------ for a page */

/**
 * A page that draws rows draws them again when a person is opened or put back, here or on another of the three. What
 * it answers moves each time: a page whose rows hold still between draws (People's) keys what they draw from on it.
 */
export function useSeen(): number {
  return useSyncExternalStore(hearStore, movesNow, movesNow);
}

/**
 * The person on screen is read: as the page opens on them, as something new of theirs lands, and as the tab comes back
 * into view. `who` is null while nobody is on screen (a phone showing its list).
 */
export function useSeeOpen(who: RowOf | null, reading: SeenReading = NO_READING): void {
  const personId = who?.personId ?? null;
  const conversationId = who?.conversationId ?? null;
  const on = !!who;
  const { unseen, heardAtMs, markAtMs } = reading;
  const unread = on && unreadHere({ personId, conversationId }, reading);
  useEffect(() => {
    if (!on || !unread) return undefined;
    const see = () => seeWhileOpen({ personId, conversationId }, { unseen, heardAtMs, markAtMs });
    see();
    document.addEventListener("visibilitychange", see);
    return () => document.removeEventListener("visibilitychange", see);
  }, [on, personId, conversationId, unread, unseen, heardAtMs, markAtMs]);
}

/* ------------------------------------------------------------ a thread's row */

/** What a thread says of its reader: the Inbox's thread, structurally, so this store knows no page's types. */
interface ThreadSeen {
  real?: boolean;
  clientId?: string | null;
  conversationId?: string | null;
  unread: boolean;
  heardAtMs?: number;
  markAtMs?: number;
}

/** Whose a thread is: the person behind it, and the conversation it is. */
export const threadWhose = (t: ThreadSeen): RowOf => ({ personId: t.clientId, conversationId: t.conversationId });

/** What a thread's last read said of its reader. */
export const threadReading = (t: ThreadSeen): SeenReading => ({
  unseen: t.unread,
  heardAtMs: t.heardAtMs ?? 0,
  markAtMs: t.markAtMs ?? 0,
});

/** A thread's row, as the Inbox draws it: a seeded thread's flag is the page's own; a real thread's is the reader's mark. */
export function threadUnread(t: ThreadSeen): boolean {
  return t.real ? unreadHere(threadWhose(t), threadReading(t)) : t.unread;
}
