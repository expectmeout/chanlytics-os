/**
 * Which threads, and which people, wait on a person now, by the one standing rule (contracts standingOfThread: flagged,
 * nobody has taken it, not paused past now, and a hold that waits on someone). A campaign run's replies and a business's
 * people said "Needs you" from the raw needs_human column, so a reply a member had already taken still said it, and a
 * colleague whose thread the reader held wore a Needs you dot on the business sheet (the wiring's second audit, R11 S9-1).
 * Reports, People and Ask apply the rule to rows of their own; these are the reads for a set of threads or people, and
 * the newest closed hold of each thread, by which one left with no answer still waits (lastClosedHolds).
 * A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { standingOfThread } from "@chanlytics/contracts";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** How many ids one `in` list carries: the URL's own limit, as the readers that page by id keep it. */
const IN_CHUNK = 200;

interface ThreadRow {
  id: string;
  contact_id: string;
  state: string;
  paused_until: string | null;
  assignee_user_id: string | null;
  last_message_at: string | null;
}

const THREAD_COLUMNS = "id, contact_id, state, paused_until, assignee_user_id, last_message_at";

/** The threads among `ids` by `key` (the thread's own id, or its person's), a chunk of ids at a time. */
async function threadsBy(
  db: Db,
  tenantId: string,
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
    if (error) throw new Error(`cannot read the threads: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** The open hold of each of these threads, by thread: its reason, which says whether it waits on anyone. */
async function openHoldsOf(
  db: Db,
  tenantId: string,
  threadIds: readonly string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < threadIds.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from("escalations")
      .select("conversation_id, reason")
      .eq("tenant_id", tenantId)
      .eq("state", "open")
      .in("conversation_id", threadIds.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`cannot read the open holds: ${error.message}`);
    for (const h of data ?? []) if (h.conversation_id) out.set(h.conversation_id, h.reason);
  }
  return out;
}

/** Of these threads, the ones that wait on a person now (contracts standingOfThread's needs_you). */
async function waitingOf(db: Db, tenantId: string, threads: readonly ThreadRow[], nowMs: number): Promise<ThreadRow[]> {
  if (!threads.length) return [];
  // Every thread's hold is read, not only a flagged thread's: an open hold that waits on someone flags a thread whatever its
  // column says (standingOf), and one that waits on nobody (a STOP) flags none.
  const holds = await openHoldsOf(
    db,
    tenantId,
    threads.map((t) => t.id),
  );
  return threads.filter(
    (t) =>
      standingOfThread(
        { state: t.state, paused_until: t.paused_until, assignee_user_id: t.assignee_user_id },
        holds.has(t.id) ? { reason: holds.get(t.id) ?? null } : false,
        nowMs,
      ).standing === "needs_you",
  );
}

/** Of these threads, the ids of those that wait on a person now: a campaign run's replies (the run's sheet). */
export async function threadIdsWaitingOnYou(
  db: Db,
  tenantId: string,
  threadIds: readonly string[],
  nowMs: number,
): Promise<Set<string>> {
  if (!threadIds.length) return new Set();
  const threads = await threadsBy(db, tenantId, "id", threadIds);
  return new Set((await waitingOf(db, tenantId, threads, nowMs)).map((t) => t.id));
}

/**
 * Of these people, the ids of those whose latest thread waits on a person now: a business's people (its sheet). The latest
 * thread alone, as People reads a person: an old flagged thread under a newer one is not what they wait on.
 */
export async function personIdsWaitingOnYou(
  db: Db,
  tenantId: string,
  contactIds: readonly string[],
  nowMs: number,
): Promise<Set<string>> {
  if (!contactIds.length) return new Set();
  const latest = new Map<string, ThreadRow>();
  for (const t of await threadsBy(db, tenantId, "contact_id", contactIds)) {
    const held = latest.get(t.contact_id);
    if (!held || (t.last_message_at ?? "") > (held.last_message_at ?? "")) latest.set(t.contact_id, t);
  }
  return new Set((await waitingOf(db, tenantId, [...latest.values()], nowMs)).map((t) => t.contact_id));
}

/** The most closed holds one read of lastClosedHolds takes, newest first: a few a thread over a chunk of threads. */
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
export async function lastClosedHolds(
  db: Db,
  tenantId: string,
  conversationIds: readonly string[],
): Promise<ClosedHold[]> {
  const newest = new Map<string, ClosedHold>();
  for (let i = 0; i < conversationIds.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from("escalations")
      .select("conversation_id, reason, details, created_at, resolved_at")
      .eq("tenant_id", tenantId)
      .eq("state", "resolved")
      .in("conversation_id", conversationIds.slice(i, i + IN_CHUNK))
      .order("created_at", { ascending: false })
      .limit(CLOSED_HOLDS_MAX);
    if (error) throw new Error(`lastClosedHolds: ${error.message}`);
    for (const r of data ?? []) if (!newest.has(r.conversation_id)) newest.set(r.conversation_id, r);
  }
  return [...newest.values()];
}
