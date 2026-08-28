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
}

const mem = new Map<string, ThreadState>();
const BLOB_ON = !!process.env.BLOB_READ_WRITE_TOKEN;

const blank = (): ThreadState => ({
  history: [],
  seen: [],
  pausedUntil: 0,
  replies: [],
});

const path = (threadId: string) => `threads/${threadId}.json`;

/**
 * The store could not be READ — as distinct from "this thread is new".
 *
 * One bare catch used to collapse those two into `blank()`, and the difference
 * decides behaviour: a blank thread has `pausedUntil: 0`, so a transient Blob
 * error made the receptionist believe nobody had taken the thread over, that
 * it had never spoken to this person, and that it had used none of its daily
 * replies. It would then talk over the human handling the conversation and
 * re-greet a customer mid-conversation.
 *
 * Compared by identity, matching the PG_MISS sentinel the Postgres path was
 * given for exactly this reason. `pausedUntil: -1` is a second line of defence:
 * any caller that forgets the identity check still fails closed on the clock.
 */
export const THREAD_UNKNOWN: ThreadState = { history: [], seen: [], pausedUntil: -1, replies: [] };

export async function getThread(threadId: string): Promise<ThreadState> {
  if (BLOB_ON) {
    try {
      const res = await get(path(threadId), { access: "private", useCache: false });
      if (res && res.statusCode === 200 && res.stream) {
        const txt = await new Response(res.stream as ReadableStream).text();
        return { ...blank(), ...JSON.parse(txt) };
      }
      // 304 (unchanged, no body) cannot occur with useCache:false and no etag,
      // but it carries no state either — so it is unknown, not empty.
      console.error("blob_read_no_body", threadId, res?.statusCode);
      return THREAD_UNKNOWN;
    } catch (e) {
      // A MISSING blob is the honest "no thread yet" — the SDK signals it by
      // throwing, which is why one bare catch could pass for correct. Every
      // other throw (network, auth, rate limit, service outage, malformed JSON)
      // landed in the same branch and became "this is a new customer".
      if (e instanceof BlobNotFoundError) return blank();
      console.error("blob_read_failed", threadId, e instanceof Error ? `${e.name}: ${e.message}` : e);
      return THREAD_UNKNOWN;
    }
  }
  return mem.get(threadId) || blank();
}

export interface SaveOptions {
  /** This writer owns pausedUntil exactly (the admin pause mirror). Everyone
   *  else merges, so a pause set during a long bot turn is never lost. */
  authoritativePause?: boolean;
}

export async function saveThread(
  threadId: string,
  state: ThreadState,
  opts: SaveOptions = {},
): Promise<void> {
  // Never persist the sentinel: writing it would turn a read failure into a
  // durable one, blanking a real thread's history and pause.
  if (state === THREAD_UNKNOWN) {
    console.error("blob_save_refused_unknown_state", threadId);
    return;
  }
  // keep things bounded
  state.history = state.history.slice(-16);
  state.seen = state.seen.slice(-40);
  state.replies = state.replies.filter((t) => Date.now() - t < 24 * 3600 * 1000);
  if (BLOB_ON && !opts.authoritativePause) {
    // Re-read immediately before writing: the webhook holds a copy from before
    // the (slow) brain call, and an operator take-over may have landed since.
    try {
      const current = await getThread(threadId);
      if (current.pausedUntil > state.pausedUntil) state.pausedUntil = current.pausedUntil;
      if (current.seen.length) {
        state.seen = [...new Set([...current.seen, ...state.seen])].slice(-40);
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
      return;
    } catch (e) {
      console.error("blob_save_failed", e instanceof Error ? e.message : e);
    }
  }
  mem.set(threadId, state);
}

export function storeBackend(): "blob" | "memory" {
  return BLOB_ON ? "blob" : "memory";
}
