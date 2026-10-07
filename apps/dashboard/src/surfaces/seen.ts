/**
 * What the reader has seen, in this tab, between two reads of the server (00345; contracts conversations/standing.ts
 * isUnseen says what the server holds).
 *
 * A row says it is new to the reader from the last read: the customer wrote or called after the reader last opened the
 * person. Opening a person is the reader's own mark (PUT contacts/:id/seen), kept, so the row stays read on the next
 * read and on their other screens. This is the moment between: the row reads as read the instant it is opened, and
 * stays so over a read that left before the mark landed, until something newer than the opening comes in. Mark as
 * unread is the same door the other way, and holds the row unread while the reader stays on it.
 *
 * And the bell's half: a person with a note about them still unread in the bell says so on their row too, and opening
 * them reads the note, so the bell and the lists never disagree about who is new (Ruben, 7 Oct 2026).
 *
 * One store for the Inbox, Conversations and People, which show the same people: a person opened in one is read in
 * all three at once. Nothing here is kept past the tab; the server's marks, and the bell's, are the record.
 */
import { noteWhose } from "@chanlytics/contracts";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/legacy-bridge/api";
import type { BellApi } from "@/legacy-bridge/notifications";
import { object } from "./shell-doors";

/** Whose row it is: the person, and their conversation where the row knows it. */
interface RowOf {
  personId?: string | null;
  conversationId?: string | null;
}

/**
 * What this tab has read of each person, by their id: when they had last written or called as the row opened said it
 * (epoch ms, the server's own clock). Never this device's clock, which may run ahead of the server's: a mark stamped
 * with it hid whatever the customer wrote in the minutes between.
 */
const seenHere = new Map<string, number>();
/** The people this tab put back as unread: the row says so until a read does, or they are opened. */
const putBack = new Set<string>();
/** The person put back while open: opening anyone lets go of it, so a row put back is not read again by staying on it. */
let heldUnread: string | null = null;

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

/** The mark itself. Quiet: nothing is re-read behind it (refresh-map), and a mark that fails is made again by the next opening. */
const mark = (personId: string, seen: boolean) => {
  void api()("PUT contacts/[id]/seen", { params: { id: personId }, body: { seen } }).catch(() => {});
};

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
 * bell holds about them. `heardAtMs` is when they had last written or called, as the row opened said it: what this
 * tab has read, until a read brings something newer.
 */
export function seePerson(who: RowOf, heardAtMs = 0): void {
  const from = bell();
  for (const key of notesAbout(who)) {
    notesRead.add(key);
    from?.read(key);
  }
  if (from) notes = readNotes(from);
  // Marked once for what they last said: a note about them read later (the bell's own read landing after the list's)
  // is the note's alone, and asks nothing more of the server.
  if (who.personId && (putBack.has(who.personId) || seenHere.get(who.personId) !== heardAtMs)) {
    seenHere.set(who.personId, heardAtMs);
    putBack.delete(who.personId);
    mark(who.personId, true);
  }
  heldUnread = null;
  told();
}

/** The reader put this person back as unread: their row says so until they open it again. */
export function unseePerson(personId: string): void {
  seenHere.delete(personId);
  putBack.add(personId);
  heldUnread = personId;
  mark(personId, false);
  told();
}

/**
 * Whether a row reads as unread now: what the last read said (`unseen`), over what this tab did since, or a note about
 * them the bell still holds unread. `heardAtMs` is when they last wrote or called, as the row holds it: a person opened
 * here at or after it is read, whatever an older read says.
 */
export function unreadHere(who: RowOf, unseen: boolean, heardAtMs: number): boolean {
  const id = who.personId;
  if (id && putBack.has(id)) {
    // The read caught up with the mark: the server's word from here, on this screen as on their others.
    if (unseen) putBack.delete(id);
    return true;
  }
  if (notesAbout(who).length) return true;
  if (!id) return unseen;
  const at = seenHere.get(id);
  return at !== undefined && at >= heardAtMs ? false : unseen;
}

/**
 * The person on screen got something new while the reader has them open: it is read as it lands, while the tab is in
 * view. Never a person the reader just put back, who stays unread until they open someone.
 */
function seeWhileOpen(who: RowOf, unseen: boolean, heardAtMs: number): void {
  if (who.personId && heldUnread === who.personId) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (unreadHere(who, unseen, heardAtMs)) seePerson(who, heardAtMs);
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
export function useSeeOpen(who: RowOf | null, unseen: boolean, heardAtMs: number): void {
  const personId = who?.personId ?? null;
  const conversationId = who?.conversationId ?? null;
  const on = !!who;
  const unread = on && unreadHere({ personId, conversationId }, unseen, heardAtMs);
  useEffect(() => {
    if (!on || !unread) return undefined;
    const see = () => seeWhileOpen({ personId, conversationId }, unseen, heardAtMs);
    see();
    document.addEventListener("visibilitychange", see);
    return () => document.removeEventListener("visibilitychange", see);
  }, [on, personId, conversationId, unread, unseen, heardAtMs]);
}

/* ------------------------------------------------------------ a thread's row */

/** What a thread says of its reader: the Inbox's thread, structurally, so this store knows no page's types. */
interface ThreadSeen {
  real?: boolean;
  clientId?: string | null;
  conversationId?: string | null;
  unread: boolean;
  heardAtMs?: number;
}

/** Whose a thread is: the person behind it, and the conversation it is. */
export const threadWhose = (t: ThreadSeen): RowOf => ({ personId: t.clientId, conversationId: t.conversationId });

/** A thread's row, as the Inbox draws it: a seeded thread's flag is the page's own; a real thread's is the reader's mark. */
export function threadUnread(t: ThreadSeen): boolean {
  return t.real ? unreadHere(threadWhose(t), t.unread, t.heardAtMs ?? 0) : t.unread;
}
