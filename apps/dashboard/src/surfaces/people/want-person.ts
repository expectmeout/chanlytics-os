/**
 * Someone a page names that People's rows do not hold yet: a person linked to a business, or made, after People was last read
 * (the wiring's second audit, R10, W-person-list-lead-5). Leads' Talking door, the business beside a name, the people at a lead
 * and the Inbox header's facts read People's rows, and People is not read again on those pages for a person changed: the
 * door was missing, and "· Business" absent, until People was opened.
 *
 * Such a page asks for People to be read again: once for each person in a tab, and once a minute at most whoever asks, since it
 * is the whole book. A person People will never hold (an erased one, a stand-in) costs one read, never one a minute. Before
 * People's first read nothing is asked: that read is on its way. And the person a thread names is read by itself until People
 * holds them (a thread's person, below), so a thread's head never waits on the whole book.
 */
import { useSyncExternalStore } from "react";
import { MIN_MS, type PersonRowVM } from "@chanlytics/contracts";
import { refreshSurface } from "../legacy-verbs";
import { onSurfaceValue, surfaceValue } from "../surface-values";
import { threadPersonRow } from "./surface";

/** People's ids, kept for the rows they were made of: a page names many people. */
let heldRows: unknown = null;
let heldIds: ReadonlySet<string> = new Set();
/** Each person asked for once in this tab. */
const askedFor = new Set<string>();
/** When People was last asked for on someone's account. */
let askedAt = -Infinity;

/** Ask for People to be read again where `personId` is someone it does not hold (see above). Cheap: call it as a page draws. */
export function wantPerson(personId: string | null | undefined): void {
  const rows = surfaceValue("people")?.rows;
  if (!personId || !rows) return;
  if (rows !== heldRows) {
    heldRows = rows;
    heldIds = new Set(rows.map((r) => r.id));
  }
  if (heldIds.has(personId) || askedFor.has(personId)) return;
  const now = Date.now();
  if (now - askedAt < MIN_MS) return;
  askedFor.add(personId);
  askedAt = now;
  // After the page has drawn: a read is never asked for from inside a draw.
  setTimeout(() => void refreshSurface("people"), 0);
}

/* ------------------------------ a thread's person ------------------------------ */

/**
 * The person a thread is with, for the thread's head and its reply box, before People's book is in (the Inbox load review's
 * lane 2, 28 Oct 2026). The head says who they are from People's row: their deal, a visit ahead or behind, where they work, a
 * step due, a name to adopt. People is the heaviest read, and on a cold load it came 0.3 to 0.5 s after the thread, its chips
 * landing on a head already drawn. The thread's own read of them (GET contacts?thread: their People row alone, made as People
 * makes its rows) is started with the Inbox's first reads where the address names the thread (contracts
 * THREAD_PERSON_READ), else as the Inbox's read finds the thread the page opens on, and its first draw waits for it
 * (surfaces/inbox/surface.ts). People's row is drawn in its place once People holds them: People hears every change to a
 * person, and this read is read once.
 */

/** A thread's person as their own read answered, and when it was asked: a step's day is said at that clock. */
interface ThreadPerson {
  row: PersonRowVM | null;
  at: number;
}

/** What each thread's read answered, by its conversation, and the reads asked for: once each in a tab. */
const threadPeople = new Map<string, ThreadPerson>();
const threadAsked = new Map<string, Promise<void>>();
const threadHearers = new Set<() => void>();
let threadVersion = 0;

/**
 * Read the person a thread is with, once in a tab. A read that fails is no person: the head draws as it did without one,
 * and from People's row once People is in.
 */
function readThreadPerson(conversationId: string): Promise<void> {
  const out = threadAsked.get(conversationId);
  if (out) return out;
  const at = Date.now();
  const read = threadPersonRow(conversationId).then(
    (row) => {
      threadPeople.set(conversationId, { row, at });
      threadVersion += 1;
      threadHearers.forEach((h) => h());
    },
    () => undefined,
  );
  threadAsked.set(conversationId, read);
  return read;
}

/** Whether People's rows hold this person: their row is drawn then, and no read of their own is needed. */
export function peopleHold(personId: string | null | undefined): boolean {
  return !!personId && !!surfaceValue("people")?.rows.some((p) => p.id === personId);
}

/**
 * The person a thread is with as its head and its reply box draw them: People's row once People holds them, with the clock
 * People was read at; else the thread's own read of them; else, People read and not holding them, none (a person made since,
 * whom People is asked for: wantPerson). Undefined while nothing has said. `conversationId` is null for a thread of the
 * mockup's, which has no read of its own.
 */
export function personOnThread(
  conversationId: string | null,
  personId: string | null | undefined,
): ThreadPerson | undefined {
  const own = conversationId ? threadPeople.get(conversationId) : undefined;
  const people = surfaceValue("people");
  if (!people) return own;
  const row = personId ? people.rows.find((p) => p.id === personId) : undefined;
  if (row) return { row, at: people.fetchedAt };
  return own ?? { row: null, at: people.fetchedAt };
}

/**
 * Ask for the person of a thread drawn before People holds them and before its own read was asked (a thread opened while
 * People is still out): after the draw, since a read is never asked for from inside one.
 */
export function wantThreadPerson(conversationId: string | null): void {
  if (!conversationId || threadAsked.has(conversationId)) return;
  setTimeout(() => void readThreadPerson(conversationId), 0);
}

/** A head drawn again when a thread's own read of its person lands. */
export function useThreadPersonMoved(): void {
  useSyncExternalStore(hearThreadPeople, threadPeopleNow, threadPeopleNow);
}
function hearThreadPeople(on: () => void): () => void {
  threadHearers.add(on);
  return () => threadHearers.delete(on);
}
const threadPeopleNow = () => threadVersion;

/**
 * Who a thread is with, said: their own read, or People's rows coming to hold them, whichever is first (People's book rides
 * the Inbox's stream too, in its second tier, and on a small book lands first); People is no longer listened to once either
 * has. What the Inbox's first draw waits for, for the thread it opens on.
 */
export function threadPersonSaid(conversationId: string, personId: string): Promise<void> {
  let stop = () => {};
  const held = new Promise<void>((done) => {
    stop = onSurfaceValue("people", () => {
      if (peopleHold(personId)) done();
    });
  });
  return Promise.race([readThreadPerson(conversationId), held]).finally(() => stop());
}
