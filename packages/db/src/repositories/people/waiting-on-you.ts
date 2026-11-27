/**
 * Which threads, and which people, wait on a person now, by the one standing rule (contracts standingOfThread: flagged,
 * nobody has taken it, not paused past now, and a hold that waits on someone). A campaign run's replies and a business's
 * people said "Needs you" from the raw needs_human column, so a reply a member had already taken still said it, and a
 * colleague whose thread the reader held wore a Needs you dot on the business sheet (the wiring's second audit, R11 S9-1).
 * Reports, People and Ask apply the rule to rows of their own; these are the reads for a set of threads or people, and
 * the newest closed hold of each thread, by which one left with no answer still waits (listLastClosedHolds).
 * A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HAND_BACK_REASONS,
  OPEN_HOLDS_READ_MAX,
  standingOfThread,
  waitsOnAPerson,
  type SchemaSet,
  DbFailure,
} from "@chanlytics/contracts";
import type { Database } from "../../types";
import type { ContactId, TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** How many ids one `in` list carries: the URL's own limit, as the readers that page by id keep it. */
const IN_CHUNK = 200;

interface ThreadRow {
  id: string;
  contact_id: ContactId;
  state: string;
  paused_until: string | null;
  assignee_user_id: string | null;
  last_message_at: string | null;
}

const THREAD_COLUMNS = "id, contact_id, state, paused_until, assignee_user_id, last_message_at";

/**
 * The threads among `ids` by `key` (the thread's own id, or its person's), a chunk of ids at a time. And the person a
 * thread is with, by the thread (people.ts personRow, for the Inbox's head).
 */
export async function listThreadsBy(
  db: Db,
  tenantId: TenantId,
  key: "id" | "contact_id",
  ids: readonly string[],
): Promise<ThreadRow[]> {
  const out: ThreadRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from("conversations")
      .select(THREAD_COLUMNS)
      .eq("tenant_id", tenantId)
      .in(key, ids.slice(i, i + IN_CHUNK));
    if (error) throw new DbFailure(error, "cannot read the threads");
    out.push(...data);
  }
  return out;
}

/** A thread's open hold: its reason, which says whether it waits on anyone, and when it was opened. */
interface OpenHoldRow {
  reason: string | null;
  created_at: string;
}

/**
 * Which of a thread's open holds stands for it, where it holds more than one: one that waits on a person before one that
 * waits on nobody (a STOP left open), since a hold that waits flags the thread whatever else is open; then the oldest,
 * whose moment is when the wait began.
 */
const standsBefore = (hold: OpenHoldRow, other: OpenHoldRow): boolean => {
  const waits = waitsOnAPerson(hold.reason);
  if (waits !== waitsOnAPerson(other.reason)) return waits;
  return hold.created_at < other.created_at;
};

/** The open hold that stands for each of these threads, by thread (standsBefore). */
async function openHoldsOf(
  db: Db,
  tenantId: TenantId,
  threadIds: readonly string[],
): Promise<Map<string, OpenHoldRow>> {
  const out = new Map<string, OpenHoldRow>();
  for (let start = 0; start < threadIds.length; start += IN_CHUNK) {
    const { data, error } = await db
      .from("escalations")
      .select("conversation_id, reason, created_at")
      .eq("tenant_id", tenantId)
      .eq("state", "open")
      .in("conversation_id", threadIds.slice(start, start + IN_CHUNK));
    if (error) throw new DbFailure(error, "cannot read the open holds");
    for (const row of data) {
      if (!row.conversation_id) continue;
      const hold = { reason: row.reason, created_at: row.created_at };
      const held = out.get(row.conversation_id);
      if (!held || standsBefore(hold, held)) out.set(row.conversation_id, hold);
    }
  }
  return out;
}

/** A thread that waits on a person now, with the hold it waits on where one is open. */
interface HeldThread {
  thread: ThreadRow;
  hold: OpenHoldRow | null;
}

/** Of these threads, the ones that wait on a person now (contracts standingOfThread's needs_you), each with its hold. */
async function waitingOf(
  db: Db,
  tenantId: TenantId,
  threads: readonly ThreadRow[],
  nowMs: number,
): Promise<HeldThread[]> {
  if (!threads.length) return [];
  // Every thread's hold is read, not only a flagged thread's: an open hold that waits on someone flags a thread whatever its
  // column says (standingOf), and one that waits on nobody (a STOP) flags none.
  const holds = await openHoldsOf(
    db,
    tenantId,
    threads.map((thread) => thread.id),
  );
  return threads.flatMap((thread) => {
    const hold = holds.get(thread.id) ?? null;
    const { standing } = standingOfThread(
      { state: thread.state, paused_until: thread.paused_until, assignee_user_id: thread.assignee_user_id },
      hold ? { reason: hold.reason } : false,
      nowMs,
    );
    return standing === "needs_you" ? [{ thread, hold }] : [];
  });
}

/**
 * Of these people, the latest thread of each that waits on a person now. The latest thread alone, as People reads a
 * person: an old flagged thread under a newer one is not what they wait on.
 */
async function latestWaitingOf(
  db: Db,
  tenantId: TenantId,
  contactIds: readonly ContactId[],
  nowMs: number,
): Promise<HeldThread[]> {
  if (!contactIds.length) return [];
  const latest = new Map<string, ThreadRow>();
  for (const thread of await listThreadsBy(db, tenantId, "contact_id", contactIds)) {
    const held = latest.get(thread.contact_id);
    if (!held || (thread.last_message_at ?? "") > (held.last_message_at ?? "")) latest.set(thread.contact_id, thread);
  }
  return waitingOf(db, tenantId, [...latest.values()], nowMs);
}

/** Of these threads, the ids of those that wait on a person now: a campaign run's replies (the run's sheet). */
export async function getThreadIdsWaitingOnYou(
  db: Db,
  tenantId: TenantId,
  threadIds: readonly string[],
  nowMs: number,
): Promise<Set<string>> {
  if (!threadIds.length) return new Set();
  const threads = await listThreadsBy(db, tenantId, "id", threadIds);
  return new Set((await waitingOf(db, tenantId, threads, nowMs)).map((w) => w.thread.id));
}

/**
 * Of these people, the ids of those whose latest thread waits on a person now: a business's people (its sheet). The latest
 * thread alone, as People reads a person: an old flagged thread under a newer one is not what they wait on.
 */
export async function getPersonIdsWaitingOnYou(
  db: Db,
  tenantId: TenantId,
  contactIds: readonly ContactId[],
  nowMs: number,
): Promise<Set<string>> {
  return new Set((await latestWaitingOf(db, tenantId, contactIds, nowMs)).map((w) => w.thread.contact_id));
}

/** A person an ad brought who needs a person now: the conversation they wait in, since when, and what names them. */
export interface AdPersonWaitingRow {
  contact_id: ContactId;
  conversation_id: string;
  /** When their wait began: the open hold's moment, else the conversation's last message. */
  since: string | null;
  display_name: string | null;
  wa_profile_name: string | null;
  phone_e164: string | null;
  /** Set while an erasure is under way: a list leaves them out (the dashboard's people/going.ts). */
  erasing_since: string | null;
}

/** How many holds that wait the read takes, newest first: as many as the Inbox and Today read of their holds. */
const WAITING_SIDE_READ = OPEN_HOLDS_READ_MAX;

/** What sorts after every moment kept (ISO moments compared as text): a wait with none kept is not the longest. */
const LAST_MOMENT = "9999";

/** The people among these whose first touch was an ad: alive, not merged away, with what names them. */
async function adPeopleOf(db: Db, tenantId: TenantId, contactIds: readonly ContactId[]) {
  const out: Omit<AdPersonWaitingRow, "conversation_id" | "since">[] = [];
  for (let start = 0; start < contactIds.length; start += IN_CHUNK) {
    const { data, error } = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, phone_e164, erasing_since")
      .eq("tenant_id", tenantId)
      .eq("acquired_via", "ad")
      .is("erased_at", null)
      .is("merged_into_contact_id", null)
      .in("id", contactIds.slice(start, start + IN_CHUNK));
    if (error) throw new DbFailure(error, "cannot read the people an ad brought");
    for (const contact of data) {
      const { id, ...named } = contact;
      out.push({ contact_id: id, ...named });
    }
  }
  return out;
}

/**
 * The people whose first touch was an ad (contacts.acquired_via) who need a person now, longest waiting first: the Ads
 * page's line for them (the Ads plan's 4.4). Each is judged as getPersonIdsWaitingOnYou judges a person, by the one
 * standing rule over their latest conversation, so the people the line names are the ones the Inbox's Needs you and
 * Today hold. Found from the waiting side, which stays small at any volume where the people ads bring do not: the holds
 * that wait on someone, the newest WAITING_SIDE_READ, as Today's queue reads its rows, then of those the people an ad
 * brought. A conversation flagged with no hold open is not found here, as Today shows none. A read that fails throws.
 */
export async function listAdPeopleWaitingOnYou(
  db: Db,
  tenantId: TenantId,
  nowMs: number,
): Promise<AdPersonWaitingRow[]> {
  // A hold that waits on nobody (a STOP) is left out, as the Inbox's read leaves it out of the holds that wait: legacy
  // ones left open would crowd out the people who do wait.
  const held = await db
    .from("escalations")
    .select("conversation_id")
    .eq("tenant_id", tenantId)
    .eq("state", "open")
    .not("reason", "in", `(${HAND_BACK_REASONS.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(WAITING_SIDE_READ);
  if (held.error) throw new DbFailure(held.error, "cannot read the open holds");
  const heldIds = [...new Set(held.data.flatMap((hold) => (hold.conversation_id ? [hold.conversation_id] : [])))];
  const heldThreads = await listThreadsBy(db, tenantId, "id", heldIds);
  const people = await adPeopleOf(db, tenantId, [...new Set(heldThreads.map((thread) => thread.contact_id))]);
  const waiting = await latestWaitingOf(
    db,
    tenantId,
    people.map((person) => person.contact_id),
    nowMs,
  );
  const byPerson = new Map(people.map((person) => [person.contact_id, person]));
  return (
    waiting
      .flatMap(({ thread, hold }) => {
        const person = byPerson.get(thread.contact_id);
        return person
          ? [{ ...person, conversation_id: thread.id, since: hold?.created_at ?? thread.last_message_at }]
          : [];
      })
      // The longest wait first; one whose wait has no moment kept, last.
      .sort((first, second) => (first.since ?? LAST_MOMENT).localeCompare(second.since ?? LAST_MOMENT))
  );
}

/** The most closed holds one read of listLastClosedHolds takes, newest first: a few a thread over a chunk of threads. */
const CLOSED_HOLDS_MAX = 1000;

/** A hold that closed: why it opened, what the receptionist noted, when it opened and when it closed. */
interface ClosedHold {
  conversation_id: string;
  reason: string;
  details: string | null;
  created_at: string;
  /** Null before 00308 kept the time. */
  resolved_at: string | null;
}

/**
 * The newest hold that has closed on each of these conversations (escalations, state 'resolved'), by conversation. A
 * thread whose customer's last words were held and the hold closed with nothing sent waits on a person for good, since
 * the receptionist never comes back to a message it held: the Inbox's read asks this beside the threads' messages and
 * keeps it on those whose customer wrote last (contracts LastHoldDto, unansweredOf). One read for each IN_CHUNK ids,
 * newest first, under the caller's row security and the workspace's own filter. A read that fails THROWS.
 */
export async function listLastClosedHolds(
  db: Db,
  tenantId: TenantId,
  conversationIds: readonly string[],
): Promise<ClosedHold[]> {
  const newest = new Map<string, ClosedHold>();
  for (let index = 0; index < conversationIds.length; index += IN_CHUNK) {
    const { data, error } = await db
      .from("escalations")
      .select("conversation_id, reason, details, created_at, resolved_at")
      .eq("tenant_id", tenantId)
      .eq("state", "resolved")
      .in("conversation_id", conversationIds.slice(index, index + IN_CHUNK))
      .order("created_at", { ascending: false })
      .limit(CLOSED_HOLDS_MAX);
    if (error) throw new DbFailure(error, "listLastClosedHolds");
    for (const r of data) if (!newest.has(r.conversation_id)) newest.set(r.conversation_id, r);
  }
  return [...newest.values()];
}

/** The most decisions a day's count reads: past it the count says at least this many, which no business reaches. */
const DONE_READ_MAX = 1000;

/**
 * How many things the members dealt with since `since` (Today in three zones, 2 Nov 2026: "3 done today" by Need you's
 * door): the subjects their own decisions of `verbs` moved (a reply sent, a hold closed or handed back, a visit marked, a
 * review answered, a run approved), each once however often it moved. A decision taken back is none (Mark all done, then
 * its Undo), and neither is the Undo itself: each is known by the `undo_of` an Undo carries, so a reversal that sends none
 * (the Inbox's own Cancel and hand-back send no `x-undo-of`) cannot be honoured.
 */
export async function getTodayDoneCount(
  db: Db,
  params: { tenantId: TenantId; since: string; verbs: readonly SchemaSet<"decisions.verb">[] },
): Promise<number> {
  const [counted, undos] = await Promise.all([
    db
      .from("decisions")
      .select("id, subject_type, subject_id")
      .eq("tenant_id", params.tenantId)
      .eq("actor_type", "user")
      .in("verb", [...params.verbs])
      .is("undo_of", null)
      .gte("created_at", params.since)
      .limit(DONE_READ_MAX),
    db
      .from("decisions")
      .select("undo_of")
      .eq("tenant_id", params.tenantId)
      .not("undo_of", "is", null)
      .gte("created_at", params.since)
      .limit(DONE_READ_MAX),
  ]);
  if (counted.error) throw new DbFailure(counted.error, "cannot read the day's decisions");
  if (undos.error) throw new DbFailure(undos.error, "cannot read the day's undos");
  const undone = new Set(undos.data.flatMap((u) => (u.undo_of ? [u.undo_of] : [])));
  const done = counted.data.filter((d) => !undone.has(d.id));
  return new Set(done.map((d) => `${d.subject_type}:${d.subject_id}`)).size;
}
