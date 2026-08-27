/**
 * Thread state store — dedupe, history, pause flags, rate caps.
 * Backend: Vercel Blob when BLOB_READ_WRITE_TOKEN is present (durable),
 * else per-lambda memory (fine for sandbox testing; resets on cold start).
 */
import { put, get } from "@vercel/blob";

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

export async function getThread(threadId: string): Promise<ThreadState> {
  if (BLOB_ON) {
    try {
      const res = await get(path(threadId), { access: "private", useCache: false });
      if (res && res.statusCode === 200 && res.stream) {
        const txt = await new Response(res.stream as ReadableStream).text();
        return { ...blank(), ...JSON.parse(txt) };
      }
    } catch { /* not found -> blank */ }
    return blank();
  }
  return mem.get(threadId) || blank();
}

export async function saveThread(threadId: string, state: ThreadState): Promise<void> {
  // keep things bounded
  state.history = state.history.slice(-16);
  state.seen = state.seen.slice(-40);
  state.replies = state.replies.filter((t) => Date.now() - t < 24 * 3600 * 1000);
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
