/**
 * Thread state store — dedupe, history, pause flags, rate caps.
 * Backend: Vercel Blob when BLOB_READ_WRITE_TOKEN is present (durable),
 * else per-lambda memory (fine for sandbox testing; resets on cold start).
 */
import { put, get, BlobNotFoundError } from "@vercel/blob";

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

const path = (threadId: string) => `threads/${threadId}.json`;

export async function getThread(threadId: string): Promise<ThreadState> {
  if (BLOB_ON) {
    try {
      const res = await get(path(threadId), { access: "private", useCache: false });
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
      console.error("blob_read_no_body", threadId, res.statusCode);
      return unreadable();
    } catch (e) {
      // Network, auth, rate limit, service outage, malformed JSON. We do not
      // know this thread's state, and "new customer" is the dangerous guess.
      // BlobNotFoundError is handled defensively too: the SDK exports it, and a
      // future version returning it here would otherwise silence new customers.
      if (e instanceof BlobNotFoundError) return blank();
      console.error("blob_read_failed", threadId, e instanceof Error ? `${e.name}: ${e.message}` : e);
      return unreadable();
    }
  }
  return mem.get(threadId) || blank();
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
  threadId: string,
  state: ThreadState,
  opts: SaveOptions = {},
): Promise<boolean> {
  // Never persist a state we could not read: writing it would turn a transient
  // read failure into a durable one, blanking a real thread's history and pause.
  if (isThreadUnknown(state)) {
    console.error("blob_save_refused_unknown_state", threadId);
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
      const current = await getThread(threadId);
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
      await put(path(threadId), JSON.stringify(state), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return true;
    } catch (e) {
      console.error("blob_save_failed", threadId, e instanceof Error ? e.message : e);
      return false;
    }
  }
  mem.set(threadId, state);
  return true;
}

export function storeBackend(): "blob" | "memory" {
  return BLOB_ON ? "blob" : "memory";
}
