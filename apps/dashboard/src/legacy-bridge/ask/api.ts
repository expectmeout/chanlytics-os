/**
 * The Ask routes, from the browser: threads, one thread, a deletion, the
 * openings fast path, a card's outcome, and the turn itself as a stream of
 * JSON lines. Every call goes through the typed client, which names the
 * workspace, reads the envelope and signs the tab out on a 401; a card's
 * commit is marked `via: "ask"`, which the client sends as the x-via header
 * the ledger reads. Nothing here knows what the palette does with it.
 */
import type {
  AskMessageVM,
  AskProposalOutcome,
  AskScope,
  AskSurface,
  AskThreadVM,
  PageContext,
  VoiceEndReason,
} from "@chanlytics/contracts";
import { MIN_MS, refusalOf, type AskOpeningsView, type SpeechPurpose } from "@chanlytics/contracts";
import { api } from "../api";
import { unwrap, type Api } from "../../client/api";

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
  /** With no calendar link: what the calendar is fed by instead (contracts AskOpeningsView.instead). */
  instead?: AskOpeningsView["instead"];
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

export type { VoiceEndReason };
/** What the browser measured, from the tap: to the connection, and to the first audio it heard (null: none came). */
/**
 * What a page says of a session the page before it died under (voice.ts `diedWord`): how it came back and on what.
 * Not one of the row's closed set: the end route keeps it on its log line alone.
 */
export type VoiceDiedWord = `died:${string}`;

export interface VoiceEndTiming {
  connectMs: number | null;
  firstAudioMs: number | null;
}

/**
 * The voice conversation's three calls (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1), spread into
 * the Ask calls: a conversation begins (the thread it runs on, the agent's token, the session the browser hands the
 * agent; a refusal is thrown in the server's words, unwrap, for the Line to say), the page under the Line moves (the
 * next spoken turn reads it), and the person ends it (the row is ended, so the brain door opens it no more, and keeps
 * how it went: the reason and the two timings, 00300).
 */
function voiceCalls(client: Api) {
  return {
    /** A conversation begun; the agent's language is the agent's own, so none is sent (the route reads none as English). */
    voiceStart: async (input: {
      threadId: string | null;
      scope: AskScope | null;
      surface: AskSurface | null;
      context: PageContext | null;
    }): Promise<{ session: string; token: string; conversation_id: string | null; thread_id: string; title: string }> =>
      unwrap(
        await client("POST ask/voice", {
          body: {
            thread_id: input.threadId,
            scope: input.scope,
            surface: input.surface,
            context: input.context,
          },
        }),
      ),
    voicePage: async (session: string, context: PageContext): Promise<void> => {
      try {
        await client.raw("POST ask/voice/page", { body: { session, context } });
      } catch {
        /* the next turn reads its page itself */
      }
    },
    voiceEnd: async (
      session: string,
      reason: VoiceEndReason | VoiceDiedWord,
      timing?: VoiceEndTiming,
    ): Promise<void> => {
      try {
        await client.raw("POST ask/voice/end", {
          body: {
            session,
            reason,
            ...(timing ? { connect_ms: timing.connectMs, first_audio_ms: timing.firstAudioMs } : {}),
          },
        });
      } catch {
        /* the row expires on its own */
      }
    },
  };
}

/**
 * Words read aloud in Ask's one voice (the spec's §3.5 as amended 4 Oct 2026: the one-way speech): the route answers
 * the audio itself, MP3, as the vendor makes it. A clip is read whole before it plays, so the player needs no
 * media-source plumbing; that the first word is not behind the whole of a brief is the speech module's doing, which
 * asks for the first sentence as a clip of its own (ask/speech.ts speechParts). `before`: the words read just before
 * these, where these carry on from them, so the vendor reads them in the same breath. A refusal is thrown in the
 * server's words, for the button to say.
 */
function speechCalls(client: Api) {
  return {
    speech: async (text: string, purpose: SpeechPurpose, more?: { before?: string }): Promise<Blob> => {
      const body = more?.before ? { text, purpose, before: more.before } : { text, purpose };
      const res = await client.raw("POST ask/speech", { body, timeoutMs: SPEECH_MS });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        // A clip asked for and refused changed nothing: a read, for the refusal's words.
        throw new Error(
          refusalOf({ code: j?.error?.code, status: res.status, message: j?.error?.message, write: false }).message,
        );
      }
      return res.blob();
    },
  };
}

/** The clip's whole wait: the route's own ceiling is a minute; a brief streams in well under ten seconds. */
const SPEECH_MS = MIN_MS;

/**
 * How long a tab holds the model's cache as warm after it sent the model a turn's head, in a warm or in a question:
 * the server's own four minutes (server/ask/warm.ts), inside the cache's five.
 */
const HEAD_WARM_MS = 4 * MIN_MS;

/**
 * The model's cache, written before the question (POST ask/warm/model; server/ask/warm.ts): asked for when a question
 * is on its way (a hold on the mic, words on the Line that reach no page), so the question's first words come about
 * two seconds sooner than a cold one's. Once in four minutes a tab, and not within four of a question sent (`sent`),
 * which reads the same cache and renews it; sent raw, never waited on, and a warm that fails costs nothing but the warm.
 */
function modelWarm(client: Api) {
  /** When this tab last sent the model a turn's head: a warm, or a question. */
  let headAt = 0;
  return {
    sent: (): void => {
      headAt = Date.now();
    },
    warmModel: (): void => {
      if (Date.now() - headAt < HEAD_WARM_MS) return;
      headAt = Date.now();
      void client.raw("POST ask/warm/model", { body: {} }).catch(() => {
        /* the question still goes, and writes the cache itself */
      });
    },
  };
}

/** The Ask calls, on the client for their window: the tab's own, or a test's stand-in (`apiFor`). */
export function askApi(client: Api = api()) {
  const head = modelWarm(client);
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
    /**
     * The page, read before the question (POST ask/warm; the Phase 2 plan, D6): sent as the Line opens and as the page
     * under it changes, so the question asked a moment later finds its page read. Sent raw, so the tab keeps its reads
     * and runs no refresh; never waited on, and a warm that fails costs nothing but the warm.
     */
    warm: async (context: PageContext): Promise<void> => {
      try {
        await client.raw("POST ask/warm", { body: context });
      } catch {
        /* the question still goes, and reads its page itself */
      }
    },
    warmModel: head.warmModel,
    ...voiceCalls(client),
    ...speechCalls(client),
    send: async (
      input: {
        text: string;
        threadId: string | null;
        /**
         * The turn's scope, which its thread then keeps: the Line's chip, or none (null, which clears the thread's).
         * Omitted by a caller with no opinion (the Leads answer row), so the thread keeps its own.
         */
        scope?: AskScope | null;
        surface: AskSurface;
        /** The search whose question the text answers (the Leads answer row): the route reads it and tells the model. */
        answering?: { searchId: string } | null;
        /** How long the Line was open before this question, in ms (AskTurnShape.opened_ms); omitted when unknown. */
        openedMs?: number | null;
        /** The page the question is asked on (contracts PageContext; ask/context.ts); omitted when the page gave none. */
        context?: PageContext | null;
      },
      on: (ev: SendEvent) => void,
    ): Promise<void> => {
      head.sent();
      let res: Response;
      try {
        res = await client.raw("POST ask", {
          body: {
            text: input.text,
            thread_id: input.threadId,
            ...(input.scope !== undefined ? { scope: input.scope } : {}),
            surface: input.surface,
            ...(input.answering ? { answering: { search_id: input.answering.searchId } } : {}),
            ...(typeof input.openedMs === "number" && input.openedMs >= 0
              ? { opened_ms: Math.round(input.openedMs) }
              : {}),
            ...(input.context ? { context: input.context } : {}),
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
