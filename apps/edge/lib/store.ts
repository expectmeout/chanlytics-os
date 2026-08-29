/**
 * Thread state store — dedupe, history, pause flags, rate caps.
 * Backend: Vercel Blob when BLOB_READ_WRITE_TOKEN is present (durable),
 * else per-lambda memory (fine for sandbox testing; resets on cold start).
 */
import { put, get, del, list, BlobNotFoundError } from "@vercel/blob";

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ThreadState {
  history: ThreadTurn[]; // conversation turns
  seen: string[];        // recent message ids (webhook retries dedupe)
  pausedUntil: number;   // epoch ms — human is handling this thread
  replies: number[];     // epoch ms of bot replies (rate cap)
  /**
   * Cached consent, so an opt-out survives a Postgres outage.
   *
   * `contacts.consent` is authoritative and lives only in Postgres, so the gate
   * read it from the ingest result — and when Postgres was unreachable that
   * result is null, meaning a customer who opted out last week would start
   * getting bot replies again for the duration of the outage. Exactly the
   * moment the guarantee matters most is the moment it disappeared.
   *
   * This is a CACHE, never the source: it is consulted only when Postgres did
   * not answer, so a customer who has since texted START is never held out by a
   * stale local copy.
   */
  optedOut?: boolean;
  /**
   * The store could not be READ. Distinct from "this thread is new", and the
   * difference decides behaviour: a blank thread has `pausedUntil: 0`, so
   * treating a read failure as blank makes the receptionist believe nobody has
   * taken the thread over, that it has never spoken to this person, and that it
   * has used none of its daily replies — so it talks over the human handling
   * the conversation and re-greets a customer mid-thread.
   *
   * A FIELD, not a shared sentinel object. The first version of this exported a
   * module-level singleton compared by identity; callers mutate what getThread
   * returns (`thread.seen.push(...)`, `t.pausedUntil = ...`), so every mutation
   * accumulated on the one shared object and leaked between customers inside a
   * warm lambda. Each call now gets its own.
   */
  unknown?: boolean;
}

const mem = new Map<string, ThreadState>();
const BLOB_ON = !!process.env.BLOB_READ_WRITE_TOKEN;

const blank = (): ThreadState => ({
  history: [],
  seen: [],
  pausedUntil: 0,
  replies: [],
});

/** Fresh every call — see ThreadState.unknown. `pausedUntil: -1` is a second
 *  line of defence: a caller that forgets the check still fails closed. */
const unreadable = (): ThreadState => ({
  history: [],
  seen: [],
  pausedUntil: -1,
  replies: [],
  unknown: true,
});

/** True when this state came from a failed read rather than from the store. */
export function isThreadUnknown(s: ThreadState): boolean {
  return s.unknown === true;
}

/**
 * The isolation boundary for stored thread state.
 *
 * The key used to be `threads/<phone digits>.json` — a customer's phone number
 * with no tenant in it. A phone number is NOT a globally unique identity: two
 * businesses in the same city can have the same customer, and that one object
 * carries conversation history, pause state, the dedupe list and the reply cap.
 * Sharing it means one business's receptionist can quote another's
 * conversation, inherit its pause, and spend its daily reply budget.
 *
 * Vercel's own guidance is to organise a private store with a folder in the
 * pathname; the tenant is the folder.
 *
 * A null tenant means we could not consult the control plane — the pre-Postgres
 * path, where the only tenant is whoever the env credentials belong to. Keying
 * on that phone id keeps the namespace specific rather than global, and needs
 * no database to compute.
 */
export function threadNamespace(tenantId: string | null | undefined): string {
  return tenantId ?? `env-${process.env.WHATSAPP_PHONE_ID || "unknown"}`;
}

const path = (namespace: string, threadId: string) =>
  `threads/${namespace}/${threadId}.json`;

export async function getThread(namespace: string, threadId: string): Promise<ThreadState> {
  if (BLOB_ON) {
    try {
      // useCache:false is REQUIRED, not an optimisation: an overwritten blob can
      // take up to 60s to propagate through the CDN cache, and this object is
      // rewritten on every single message. A cached read would hand the bot a
      // stale pause and a stale dedupe list.
      const res = await get(path(namespace, threadId), { access: "private", useCache: false });
      // A MISSING blob is `null` — the SDK's documented signal for not-found
      // ("resolves to { stream, blob } or null if not found"). It is the honest
      // "no thread yet" and MUST be blank: every first-time customer takes this
      // path, and returning unknown here refuses to greet any of them.
      if (res === null) return blank();
      if (res.statusCode === 200 && res.stream) {
        const txt = await new Response(res.stream as ReadableStream).text();
        return { ...blank(), ...JSON.parse(txt) };
      }
      // 304 (unchanged, no body) cannot occur with useCache:false and no etag,
      // but it carries no state either — so it is unknown, not empty.
      console.error("blob_read_no_body", namespace, threadId, res.statusCode);
      return unreadable();
    } catch (e) {
      // Network, auth, rate limit, service outage, malformed JSON. We do not
      // know this thread's state, and "new customer" is the dangerous guess.
      // BlobNotFoundError is handled defensively too: the SDK exports it, and a
      // future version returning it here would otherwise silence new customers.
      if (e instanceof BlobNotFoundError) return blank();
      console.error("blob_read_failed", namespace, threadId, e instanceof Error ? `${e.name}: ${e.message}` : e);
      return unreadable();
    }
  }
  return mem.get(path(namespace, threadId)) || blank();
}

export interface SaveOptions {
  /** This writer owns pausedUntil exactly (the admin pause mirror). Everyone
   *  else merges, so a pause set during a long bot turn is never lost. */
  authoritativePause?: boolean;
}

/**
 * Returns whether the state was actually PERSISTED.
 *
 * It used to return void, so a caller could not tell a durable write from a
 * fall-through into the per-lambda Map that the next invocation cannot see.
 * The admin pause mirror in particular must fail LOUD — the dashboard reports
 * "the receptionist is paused" on the strength of it.
 */
export async function saveThread(
  namespace: string,
  threadId: string,
  state: ThreadState,
  opts: SaveOptions = {},
): Promise<boolean> {
  // Never persist a state we could not read: writing it would turn a transient
  // read failure into a durable one, blanking a real thread's history and pause.
  if (isThreadUnknown(state)) {
    console.error("blob_save_refused_unknown_state", namespace, threadId);
    return false;
  }
  // keep things bounded
  state.history = state.history.slice(-16);
  state.seen = state.seen.slice(-40);
  state.replies = state.replies.filter((t) => Date.now() - t < 24 * 3600 * 1000);
  if (BLOB_ON && !opts.authoritativePause) {
    // Re-read immediately before writing: the webhook holds a copy from before
    // the (slow) brain call, and an operator take-over may have landed since.
    // A failed re-read must not clobber the pause it was meant to preserve.
    try {
      const current = await getThread(namespace, threadId);
      if (!isThreadUnknown(current)) {
        if (current.pausedUntil > state.pausedUntil) state.pausedUntil = current.pausedUntil;
        if (current.seen.length) {
          state.seen = [...new Set([...current.seen, ...state.seen])].slice(-40);
        }
      }
    } catch { /* fall through to a plain write */ }
  }
  if (BLOB_ON) {
    try {
      await put(path(namespace, threadId), JSON.stringify(state), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return true;
    } catch (e) {
      console.error("blob_save_failed", namespace, threadId, e instanceof Error ? e.message : e);
      return false;
    }
  }
  mem.set(path(namespace, threadId), state);
  return true;
}

export function storeBackend(): "blob" | "memory" {
  return BLOB_ON ? "blob" : "memory";
}

/**
 * Forget one customer's stored thread state.
 *
 * The store has never had a delete path of any kind, which makes a deletion
 * request unanswerable: this object holds the verbatim text of a customer's
 * conversation, and until now the only honest answer to "delete my data" was
 * that we could not. Postgres rows can be deleted; these could not.
 */
export async function deleteThread(namespace: string, threadId: string): Promise<boolean> {
  if (!BLOB_ON) {
    mem.delete(path(namespace, threadId));
    return true;
  }
  try {
    await del(path(namespace, threadId));
    return true;
  } catch (e) {
    // A missing blob is already the desired end state.
    if (e instanceof BlobNotFoundError) return true;
    console.error("blob_delete_failed", namespace, threadId, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Forget an entire tenant's stored thread state — offboarding, or a workspace
 * deletion. Returns how many objects were removed.
 *
 * This is only expressible because the namespace is now a real prefix; with the
 * old flat phone-number keys there was no way to enumerate one business's
 * threads, which is a second reason that key was wrong.
 */
export async function deleteTenantThreads(namespace: string): Promise<number> {
  if (!BLOB_ON) {
    const prefix = `threads/${namespace}/`;
    let n = 0;
    for (const k of [...mem.keys()]) if (k.startsWith(prefix)) { mem.delete(k); n++; }
    return n;
  }
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `threads/${namespace}/`, cursor, limit: 1000 });
    for (const b of page.blobs) {
      try {
        await del(b.url);
        removed++;
      } catch (e) {
        console.error("blob_delete_failed", b.pathname, e instanceof Error ? e.message : e);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}
