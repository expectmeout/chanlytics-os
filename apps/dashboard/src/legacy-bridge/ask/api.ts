/**
 * The Ask routes, from the browser: threads, one thread, a deletion, the
 * openings fast path, a card's outcome, and the turn itself as a stream of
 * JSON lines. Every call goes through the typed client, which names the
 * workspace, reads the envelope and signs the tab out on a 401; a card's
 * commit is marked `via: "ask"`, which the client sends as the x-via header
 * the ledger reads. Nothing here knows what the palette does with it.
 */
import type { AskMessageVM, AskProposalOutcome, AskScope, AskSurface, AskThreadVM } from "@chanlytics/contracts";
import { refusalOf } from "@chanlytics/contracts";
import { api } from "../api";
import { unwrap, type Api, type ApiOptions, type ApiResult, type Output, type RouteKey } from "../../client/api";

/**
 * A turn's lines. `say` is the answer's Say as written so far, a preview the final message replaces (an empty one takes
 * back an answer the server set aside); `delta` is a v1 turn's words, from a server before the Line (spec 7.5). The
 * Line reads both.
 */
export type SendEvent =
  | { t: "thread"; id: string; title: string }
  | { t: "trace"; text: string }
  | { t: "say"; headline: string; detail: string }
  | { t: "delta"; text: string }
  | { t: "final"; message: AskMessageVM }
  | { t: "error"; text: string };

export interface OpeningsView {
  state: string;
  text: string;
  days: Array<{ key: string; label: string; windows: string[] }>;
}

/**
 * A call through the app's own route, marked as a card's: the ledger keeps
 * that it was tapped, not typed. An undo also names the decision it reverses.
 * The client is the caller's -- the tab's own, or a test's bound to a fake
 * fetch -- so the committer can be run rather than read.
 */
export function viaAsk<K extends RouteKey>(
  client: Api,
  key: K,
  opts: ApiOptions<K> = {} as ApiOptions<K>,
  undoOf?: string,
): Promise<ApiResult<Output<K>>> {
  return client(key, { ...opts, via: "ask", ...(undoOf ? { undoOf } : {}) });
}

/** Read a stream of JSON lines, one event per line, across chunk boundaries. */
export async function readLines(body: ReadableStream<Uint8Array>, on: (line: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) on(l);
  }
  if (carry.trim()) on(carry);
}

/** The stream lasts as long as the turn: the server's own ceiling ends it, not the client's write timeout. */
const TURN_MS = 300_000;

/** The Ask calls, on the client for their window: the tab's own, or a test's stand-in (`apiFor`). */
export function askApi(client: Api = api()) {
  return {
    threads: async (): Promise<AskThreadVM[]> => {
      try {
        return unwrap(await client("GET ask/threads")).threads;
      } catch {
        return [];
      }
    },
    /**
     * One thread, told apart from a thread that is gone: `{ missing: true }` for a
     * 404, null for a read that failed. Both were null, and the palette said
     * "Thread deleted" and dropped the thread from the list whenever a read failed.
     */
    thread: async (
      id: string,
    ): Promise<{ thread: AskThreadVM; messages: AskMessageVM[] } | { missing: true } | null> => {
      try {
        const r = await client("GET ask/threads/[id]", { params: { id } });
        if (r.ok) return r.data;
        return r.status === 404 ? { missing: true } : null;
      } catch {
        return null;
      }
    },
    deleteThread: async (id: string): Promise<boolean> =>
      (await client("DELETE ask/threads/[id]", { params: { id } })).ok,
    openings: async (day: string | null, service: string | null): Promise<OpeningsView> => {
      return unwrap(
        await client("GET ask/openings", { query: { day: day ?? undefined, service: service ?? undefined } }),
      ).openings;
    },
    outcome: async (messageId: string, proposalId: string, o: AskProposalOutcome): Promise<boolean> => {
      if (!/^[0-9a-f-]{36}$/.test(messageId)) return false;
      const r = await client("POST ask/messages/[id]/proposals/[pid]", {
        params: { id: messageId, pid: proposalId },
        body: o,
        via: "ask",
      });
      return r.ok;
    },
    send: async (
      input: {
        text: string;
        threadId: string | null;
        scope: AskScope | null;
        surface: AskSurface;
        /** The search whose question the text answers (the Leads answer row): the route reads it and tells the model. */
        answering?: { searchId: string } | null;
      },
      on: (ev: SendEvent) => void,
    ): Promise<void> => {
      let res: Response;
      try {
        res = await client.raw("POST ask", {
          body: {
            text: input.text,
            thread_id: input.threadId,
            scope: input.scope,
            surface: input.surface,
            ...(input.answering ? { answering: { search_id: input.answering.searchId } } : {}),
          },
          timeoutMs: TURN_MS,
        });
      } catch (e) {
        // A question that never left asked nothing; one that timed out may still be answered.
        const name = (e as { name?: unknown } | null)?.name;
        on({
          t: "error",
          text:
            name === "TimeoutError" || name === "AbortError"
              ? "Chanlytics took too long to answer — ask again in a moment."
              : "Network error — nothing was asked.",
        });
        return;
      }
      // The client has already signed the tab out on its way back.
      if (res.status === 401) return;
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string; details?: unknown };
        } | null;
        // The server's sentence, in our words where it gave none (contracts refusalOf); a page
        // that was not ours used to read "Ask failed (502)." and gets a sentence of ours.
        on({
          t: "error",
          text: j?.error
            ? refusalOf({
                code: j.error.code,
                status: res.status,
                message: j.error.message,
                details: j.error.details,
                retryAfter: res.headers.get("retry-after"),
                write: true,
              }).message
            : "Chanlytics didn't answer — ask again in a moment.",
        });
        return;
      }
      await readLines(res.body, (line) => {
        try {
          on(JSON.parse(line) as SendEvent);
        } catch {
          /* a torn line at the end of a broken stream */
        }
      });
    },
  };
}

export type AskApiCalls = ReturnType<typeof askApi>;
