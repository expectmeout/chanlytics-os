/**
 * Thread state store — dedupe, history, pause flags, rate caps.
 * Backend: Vercel Blob when BLOB_READ_WRITE_TOKEN is present (durable),
 * else per-lambda memory (fine for sandbox testing; resets on cold start).
 */
import { put, get } from "@vercel/blob";

const mem = new Map();
const BLOB_ON = !!process.env.BLOB_READ_WRITE_TOKEN;

const blank = () => ({
  history: [],          // [{role:"user"|"assistant", content}]
  seen: [],             // recent message ids (webhook retries dedupe)
  pausedUntil: 0,       // epoch ms — human is handling this thread
  replies: [],          // epoch ms of bot replies (rate cap)
});

const path = (threadId) => `threads/${threadId}.json`;

export async function getThread(threadId) {
  if (BLOB_ON) {
    try {
      const res = await get(path(threadId), { access: "private", useCache: false });
      if (res && res.statusCode === 200 && res.stream) {
        const txt = await new Response(res.stream).text();
        return { ...blank(), ...JSON.parse(txt) };
      }
    } catch { /* not found -> blank */ }
    return blank();
  }
  return mem.get(threadId) || blank();
}

export async function saveThread(threadId, state) {
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
      console.error("blob_save_failed", e && e.message);
    }
  }
  mem.set(threadId, state);
}

export function storeBackend() {
  return BLOB_ON ? "blob" : "memory";
}
